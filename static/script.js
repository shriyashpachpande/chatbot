// ==========================================================
// Executive AI Assistant - Client Controller & Real-Time Engine
// Full Markdown Rendering, Code Highlighting, and Session Switcher
// ==========================================================

const STORAGE_KEY = "ai_assistant_session_id";
const SIDEBAR_PREF_KEY = "ai_assistant_sidebar_collapsed";

// Helper: UUID Generator
function generateUUID() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
}

function getOrCreateSessionId() {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

let currentSessionId = getOrCreateSessionId();

// DOM Elements
const chatViewport = document.getElementById("chatViewport");
const conversationStream = document.getElementById("conversationStream");
const welcomeSection = document.getElementById("welcomeSection");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingIndicator = document.getElementById("typingIndicator");
const sessionInfoBtn = document.getElementById("sessionInfoBtn");
const sessionDisplay = document.getElementById("sessionDisplay");
const activeChatTitle = document.getElementById("activeChatTitle");
const renameActiveChatBtn = document.getElementById("renameActiveChatBtn");
const messageCountDisplay = document.getElementById("messageCountDisplay");
const sessionCountBadge = document.getElementById("sessionCountBadge");
const suggestionCards = document.querySelectorAll(".suggestion-card");

// Sidebar DOM Elements
const chatSidebar = document.getElementById("chatSidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const openSidebarBtn = document.getElementById("openSidebarBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const newChatBtn = document.getElementById("newChatBtn");
const sidebarNewChatBtn = document.getElementById("sidebarNewChatBtn");
const sessionsListContainer = document.getElementById("sessionsListContainer");

// Configure Marked.js for GitHub Flavored Markdown
if (window.marked) {
  marked.setOptions({
    breaks: true,
    gfm: true
  });
}

// ==========================================================
// Markdown Rendering & Syntax Highlighting Engine
// ==========================================================

function renderMarkdownContent(rawText) {
  if (!rawText) return "";

  let html = "";
  if (window.marked) {
    try {
      html = marked.parse(rawText);
    } catch (e) {
      console.warn("Markdown parse error:", e);
      html = escapeHtml(rawText);
    }
  } else {
    html = escapeHtml(rawText);
  }

  // Parse HTML into temporary DOM to enhance code blocks and links
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  // Make external links target="_blank"
  tempDiv.querySelectorAll("a").forEach(a => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });

  // Enhance code blocks with custom headers and copy buttons
  tempDiv.querySelectorAll("pre code").forEach(codeBlock => {
    // Syntax highlight with highlight.js if available
    if (window.hljs) {
      hljs.highlightElement(codeBlock);
    }

    const pre = codeBlock.parentElement;
    if (pre && !pre.parentElement.classList.contains("code-block-wrapper")) {
      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";

      const header = document.createElement("div");
      header.className = "code-block-header";

      // Detect language
      let lang = "code";
      codeBlock.classList.forEach(cls => {
        if (cls.startsWith("language-")) {
          lang = cls.replace("language-", "");
        }
      });
      header.innerHTML = `
        <span><i class="bi bi-file-code me-1"></i>${lang}</span>
        <button class="btn-copy-code" type="button" title="Copy code snippet">
          <i class="bi bi-clipboard me-1"></i>Copy
        </button>
      `;

      // Copy code event
      const copyBtn = header.querySelector(".btn-copy-code");
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(codeBlock.innerText);
        copyBtn.innerHTML = `<i class="bi bi-check2 text-success me-1"></i>Copied!`;
        setTimeout(() => {
          copyBtn.innerHTML = `<i class="bi bi-clipboard me-1"></i>Copy`;
        }, 2000);
      });

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    }
  });

  return tempDiv.innerHTML;
}

function escapeHtml(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p.innerHTML;
}

// ==========================================================
// Time & UI Utilities
// ==========================================================

function formatTime(dateStr) {
  let date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) date = new Date();
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
  return `${hours}:${formattedMinutes} ${ampm}`;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return "Just now";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Recently";

  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return formatTime(dateStr);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function scrollToBottom() {
  chatViewport.scrollTo({
    top: chatViewport.scrollHeight,
    behavior: "smooth"
  });
}

