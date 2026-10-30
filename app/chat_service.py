import json
import time
import uuid
from typing import Dict, Any, List
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

from app.config import settings
from app.llm import get_llm, get_llm_provider
from app.tools import TOOLS
from app.database import save_message, get_history, save_log

SYSTEM_PROMPT = (
    "You are a helpful, friendly assistant. Reply in the same language the user writes in. "
    "Use web_search for current events or anything you are not sure about. "
    "When the user shares a link, use fetch_url and answer from its content. "
    "Mention source URLs when you used the tools. "
    "For normal greetings and general chat, do not use any tool."
)


def extract_text_from_content(content: Any) -> str:
    """Helper to cleanly extract string text from Gemini response content."""
    if isinstance(content, str):
        return content
    elif isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and "text" in item:
                parts.append(item["text"])
            elif hasattr(item, "text"):
                parts.append(getattr(item, "text"))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return str(content)


def chat(session_id: str, message: str) -> Dict[str, Any]:
    """
    Executes conversational agent loop with tool calling, session memory, and logging.
    1. Generates unique trace_id for the entire turn.
    2. Loads prior session history (last 20 messages).
    3. Persists user message in the database.
    4. Binds tools to Gemini model.
    5. Agent loop (maximum 5 iterations):
       - Calls model and logs the LLM call.
       - If tool_calls exist, runs each tool, logs the tool call, appends ToolMessage, and loops.
       - If no tool_calls, extracts final answer.
    6. Persists only the final assistant reply in the messages table.
    """
    trace_id = str(uuid.uuid4())
    provider = get_llm_provider()
    model = settings.GEMINI_MODEL or "gemini-3.1-flash-lite"
    tools_used: List[str] = []

    # 1. Load history before adding the new message
    history = get_history(session_id, limit=20)

    # 2. Save user message to database
    save_message(session_id=session_id, role="user", content=message)

    # 3. Build LangChain messages payload with history
    messages_payload = [SystemMessage(content=SYSTEM_PROMPT)]
    for past in history:
        if past["role"] == "user":
            messages_payload.append(HumanMessage(content=past["content"]))
        elif past["role"] == "assistant":
            messages_payload.append(AIMessage(content=past["content"]))
    messages_payload.append(HumanMessage(content=message))

    # Check if API key is provided
    if not settings.GEMINI_API_KEY:
        error_msg = "GEMINI_API_KEY missing in .env file. Please add your key to enable Gemini responses."
        save_log(
            trace_id=trace_id,
            session_id=session_id,
            provider=provider,
            model=model,
            request=json.dumps({"user_message": message}),
            status="error",
            error_message=error_msg
        )
        return {
            "reply": f"⚠️ {error_msg} (Paste your Gemini key in .env)",
            "session_id": session_id,
            "tools_used": []
        }

    tool_map = {t.name: t for t in TOOLS}

    try:
        llm = get_llm(model_name=model, trace_id=trace_id, session_id=session_id)
        llm_with_tools = llm.bind_tools(TOOLS)

        # Agent Loop: Maximum 5 iterations
        for iteration in range(5):
            llm_start = time.perf_counter()
            req_dump = json.dumps({
                "iteration": iteration + 1,
                "messages_count": len(messages_payload),
                "last_message": str(messages_payload[-1].content)[:500]
            })

            response = llm_with_tools.invoke(messages_payload)
            llm_latency_ms = round((time.perf_counter() - llm_start) * 1000, 2)

            # Token usage extraction
            tokens_in, tokens_out = 0, 0
            usage = getattr(response, "usage_metadata", None)
            if isinstance(usage, dict):
                tokens_in = usage.get("input_tokens", 0)
                tokens_out = usage.get("output_tokens", 0)
            elif hasattr(response, "response_metadata") and isinstance(response.response_metadata, dict):
                token_usage = response.response_metadata.get("token_usage", {})
                tokens_in = token_usage.get("prompt_token_count", 0) or token_usage.get("prompt_tokens", 0)
                tokens_out = token_usage.get("candidates_token_count", 0) or token_usage.get("completion_tokens", 0)

            raw_reply_text = extract_text_from_content(response.content)
            current_tool_calls = getattr(response, "tool_calls", [])

            # Log this LLM call
            save_log(
                trace_id=trace_id,
                session_id=session_id,
                provider=provider,
                model=model,
                request=req_dump,
                response=json.dumps({
                    "content": raw_reply_text,
                    "tool_calls": current_tool_calls
                }),
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=llm_latency_ms,
                status="success"
            )

            messages_payload.append(response)

            # If no tool calls, this is the final answer!
            if not current_tool_calls:
                save_message(session_id=session_id, role="assistant", content=raw_reply_text)
                return {
                    "reply": raw_reply_text,
                    "session_id": session_id,
                    "tools_used": list(dict.fromkeys(tools_used))
                }

            # Execute tool calls
            for t_call in current_tool_calls:
                t_name = t_call.get("name")
                t_args = t_call.get("args", {})
                t_id = t_call.get("id") or str(uuid.uuid4())
                tools_used.append(t_name)

                t_start = time.perf_counter()
                t_status = "success"
                t_err = None
                try:
                    target_tool = tool_map.get(t_name)
                    if target_tool:
                        t_output = target_tool.invoke(t_args)
                    else:
                        t_output = f"Tool '{t_name}' not available."
                        t_status = "error"
                        t_err = t_output
                except Exception as exc:
                    t_output = f"Error executing tool '{t_name}': {str(exc)}"
                    t_status = "error"
                    t_err = str(exc)

                t_latency = round((time.perf_counter() - t_start) * 1000, 2)

                # Log this tool call
                save_log(
                    trace_id=trace_id,
                    session_id=session_id,
                    provider=provider,
                    model=model,
                    request=json.dumps(t_args),
                    response=str(t_output)[:2000],
                    tool_name=t_name,
                    tool_input=json.dumps(t_args),
                    tool_output=str(t_output)[:2000],
                    latency_ms=t_latency,
                    status=t_status,
                    error_message=t_err
                )

                # Append tool result to conversation context
                messages_payload.append(ToolMessage(content=str(t_output), tool_call_id=t_id))

        # Iteration limit reached
        limit_msg = "I apologize, but I was unable to complete your request within the allowed tool call limit."
        save_message(session_id=session_id, role="assistant", content=limit_msg)
        return {
            "reply": limit_msg,
            "session_id": session_id,
            "tools_used": list(dict.fromkeys(tools_used))
        }

    except Exception as exc:
        error_str = str(exc)
        save_log(
            trace_id=trace_id,
            session_id=session_id,
            provider=provider,
            model=model,
            request=json.dumps({"user_message": message}),
            status="error",
            error_message=error_str
        )
        return {
            "reply": f"⚠️ Gemini Assistant Error: {error_str}",
            "session_id": session_id,
            "tools_used": list(dict.fromkeys(tools_used))
        }


