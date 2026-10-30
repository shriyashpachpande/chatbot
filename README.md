# Enterprise AI Assistant & Observability Platform

A full-stack, enterprise-grade conversational AI assistant powered by Google Gemini with dual routing architecture: direct API calls or via the **Portkey AI Gateway**. The platform features real-time Server-Sent Events (SSE) streaming, persistent conversation session memory, autonomous agent tools (real-time web search and secure web scraping with SSRF protection), and end-to-end observability with local SQLite audit logging and Portkey cloud analytics.

---

## 🛠️ Tech Stack

- **Backend Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+) with [Uvicorn](https://www.uvicorn.org/) ASGI server
- **LLM Orchestration**: [LangChain](https://www.langchain.com/) (`langchain-core`, `langchain-google-genai`, `langchain-openai`)
- **AI Gateway & Observability**: [Portkey AI](https://portkey.ai/) (`portkey-ai`, unified gateway, model catalog routing)
- **Database & ORM**: SQLite with [SQLAlchemy](https://www.sqlalchemy.org/)
- **Agent Tools**: [DuckDuckGo Search](https://pypi.org/project/ddgs/) (`ddgs`), [Trafilatura](https://trafilatura.readthedocs.io/), [BeautifulSoup4](https://www.crummy.com/software/BeautifulSoup/), [HTTPX](https://www.python-httpx.org/)
- **Frontend UI**: Vanilla HTML5, Vanilla CSS3 (Custom Executive Dark Glassmorphism), Modern JavaScript (ES6+), [Bootstrap 5](https://getbootstrap.com/), [Bootstrap Icons](https://icons.getbootstrap.com/)

---

## 📁 Folder Structure

```
chatbot/
├── app/
│   ├── __init__.py          # Python package initializer
│   ├── main.py              # FastAPI application, CORS, static mounts, and API routes
│   ├── config.py            # Pydantic BaseSettings loading from .env
│   ├── database.py          # SQLite engine, models (Message, LLMLog), and CRUD queries
│   ├── llm.py               # Dual-mode LLM factory (Direct Gemini vs Portkey Gateway)
│   ├── chat_service.py      # LangChain agent loop, memory, tool binding, and streaming
│   └── tools.py             # Agent tools: web_search & fetch_url with SSRF protection
├── static/
│   ├── index.html           # Modern chat interface with suggestion cards and sidebar
│   ├── style.css            # Dark glassmorphism styling, ambient lighting, animations
│   ├── script.js            # Frontend chat client, SSE parser, session storage manager
│   ├── logs.html            # Observability dashboard with metrics, filters, and modals
│   ├── logs.css             # Dedicated styling for execution logs, table, and timeline
│   └── logs.js              # Logs dashboard controller, trace visualizer, auto-refresh
├── .env                     # Environment variables (API keys, models, gateway settings)
├── .gitignore               # Ignored directories (venv, databases, caches, logs)
├── requirements.txt         # Project Python dependencies
├── chatbot.db               # SQLite database file (auto-generated on startup)
└── README.md                # Comprehensive documentation and architecture guide
```

---

## 🚀 Setup & Installation

### 1. Prerequisites & Virtual Environment
Ensure Python 3.10+ is installed on your system.

```bash
# Clone or navigate to the repository
cd chatbot

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Windows (CMD):
.\venv\Scripts\activate.bat
# Linux / macOS:
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables (`.env`)
Create or edit the `.env` file in the project root directory:

```env
# Google Gemini Credentials
GEMINI_API_KEY=your_google_gemini_api_key_here
GEMINI_MODEL=gemini-3.1-flash-lite

# Database Configuration
DATABASE_URL=sqlite:///chatbot.db

# Portkey AI Gateway Configuration
PORTKEY_API_KEY=your_portkey_api_key_here
PORTKEY_PROVIDER=gemini
USE_PORTKEY=true
```

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio Gemini API Key |
| `GEMINI_MODEL` | Gemini Model identifier (e.g. `gemini-3.1-flash-lite`, `gemini-1.5-flash`) |
| `DATABASE_URL` | SQLAlchemy connection string (default: `sqlite:///chatbot.db`) |
| `PORTKEY_API_KEY` | Portkey API Key from your Portkey dashboard |
| `PORTKEY_PROVIDER` | Integration slug configured in Portkey (e.g., `gemini`) |
| `USE_PORTKEY` | `true` to route via Portkey Gateway; `false` for direct Gemini |

### 4. Run Development Server
```bash
uvicorn app.main:app --reload
```

Open your browser:
- **Chat Web Application**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Observability & Logs Dashboard**: [http://127.0.0.1:8000/logs.html](http://127.0.0.1:8000/logs.html)
- **Interactive Swagger Documentation**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Health Check**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

---

## 🏛️ Architecture Flow

```
[Browser Client (Web UI)]
         │
         ▼  (HTTP POST /chat or POST /chat/stream)
[FastAPI Server (app/main.py)]
         │
         ▼
[LangChain Agent Loop (app/chat_service.py)]
   ├── 1. Persists user query to SQLite (`messages` table)
   ├── 2. Loads last 20 messages for session memory
   ├── 3. Generates unique turn `trace_id` (UUID4)
   │
   ▼
[LLM Factory (app/llm.py)]
   │
   ├── If USE_PORTKEY = false ──► [ChatGoogleGenerativeAI] ──► [Google Gemini API]
   │
   └── If USE_PORTKEY = true  ──► [ChatOpenAI via Portkey Gateway]
                                          │ (x-portkey-trace-id, metadata)
                                          ▼
                                   [Portkey AI Gateway (api.portkey.ai/v1)]
                                          │
                                          ▼
                                   [Google Gemini API]
   │
   ├── [Tool Calling Check]
   │    ├── Needs Tool? ──► Calls `web_search` or `fetch_url` (with SSRF check)
   │    │                   Logs tool input/output to SQLite & continues loop
   │    └── Final Answer? ──► Streams tokens to UI, saves assistant reply
   │
   ▼
[Dual Audit Logging Destination]
   ├── Local SQLite DB: `chatbot.db` (`llm_logs` table)
   └── Cloud Gateway: Portkey Observability Dashboard (matched by `trace_id`)
```

---

## 📊 Logging: SQLite vs. Portkey Comparison

Both logging systems operate concurrently and are linked via `trace_id`.

| Feature / Criteria | Own Local SQLite Logging | Portkey AI Gateway |
|---|---|---|
| **Data Control & Ownership** | 100% On-premise / Local | Hosted in Cloud |
| **Setup Effort** | Zero (automatic SQLite table creation) | Low (requires Portkey API key & slug) |
| **Dashboard Quality** | Lightweight embedded web viewer (`/logs.html`) | Full-featured enterprise analytics & tracing |
| **Vendor Dependency** | None (self-hosted SQLite) | Dependent on Portkey cloud uptime |
| **Cost** | Free (Local disk storage) | Free tier available / Usage-based pricing |
| **Privacy & Security** | Sensitive data remains strictly local | Payloads pass through gateway |
| **Key Features** | Custom SQL queries, zero egress, instant local inspect | Cost tracking, semantic caching, rate limiting |

---

## 🔍 How to View Execution Logs

1. **Embedded Web UI (`/logs.html`)**:
   - Access [http://127.0.0.1:8000/logs.html](http://127.0.0.1:8000/logs.html) directly or click **Logs** in the chat header.
   - Live metrics: Total calls, errors, average latency, and total tokens.
   - Filter by status (`success`/`error`), session ID, or tool calls only.
   - Click any **Trace ID** badge to visualize the chronological flow (LLM Call ➔ Tool Call ➔ LLM Call).
   - Click any **row** to inspect raw request/response payloads with full JSON formatting and API key redaction.
   - Toggle **Live (5s)** for real-time background polling.

2. **DB Browser for SQLite**:
   - Open `chatbot.db` with [DB Browser for SQLite](https://sqlitebrowser.org/).
   - Inspect the `messages` and `llm_logs` tables directly.

3. **Portkey Cloud Dashboard**:
   - Log into [https://app.portkey.ai/](https://app.portkey.ai/).
   - View latency percentiles, token consumption, request traces, and correlate logs using the same `trace_id`.

---

## 🔒 Security & Data Protection

- **API Key Redaction**: Automatic sanitizer in `app/database.py` strips `GEMINI_API_KEY` and `PORTKEY_API_KEY` from request/response bodies before persisting into `llm_logs`.
- **SSRF Prevention**: `app/tools.py` resolves domains and blocks internal/private IP ranges (`127.0.0.1`, `localhost`, `10.0.0.0/8`, `192.168.0.0/16`, link-local, loopback, and multicast).
- **XSS Prevention**: All frontend text renders using safe DOM manipulation and explicit HTML character escaping.

---

## ⚠️ Known Limitations & Future Improvements

- **Database Scaling**: SQLite is ideal for development and single-node setups. For distributed enterprise deployments, migrate to PostgreSQL via SQLAlchemy.
- **RAG & Document Uploads**: Add vector database support (e.g., ChromaDB, pgvector) for PDF and document question-answering.
- **User Authentication**: Implement JWT or OAuth2 authentication for multi-user session isolation.
