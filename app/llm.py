import json
import logging
from functools import lru_cache
from typing import Optional, Dict
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

PORTKEY_GATEWAY_URL = "https://api.portkey.ai/v1"


@lru_cache(maxsize=8)
def _create_gemini_direct_cached(model: str, api_key: str) -> ChatGoogleGenerativeAI:
    clean_model = model.split("/")[-1] if "/" in model else model
    clean_model = clean_model.lstrip("@")
    return ChatGoogleGenerativeAI(
        model=clean_model,
        google_api_key=api_key,
        temperature=0.7,
        timeout=30.0,
    )


def get_direct_llm(model_name: Optional[str] = None) -> ChatGoogleGenerativeAI:
    """Returns direct ChatGoogleGenerativeAI bypassing Portkey."""
    base_model = model_name or settings.GEMINI_MODEL or "gemini-2.5-flash"
    return _create_gemini_direct_cached(base_model, settings.GEMINI_API_KEY)


def get_llm_provider() -> str:
    """Returns 'portkey-gemini' when Portkey is active and keys are present, else 'gemini'."""
    if settings.USE_PORTKEY and settings.PORTKEY_API_KEY:
        return "portkey-gemini"
    return "gemini"


def get_llm(
    model_name: Optional[str] = None,
    trace_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> BaseChatModel:
    """
    Returns an LLM instance based on USE_PORTKEY config.
    - If USE_PORTKEY is False: routes directly to Google Gemini using ChatGoogleGenerativeAI.
    - If USE_PORTKEY is True: routes to Portkey Gateway using OpenAI-compatible ChatOpenAI.
      No portkey_ai library import required.
      No Gemini API key required (Portkey resolves credentials internally).
    """
    base_model = model_name or settings.GEMINI_MODEL or "gemini-2.5-flash"
    portkey_key = settings.PORTKEY_API_KEY

    if settings.USE_PORTKEY:
        if not portkey_key:
            logger.warning(
                "USE_PORTKEY is enabled but PORTKEY_API_KEY is missing. Falling back to direct Gemini."
            )
            return get_direct_llm(base_model)

        # Standard OpenAI client headers for Portkey Gateway
        headers: Dict[str, str] = {
            "x-portkey-api-key": portkey_key,
        }
        if trace_id:
            headers["x-portkey-trace-id"] = trace_id
        if session_id:
            headers["x-portkey-metadata"] = json.dumps({"session_id": session_id})
        if settings.PORTKEY_VIRTUAL_KEY:
            headers["x-portkey-virtual-key"] = settings.PORTKEY_VIRTUAL_KEY.strip()

        clean_base = base_model.split("/")[-1] if "/" in base_model else base_model
        clean_base = clean_base.lstrip("@")

        if settings.PORTKEY_VIRTUAL_KEY:
            portkey_model = clean_base
        elif base_model.startswith("@"):
            portkey_model = base_model
        elif settings.PORTKEY_PROVIDER:
            slug = settings.PORTKEY_PROVIDER.strip().lstrip("@")
            portkey_model = f"@{slug}/{clean_base}"
        else:
            portkey_model = clean_base

        return ChatOpenAI(
            model=portkey_model,
            api_key=portkey_key,
            base_url=PORTKEY_GATEWAY_URL,
            default_headers=headers,
            temperature=0.7,
            timeout=30.0,
        )

    # Direct Gemini mode
    return get_direct_llm(base_model)
