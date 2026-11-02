from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy import create_engine, Column, Integer, String, Text, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# SQLite Database Setup
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 20} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(128), index=True, nullable=False)
    role = Column(String(32), nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class LLMLog(Base):
    __tablename__ = "llm_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    trace_id = Column(String(128), index=True, nullable=False)
    session_id = Column(String(128), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    provider = Column(String(64), nullable=False)  # e.g., "google"
    model = Column(String(128), nullable=False)
    request = Column(Text, nullable=False)  # JSON string
    response = Column(Text, nullable=True)  # JSON string
    tool_name = Column(String(128), nullable=True)
    tool_input = Column(Text, nullable=True)
    tool_output = Column(Text, nullable=True)
    tokens_in = Column(Integer, default=0, nullable=False)
    tokens_out = Column(Integer, default=0, nullable=False)
    latency_ms = Column(Float, default=0.0, nullable=False)
    status = Column(String(32), nullable=False)  # "success" or "error"
    error_message = Column(Text, nullable=True)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(128), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


def init_db():
    """Create tables automatically if they do not exist."""
    Base.metadata.create_all(bind=engine)


def save_message(session_id: str, role: str, content: str) -> Dict[str, Any]:
    """Saves a single message row and ensures the chat session exists with a title."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        msg = Message(session_id=session_id, role=role, content=content, created_at=now)
        db.add(msg)

        # Ensure chat_sessions table tracks this session
        chat_sess = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
        if not chat_sess:
            clean_title = content.strip().replace("\n", " ")
            if len(clean_title) > 36:
                clean_title = clean_title[:34].rstrip() + "..."
            if not clean_title:
                clean_title = "New Chat"
            chat_sess = ChatSession(session_id=session_id, title=clean_title, created_at=now, updated_at=now)
            db.add(chat_sess)
        else:
            chat_sess.updated_at = now

        db.commit()
        db.refresh(msg)
        return {
            "id": msg.id,
            "session_id": msg.session_id,
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at.isoformat()
        }
    finally:
        db.close()


def get_history(session_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Retrieves message history for a given session, ordered chronologically."""
    db = SessionLocal()
    try:
        query = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at.asc())
        if limit:
            # Get last `limit` messages
            query = query.order_by(Message.created_at.desc()).limit(limit)
            messages = query.all()[::-1]
        else:
            messages = query.all()

        return [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat()
            }
            for m in messages
        ]
    finally:
        db.close()


def _sanitize_log_text(text: Optional[str]) -> Optional[str]:
    """Ensure no API keys are ever stored in logs or returned."""
    if not text:
        return text
    sanitized = text
    if getattr(settings, "GEMINI_API_KEY", None):
        sanitized = sanitized.replace(settings.GEMINI_API_KEY, "[REDACTED_GEMINI_KEY]")
    if getattr(settings, "PORTKEY_API_KEY", None):
        sanitized = sanitized.replace(settings.PORTKEY_API_KEY, "[REDACTED_PORTKEY_KEY]")
    return sanitized