async def chat_stream(session_id: str, message: str):
    """
    Executes streaming agent loop. Notifies frontend when tools are called,
    executes them, and streams final answer tokens.
    """
    trace_id = str(uuid.uuid4())
    provider = get_llm_provider()
    model = settings.GEMINI_MODEL or "gemini-3.1-flash-lite"
    tools_used: List[str] = []

    history = get_history(session_id, limit=20)
    save_message(session_id=session_id, role="user", content=message)

    messages_payload = [SystemMessage(content=SYSTEM_PROMPT)]
    for past in history:
        if past["role"] == "user":
            messages_payload.append(HumanMessage(content=past["content"]))
        elif past["role"] == "assistant":
            messages_payload.append(AIMessage(content=past["content"]))
    messages_payload.append(HumanMessage(content=message))

    if not settings.GEMINI_API_KEY:
        error_msg = "GEMINI_API_KEY missing in .env file."
        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
        return

    tool_map = {t.name: t for t in TOOLS}

    try:
        llm = get_llm(model_name=model, trace_id=trace_id, session_id=session_id)
        llm_with_tools = llm.bind_tools(TOOLS)

        for iteration in range(5):
            llm_start = time.perf_counter()
            req_dump = json.dumps({
                "iteration": iteration + 1,
                "messages_count": len(messages_payload),
                "last_message": str(messages_payload[-1].content)[:500]
            })

            # Check if this iteration has tool calls
            response = llm_with_tools.invoke(messages_payload)
            llm_latency_ms = round((time.perf_counter() - llm_start) * 1000, 2)

            raw_reply_text = extract_text_from_content(response.content)
            current_tool_calls = getattr(response, "tool_calls", [])

            # Token usage extraction
            tokens_in, tokens_out = 0, 0
            usage = getattr(response, "usage_metadata", None)
            if isinstance(usage, dict):
                tokens_in = usage.get("input_tokens", 0)
                tokens_out = usage.get("output_tokens", 0)
            elif hasattr(response, "response_metadata") and isinstance(response.response_metadata, dict):
                token_usage = response.response_metadata.get("token_usage", {})
                tokens_in = token_usage.get("prompt_token_count", 0) or token_usage.get("prompt_tokens", 0)
                tokens_out = token_usage.get("candidates_token_count", 0) or token_usage.get("completion_tokens", 0)

            save_log(
                trace_id=trace_id,
                session_id=session_id,
                provider=provider,
                model=model,
                request=req_dump,
                response=json.dumps({
                    "content": raw_reply_text,
                    "tool_calls": current_tool_calls
                }),
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=llm_latency_ms,
                status="success"
            )

            messages_payload.append(response)

            if not current_tool_calls:
                # Stream the final answer chunk by chunk for the UI
                # Yield text in chunks to create the smooth streaming experience
                chunk_size = 8
                words = raw_reply_text.split(" ")
                for i in range(0, len(words), chunk_size):
                    chunk = " ".join(words[i:i + chunk_size])
                    if i + chunk_size < len(words):
                        chunk += " "
                    yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"

                save_message(session_id=session_id, role="assistant", content=raw_reply_text)
                yield f"data: {json.dumps({'type': 'done', 'session_id': session_id, 'tools_used': list(dict.fromkeys(tools_used))})}\n\n"
                return

            # Execute tool calls
            for t_call in current_tool_calls:
                t_name = t_call.get("name")
                t_args = t_call.get("args", {})
                t_id = t_call.get("id") or str(uuid.uuid4())
                tools_used.append(t_name)

                # Send tool notification to frontend
                yield f"data: {json.dumps({'type': 'tool_start', 'tool': t_name, 'args': t_args})}\n\n"

                t_start = time.perf_counter()
                t_status = "success"
                t_err = None
                try:
                    target_tool = tool_map.get(t_name)
                    if target_tool:
                        t_output = target_tool.invoke(t_args)
                    else:
                        t_output = f"Tool '{t_name}' not available."
                        t_status = "error"
                        t_err = t_output
                except Exception as exc:
                    t_output = f"Error executing tool '{t_name}': {str(exc)}"
                    t_status = "error"
                    t_err = str(exc)

                t_latency = round((time.perf_counter() - t_start) * 1000, 2)

                save_log(
                    trace_id=trace_id,
                    session_id=session_id,
                    provider=provider,
                    model=model,
                    request=json.dumps(t_args),
                    response=str(t_output)[:2000],
                    tool_name=t_name,
                    tool_input=json.dumps(t_args),
                    tool_output=str(t_output)[:2000],
                    latency_ms=t_latency,
                    status=t_status,
                    error_message=t_err
                )

                messages_payload.append(ToolMessage(content=str(t_output), tool_call_id=t_id))

        limit_msg = "I apologize, but I was unable to complete your request within the allowed tool call limit."
        save_message(session_id=session_id, role="assistant", content=limit_msg)
        yield f"data: {json.dumps({'type': 'chunk', 'text': limit_msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id, 'tools_used': list(dict.fromkeys(tools_used))})}\n\n"

    except Exception as exc:
        error_str = str(exc)
        save_log(
            trace_id=trace_id,
            session_id=session_id,
            provider=provider,
            model=model,
            request=json.dumps({"user_message": message}),
            status="error",
            error_message=error_str
        )
        yield f"data: {json.dumps({'type': 'error', 'error': error_str})}\n\n"
