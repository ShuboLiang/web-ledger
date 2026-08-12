const COLORS = ["#18766f", "#e76f51", "#e7b44a", "#477b9f", "#7569a8", "#78a4a0", "#b57f5f", "#cf6f8f", "#729e4f", "#bd7147", "#568da8", "#8b75bd"];
const state = { dashboard: null, records: [], recentRecords: [], dictionaries: { projects: [], categories: [] }, breakdownScope: "day", breakdownLevel: "primary", trendScope: "day", recordMonth: "", recordPage: 1, recordPageSize: 20, recordTotal: 0, recordTotalPages: 1, recordQuery: "", recordCategory: "", editingId: null, pendingDeleteId: null, preview: [], proposals: [], conversationId: createConversationId(), aiMessages: [], aiBusy: false, aiWarning: "" };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function createConversationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function money(value, digits = 2) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value) || 0);
}

function shortMoney(value) {
  const amount = Number(value) || 0;
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(1)}万`;
  return `¥${amount.toFixed(amount >= 1000 ? 0 : 2)}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...options.headers }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

let toastTimer;
function toast(message, error = false) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.toggle("error", error);
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2800);
}

function rangeLabel([start, end], type) {
  if (type === "day") return start;
  if (type === "month") return start.slice(0, 7);
  if (type === "year") return start.slice(0, 4);
  return `${start.slice(5).replace("-", "/")} — ${end.slice(5).replace("-", "/")}`;
}

function renderTotals() {
  const { totals, ranges, anchor } = state.dashboard;
  $("#totalDay").textContent = money(totals.day);
  $("#totalWeek").textContent = money(totals.week);
  $("#totalMonth").textContent = money(totals.month);
  $("#totalYear").textContent = money(totals.year);
  $("#dayRange").textContent = rangeLabel(ranges.day, "day");
  $("#weekRange").textContent = rangeLabel(ranges.week, "week");
  $("#monthRange").textContent = rangeLabel(ranges.month, "month");
  $("#yearRange").textContent = rangeLabel(ranges.year, "year");
  $("#historyDate").value = anchor;
  $("#historyYear").value = anchor.slice(0, 4);
  $("#currentPeriodDate").textContent = anchor;
}