function updateSessionHeader(title = null) {
  if (sessionDisplay) {
    sessionDisplay.textContent = `ID: ${currentSessionId.substring(0, 8)}...`;
  }
  if (activeChatTitle) {
    activeChatTitle.textContent = title || "Active Conversation";
  }
}
updateSessionHeader();

// Format Tools Used Badge
function formatToolsUsedBadge(toolsUsed) {
  if (!toolsUsed || toolsUsed.length === 0) return "";
  const badges = [];
  if (toolsUsed.includes("web_search")) {
    badges.push(`<span class="tool-badge"><i class="bi bi-search"></i> <em>Searched web</em></span>`);
  }
  if (toolsUsed.includes("fetch_url")) {
    badges.push(`<span class="tool-badge"><i class="bi bi-link-45deg"></i> <em>Read webpage</em></span>`);
  }
  if (badges.length === 0) return "";
  return `<div class="tools-used-container">${badges.join(" ")}</div>`;
}

// ==========================================================
// Message Rendering (Append & Stream)
// ==========================================================

function appendMessage(text, sender = "bot", isError = false, timestamp = null, toolsUsed = []) {
  const item = document.createElement("div");
  item.className = `message-item ${sender}-message`;

  const timeLabel = formatTime(timestamp);

  if (sender === "bot") {
    item.innerHTML = `
      <div class="msg-avatar bot-avatar">
        <i class="bi bi-robot"></i>
      </div>
      <div class="msg-body">
        <div class="msg-header-row">
          <span class="msg-sender-name">AI Assistant</span>
        </div>
        <div class="msg-card ${isError ? 'error-card' : ''}">
          ${formatToolsUsedBadge(toolsUsed)}
          <div class="msg-text">${renderMarkdownContent(text)}</div>
          <div class="msg-footer">
            <button class="btn-copy-msg" type="button" title="Copy full response">
              <i class="bi bi-clipboard"></i> <span>Copy</span>
            </button>
            <span class="msg-time">${timeLabel}</span>
          </div>
        </div>
      </div>
    `;

    // Copy entire response button handler
    const copyMsgBtn = item.querySelector(".btn-copy-msg");
    copyMsgBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(text);
      copyMsgBtn.innerHTML = `<i class="bi bi-check2 text-success"></i> <span>Copied!</span>`;
      setTimeout(() => {
        copyMsgBtn.innerHTML = `<i class="bi bi-clipboard"></i> <span>Copy</span>`;
      }, 2000);
    });

  } else {
    item.innerHTML = `
      <div class="msg-body">
        <div class="msg-header-row">
          <span class="msg-sender-name">You</span>
        </div>
        <div class="msg-card">
          <div class="msg-text">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
          <div class="msg-footer justify-content-end">
            <span class="msg-time">${timeLabel}</span>
          </div>
        </div>
      </div>
      <div class="msg-avatar user-avatar">
        <i class="bi bi-person-fill"></i>
      </div>
    `;
  }

  conversationStream.insertBefore(item, typingIndicator);
  scrollToBottom();
}

function showTypingIndicator() {
  typingIndicator.classList.remove("d-none");
  conversationStream.appendChild(typingIndicator);
  scrollToBottom();
}

function hideTypingIndicator() {
  typingIndicator.classList.add("d-none");
}

// Create Live Streaming Bot Message Bubble
function createStreamingBotMessage() {
  const item = document.createElement("div");
  item.className = "message-item bot-message";
  const timeLabel = formatTime();

  item.innerHTML = `
    <div class="msg-avatar bot-avatar">
      <i class="bi bi-robot"></i>
    </div>
    <div class="msg-body">
      <div class="msg-header-row">
        <span class="msg-sender-name">AI Assistant</span>
      </div>
      <div class="msg-card">
        <div class="msg-text"></div>
        <div class="msg-footer">
          <button class="btn-copy-msg" type="button" title="Copy response">
            <i class="bi bi-clipboard"></i> <span>Copy</span>
          </button>
          <span class="msg-time">${timeLabel}</span>
        </div>
      </div>
    </div>
  `;

  conversationStream.insertBefore(item, typingIndicator);
  scrollToBottom();

  const textElement = item.querySelector(".msg-text");
  const cardElement = item.querySelector(".msg-card");
  const copyMsgBtn = item.querySelector(".btn-copy-msg");
  let fullAccumulated = "";

  copyMsgBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(fullAccumulated);
    copyMsgBtn.innerHTML = `<i class="bi bi-check2 text-success"></i> <span>Copied!</span>`;
    setTimeout(() => {
      copyMsgBtn.innerHTML = `<i class="bi bi-clipboard"></i> <span>Copy</span>`;
    }, 2000);
  });

  return {
    updateText: (rawText) => {
      fullAccumulated = rawText;
      textElement.innerHTML = renderMarkdownContent(rawText);
      scrollToBottom();
    },
    setToolsUsed: (toolsUsed) => {
      let badgeDiv = item.querySelector(".tools-used-container");
      if (!badgeDiv) {
        badgeDiv = document.createElement("div");
        badgeDiv.className = "tools-used-container";
        cardElement.insertBefore(badgeDiv, textElement);
      }
      badgeDiv.innerHTML = formatToolsUsedBadge(toolsUsed);
      scrollToBottom();
    },
    setError: (errText) => {
      cardElement.classList.add("error-card");
      textElement.innerHTML = `<p>⚠️ ${escapeHtml(errText)}</p>`;
      scrollToBottom();
    }
  };
}

