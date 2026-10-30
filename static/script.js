// ==========================================================
// Professional AI Assistant Logic & Entry-Level Animations
// ==========================================================

// 1. Session Management
function getOrCreateSessionId() {
  const STORAGE_KEY = "ai_assistant_session_id";
  let sessionId = localStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    if (window.crypto && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      sessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    }
    localStorage.setItem(STORAGE_KEY, sessionId);
  }
  return sessionId;
}

const sessionId = getOrCreateSessionId();

// DOM Elements
const chatViewport = document.getElementById("chatViewport");
const conversationStream = document.getElementById("conversationStream");
const welcomeSection = document.getElementById("welcomeSection");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingIndicator = document.getElementById("typingIndicator");
const clearChatBtn = document.getElementById("clearChatBtn");
const sessionInfoBtn = document.getElementById("sessionInfoBtn");
const sessionDisplay = document.getElementById("sessionDisplay");
const initialBotTime = document.getElementById("initialBotTime");
const suggestionCards = document.querySelectorAll(".suggestion-card");

// Display shortened session ID in header
if (sessionDisplay) {
  sessionDisplay.textContent = `ID: ${sessionId.substring(0, 8)}...`;
}

// 2. Format Timestamp
function formatTime(dateStr) {
  let date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) {
    date = new Date();
  }
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
  return `${hours}:${formattedMinutes} ${ampm}`;
}

if (initialBotTime) {
  initialBotTime.textContent = formatTime();
}

// 3. Security: XSS Prevention + Auto-link URLs
function formatMessageContent(rawText) {
  // Escape HTML entities to prevent XSS
  const tempDiv = document.createElement("div");
  tempDiv.textContent = rawText;
  const escaped = tempDiv.innerHTML;

  // Transform URLs into clickable target="_blank" anchor tags
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return escaped.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

// 4. Smooth Auto-Scroll
function scrollToBottom() {
  chatViewport.scrollTo({
    top: chatViewport.scrollHeight,
    behavior: "smooth"
  });
}

// 5. Entry-Level Section Observer (Triggers entrance animation when scrolled into view)
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("animate-entry");
    }
  });
}, {
  threshold: 0.15
});

document.querySelectorAll(".suggestion-card, .welcome-section").forEach(el => {
  sectionObserver.observe(el);
});

// Helper: Format tool badges
function formatToolsUsedBadge(toolsUsed) {
  if (!toolsUsed || toolsUsed.length === 0) return "";
  const badges = [];
  if (toolsUsed.includes("web_search")) {
    badges.push(`<span class="tool-badge"><i class="bi bi-search"></i> <em>Searched the web</em></span>`);
  }
  if (toolsUsed.includes("fetch_url")) {
    badges.push(`<span class="tool-badge"><i class="bi bi-link-45deg"></i> <em>Read the link</em></span>`);
  }
  if (badges.length === 0) return "";
  return `<div class="tools-used-container">${badges.join(" ")}</div>`;
}

// 6. Append Message Bubble with Dynamic Entry Animation
function appendMessage(text, sender = "bot", isError = false, timestamp = null, toolsUsed = []) {
  const item = document.createElement("div");
  item.className = `message-item ${sender}-message animate-entry`;

  const timeLabel = formatTime(timestamp);

  if (sender === "bot") {
    item.innerHTML = `
      <div class="msg-avatar">
        <i class="bi bi-robot"></i>
      </div>
      <div class="msg-body">
        <div class="msg-header">AI Assistant</div>
        <div class="msg-card ${isError ? 'error-card' : ''}">
          ${formatToolsUsedBadge(toolsUsed)}
          <div class="msg-text">${formatMessageContent(text)}</div>
          <div class="msg-time">${timeLabel}</div>
        </div>
      </div>
    `;
  } else {
    item.innerHTML = `
      <div class="msg-body">
        <div class="msg-header">You</div>
        <div class="msg-card">
          <div class="msg-text">${formatMessageContent(text)}</div>
          <div class="msg-time">${timeLabel}</div>
        </div>
      </div>
      <div class="msg-avatar" style="background: linear-gradient(135deg, #3b82f6, #6366f1); color: #fff;">
        <i class="bi bi-person-fill"></i>
      </div>
    `;
  }

  // Insert before typing indicator
  conversationStream.insertBefore(item, typingIndicator);
  sectionObserver.observe(item);
  scrollToBottom();
}