function renderBreakdown() {
  const source = state.breakdownLevel === "secondary" ? state.dashboard.secondaryBreakdowns : state.dashboard.breakdowns;
  const rows = source?.[state.breakdownScope] || [];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  let cursor = 0;
  const segments = rows.map((row, index) => {
    const start = cursor;
    cursor += row.share * 100;
    return `${COLORS[index % COLORS.length]} ${start}% ${cursor}%`;
  });
  $("#donut").style.background = rows.length ? `conic-gradient(${segments.join(",")})` : "#dfe7e9";
  $("#donutTotal").textContent = shortMoney(total);
  $("#donutLevelLabel").textContent = state.breakdownLevel === "secondary" ? "二级分类" : "一级分类";
  $("#breakdownLegend").innerHTML = rows.length ? rows.map((row, index) => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${COLORS[index % COLORS.length]}"></span>
      <span class="legend-label"><strong>${escapeHtml(row.category)}</strong>${row.parent ? `<small>${escapeHtml(row.parent)}</small>` : ""}</span>
      <span class="legend-value"><strong>${money(row.amount)}</strong><small>${(row.share * 100).toFixed(1)}%</small></span>
    </div>`).join("") : '<div class="empty">这个周期还没有支出</div>';
}

function setBreakdownScope(scope, scrollToChart = false) {
  if (!["day", "week", "month", "year"].includes(scope)) return;
  state.breakdownScope = scope;
  $$('[data-summary-scope]').forEach((card) => card.classList.toggle("featured", card.dataset.summaryScope === scope));
  $$("#breakdownTabs button").forEach((button) => button.classList.toggle("active", button.dataset.scope === scope));
  renderBreakdown();
  if (scrollToChart) {
    window.location.hash = "analytics";
    requestAnimationFrame(() => $(".breakdown-panel").scrollIntoView({ behavior: "smooth", block: "center" }));
  }
}

function renderTrend() {
  const rows = state.dashboard.series[state.trendScope] || [];
  const max = Math.max(...rows.map((row) => row.amount), 1);
  $("#trendChart").innerHTML = rows.map((row) => {
    const height = Math.max(row.amount ? 5 : 2, (row.amount / max) * 190);
    return `<div class="bar-item" style="--height:${height}px"><span class="bar-tip">${money(row.amount)}</span><div class="bar" style="height:${height}px"></div><span class="bar-label">${row.label}</span></div>`;
  }).join("");
}

function renderRecords() {
  $("#recordCount").textContent = `共 ${state.recordTotal} 笔`;
  $("#recordMonth").value = state.recordMonth;
  $("#recordRows").innerHTML = state.records.length ? state.records.map((row) => `
    <tr>
      <td>${row.date}</td>
      <td><strong>${escapeHtml(row.item)}</strong></td>
      <td><span class="category-tag">${escapeHtml(row.category1)} · ${escapeHtml(row.category2)}</span></td>
      <td class="muted">${escapeHtml(row.note || "—")}</td>
      <td class="amount ${row.amount < 0 ? "expense" : "income"}">${row.amount < 0 ? "−" : "+"}${money(Math.abs(row.amount))}</td>
      <td class="row-actions"><button class="row-action" data-edit="${row.id}" title="编辑" aria-label="编辑 ${escapeHtml(row.item)}">✎</button><button class="row-action danger-text" data-delete="${row.id}" title="删除" aria-label="删除 ${escapeHtml(row.item)}">×</button></td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty">${state.recordQuery || state.recordCategory ? "没有符合筛选条件的账目" : "这个月还没有账目"}</td></tr>`;
  $("#pageInfo").textContent = `第 ${state.recordPage} / ${state.recordTotalPages} 页`;
  $("#previousPage").disabled = state.recordPage <= 1;
  $("#nextPage").disabled = state.recordPage >= state.recordTotalPages;
  $("#clearRecordFilters").classList.toggle("hidden", !state.recordQuery && !state.recordCategory);
}

function renderDashboardRecent() {
  const container = $("#dashboardRecent");
  container.innerHTML = state.recentRecords.length ? state.recentRecords.map((row) => `
    <div class="recent-row">
      <time class="recent-date" datetime="${row.date}"><strong>${row.date.slice(8)}</strong><span>${row.date.slice(5, 7)}月</span></time>
      <div class="recent-copy"><strong>${escapeHtml(row.item)}</strong><small>${escapeHtml(row.category1)} · ${escapeHtml(row.category2)}${row.note ? ` · ${escapeHtml(row.note)}` : ""}</small></div>
      <strong class="recent-amount ${row.amount < 0 ? "expense" : "income"}">${row.amount < 0 ? "−" : "+"}${money(Math.abs(row.amount))}</strong>
    </div>`).join("") : '<div class="empty">还没有账目，先记下第一笔吧</div>';

  const top = state.dashboard.breakdowns.month?.[0];
  $("#dashboardTopCategory").textContent = top?.category || "暂无支出";
  $("#dashboardTopCategoryMeta").textContent = top
    ? `${money(top.amount)} · 占本月支出的 ${(top.share * 100).toFixed(1)}%`
    : "本月还没有支出分类";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function renderInlineMarkdown(value) {
  const tokens = [];
  let source = String(value ?? "")
    .replace(/`([^`\n]+)`/g, (_, code) => {
      const token = `\u0000${tokens.length}\u0000`;
      tokens.push(`<code>${escapeHtml(code)}</code>`);
      return token;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_, label, url) => {
      const token = `\u0000${tokens.length}\u0000`;
      tokens.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
      return token;
    });
  source = escapeHtml(source)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return source.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || "");
}

function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function renderMarkdown(markdown) {
  const lines = String(markdown ?? "").replace(/\r/g, "").split("\n");
  const output = [];
  let index = 0;
  const isTableDivider = (line) => tableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
  const isSpecial = (line, next = "") => !line.trim() || /^```/.test(line.trim()) || /^#{1,6}\s+/.test(line) || /^>\s?/.test(line) || /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || (line.includes("|") && isTableDivider(next));

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      output.push(`<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(tableCells(lines[index++]));
      output.push(`<div class="markdown-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${renderInlineMarkdown(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      output.push(`<blockquote>${quote.map(renderInlineMarkdown).join("<br>")}</blockquote>`);
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const tag = unordered ? "ul" : "ol";
      const pattern = unordered ? /^\s*[-*+]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/;
      const items = [];
      while (index < lines.length) {
        const match = lines[index].match(pattern);
        if (!match) break;
        items.push(`<li>${renderInlineMarkdown(match[1])}</li>`);
        index += 1;
      }
      output.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isSpecial(lines[index], lines[index + 1] || "")) paragraph.push(lines[index++].trim());
    output.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
  }
  return output.join("");
}

