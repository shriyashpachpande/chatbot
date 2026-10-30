/**
 * Observability Logs & Traces Controller
 */

// Global state
let currentLogs = [];
let autoRefreshTimer = null;
let logModalInstance = null;
let traceModalInstance = null;

// HTML Escaper for XSS prevention
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatJson(val) {
  if (!val) return "";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  try {
    const parsed = JSON.parse(val);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(val);
  }
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + 
           ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return isoStr;
  }
}

async function fetchLogs() {
  const status = document.getElementById("statusFilter").value;
  const sessionId = document.getElementById("sessionIdFilter").value.trim();
  const limit = document.getElementById("limitFilter").value;
  const toolOnly = document.getElementById("toolOnlyCheck").checked;

  const refreshIcon = document.getElementById("refreshIcon");
  if (refreshIcon) refreshIcon.classList.add("spin-animation");

  const params = new URLSearchParams();
  params.append("limit", limit);
  if (status) params.append("status", status);
  if (sessionId) params.append("session_id", sessionId);
  if (toolOnly) params.append("tool_only", "true");

  try {
    const res = await fetch(`/logs?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const logs = await res.json();
    currentLogs = logs;
    renderSummary(logs);
    renderTable(logs);
  } catch (err) {
    console.error("Failed to fetch logs:", err);
    document.getElementById("logsTableBody").innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle me-1"></i> Failed to load logs: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  } finally {
    if (refreshIcon) refreshIcon.classList.remove("spin-animation");
  }
}

function renderSummary(logs) {
  const totalCalls = logs.length;
  let errors = 0;
  let totalLatency = 0;
  let totalTokens = 0;

  logs.forEach(l => {
    if (l.status === "error") errors++;
    totalLatency += (l.latency_ms || 0);
    totalTokens += ((l.tokens_in || 0) + (l.tokens_out || 0));
  });

  const avgLatency = totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0;

  document.getElementById("statTotalCalls").textContent = totalCalls;
  document.getElementById("statErrors").textContent = errors;
  document.getElementById("statAvgLatency").textContent = `${avgLatency} ms`;
  document.getElementById("statTotalTokens").textContent = totalTokens.toLocaleString();
}

function renderTable(logs) {
  const tbody = document.getElementById("logsTableBody");
  if (!logs || logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-secondary">
          <i class="bi bi-inbox fs-4 d-block mb-1"></i>
          No execution logs match the selected filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(l => {
    const shortTrace = (l.trace_id || "").slice(0, 8);
    const shortSession = (l.session_id || "").slice(0, 8);
    const statusClass = l.status === "success" ? "status-badge-success" : "status-badge-error";
    const statusIcon = l.status === "success" ? "bi-check2-circle" : "bi-x-circle";
    const providerClass = (l.provider || "").includes("portkey") ? "provider-portkey" : "provider-gemini";
    const toolBadge = l.tool_name ? `<span class="badge bg-warning-subtle text-warning border border-warning-subtle">${escapeHtml(l.tool_name)}</span>` : '<span class="text-secondary">-</span>';

    return `
      <tr onclick="showLogDetail(${l.id})">
        <td class="text-secondary small font-monospace">${escapeHtml(formatTime(l.created_at))}</td>
        <td>
          <span class="trace-chip" onclick="openTraceModal(event, '${escapeHtml(l.trace_id)}')" title="View complete trace flow">
            <i class="bi bi-bezier2"></i> ${escapeHtml(shortTrace)}...
          </span>
        </td>
        <td class="font-monospace small text-secondary" title="${escapeHtml(l.session_id)}">${escapeHtml(shortSession)}...</td>
        <td><span class="provider-badge ${providerClass}">${escapeHtml(l.provider || 'unknown')}</span></td>
        <td class="small text-truncate" style="max-width: 140px;" title="${escapeHtml(l.model)}">${escapeHtml(l.model || '')}</td>
        <td>${toolBadge}</td>
        <td>
          <span class="${statusClass}">
            <i class="bi ${statusIcon} me-1"></i>${escapeHtml(l.status)}
          </span>
        </td>
        <td class="text-end font-monospace small">${(l.latency_ms || 0).toFixed(0)} ms</td>
        <td class="text-end font-monospace small">${l.tokens_in || 0}</td>
        <td class="text-end font-monospace small">${l.tokens_out || 0}</td>
      </tr>
    `;
  }).join("");
}

function showLogDetail(logId) {
  const log = currentLogs.find(l => l.id === logId);
  if (!log) return;

  const container = document.getElementById("logDetailBody");
  
  let errorSection = "";
  if (log.error_message) {
    errorSection = `
      <div class="alert alert-danger mb-3 p-3 rounded-3">
        <strong><i class="bi bi-exclamation-triangle-fill me-1"></i> Error Message:</strong>
        <div class="mt-1 font-monospace small">${escapeHtml(log.error_message)}</div>
      </div>
    `;
  }

  let toolSection = "";
  if (log.tool_name) {
    toolSection = `
      <div class="card bg-dark border-warning border mb-3 rounded-3">
        <div class="card-header border-warning text-warning fw-semibold py-2">
          <i class="bi bi-tools me-1"></i> Tool Invocation: ${escapeHtml(log.tool_name)}
        </div>
        <div class="card-body p-3">
          <label class="form-label small text-secondary fw-semibold">Tool Input:</label>
          <pre class="code-container mb-3">${escapeHtml(formatJson(log.tool_input))}</pre>

          <label class="form-label small text-secondary fw-semibold">Tool Output:</label>
          <pre class="code-container mb-0">${escapeHtml(log.tool_output || "")}</pre>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    ${errorSection}
    
    <div class="row g-2 mb-3 small">
      <div class="col-md-3">
        <span class="text-secondary d-block">Trace ID:</span>
        <span class="font-monospace text-primary">${escapeHtml(log.trace_id)}</span>
      </div>
      <div class="col-md-3">
        <span class="text-secondary d-block">Session ID:</span>
        <span class="font-monospace text-info">${escapeHtml(log.session_id)}</span>
      </div>
      <div class="col-md-3">
        <span class="text-secondary d-block">Provider / Model:</span>
        <span class="fw-semibold">${escapeHtml(log.provider)} &bull; ${escapeHtml(log.model)}</span>
      </div>
      <div class="col-md-3">
        <span class="text-secondary d-block">Tokens / Latency:</span>
        <span>${log.tokens_in} in / ${log.tokens_out} out &bull; ${log.latency_ms} ms</span>
      </div>
    </div>

    ${toolSection}

    <div class="mb-3">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <label class="form-label small text-secondary fw-semibold mb-0">Request Payload:</label>
        <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="navigator.clipboard.writeText(document.getElementById('rawReqText').textContent)">Copy</button>
      </div>
      <pre class="code-container" id="rawReqText">${escapeHtml(formatJson(log.request))}</pre>
    </div>

    <div>
      <div class="d-flex justify-content-between align-items-center mb-1">
        <label class="form-label small text-secondary fw-semibold mb-0">Response / Model Output:</label>
        <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="navigator.clipboard.writeText(document.getElementById('rawResText').textContent)">Copy</button>
      </div>
      <pre class="code-container" id="rawResText">${escapeHtml(formatJson(log.response))}</pre>
    </div>
  `;

  if (!logModalInstance) {
    logModalInstance = new bootstrap.Modal(document.getElementById("logDetailModal"));
  }
  logModalInstance.show();
}

async function openTraceModal(event, traceId) {
  event.stopPropagation();

  document.getElementById("traceModalSubtitle").textContent = `Trace: ${traceId}`;
  const body = document.getElementById("traceModalBody");
  body.innerHTML = `
    <div class="text-center py-4 text-secondary">
      <div class="spinner-border spinner-border-sm text-info me-2"></div>
      Loading complete trace timeline...
    </div>
  `;

  if (!traceModalInstance) {
    traceModalInstance = new bootstrap.Modal(document.getElementById("traceModal"));
  }
  traceModalInstance.show();

  try {
    const res = await fetch(`/logs/trace/${encodeURIComponent(traceId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const traceSteps = await res.json();
    renderTraceFlow(traceSteps);
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger p-3">Failed to load trace: ${escapeHtml(err.message)}</div>`;
  }
}

function renderTraceFlow(steps) {
  const body = document.getElementById("traceModalBody");
  if (!steps || steps.length === 0) {
    body.innerHTML = `<div class="text-secondary text-center py-4">No records found for this trace.</div>`;
    return;
  }

  let html = `<div class="timeline-container py-2">`;

  steps.forEach((step, idx) => {
    const isTool = !!step.tool_name;
    const iconClass = isTool ? "step-tool" : "step-llm";
    const icon = isTool ? '<i class="bi bi-gear-fill"></i>' : '<i class="bi bi-cpu-fill"></i>';
    const title = isTool ? `Step ${idx + 1}: Tool Execution (${escapeHtml(step.tool_name)})` : `Step ${idx + 1}: LLM Model Call (${escapeHtml(step.model)})`;

    let payloadSummary = "";
    if (isTool) {
      payloadSummary = `
        <div class="mb-2"><small class="text-secondary fw-semibold">Input:</small> <code class="text-warning">${escapeHtml(step.tool_input || '')}</code></div>
        <div><small class="text-secondary fw-semibold">Output:</small> <div class="font-monospace small text-light bg-black p-2 rounded mt-1">${escapeHtml(step.tool_output || '')}</div></div>
      `;
    } else {
      let contentPreview = "";
      try {
        const respObj = JSON.parse(step.response);
        contentPreview = respObj.content || JSON.stringify(respObj);
      } catch {
        contentPreview = step.response || "";
      }
      payloadSummary = `
        <div class="small text-secondary mb-1">Response Content:</div>
        <div class="font-monospace small text-light bg-black p-2 rounded">${escapeHtml(contentPreview)}</div>
      `;
    }

    html += `
      <div class="timeline-step">
        <div class="timeline-step-icon ${iconClass}">
          ${icon}
        </div>
        <div class="card bg-dark border-secondary p-3 rounded-3 shadow-sm">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0 fw-bold text-white">${title}</h6>
            <div class="d-flex align-items-center gap-2">
              <span class="badge ${step.status === 'success' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}">${escapeHtml(step.status)}</span>
              <span class="text-secondary small font-monospace">${step.latency_ms} ms</span>
              <span class="text-secondary small font-monospace">${step.tokens_in || 0} in / ${step.tokens_out || 0} out</span>
            </div>
          </div>
          ${payloadSummary}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  body.innerHTML = html;
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  fetchLogs();

  document.getElementById("refreshBtn").addEventListener("click", fetchLogs);
  document.getElementById("statusFilter").addEventListener("change", fetchLogs);
  document.getElementById("limitFilter").addEventListener("change", fetchLogs);
  document.getElementById("toolOnlyCheck").addEventListener("change", fetchLogs);
  
  // Debounce session_id input
  let typingTimer;
  document.getElementById("sessionIdFilter").addEventListener("input", () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(fetchLogs, 400);
  });

  // Auto-refresh toggle
  const autoToggle = document.getElementById("autoRefreshToggle");
  autoToggle.addEventListener("change", () => {
    if (autoToggle.checked) {
      autoRefreshTimer = setInterval(() => {
        // Only refresh if no modal is actively open
        const isLogModalOpen = document.getElementById("logDetailModal").classList.contains("show");
        const isTraceModalOpen = document.getElementById("traceModal").classList.contains("show");
        if (!isLogModalOpen && !isTraceModalOpen) {
          fetchLogs();
        }
      }, 5000);
    } else {
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
    }
  });
});