function clearAllMessagesFromScreen() {
  const items = conversationStream.querySelectorAll(".message-item:not(#typingIndicator)");
  items.forEach(el => el.remove());
}

// Load Previous Session History from Database
async function loadSessionHistory(targetSessionId = currentSessionId) {
  clearAllMessagesFromScreen();

  try {
    const res = await fetch(`/history/${encodeURIComponent(targetSessionId)}`);
    if (!res.ok) return;

    const history = await res.json();
    if (Array.isArray(history) && history.length > 0) {
      if (welcomeSection) {
        welcomeSection.style.display = "none";
      }
      if (messageCountDisplay) {
        messageCountDisplay.textContent = `${history.length} messages`;
      }
      history.forEach(item => {
        const sender = (item.role === "assistant" || item.role === "bot") ? "bot" : "user";
        appendMessage(item.content, sender, false, item.created_at);
      });
      scrollToBottom();
    } else {
      if (welcomeSection) {
        welcomeSection.style.display = "block";
        welcomeSection.style.opacity = "1";
      }
      if (messageCountDisplay) {
        messageCountDisplay.textContent = "New Conversation";
      }
    }
  } catch (err) {
    console.warn("Could not load history:", err);
  }
}

// ==========================================================
// Dispatch Message with True Real-Time Token Streaming
// ==========================================================