function renderDictionaries() {
  $("#projectList").innerHTML = state.dictionaries.projects.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  const first = [...new Set(state.dictionaries.categories.map((row) => row.category1))];
  const second = [...new Set(state.dictionaries.categories.map((row) => row.category2))];
  $("#category1List").innerHTML = first.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#category2List").innerHTML = second.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("#recordCategory").innerHTML = '<option value="">全部一级分类</option>' + first.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  $("#recordCategory").value = state.recordCategory;
}

async function loadRecordPage() {
  const query = new URLSearchParams({
    month: state.recordMonth,
    page: String(state.recordPage),
    pageSize: String(state.recordPageSize),
    query: state.recordQuery,
    category1: state.recordCategory,
  });
  const transactions = await api(`/api/transactions?${query}`);
  state.records = transactions.records;
  state.recordTotal = transactions.total;
  state.recordPage = transactions.page;
  state.recordTotalPages = transactions.totalPages;
  renderRecords();
}

async function refresh(anchor = state.dashboard?.anchor || "") {
  const query = anchor ? `?anchor=${encodeURIComponent(anchor)}` : "";
  const [dashboard, dictionaries, recent] = await Promise.all([
    api(`/api/dashboard${query}`),
    api("/api/dictionaries"),
    api("/api/transactions?limit=5"),
  ]);
  state.dashboard = dashboard;
  state.recentRecords = recent.records;
  if (!state.recordMonth) state.recordMonth = dashboard.anchor.slice(0, 7);
  state.dictionaries = dictionaries;
  renderTotals();
  renderBreakdown();
  renderTrend();
  renderDictionaries();
  renderDashboardRecent();
  await loadRecordPage();
}

function endOfSelectedMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

async function selectRecordMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
  state.recordMonth = month;
  state.recordPage = 1;
  await refresh(endOfSelectedMonth(month));
}

async function selectHistoryDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  state.recordMonth = date.slice(0, 7);
  state.recordPage = 1;
  await refresh(date);
}

