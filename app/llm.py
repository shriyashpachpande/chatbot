import logging
from functools import lru_cache
from typing import Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from portkey_ai import PORTKEY_GATEWAY_URL, createHeaders

from app.config import settings

logger = logging.getLogger(__name__)


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
    - If USE_PORTKEY is False: returns direct ChatGoogleGenerativeAI.
    - If USE_PORTKEY is True: routes ChatOpenAI through Portkey Gateway with trace_id and session_id.
    - Supports PORTKEY_VIRTUAL_KEY and PORTKEY_PROVIDER slug.
    - If USE_PORTKEY is True but keys are missing, logs a warning and falls back to direct Gemini.
    """
    base_model = model_name or settings.GEMINI_MODEL or "gemini-2.5-flash"
    gemini_key = settings.GEMINI_API_KEY
    portkey_key = settings.PORTKEY_API_KEY

    if settings.USE_PORTKEY:
        if not portkey_key:
            logger.warning(
                "USE_PORTKEY is enabled but PORTKEY_API_KEY is missing. Falling back to direct Gemini."
            )
            return get_direct_llm(base_model)

        # Build headers for Portkey Gateway
        header_kwargs = {
            "api_key": portkey_key,
        }
        if settings.PORTKEY_VIRTUAL_KEY:
            header_kwargs["virtual_key"] = settings.PORTKEY_VIRTUAL_KEY.strip()
        if trace_id:
            header_kwargs["trace_id"] = trace_id
        if session_id:
            header_kwargs["metadata"] = {"session_id": session_id}

        portkey_headers = createHeaders(**header_kwargs)

        clean_base = base_model.split("/")[-1] if "/" in base_model else base_model
        clean_base = clean_base.lstrip("@")

        if settings.PORTKEY_VIRTUAL_KEY:
            # If virtual_key is passed in headers, base model name is used directly
            portkey_model = clean_base
        else:
            # Portkey slug routing: @slug/model
            slug = settings.PORTKEY_PROVIDER.strip() if settings.PORTKEY_PROVIDER else "gemini"
            if not slug.startswith("@"):
                slug = f"@{slug}"
            portkey_model = base_model if base_model.startswith("@") else f"{slug}/{clean_base}"

        return ChatOpenAI(
            model=portkey_model,
            api_key=gemini_key or "dummy_key",
            base_url=PORTKEY_GATEWAY_URL,
            default_headers=portkey_headers,
            temperature=0.7,
            timeout=30.0,
        )

    # Direct Gemini mode
    return get_direct_llm(base_model)
