from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.database import init_db, get_history, get_logs, get_trace_logs
from app import chat_service

app = FastAPI(title="AI Assistant Chatbot API")

# Enable CORS for frontend flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    tools_used: List[str] = []


@app.on_event("startup")
def on_startup():
    """Automatically create database tables on application start."""
    init_db()


@app.get("/health")
def health_check():
    """Simple health check endpoint."""
    return {"status": "ok"}


from fastapi.responses import StreamingResponse


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest):
    """Processes message via chat_service, invokes Gemini with memory, logs execution."""
    result = chat_service.chat(session_id=request.session_id, message=request.message)
    return ChatResponse(
        reply=result["reply"],
        session_id=result["session_id"],
        tools_used=result.get("tools_used", [])
    )


@app.post("/chat/stream")
async def chat_stream_endpoint(request: ChatRequest):
    """Processes message with streaming chunks for fast, real-time typing."""
    return StreamingResponse(
        chat_service.chat_stream(session_id=request.session_id, message=request.message),
        media_type="text/event-stream"
    )



@app.get("/history/{session_id}")
def history_endpoint(session_id: str):
    """Returns conversation history for a given session."""
    return get_history(session_id=session_id)


@app.get("/logs")
def logs_endpoint(
    limit: int = Query(default=100, ge=1, le=1000),
    status: Optional[str] = Query(default=None),
    session_id: Optional[str] = Query(default=None),
    tool_only: bool = Query(default=False),
    trace_id: Optional[str] = Query(default=None)
):
    """Returns filtered LLM execution logs (newest first)."""
    return get_logs(
        limit=limit,
        status=status,
        session_id=session_id,
        tool_only=tool_only,
        trace_id=trace_id
    )


@app.get("/logs/trace/{trace_id}")
def trace_logs_endpoint(trace_id: str):
    """Returns all log entries belonging to a single trace in chronological order."""
    return get_trace_logs(trace_id=trace_id)


# Mount static directory for frontend web UI
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