async function handleUserMessage(message) {
  if (!message || message.trim() === "") return;

  if (welcomeSection && welcomeSection.style.display !== "none") {
    welcomeSection.style.display = "none";
  }

  appendMessage(message, "user");
  messageInput.value = "";
  autoResizeTextarea();

  showTypingIndicator();
  sendBtn.disabled = true;

  try {
    const response = await fetch("/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: currentSessionId,
        message: message
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let botBubble = null;
    let accumulatedText = "";
    let buffer = "";
    const activeTools = new Set();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();

      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.substring(6));
            if (data.type === "tool_start") {
              if (data.tool) {
                activeTools.add(data.tool);
                if (!botBubble) {
                  botBubble = createStreamingBotMessage();
                }
                botBubble.setToolsUsed(Array.from(activeTools));
              }
            } else if (data.type === "chunk") {
              // Real-time token reception: immediately parses and formats markdown!
              hideTypingIndicator();
              if (!botBubble) {
                botBubble = createStreamingBotMessage();
              }
              accumulatedText += data.text;
              botBubble.updateText(accumulatedText);
            } else if (data.type === "error") {
              hideTypingIndicator();
              if (!botBubble) {
                botBubble = createStreamingBotMessage();
              }
              botBubble.setError(data.error);
            } else if (data.type === "done") {
              hideTypingIndicator();
              if (data.tools_used && data.tools_used.length > 0 && botBubble) {
                data.tools_used.forEach(t => activeTools.add(t));
                botBubble.setToolsUsed(Array.from(activeTools));
              }
              loadSessionsList(false);
            }
          } catch (e) {
            console.error("Chunk parse error:", e);
          }
        }
      }
    }

    hideTypingIndicator();
  } catch (error) {
    hideTypingIndicator();
    console.error("Assistant Error:", error);
    appendMessage("⚠️ Connection error: Unable to communicate with backend. Please ensure the server is running.", "bot", true);
  } finally {
    hideTypingIndicator();
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

// ==========================================================
// Conversations List & Thread Management
// ==========================================================

async function loadSessionsList(showLoading = true) {
  if (!sessionsListContainer) return;
  if (showLoading) {
    sessionsListContainer.innerHTML = `
      <div class="text-center text-muted p-4">
        <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
        <div class="small">Loading conversations...</div>
      </div>
    `;
  }

  try {
    const res = await fetch("/sessions");
    if (!res.ok) throw new Error("Failed to load sessions");

    const sessions = await res.json();
    if (!Array.isArray(sessions) || sessions.length === 0) {
      sessionsListContainer.innerHTML = `
        <div class="text-center text-muted p-4">
          <i class="bi bi-chat-dots fs-3 d-block mb-2 text-secondary"></i>
          <div class="small fw-medium">No past conversations.</div>
          <small class="text-dim">Send a message to start!</small>
        </div>
      `;
      if (sessionCountBadge) sessionCountBadge.textContent = "0 chats";
      return;
    }

    if (sessionCountBadge) {
      sessionCountBadge.textContent = `${sessions.length} chats`;
    }

    sessionsListContainer.innerHTML = "";
    sessions.forEach(sess => {
      const isActive = sess.session_id === currentSessionId;
      if (isActive && activeChatTitle && activeChatTitle.textContent === "Active Conversation") {
        activeChatTitle.textContent = sess.title || "Conversation";
      }

      const itemEl = document.createElement("div");
      itemEl.className = `session-item ${isActive ? 'active' : ''}`;
      itemEl.setAttribute("data-session-id", sess.session_id);

      const timeText = formatRelativeDate(sess.updated_at || sess.created_at);

      itemEl.innerHTML = `
        <div class="session-item-content">
          <div class="session-item-title" title="${sess.title || 'Conversation'}">
            <i class="bi bi-chat-left-text me-1 text-primary"></i>
            ${sess.title || 'Conversation'}
          </div>
          <div class="session-item-meta">
            <span>${timeText}</span>
            <span>•</span>
            <span>${sess.message_count || 0} msgs</span>
          </div>
        </div>
        <div class="session-item-actions">
          <button class="session-action-btn btn-rename" title="Rename" data-id="${sess.session_id}">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="session-action-btn btn-delete" title="Delete" data-id="${sess.session_id}">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      `;

      itemEl.addEventListener("click", (e) => {
        if (e.target.closest(".session-item-actions")) return;
        switchSession(sess.session_id, sess.title);
      });

      const renameBtn = itemEl.querySelector(".btn-rename");
      renameBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await renameSession(sess.session_id, sess.title || "");
      });

      const delBtn = itemEl.querySelector(".btn-delete");
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Delete conversation "${sess.title}"?`)) {
          await deleteSession(sess.session_id);
        }
      });

      sessionsListContainer.appendChild(itemEl);
    });
  } catch (err) {
    console.error("Sessions load error:", err);
    sessionsListContainer.innerHTML = `
      <div class="text-center text-danger p-3">
        <small>Failed to load chats.</small>
      </div>
    `;
  }
}

// Switch Active Conversation
async function switchSession(targetSessionId, title = null) {
  if (!targetSessionId) return;
  currentSessionId = targetSessionId;
  localStorage.setItem(STORAGE_KEY, targetSessionId);
  updateSessionHeader(title);

  document.querySelectorAll(".session-item").forEach(el => {
    if (el.getAttribute("data-session-id") === targetSessionId) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  await loadSessionHistory(targetSessionId);
  closeMobileSidebar();
}

// Start Brand New Chat Thread
function startNewChat() {
  const newId = generateUUID();
  currentSessionId = newId;
  localStorage.setItem(STORAGE_KEY, newId);
  updateSessionHeader("New Conversation");
  clearAllMessagesFromScreen();

  if (welcomeSection) {
    welcomeSection.style.display = "block";
    welcomeSection.style.opacity = "1";
  }
  if (messageCountDisplay) {
    messageCountDisplay.textContent = "New Conversation";
  }

  document.querySelectorAll(".session-item").forEach(el => el.classList.remove("active"));
  closeMobileSidebar();
  messageInput.focus();
}

// Rename Conversation
async function renameSession(targetSessionId, currentTitle) {
  const newTitle = prompt("Enter new conversation name:", currentTitle);
  if (!newTitle || newTitle.trim() === "" || newTitle.trim() === currentTitle) return;

  try {
    const res = await fetch(`/sessions/${encodeURIComponent(targetSessionId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() })
    });
    if (res.ok) {
      if (currentSessionId === targetSessionId) {
        updateSessionHeader(newTitle.trim());
      }
      loadSessionsList(false);
    }
  } catch (err) {
    console.error("Rename error:", err);
  }
}