// 7. Typing Indicator Handlers
function showTypingIndicator() {
  typingIndicator.classList.remove("d-none");
  conversationStream.appendChild(typingIndicator);
  scrollToBottom();
}

function hideTypingIndicator() {
  typingIndicator.classList.add("d-none");
}

// 7b. Create Live Streaming Bot Message Bubble
function createStreamingBotMessage() {
  const item = document.createElement("div");
  item.className = "message-item bot-message animate-entry";
  const timeLabel = formatTime();

  item.innerHTML = `
    <div class="msg-avatar">
      <i class="bi bi-robot"></i>
    </div>
    <div class="msg-body">
      <div class="msg-header">AI Assistant</div>
      <div class="msg-card">
        <div class="msg-text"></div>
        <div class="msg-time">${timeLabel}</div>
      </div>
    </div>
  `;

  conversationStream.insertBefore(item, typingIndicator);
  sectionObserver.observe(item);
  scrollToBottom();

  const textElement = item.querySelector(".msg-text");
  const cardElement = item.querySelector(".msg-card");

  return {
    updateText: (text) => {
      textElement.innerHTML = formatMessageContent(text);
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
      textElement.innerHTML = formatMessageContent(`⚠️ ${errText}`);
      scrollToBottom();
    }
  };
}

// 8. Dedicated API Communication Function (As Required)
async function sendToBackend(message) {
  const response = await fetch("/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      session_id: sessionId,
      message: message
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  return await response.json();
}

// 9. Load Previous Session History from Database
async function loadSessionHistory() {
  try {
    const res = await fetch(`/history/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return;

    const history = await res.json();
    if (Array.isArray(history) && history.length > 0) {
      if (welcomeSection) {
        welcomeSection.style.opacity = "0.4";
      }
      history.forEach(item => {
        const sender = (item.role === "assistant" || item.role === "bot") ? "bot" : "user";
        appendMessage(item.content, sender, false, item.created_at);
      });
    }
  } catch (err) {
    console.warn("Could not load history:", err);
  }
}

// 10. Dispatch Message Logic with Instant Streaming and Tool Indicators
async function handleUserMessage(message) {
  if (!message) return;

  if (welcomeSection && welcomeSection.style.display !== "none") {
    welcomeSection.style.opacity = "0.4";
  }

  // 1. Render User Message with animation
  appendMessage(message, "user");
  messageInput.value = "";

  // 2. Display Typing State & Disable Submit
  showTypingIndicator();
  sendBtn.disabled = true;

  try {
    const response = await fetch("/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: sessionId,
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
            }
          } catch (e) {
            console.error("Chunk parse error:", e);
          }
        }
      }
    }

    hideTypingIndicator();
    if (!botBubble && accumulatedText.length === 0) {
      const fallbackData = await sendToBackend(message);
      if (fallbackData && fallbackData.reply) {
        const isErr = fallbackData.reply.startsWith("⚠️");
        appendMessage(fallbackData.reply, "bot", isErr, null, fallbackData.tools_used || []);
      }
    }
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

// Form Submit Handler
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  handleUserMessage(message);
});

// Interactive Suggestion Cards Click
suggestionCards.forEach(card => {
  card.addEventListener("click", () => {
    const prompt = card.getAttribute("data-prompt");
    if (prompt) {
      card.style.transform = "scale(0.96)";
      setTimeout(() => {
        card.style.transform = "";
        handleUserMessage(prompt);
      }, 150);
    }
  });
});

// Clear Chat Action (resets session and clear screen)
if (clearChatBtn) {
  clearChatBtn.addEventListener("click", () => {
    if (confirm("Reset current conversation? A new session will be generated.")) {
      // Generate new session ID
      localStorage.removeItem("ai_assistant_session_id");
      location.reload();
    }
  });
}

// Session Information Details Action
if (sessionInfoBtn) {
  sessionInfoBtn.addEventListener("click", () => {
    alert(`Active Session ID:\n${sessionId}\n\nPast messages are saved in SQLite (messages table) and LLM traces in llm_logs table.`);
  });
}

// Load prior history on page load
loadSessionHistory();
