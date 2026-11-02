# 🤖 Enterprise AI Assistant & Observability Platform

A full-stack, enterprise-ready conversational AI assistant built with **FastAPI**, **LangChain**, and **Google Gemini**, featuring **Portkey AI Gateway** integration with seamless automatic fallback, real-time token-by-token streaming, persistent multi-thread conversation history, autonomous agent tools (web search and webpage scraping), and dual local/cloud observability.

---

## 🌟 Key Features

- **ChatGPT/Claude Style Interface**: Modern 2-column desktop sidebar with dark glassmorphism design, full conversation threads, conversation renaming, deleting, and keyboard shortcuts (`Ctrl+K` for new chat).
- **True Real-Time Token Streaming**: Server-Sent Events (SSE) streaming tokens word-by-word with zero buffering or delay.
- **Rich Markdown & Code Highlighting**: Full GitHub Flavored Markdown (GFM) rendering with syntax-highlighted code blocks, language badges, and one-click code copy buttons.
- **Dual-Routing LLM Architecture**:
  - **Option 1 (Direct Gemini)**: Native connection to Google AI Studio via `ChatGoogleGenerativeAI`.
  - **Option 2 (Portkey AI Gateway)**: Standard OpenAI-compatible routing (`ChatOpenAI`) via Portkey with centralized tracing, analytics, and virtual keys.
  - **Automatic Fallback**: If Portkey Gateway is unavailable or fails, requests automatically fall back to Direct Gemini without user downtime.
- **Autonomous Agent Tools**:
  - `web_search`: Live search via DuckDuckGo (`ddgs`) for real-time news and up-to-date facts.
  - `fetch_url`: Safe webpage scraper with SSRF (Server-Side Request Forgery) protection.
- **Full Observability & Audit Logging**:
  - Local embedded dashboard at `/logs.html` for inspecting execution traces, token consumption, latency, and sanitized payloads.
  - Optional cloud dashboard correlation on Portkey AI via unified `trace_id`.

---

## 💡 What is Portkey AI? (For Beginners)

If you are new to AI engineering, you might wonder: **"What is Portkey and why do I need it?"**

Normally, an application connects directly to an LLM provider (like Google Gemini or OpenAI). However, in production, you often need:
1. **Observability**: Tracking how many tokens you use, what your queries cost, and how fast the model responds.
2. **Unified API Gateway**: Calling multiple providers (Gemini, Claude, GPT-4) using a single standard format (OpenAI-compatible) without installing vendor-specific libraries.
3. **Virtual Keys**: Managing API keys securely in the cloud without storing raw provider keys in your local `.env` files.
4. **Reliability & Fallbacks**: Automatically retrying or routing to a fallback model if a provider experiences outages.