async function shiftHistoryDate(days) {
  const date = new Date(`${state.dashboard.anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  await selectHistoryDate(date.toISOString().slice(0, 10));
}

async function selectHistoryYear(year) {
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > 9999) throw new Error("请输入 1900 至 9999 之间的年份");
  await selectHistoryDate(`${numericYear}-12-31`);
}

async function showLatestStatistics() {
  state.recordMonth = "";
  state.recordPage = 1;
  await refresh("");
}

function previewRow(record, index) {
  return `<div class="preview-row" data-preview-index="${index}">
    <label>日期<input data-field="date" type="date" value="${record.date}"></label>
    <label>项目<input data-field="item" list="projectList" value="${escapeHtml(record.item)}"></label>
    <label>金额<input data-field="amount" type="number" min="0.01" step="0.01" value="${record.amount}"></label>
    <label>一级分类<input data-field="category1" list="category1List" value="${escapeHtml(record.category1)}"></label>
    <label>二级分类<input data-field="category2" list="category2List" value="${escapeHtml(record.category2)}"></label>
    <label>备注<input data-field="note" value="${escapeHtml(record.note)}" placeholder="可选"></label>
    <button class="delete-button" data-remove-preview="${index}" title="移除">×</button>
  </div>`;
}

function renderConversationMessage(message) {
  if (message.role === "event") return `<div class="conversation-event"><span>✓</span>${escapeHtml(message.content)}</div>`;
  if (message.role === "thinking") return `<div class="conversation-message assistant"><div class="message-avatar">✦</div><div class="message-content"><small>AI 助手</small><div class="typing-indicator"><i></i><i></i><i></i><span>正在思考并查询账本</span></div></div></div>`;
  const assistant = message.role === "assistant";
  return `<div class="conversation-message ${assistant ? "assistant" : "user"}">
    <div class="message-avatar">${assistant ? "✦" : "你"}</div>
    <div class="message-content"><small>${assistant ? "AI 助手" : "你"}</small><div class="${assistant ? "markdown-body" : "user-message"}">${assistant ? renderMarkdown(message.content) : escapeHtml(message.content)}</div></div>
  </div>`;
}

function renderPreview(warning = state.aiWarning) {
  const panel = $("#aiPreview");
  state.aiWarning = warning || "";
  const messages = state.aiBusy ? [...state.aiMessages, { role: "thinking", content: "" }] : state.aiMessages;
  if (!messages.length && !state.proposals.length) return panel.classList.add("hidden");
  panel.classList.remove("hidden");
  const mutations = state.proposals.filter((proposal) => proposal.type !== "create");
  panel.innerHTML = `
    <div class="conversation-head"><span><i class="live-dot"></i>当前对话</span><small>上下文仅保留在本次页面会话中</small></div>
    <div class="conversation-thread">${messages.map(renderConversationMessage).join("")}</div>
    ${state.proposals.length ? `<div class="proposal-zone">
      <div class="preview-head"><strong>待确认操作</strong><span class="preview-warning">${escapeHtml(state.aiWarning)}</span></div>
      <div class="preview-list">${state.preview.map(previewRow).join("")}</div>
      ${mutations.map((proposal) => proposal.type === "delete" ? `
        <div class="proposal-card"><div><strong>删除：${escapeHtml(proposal.current?.item || `账目 #${proposal.id}`)}</strong><small>${proposal.current?.date || ""} · ${money(Math.abs(proposal.current?.amount || 0))}${proposal.reason ? ` · ${escapeHtml(proposal.reason)}` : ""}</small></div><span class="proposal-badge">删除</span></div>` : `
        <div class="proposal-card"><div><strong>修改：${escapeHtml(proposal.current?.item || `账目 #${proposal.id}`)}</strong><small>${escapeHtml(Object.entries(proposal.changes || {}).map(([key, value]) => `${key}: ${value}`).join("；"))}</small></div><span class="proposal-badge">修改</span></div>`).join("")}
      <div class="preview-actions"><button class="button ghost" id="cancelPreview">取消操作</button><button class="button primary" id="commitPreview">确认执行</button></div>
    </div>` : ""}`;
  requestAnimationFrame(() => { panel.scrollTop = panel.scrollHeight; });
}

async function parseAiText() {
  const input = $("#aiText");
  const text = input.value.trim();
  if (!text) return toast("请先输入一条消息", true);
  if (state.proposals.length) return toast("请先确认或取消当前待执行操作", true);
  if (state.aiBusy) return;
  const button = $("#parseAi");
  state.aiMessages.push({ role: "user", content: text });
  state.aiBusy = true;
  state.aiWarning = "";
  input.value = "";
  renderPreview();
  button.disabled = true;
  button.textContent = "处理中…";
  try {
    const result = await api("/api/ai/command", { method: "POST", body: JSON.stringify({ text, conversationId: state.conversationId }) });
    state.proposals = result.proposals || [];
    state.preview = state.proposals.filter((proposal) => proposal.type === "create").flatMap((proposal) => proposal.records || []);
    state.aiMessages.push({ role: "assistant", content: result.message || "AI 已完成分析。" });
    state.aiWarning = result.warning || "";
    $("#parserMode").textContent = "多轮对话进行中";
  } catch (error) {
    state.aiMessages.push({ role: "assistant", content: `抱歉，这条消息处理失败：${error.message}` });
    toast(error.message, true);
  } finally {
    state.aiBusy = false;
    button.disabled = false;
    button.innerHTML = "<span>✦</span> 发送";
    renderPreview();
    input.focus();
  }
}

async function reportAiOutcome(outcome) {
  try {
    await api(`/api/ai/conversations/${encodeURIComponent(state.conversationId)}/outcome`, { method: "POST", body: JSON.stringify({ outcome }) });
  } catch {}
}

async function cancelPreview() {
  await reportAiOutcome("cancelled");
  state.preview = [];
  state.proposals = [];
  state.aiMessages.push({ role: "event", content: "已取消待执行操作，账本没有发生变化" });
  renderPreview();
  $("#aiText").focus();
}

async function newAiConversation({ remote = true, notify = true } = {}) {
  if (state.aiBusy) return toast("请等待当前消息处理完成", true);
  const previousId = state.conversationId;
  if (remote) {
    try { await api(`/api/ai/conversations/${encodeURIComponent(previousId)}`, { method: "DELETE" }); } catch {}
  }
  state.conversationId = createConversationId();
  state.aiMessages = [];
  state.preview = [];
  state.proposals = [];
  state.aiWarning = "";
  $("#aiText").value = "";
  $("#aiPreview").classList.add("hidden");
  $("#parserMode").textContent = "多轮对话已就绪";
  $("#aiText").focus();
  if (notify) toast("已开始一段新对话");
}

function collectPreview() {
  return $$(".preview-row").map((row) => {
    const index = Number(row.dataset.previewIndex);
    const result = { ...state.preview[index] };
    $$('[data-field]', row).forEach((input) => { result[input.dataset.field] = input.dataset.field === "amount" ? Number(input.value) : input.value; });
    return result;
  });
}

async function commitPreview() {
  try {
    const records = collectPreview();
    const proposals = state.proposals.filter((proposal) => proposal.type !== "create");
    if (records.length) proposals.unshift({ type: "create", records });
    await api("/api/ai/execute", { method: "POST", body: JSON.stringify({ proposals, conversationId: state.conversationId }) });
    state.preview = [];
    state.proposals = [];
    state.aiMessages.push({ role: "event", content: `已确认并执行 ${proposals.length} 项账目操作` });
    renderPreview();
    await refresh();
    toast(`已执行 ${proposals.length} 项操作`);
  } catch (error) {
    toast(error.message, true);
  }
}

function openManualDialog(record = null) {
  const form = $("#manualForm");
  form.reset();
  state.editingId = record?.id || null;
  $("#manualEyebrow").textContent = record ? "EDIT RECORD" : "NEW RECORD";
  $("#manualTitle").textContent = record ? "编辑账目" : "手动记一笔";
  $("#saveManual").textContent = record ? "保存修改" : "保存账目";
  form.elements.date.value = record?.date || state.dashboard?.anchor || new Date().toISOString().slice(0, 10);
  form.elements.direction.value = record ? (record.amount > 0 ? "income" : "expense") : "expense";
  form.elements.amount.value = record ? Math.abs(record.amount) : "";
  form.elements.item.value = record?.item || "";
  form.elements.category1.value = record?.category1 || "";
  form.elements.category2.value = record?.category2 || "";
  form.elements.note.value = record?.note || "";
  $("#manualDialog").showModal();
  requestAnimationFrame(() => form.elements.amount.focus());
}

async function saveManual(event) {
  event.preventDefault();
  const form = new FormData($("#manualForm"));
  const record = Object.fromEntries(form.entries());
  record.amount = Number(record.amount);
  const saveButton = $("#saveManual");
  const editing = Boolean(state.editingId);
  saveButton.disabled = true;
  saveButton.textContent = editing ? "正在保存修改…" : "正在保存…";
  try {
    if (editing) await api(`/api/transactions/${state.editingId}`, { method: "PUT", body: JSON.stringify(record) });
    else await api("/api/transactions", { method: "POST", body: JSON.stringify(record) });
    closeManualDialog();
    state.recordMonth = record.date.slice(0, 7);
    state.recordPage = 1;
    await refresh(record.date);
    toast(editing ? "账目修改已保存" : "账目已保存");
  } catch (error) {
    toast(error.message, true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = editing ? "保存修改" : "保存账目";
  }
}

function closeManualDialog() {
  $("#manualDialog").close();
  $("#manualForm").reset();
  state.editingId = null;
  $("#manualTitle").textContent = "手动记一笔";
  $("#manualEyebrow").textContent = "NEW RECORD";
  $("#saveManual").textContent = "保存账目";
}

function openDeleteDialog(record) {
  state.pendingDeleteId = record.id;
  $("#deleteRecordSummary").textContent = `${record.date} · ${record.item} · ${money(Math.abs(record.amount))}。删除后相关统计会自动重算。`;
  $("#deleteDialog").showModal();
}

function closeDeleteDialog() {
  $("#deleteDialog").close();
  state.pendingDeleteId = null;
}

async function confirmDeleteRecord() {
  if (!state.pendingDeleteId) return;
  const button = $("#confirmDelete");
  button.disabled = true;
  button.textContent = "正在删除…";
  try {
    await api(`/api/transactions/${state.pendingDeleteId}`, { method: "DELETE" });
    closeDeleteDialog();
    await refresh();
    toast("账目已删除");
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "确认删除";
  }
}

function modelModeLabel(mode) {
  return mode === "custom" ? "自定义模型" : "默认模型";
}

function toggleCustomModelFields() {
  $("#customModelFields").classList.toggle("hidden", $("#aiModeSelect").value !== "custom");
}

async function openAiSettings() {
  try {
    const settings = await api("/api/ai/settings");
    const form = $("#settingsForm");
    form.elements.mode.value = settings.mode;
    form.elements.providerId.value = settings.providerId;
    form.elements.modelId.value = settings.modelId;
    form.elements.baseUrl.value = settings.baseUrl;
    form.elements.apiType.value = settings.apiType;
    form.elements.authHeader.checked = settings.authHeader;
    form.elements.apiKey.value = "";
    form.elements.clearApiKey.checked = false;
    form.elements.apiKey.placeholder = settings.hasApiKey ? "已配置；留空则保持不变" : "请输入 API Key";
    $("#settingsStatus").textContent = settings.hasApiKey ? "当前已保存 API Key（完整内容不会返回网页）" : "当前未保存 API Key";
    toggleCustomModelFields();
    $("#settingsDialog").showModal();
  } catch (error) { toast(error.message, true); }
}

async function saveAiSettings(event) {
  event.preventDefault();
  const form = new FormData($("#settingsForm"));
  const payload = Object.fromEntries(form.entries());
  payload.authHeader = $("#settingsForm").elements.authHeader.checked;
  payload.clearApiKey = $("#settingsForm").elements.clearApiKey.checked;
  try {
    const saved = await api("/api/ai/settings", { method: "PUT", body: JSON.stringify(payload) });
    $("#settingsDialog").close();
    $("#aiStatus").textContent = `${modelModeLabel(saved.mode)}已启用`;
    $("#settingsAiMode").textContent = modelModeLabel(saved.mode);
    $("#settingsAiStatus").textContent = saved.hasApiKey || saved.mode === "default" ? "配置可用" : "等待配置";
    await newAiConversation({ remote: false, notify: false });
    toast("AI 模型设置已保存");
  } catch (error) { $("#settingsStatus").textContent = error.message; toast(error.message, true); }
}

document.addEventListener("click", async (event) => {
  const scopeButton = event.target.closest("[data-scope]");
  if (scopeButton) {
    const parent = scopeButton.parentElement;
    $$("button", parent).forEach((button) => button.classList.remove("active"));
    scopeButton.classList.add("active");
    if (parent.id === "breakdownTabs") setBreakdownScope(scopeButton.dataset.scope);
    if (parent.id === "trendTabs") { state.trendScope = scopeButton.dataset.scope; renderTrend(); }
  }
  const levelButton = event.target.closest("[data-level]");
  if (levelButton) {
    $$("button", levelButton.parentElement).forEach((button) => button.classList.remove("active"));
    levelButton.classList.add("active");
    state.breakdownLevel = levelButton.dataset.level;
    renderBreakdown();
  }
  const summaryCard = event.target.closest("[data-summary-scope]");
  if (summaryCard) setBreakdownScope(summaryCard.dataset.summaryScope, true);
  if (event.target.closest("#parseAi")) parseAiText();
  if (event.target.closest("#commitPreview")) commitPreview();
  if (event.target.closest("#cancelPreview")) cancelPreview();
  if (event.target.closest("#newAiConversation")) newAiConversation();
  const removePreview = event.target.closest("[data-remove-preview]");
  if (removePreview) { state.preview.splice(Number(removePreview.dataset.removePreview), 1); renderPreview(); }
  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    const record = state.records.find((row) => row.id === Number(editButton.dataset.edit));
    if (record) openManualDialog(record);
  }
  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    const record = state.records.find((row) => row.id === Number(deleteButton.dataset.delete));
    if (record) openDeleteDialog(record);
  }
  const monthShift = event.target.closest("[data-month-shift]");
  if (monthShift) {
    const [year, month] = state.recordMonth.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, month - 1 + Number(monthShift.dataset.monthShift), 1));
    const nextMonth = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
    selectRecordMonth(nextMonth).catch((error) => toast(error.message, true));
  }
  const dayShift = event.target.closest("[data-day-shift]");
  if (dayShift) {
    shiftHistoryDate(dayShift.dataset.dayShift).catch((error) => toast(error.message, true));
  }
});

$("#openManual").addEventListener("click", () => openManualDialog());
$("#openSettings").addEventListener("click", openAiSettings);
$("#aiModeSelect").addEventListener("change", toggleCustomModelFields);
$("#settingsForm").addEventListener("submit", saveAiSettings);
$("#closeSettings").addEventListener("click", () => $("#settingsDialog").close());
$("#cancelSettings").addEventListener("click", () => $("#settingsDialog").close());
$("#manualForm").addEventListener("submit", saveManual);
$("#closeManual").addEventListener("click", closeManualDialog);
$("#cancelManual").addEventListener("click", closeManualDialog);
$("#cancelDelete").addEventListener("click", closeDeleteDialog);
$("#confirmDelete").addEventListener("click", confirmDeleteRecord);
$("#historyDate").addEventListener("change", (event) => selectHistoryDate(event.target.value).catch((error) => toast(error.message, true)));
$("#applyHistoryYear").addEventListener("click", () => selectHistoryYear($("#historyYear").value).catch((error) => toast(error.message, true)));
$("#historyYear").addEventListener("keydown", (event) => { if (event.key === "Enter") selectHistoryYear(event.target.value).catch((error) => toast(error.message, true)); });
$("#showLatestStats").addEventListener("click", () => showLatestStatistics().catch((error) => toast(error.message, true)));
$("#recordMonth").addEventListener("change", (event) => selectRecordMonth(event.target.value).catch((error) => toast(error.message, true)));
$("#previousPage").addEventListener("click", () => { state.recordPage -= 1; loadRecordPage().catch((error) => toast(error.message, true)); });
$("#nextPage").addEventListener("click", () => { state.recordPage += 1; loadRecordPage().catch((error) => toast(error.message, true)); });
let recordSearchTimer;
$("#recordSearch").addEventListener("input", (event) => {
  clearTimeout(recordSearchTimer);
  recordSearchTimer = setTimeout(() => {
    state.recordQuery = event.target.value.trim();
    state.recordPage = 1;
    loadRecordPage().catch((error) => toast(error.message, true));
  }, 250);
});
$("#recordCategory").addEventListener("change", (event) => {
  state.recordCategory = event.target.value;
  state.recordPage = 1;
  loadRecordPage().catch((error) => toast(error.message, true));
});
$("#clearRecordFilters").addEventListener("click", () => {
  clearTimeout(recordSearchTimer);
  state.recordQuery = "";
  state.recordCategory = "";
  state.recordPage = 1;
  $("#recordSearch").value = "";
  $("#recordCategory").value = "";
  loadRecordPage().catch((error) => toast(error.message, true));
});
$("#aiText").addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") parseAiText(); });
$$("[data-summary-scope]").forEach((card) => card.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setBreakdownScope(card.dataset.summaryScope, true);
  }
}));

const WORKSPACES = {
  dashboard: { eyebrow: "FINANCE OVERVIEW", title: "财务概览", subtitle: "快速掌握关键支出、分类结构与最近账目" },
  transactions: { eyebrow: "TRANSACTION LEDGER", title: "账目明细", subtitle: "按月份、分类与关键词检索全部账目" },
  analytics: { eyebrow: "FINANCIAL ANALYTICS", title: "统计分析", subtitle: "跨日期、周、月和年份回看支出趋势与占比" },
  ai: { eyebrow: "AI BOOKKEEPING", title: "AI 助手", subtitle: "通过多轮自然语言对话查询和管理账目" },
  settings: { eyebrow: "APPLICATION SETTINGS", title: "系统设置", subtitle: "管理模型服务、数据能力与安全选项" },
};
const WORKSPACE_ALIASES = { top: "dashboard", records: "transactions", statistics: "analytics", "ai-entry": "ai" };

function showWorkspace(requested) {
  const normalized = WORKSPACE_ALIASES[requested] || requested;
  const id = WORKSPACES[normalized] ? normalized : "dashboard";
  $$(".workspace-page").forEach((page) => page.classList.toggle("active", page.dataset.workspace === id));
  $$('[data-nav]').forEach((item) => item.classList.toggle("active", item.dataset.nav === id));
  $("#pageEyebrow").textContent = WORKSPACES[id].eyebrow;
  $("#pageTitle").textContent = WORKSPACES[id].title;
  $("#pageSubtitle").textContent = WORKSPACES[id].subtitle;
  document.title = `${WORKSPACES[id].title} · 轻账`;
  window.scrollTo(0, 0);
  if (window.location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
}

function syncNavigationFromHash() {
  showWorkspace(window.location.hash.slice(1) || "dashboard");
}

window.addEventListener("hashchange", syncNavigationFromHash);
syncNavigationFromHash();
$("#globalSearch").addEventListener("click", () => {
  window.location.hash = "transactions";
  requestAnimationFrame(() => $("#recordSearch").focus());
});

Promise.all([api("/api/health"), refresh()])
  .then(([health]) => {
    $("#aiStatus").textContent = `${modelModeLabel(health.aiMode)}已启用`;
    $("#parserMode").textContent = "多轮对话已就绪";
    $("#settingsAiMode").textContent = modelModeLabel(health.aiMode);
    $("#settingsAiStatus").textContent = health.aiConfigured ? "配置可用" : "需要完成模型配置";
  })
  .catch((error) => toast(error.message, true));