// Delete Conversation
async function deleteSession(targetSessionId) {
  try {
    const res = await fetch(`/sessions/${encodeURIComponent(targetSessionId)}`, {
      method: "DELETE"
    });
    if (res.ok) {
      if (currentSessionId === targetSessionId) {
        startNewChat();
      }
      loadSessionsList(false);
    }
  } catch (err) {
    console.error("Delete session error:", err);
  }
}

// ==========================================================
// Auto-Expanding Textarea & Keyboard Shortcuts
// ==========================================================

function autoResizeTextarea() {
  if (!messageInput) return;
  messageInput.style.height = "auto";
  const newHeight = Math.min(messageInput.scrollHeight, 180);
  messageInput.style.height = (newHeight > 24 ? newHeight : 24) + "px";
}

if (messageInput) {
  messageInput.addEventListener("input", autoResizeTextarea);

  // Submit on Enter, Newline on Shift+Enter
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const message = messageInput.value.trim();
      if (message) {
        handleUserMessage(message);
      }
    }
  });
}

// Global Keyboard Shortcut: Ctrl + K (or Cmd + K) starts a new chat!
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    startNewChat();
  }
});

// ==========================================================
// Sidebar State & Mobile Controls
// ==========================================================

function toggleSidebar() {
  if (!chatSidebar) return;
  if (window.innerWidth >= 992) {
    chatSidebar.classList.toggle("collapsed");
    localStorage.setItem(SIDEBAR_PREF_KEY, chatSidebar.classList.contains("collapsed") ? "collapsed" : "open");
  } else {
    chatSidebar.classList.add("mobile-open");
    if (sidebarBackdrop) sidebarBackdrop.classList.remove("d-none");
  }
}

function closeMobileSidebar() {
  if (chatSidebar && window.innerWidth < 992) {
    chatSidebar.classList.remove("mobile-open");
    if (sidebarBackdrop) sidebarBackdrop.classList.add("d-none");
  }
}

// Restore desktop sidebar preference
if (window.innerWidth >= 992 && chatSidebar) {
  const pref = localStorage.getItem(SIDEBAR_PREF_KEY);
  if (pref === "collapsed") {
    chatSidebar.classList.add("collapsed");
  } else {
    chatSidebar.classList.remove("collapsed");
  }
}

// Event Listeners
if (openSidebarBtn) {
  openSidebarBtn.addEventListener("click", toggleSidebar);
}
if (closeSidebarBtn) {
  closeSidebarBtn.addEventListener("click", closeMobileSidebar);
}
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", closeMobileSidebar);
}
if (newChatBtn) {
  newChatBtn.addEventListener("click", startNewChat);
}
if (sidebarNewChatBtn) {
  sidebarNewChatBtn.addEventListener("click", startNewChat);
}
if (renameActiveChatBtn) {
  renameActiveChatBtn.addEventListener("click", () => {
    const currentTitle = activeChatTitle ? activeChatTitle.textContent : "";
    renameSession(currentSessionId, currentTitle);
  });
}

// Form Submit Handler
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (message) {
    handleUserMessage(message);
  }
});

// Interactive Suggestion Cards Click
suggestionCards.forEach(card => {
  card.addEventListener("click", () => {
    const prompt = card.getAttribute("data-prompt");
    if (prompt) {
      card.style.transform = "scale(0.97)";
      setTimeout(() => {
        card.style.transform = "";
        handleUserMessage(prompt);
      }, 150);
    }
  });
});

// Session Information Details Action
if (sessionInfoBtn) {
  sessionInfoBtn.addEventListener("click", () => {
    alert(`Active Conversation ID:\n${currentSessionId}\n\nPreserved in local SQLite database with Portkey Gateway & Gemini routing.`);
  });
}

// Initial Load
loadSessionHistory();
loadSessionsList();