**[Portkey AI](https://portkey.ai/)** acts as an intelligent proxy between your application and your AI models to handle all of this. In this project:
- We use the Portkey Gateway **without requiring the heavy `portkey-ai` library** (using standard HTTP headers and `ChatOpenAI`).
- You can run the app with **only Portkey**, **only Gemini**, or **both with automatic fallback**.

---

## 🔄 Dual-Routing & Automatic Fallback Architecture

| Scenario | Configuration | What Happens Under the Hood | Required Keys |
|---|---|---|---|
| **Direct Google Gemini** (Simplest) | `USE_PORTKEY=false` | App talks directly to Google AI Studio via LangChain's `ChatGoogleGenerativeAI`. | Only `GEMINI_API_KEY` |
| **Portkey Gateway** (Recommended for Analytics) | `USE_PORTKEY=true` | App sends requests to Portkey Gateway (`https://api.portkey.ai/v1`) using `ChatOpenAI`. Portkey logs traces and routes to Gemini. | `PORTKEY_API_KEY` (Gemini key can be stored in Portkey dashboard) |
| **Automatic Fallback** | `USE_PORTKEY=true` with both keys present | If Portkey network call fails or times out, the system automatically falls back to Direct Gemini so the user never gets an error. | Both `PORTKEY_API_KEY` and `GEMINI_API_KEY` |

```
                       [Browser Client (Web UI)]
                                  │
                                  ▼  (SSE /chat/stream)
                       [FastAPI Backend (app/main.py)]
                                  │
                                  ▼
                   [LangChain Agent (app/chat_service.py)]
                                  │
                 ┌────────────────┴────────────────┐
                 │                                 │
     (If USE_PORTKEY = true)             (If USE_PORTKEY = false)
                 │                                 │
                 ▼                                 ▼
       [Portkey AI Gateway]              [Direct Google Gemini]
     (api.portkey.ai/v1)              (generativelanguage.googleapis.com)
                 │                                 │
                 │ (Automatic Fallback on error)  │
                 └────────────────►────────────────┘
                                  │
                                  ▼
                     [Autonomous Tools Execution]
                     ├── web_search (DuckDuckGo)
                     └── fetch_url (SSRF-protected)
                                  │
                                  ▼
                    [Local SQLite Audit Logs (llm_logs)]
```

---

## 🔑 How to Get Your API Keys

You only need **at least one** of the following to run the application:

### Option A: Get a Google Gemini API Key (Direct Mode)
1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google Account.
3. Click on the **"Get API key"** button in the top left.
4. Click **"Create API key"** (select or create a Google Cloud project).
5. Copy the generated key and save it as `GEMINI_API_KEY` in your `.env` file.

### Option B: Get a Portkey AI API Key (Gateway Mode)
1. Sign up or log into [Portkey AI](https://app.portkey.ai/).
2. In the left navigation bar, navigate to **Settings** ➔ **API Keys**.
3. Click **"Add Key"**, name your key, and copy the secret key.
4. Set `PORTKEY_API_KEY=your_key_here` and `USE_PORTKEY=true` in your `.env` file.
5. *(Optional but recommended)*: In your Portkey dashboard, go to **Virtual Keys** or **Integrations**, add your Gemini API key there. Now your application doesn't even need `GEMINI_API_KEY` in the local `.env`!

---

## 🛠️ Tech Stack

- **Backend Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+) with [Uvicorn](https://www.uvicorn.org/)
- **LLM Orchestration**: [LangChain](https://www.langchain.com/) (`langchain-core`, `langchain-google-genai`, `langchain-openai`)
- **AI Gateway & Observability**: [Portkey AI](https://portkey.ai/) (Standard OpenAI-compatible REST integration)
- **Database & Storage**: SQLite with [SQLAlchemy](https://www.sqlalchemy.org/) ORM
- **Agent Tools**: [DuckDuckGo Search](https://pypi.org/project/ddgs/) (`ddgs`), [BeautifulSoup4](https://www.crummy.com/software/BeautifulSoup/), [HTTPX](https://www.python-httpx.org/)
- **Frontend UI**: Vanilla JavaScript (ES6+), Vanilla CSS3, Bootstrap 5, Marked.js (Markdown), Highlight.js (Code highlighting)

---

## 📁 Directory Structure

```
chatbot/
├── app/
│   ├── __init__.py          # Package initializer
│   ├── main.py              # FastAPI app, API routes, static mounts
│   ├── config.py            # Pydantic BaseSettings loading from .env
│   ├── database.py          # SQLite engine, models (ChatSession, Message, LLMLog)
│   ├── llm.py               # Dual-routing LLM factory (Direct Gemini vs Portkey Gateway)
│   ├── chat_service.py      # Agent loop, memory, tool execution, and token streaming
│   └── tools.py             # Autonomous agent tools: web_search & fetch_url
├── static/
│   ├── index.html           # Modern ChatGPT-style chat workspace
│   ├── style.css            # Executive dark glassmorphism styling & animations
│   ├── script.js            # Frontend client, SSE stream parser, markdown renderer
│   ├── logs.html            # Observability dashboard with metrics & trace view
│   ├── logs.css             # Observability styling
│   └── logs.js              # Logs dashboard controller & trace timeline
├── .env                     # Local environment variables
├── .env.example             # Template for environment configuration
├── requirements.txt         # Python dependencies
├── chatbot.db               # SQLite database (auto-created on startup)
└── README.md                # Documentation and architecture guide
```

---

## 🚀 Installation & Setup

### 1. Clone & Navigate
```bash
git clone https://github.com/shriyashpachpande/chatbot.git
cd chatbot
```

### 2. Create and Activate Virtual Environment
```bash
# Create virtual environment
python -m venv venv

# Activate on Windows (PowerShell):
.\venv\Scripts\Activate.ps1

# Activate on Windows (CMD):
.\venv\Scripts\activate.bat

# Activate on Linux / macOS:
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure `.env` File
Create a `.env` file in the project root:

```env
# ==========================================
# Option 1: Direct Google Gemini (Default)
# ==========================================
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Database URL (Default: local SQLite)
DATABASE_URL=sqlite:///chatbot.db

# ==========================================
# Option 2: Portkey AI Gateway
# ==========================================
# Set USE_PORTKEY=true if routing through Portkey Gateway
USE_PORTKEY=false
PORTKEY_API_KEY=your_portkey_api_key_here

# Optional: Virtual Key or Provider Slug in Portkey
PORTKEY_VIRTUAL_KEY=
PORTKEY_PROVIDER=
```

### 5. Start the Application
Make sure your virtual environment is active, then run:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open your browser:
- **Chat Web App**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Observability Dashboard**: [http://127.0.0.1:8000/logs.html](http://127.0.0.1:8000/logs.html)
- **Interactive Swagger API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Health Check**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

---

## 🔒 Security & Data Sanitization

1. **API Key Redaction**: `app/database.py` contains an automatic sanitization filter that strips all instances of `GEMINI_API_KEY` and `PORTKEY_API_KEY` from logs before they are saved to disk or transmitted to the UI.
2. **SSRF Prevention**: `app/tools.py` validates requested domains and blocks private IP ranges (`127.0.0.1`, `localhost`, `10.0.0.0/8`, `192.168.0.0/16`, link-local, loopback, and multicast).
3. **Safe Markdown Rendering**: Frontend uses safe DOM parsing to prevent XSS (Cross-Site Scripting).

---

## 📄 License

This project is licensed under the MIT License - feel free to use and modify for personal and commercial projects.