def save_log(
    trace_id: str,
    session_id: str,
    provider: str,
    model: str,
    request: str,
    response: Optional[str] = None,
    tool_name: Optional[str] = None,
    tool_input: Optional[str] = None,
    tool_output: Optional[str] = None,
    tokens_in: int = 0,
    tokens_out: int = 0,
    latency_ms: float = 0.0,
    status: str = "success",
    error_message: Optional[str] = None
) -> int:
    """Writes a single execution log entry into the llm_logs table with API key redaction."""
    db = SessionLocal()
    try:
        log_entry = LLMLog(
            trace_id=trace_id,
            session_id=session_id,
            created_at=datetime.utcnow(),
            provider=provider,
            model=model,
            request=_sanitize_log_text(request),
            response=_sanitize_log_text(response),
            tool_name=tool_name,
            tool_input=_sanitize_log_text(tool_input),
            tool_output=_sanitize_log_text(tool_output),
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=latency_ms,
            status=status,
            error_message=_sanitize_log_text(error_message)
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry.id
    finally:
        db.close()


def get_logs(
    limit: int = 100,
    status: Optional[str] = None,
    session_id: Optional[str] = None,
    tool_only: bool = False,
    trace_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Fetches filtered LLM execution logs, newest first."""
    db = SessionLocal()
    try:
        query = db.query(LLMLog)
        if status:
            query = query.filter(LLMLog.status == status)
        if session_id:
            query = query.filter(LLMLog.session_id == session_id)
        if trace_id:
            query = query.filter(LLMLog.trace_id == trace_id)
        if tool_only:
            query = query.filter(LLMLog.tool_name.isnot(None), LLMLog.tool_name != "")

        logs = query.order_by(LLMLog.created_at.desc(), LLMLog.id.desc()).limit(limit).all()
        return [
            {
                "id": l.id,
                "trace_id": l.trace_id,
                "session_id": l.session_id,
                "created_at": l.created_at.isoformat(),
                "provider": l.provider,
                "model": l.model,
                "request": l.request,
                "response": l.response,
                "tool_name": l.tool_name,
                "tool_input": l.tool_input,
                "tool_output": l.tool_output,
                "tokens_in": l.tokens_in,
                "tokens_out": l.tokens_out,
                "latency_ms": l.latency_ms,
                "status": l.status,
                "error_message": l.error_message
            }
            for l in logs
        ]
    finally:
        db.close()


def get_trace_logs(trace_id: str) -> List[Dict[str, Any]]:
    """Fetches all log rows for a single trace_id in chronological order."""
    db = SessionLocal()
    try:
        logs = db.query(LLMLog).filter(LLMLog.trace_id == trace_id).order_by(LLMLog.created_at.asc(), LLMLog.id.asc()).all()
        return [
            {
                "id": l.id,
                "trace_id": l.trace_id,
                "session_id": l.session_id,
                "created_at": l.created_at.isoformat(),
                "provider": l.provider,
                "model": l.model,
                "request": l.request,
                "response": l.response,
                "tool_name": l.tool_name,
                "tool_input": l.tool_input,
                "tool_output": l.tool_output,
                "tokens_in": l.tokens_in,
                "tokens_out": l.tokens_out,
                "latency_ms": l.latency_ms,
                "status": l.status,
                "error_message": l.error_message
            }
            for l in logs
        ]
    finally:
        db.close()


def get_all_sessions() -> List[Dict[str, Any]]:
    """Returns all chat sessions with their titles, message counts, and timestamps."""
    from sqlalchemy import func
    db = SessionLocal()
    try:
        # Fetch from chat_sessions table
        sessions = db.query(ChatSession).order_by(ChatSession.updated_at.desc()).all()
        results = []
        for s in sessions:
            msg_count = db.query(func.count(Message.id)).filter(Message.session_id == s.session_id).scalar() or 0
            results.append({
                "session_id": s.session_id,
                "title": s.title,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
                "message_count": msg_count,
            })
        return results
    finally:
        db.close()


def update_session_title(session_id: str, new_title: str) -> bool:
    """Updates the custom title for a chat session."""
    db = SessionLocal()
    try:
        s = db.query(ChatSession).filter(ChatSession.session_id == session_id).first()
        if s:
            s.title = new_title.strip()[:100] or "Conversation"
            s.updated_at = datetime.utcnow()
            db.commit()
            return True
        return False
    except Exception:
        db.rollback()
        return False
    finally:
        db.close()


def delete_session(session_id: str) -> bool:
    """Deletes all messages, session records, and logs associated with a session_id."""
    db = SessionLocal()
    try:
        db.query(ChatSession).filter(ChatSession.session_id == session_id).delete(synchronize_session=False)
        db.query(Message).filter(Message.session_id == session_id).delete(synchronize_session=False)
        db.query(LLMLog).filter(LLMLog.session_id == session_id).delete(synchronize_session=False)
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False
    finally:
        db.close()


