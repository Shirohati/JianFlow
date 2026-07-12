import { taskApi, activityApi, goalApi, conversationApi, streamChat, personaApi, userApi } from '../api';
import { store } from '../store';
import { initIcons, getIconHTML } from '../icons';
import type { AiChatRequest, Conversation, AiPersona, UserProfile } from '../api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
}

const SCENARIOS = [
  { id: 'plan', label: '晨间规划', icon: 'sun' },
  { id: 'weekly', label: '周报生成', icon: 'calendar-range' },
  { id: 'analyze', label: '分析建议', icon: 'bar-chart-3' },
  { id: 'workflow', label: '构建工作流', icon: 'git-branch' },
  { id: 'free', label: '自由问答', icon: 'message-square' },
];

const SCENARIO_PROMPTS: Record<string, string> = {
  plan: '帮我规划今天的学习和工作，根据我的待办事项和习惯给出建议。',
  weekly: '帮我分析本周的学习数据，生成一份周报总结。',
  analyze: '根据我当前的数据，给我一些提升生产力的建议。',
  workflow: '查看我当前的目标板，分析我的学习进度并优化工作流。',
  free: '',
};

let messages: ChatMessage[] = [];
let sessionId = 'session_' + Date.now();
let conversations: Conversation[] = [];
let streamingCleanup: (() => void) | null = null;
let currentPersona: AiPersona | null = null;
let userProfile: UserProfile | null = null;
let userScrolledUp = false;
let lastStreamMsgIdx = -1; // index of the message being streamed into
let lastBriefDate = '';

function esc(str: string): string {
  const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return str.replace(/[&<>"]/g, c => m[c] || c);
}

/** Strip tool call markers from content before displaying */
function stripToolCalls(text: string): string {
  return text.replace(/【TOOL】[\s\S]*?(?:【\/TOOL】|\/TOOL】|$)/g, '').trim();
}

/** Minimal markdown → HTML. Lists processed before <br> to avoid <br> inside <ul> */
function md(text: string): string {
  if (!text) return '';
  let h = esc(stripToolCalls(text));
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  h = h.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  h = h.replace(/\n/g, '<br>');
  return h;
}

/* ─── DOM helpers ─── */

function el(id: string): HTMLElement | null { return document.getElementById(id); }

function scrollToBottom(force = false): void {
  if (!force && userScrolledUp) return;
  const ct = el('chatMessages');
  if (ct) { ct.scrollTop = ct.scrollHeight; }
}

/** Build one message HTML string (without mounting) */
function msgHtml(m: ChatMessage, idx: number, showThought: boolean, streaming: boolean): string {
  const last = idx === messages.length - 1;
  let html = `<div class="chat-msg chat-msg--${m.role}" data-msg-idx="${idx}">`;
  if (m.role === 'assistant' && m.reasoning) {
    html += `<details class="chat-thinking"${showThought ? ' open' : ''}>`;
    html += `<summary>🧠 思考链</summary>`;
    html += `<div class="chat-thinking-content">${esc(m.reasoning)}</div></details>`;
  }
  html += `<div class="chat-msg-content">${md(m.content)}</div>`;
  if (m.role === 'assistant' && m.content) {
    html += `<button class="chat-msg-copy" title="复制">📋</button>`;
  }
  if (last && streaming) {
    html += `<span class="chat-typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
  }
  html += `</div>`;
  return html;
}

/** Append a new message element to the DOM */
function appendMsgEl(m: ChatMessage, idx: number): void {
  const ct = el('chatMessages');
  if (!ct) return;
  const showThought = (store.get<any>('activitySettings') as any)?.show_thinking === true;
  // remove welcome if present
  const welcome = ct.querySelector('.chat-welcome');
  if (welcome) welcome.remove();
  ct.insertAdjacentHTML('beforeend', msgHtml(m, idx, showThought, chatPanel.streaming));
  scrollToBottom();
}

/** Only update the content + copy button of the last streaming message. Avoid full rebuild. */
function updateStreamMsg(content: string): void {
  const ct = el('chatMessages');
  if (!ct) return;
  const items = ct.querySelectorAll('.chat-msg');
  const last = items[items.length - 1] as HTMLElement | undefined;
  if (!last) return;
  const contentEl = last.querySelector('.chat-msg-content') as HTMLElement;
  if (contentEl) contentEl.innerHTML = md(content);
  // ensure copy button exists
  let copyBtn = last.querySelector('.chat-msg-copy') as HTMLElement | null;
  if (content && !copyBtn) {
    last.insertAdjacentHTML('beforeend', '<button class="chat-msg-copy" title="复制">📋</button>');
  }
}

/** Full rebuild of message list (used when switching conversations or loading) */
function rebuildMsgView(): void {
  const ct = el('chatMessages');
  if (!ct) return;
  if (messages.length === 0) {
    const greeting = currentPersona?.greeting || '你好！我是笺流 AI 管家，可以帮你：';
    ct.innerHTML = `
      <div class="chat-welcome">
        <p>${esc(greeting)}</p>
        <ul><li>📋 规划每日安排</li><li>📊 分析学习数据</li><li>📝 构建便签工作流</li><li>💬 回答你的问题</li></ul>
      </div>`;
    return;
  }
  const showThought = (store.get<any>('activitySettings') as any)?.show_thinking === true;
  ct.innerHTML = messages.map((m, i) => msgHtml(m, i, showThought, chatPanel.streaming)).join('');
  scrollToBottom(true);
}

/* ─── Data loading ─── */

async function loadConversations(): Promise<void> {
  try { conversations = await conversationApi.list(); } catch { conversations = []; }
  renderConvList();
}

async function loadCurrentPersona(): Promise<void> {
  const settings = store.get<any>('activitySettings');
  const personaId = settings?.current_persona_id || '';
  try {
    const list = await personaApi.list();
    currentPersona = personaId
      ? list.find((p: AiPersona) => p.id === personaId) || null
      : list.find((p: AiPersona) => p.id === 'persona_default') || null;
  } catch { currentPersona = null; }
}

async function loadUserProfile(): Promise<void> {
  try { userProfile = await userApi.getProfile(); renderProfilePanel(); }
  catch { userProfile = null; }
}

/* ─── Renderers ─── */

function renderConvList(): void {
  const ct = el('chatConvList');
  if (!ct) return;
  if (conversations.length === 0) {
    ct.innerHTML = '<span class="chat-conv-label">当前对话</span>';
    return;
  }
  ct.innerHTML = `
    <span class="chat-conv-label">对话历史</span>
    <div class="chat-conv-items">${conversations.map(c => `
      <div class="chat-conv-item${c.id === sessionId ? ' active' : ''}" data-conv-id="${c.id}">
        <span class="chat-conv-title">${esc(c.title || '新对话')}</span>
        <span class="chat-conv-time">${c.updated_at?.slice(5, 16) || ''}</span>
      </div>`).join('')}
    </div>`;
}

function renderProfilePanel(): void {
  const ct = el('chatProfilePanel');
  if (!ct || !userProfile) return;
  const insights = (userProfile.insights || []).slice(-5).reverse();
  ct.innerHTML = `
    <details class="chat-profile-details">
      <summary>用户画像</summary>
      <div class="chat-profile-content">
        ${userProfile.total_days_active > 0 ? `<div class="chat-profile-item">活跃 <strong>${userProfile.total_days_active}</strong> 天</div>` : ''}
        ${userProfile.average_daily_focus > 0 ? `<div class="chat-profile-item">日均专注 <strong>${userProfile.average_daily_focus}</strong> 分钟</div>` : ''}
        ${userProfile.common_categories.length > 0 ? `<div class="chat-profile-item">常用分类：${userProfile.common_categories.join('、')}</div>` : ''}
        ${insights.length > 0 ? `
          <div class="chat-profile-insights">
            <div class="chat-profile-insights-title">最近洞察</div>
            ${insights.map(i => `
              <div class="chat-profile-insight-item" data-insight-id="${i.id}">
                <span class="chat-profile-insight-type">${i.insight_type}</span>
                <span class="chat-profile-insight-content">${esc(i.content)}</span>
                <button class="chat-profile-insight-del" data-insight-id="${i.id}" title="删除">×</button>
              </div>`).join('')}
          </div>` : ''}
      </div>
    </details>`;
}

function updatePersonaDisplay(): void {
  const nameEl = el('chatPersonaName');
  if (nameEl) nameEl.textContent = currentPersona ? currentPersona.name : 'AI 管家';
}

/* ─── Event delegation (only set up once) ─── */

function setupDelegatedEvents(): void {
  const ct = el('chatMessages');
  if (!ct) return;

  // Copy button
  ct.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.chat-msg-copy') as HTMLElement | null;
    if (!btn) return;
    e.stopPropagation();
    const msgEl = btn.closest('.chat-msg') as HTMLElement | null;
    const idx = parseInt(msgEl?.getAttribute('data-msg-idx') || '-1');
    if (idx < 0 || !messages[idx]) return;
    try {
      await navigator.clipboard.writeText(messages[idx].content);
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = '📋'; }, 1500);
    } catch { /* ignore */ }
  });
}

function bindConvListEvents(): void {
  const ct = el('chatConvList');
  if (!ct) return;
  ct.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.chat-conv-item') as HTMLElement | null;
    if (item) switchConversation(item.dataset.convId!);
  });
}

/* ─── Conversation switching ─── */

async function switchConversation(id: string): Promise<void> {
  if (chatPanel.streaming) return;
  sessionId = id;
  if (streamingCleanup) { streamingCleanup(); streamingCleanup = null; }
  try {
    const conv = await conversationApi.get(id);
    messages = conv ? conv.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })) : [];
  } catch { messages = []; }
  rebuildMsgView();
  renderConvList();
  userScrolledUp = false;
}

function newConversation(): void {
  if (chatPanel.streaming) return;
  sessionId = 'session_' + Date.now();
  messages = [];
  userScrolledUp = false;
  if (streamingCleanup) { streamingCleanup(); streamingCleanup = null; }
  rebuildMsgView();
  renderConvList();
}

/* ─── Page data ─── */

async function gatherPageData(): Promise<string> {
  const parts: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const errors: string[] = [];

  try {
    const todayTasks = await taskApi.list({ todo_date: today });
    const done = todayTasks.filter((t: any) => t.todo_status === 'completed' || t.status === 'done');
    const active = todayTasks.filter((t: any) => !(t.todo_status === 'completed' || t.status === 'done'));
    if (todayTasks.length === 0) parts.push(`今日${today}：暂无待办`);
    else {
      parts.push(`今日${today}：未完成${active.length} 已完成${done.length}`);
      active.forEach((t: any) => parts.push(`  ${t.title}[${t.id.slice(0,4)}]${t.deadline?` 截止${t.deadline}`:''}${t.priority?` P${t.priority}`:''}`));
      done.forEach((t: any) => parts.push(`  ✓${t.title}`));
    }
  } catch (e: any) { errors.push(`今日待办: ${e?.message || '获取失败'}`); }

  try {
    const yesterdayTasks = await taskApi.list({ todo_date: yesterday });
    if (yesterdayTasks.length > 0) {
      const d = yesterdayTasks.filter((t: any) => t.todo_status === 'completed' || t.status === 'done');
      const u = yesterdayTasks.filter((t: any) => !(t.todo_status === 'completed' || t.status === 'done'));
      parts.push(`昨日${yesterday}：未完成${u.length} 已完成${d.length}`);
      u.forEach((t: any) => parts.push(`  ${t.title}[${t.id.slice(0,4)}]`));
    }
  } catch { }

  try {
    const state = await activityApi.getState();
    if (state) parts.push(`监测:${state.paused?'暂停':'运行中'}`);
  } catch { }

  try {
    const score = await activityApi.getProductivityScore(today);
    if (score) parts.push(`生产力:${score.score}分(${score.level})`);
  } catch { }

  try {
    const allTasks = await taskApi.list({});
    const boardNotes = allTasks.filter((t: any) => t.grid_x !== null && t.grid_y !== null);
    if (boardNotes.length > 0) {
      const tabs = [...new Set(boardNotes.map((t: any) => t.board_tab || '默认').filter(Boolean))];
      parts.push(`目标板${boardNotes.length}项 标签:${tabs.join(',')}`);
      boardNotes.slice(0, 8).forEach((t: any) => {
        const c = t.note || t.content || '';
        parts.push(`  ${t.title}${c?`:${c.slice(0,30)}`:''}`);
      });
    }
  } catch { }

  try {
    const goals = await goalApi.list();
    if (goals.length > 0) parts.push(`目标:${goals.map((g: any) => `${g.goal_type}${g.target_minutes}m`).join(',')}`);
  } catch { }

  if (errors.length > 0) parts.push(`\n[异常]${errors.join(';')}`);
  return parts.join('\n');
}

/* ─── Send / Stream ─── */

async function send(): Promise<void> {
  const input = el('chatInput') as HTMLTextAreaElement | null;
  if (!input) return;
  const text = input.value.trim();
  if (!text || chatPanel.streaming) return;
  input.value = '';

  const msgIdx = messages.length;
  messages.push({ role: 'user', content: text });
  messages.push({ role: 'assistant', content: '', reasoning: '' });
  lastStreamMsgIdx = msgIdx + 1;

  chatPanel.streaming = true;
  chatPanel.disableInput();

  appendMsgEl(messages[msgIdx], msgIdx);
  appendMsgEl(messages[msgIdx + 1], msgIdx + 1);

  const stopBtn = el('chatStopBtn');
  if (stopBtn) stopBtn.style.display = 'inline-flex';

  const currentPage = store.get<string>('currentPage') || 'home';
  const pageData = await gatherPageData();
  const convHistory = messages.slice(0, msgIdx).map(m => ({ role: m.role, content: m.content }));
  const request: AiChatRequest = {
    session_id: sessionId,
    message: text,
    page: currentPage,
    page_data: pageData,
    history: convHistory,
  };

  let framePending = false;
  let execTimer: number | null = null;
  const execStatus = el('chatExecStatus');

  function showExecStatus(): void {
    if (execStatus) execStatus.style.display = 'flex';
  }
  function hideExecStatus(): void {
    if (execStatus) execStatus.style.display = 'none';
    if (execTimer !== null) { clearTimeout(execTimer); execTimer = null; }
  }
  function resetExecTimer(): void {
    if (execTimer !== null) clearTimeout(execTimer);
    execTimer = window.setTimeout(showExecStatus, 1200);
  }

  function cleanupStream(): void {
    chatPanel.streaming = false;
    chatPanel.enableInput();
    if (stopBtn) stopBtn.style.display = 'none';
    hideExecStatus();
    const ct = el('chatMessages');
    const dots = ct?.querySelector('.chat-typing-dots');
    if (dots) dots.remove();
  }

  try {
    streamingCleanup = await streamChat(request, {
      onToken: (token: string) => {
        resetExecTimer();
        const msg = messages[lastStreamMsgIdx];
        if (msg) {
          // Dedup: skip if token already at end of content (guards against duplicate SSE)
          if (token.length > 0 && msg.content.length >= token.length &&
              msg.content.slice(-token.length) === token) {
            return;
          }
          msg.content += token;
        }
        if (!framePending) {
          framePending = true;
          requestAnimationFrame(() => {
            framePending = false;
            const msg = messages[lastStreamMsgIdx];
            if (msg) updateStreamMsg(msg.content);
            scrollToBottom();
          });
        }
      },
      onReasoning: (reasoning: string) => {
        const msg = messages[lastStreamMsgIdx];
        if (msg) msg.reasoning = (msg.reasoning || '') + reasoning;
        const ct = el('chatMessages');
        const lastMsg = ct?.querySelector('.chat-msg:last-child');
        if (lastMsg) {
          let details = lastMsg.querySelector('.chat-thinking') as HTMLElement;
          const showThought = (store.get<any>('activitySettings') as any)?.show_thinking === true;
          if (!details) {
            const d = document.createElement('details');
            d.className = 'chat-thinking';
            if (showThought) d.setAttribute('open', '');
            d.innerHTML = `<summary>🧠 思考链</summary><div class="chat-thinking-content"></div>`;
            lastMsg.insertBefore(d, lastMsg.firstChild);
            details = d;
          }
          const contentDiv = details.querySelector('.chat-thinking-content') as HTMLElement;
          if (contentDiv) contentDiv.textContent = msg?.reasoning || '';
        }
      },
      onDone: (result: { content: string; session_id: string }) => {
        const clean = stripToolCalls(result.content);
        messages[lastStreamMsgIdx].content = clean;
        updateStreamMsg(clean);
        cleanupStream();
        loadConversations();
        setTimeout(() => loadUserProfile(), 2000);
      },
      onError: (error: string) => {
        const errMsg = error.includes('AI') ? error : `抱歉，出了点问题：${error}\n\n请检查 AI 配置是否正确。`;
        messages[lastStreamMsgIdx] = { role: 'assistant', content: errMsg };
        updateStreamMsg(errMsg);
        cleanupStream();
      },
    });
  } catch (err: any) {
    messages[lastStreamMsgIdx] = { role: 'assistant', content: '抱歉，出了点问题：' + (err?.message || String(err)) + '\n\n请检查 AI 配置是否正确。' };
    updateStreamMsg(messages[lastStreamMsgIdx].content);
    cleanupStream();
  }
}

/* ─── Panel component ─── */

export const chatPanel = {
  isOpen: false,
  streaming: false,

  init(): void {
    const container = document.createElement('div');
    container.id = 'chatRoot';
    container.innerHTML = `
      <div id="chatToggle" class="chat-toggle">${getIconHTML('bot', { size: '22' })}</div>
      <div id="chatPanel" class="chat-panel" style="display:none">
        <div class="chat-header">
          <span>${getIconHTML('bot', { size: '16' })} <span id="chatPersonaName">AI 管家</span></span>
          <div class="chat-header-actions">
            <button id="chatNewBtn" class="btn btn--ghost btn--icon" title="新建对话">${getIconHTML('plus', { size: '14' })}</button>
            <button id="chatCloseBtn" class="btn btn--ghost btn--icon">${getIconHTML('x', { size: '16' })}</button>
          </div>
        </div>
        <div id="chatConvList" class="chat-conv-list"></div>
        <div class="chat-scenarios">
          ${SCENARIOS.map(s => `<button class="chat-scenario-btn" data-scenario="${s.id}">${getIconHTML(s.icon, { size: '12' })} ${s.label}</button>`).join('')}
        </div>
        <div class="chat-brief-banner" id="chatBriefBanner" style="display:none">
          <span class="chat-brief-text">🌅 需要我为您做今日规划吗？</span>
          <button id="chatBriefPlanBtn" class="btn btn--primary btn--small">开始规划</button>
          <button id="chatBriefDismissBtn" class="btn btn--ghost btn--small">稍后</button>
        </div>
        <div class="chat-messages" id="chatMessages">
          <div class="chat-welcome"><p>你好！我是笺流 AI 管家，可以帮你：</p>
          <ul><li>📋 规划每日安排</li><li>📊 分析学习数据</li><li>📝 构建便签工作流</li><li>💬 回答你的问题</li></ul></div>
        </div>
        <div class="chat-msg-actions" id="chatMsgActions">
          <button id="chatScrollBtn" class="chat-scroll-btn" style="display:none">↓ 最新</button>
        </div>
        <div id="chatExecStatus" class="chat-exec-status" style="display:none">
          <span class="chat-exec-spinner"></span>
          <span class="chat-exec-text">正在执行操作…</span>
        </div>
        <div class="chat-input-area">
          <textarea id="chatInput" class="chat-input" placeholder="输入消息..." rows="2"></textarea>
          <button id="chatSendBtn" class="btn btn--primary btn--icon">${getIconHTML('send', { size: '16' })}</button>
          <button id="chatStopBtn" class="btn btn--danger btn--icon" style="display:none" title="停止生成">${getIconHTML('square', { size: '16' })}</button>
        </div>
        <div id="chatProfilePanel" class="chat-profile-panel"></div>
      </div>`;
    document.body.appendChild(container);
    this.bindEvents();
    initIcons();
    loadConversations();
    loadCurrentPersona().then(() => { updatePersonaDisplay(); rebuildMsgView(); });
    loadUserProfile();
    setupDelegatedEvents();
    bindConvListEvents();
  },

  bindEvents(): void {
    el('chatToggle')?.addEventListener('click', () => this.toggle());
    el('chatCloseBtn')?.addEventListener('click', () => this.close());
    el('chatNewBtn')?.addEventListener('click', newConversation);
    el('chatSendBtn')?.addEventListener('click', () => send());
    el('chatStopBtn')?.addEventListener('click', () => this.abort());

    const input = el('chatInput') as HTMLTextAreaElement | null;
    input?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
        e.preventDefault();
        send();
      }
    });

    el('chatScrollBtn')?.addEventListener('click', () => {
      const ct = el('chatMessages');
      if (ct) ct.scrollTop = ct.scrollHeight;
      userScrolledUp = false;
      const btn = el('chatScrollBtn');
      if (btn) btn.style.display = 'none';
    });

    const msgEl = el('chatMessages');
    msgEl?.addEventListener('scroll', () => {
      if (!msgEl) return;
      const atBottom = msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight < 60;
      userScrolledUp = !atBottom;
      const btn = el('chatScrollBtn');
      if (btn) btn.style.display = atBottom ? 'none' : 'block';
    });

    // Brief banner buttons
    el('chatBriefPlanBtn')?.addEventListener('click', () => {
      el('chatBriefBanner')!.style.display = 'none';
      lastBriefDate = new Date().toISOString().slice(0, 10);
      const inp = el('chatInput') as HTMLTextAreaElement | null;
      if (inp) { inp.value = '帮我规划今天'; send(); }
    });
    el('chatBriefDismissBtn')?.addEventListener('click', () => {
      el('chatBriefBanner')!.style.display = 'none';
      lastBriefDate = new Date().toISOString().slice(0, 10);
    });

    // Scenario buttons
    document.querySelectorAll('.chat-scenario-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.scenario!;
        const prompt = SCENARIO_PROMPTS[id];
        if (prompt) {
          const inp = el('chatInput') as HTMLTextAreaElement | null;
          if (inp) inp.value = prompt;
          send();
        }
      });
    });

    // Profile panel insight deletion
    el('chatProfilePanel')?.addEventListener('click', async (e) => {
      const delBtn = (e.target as HTMLElement).closest('.chat-profile-insight-del') as HTMLElement | null;
      if (!delBtn) return;
      e.stopPropagation();
      const id = delBtn.dataset.insightId;
      if (!id) return;
      try { await userApi.deleteInsight(id); await loadUserProfile(); } catch { /* ignore */ }
    });
  },

  toggle(): void { this.isOpen ? this.close() : this.open(); },

  open(): void {
    const panel = el('chatPanel');
    const toggle = el('chatToggle');
    if (panel) panel.style.display = 'flex';
    if (toggle) toggle.style.display = 'none';
    this.isOpen = true;
    el('chatInput')?.focus();
    loadConversations();
    loadCurrentPersona().then(() => { updatePersonaDisplay(); rebuildMsgView(); });
    loadUserProfile();

    // Auto-show brief banner on first daily open with empty chat
    if (messages.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      const hour = new Date().getHours();
      if (lastBriefDate !== today && hour >= 5 && hour < 14) {
        const banner = el('chatBriefBanner');
        if (banner) banner.style.display = 'flex';
      }
    }
  },

  close(): void {
    if (this.streaming) this.abort();
    const panel = el('chatPanel');
    const toggle = el('chatToggle');
    if (panel) panel.style.display = 'none';
    if (toggle) toggle.style.display = 'flex';
    this.isOpen = false;
  },

  abort(): void {
    if (streamingCleanup) { streamingCleanup(); streamingCleanup = null; }
    this.streaming = false;
    this.enableInput();
    const stopBtn = el('chatStopBtn');
    if (stopBtn) stopBtn.style.display = 'none';
    const execStatus = el('chatExecStatus');
    if (execStatus) execStatus.style.display = 'none';
    const ct = el('chatMessages');
    const dots = ct?.querySelector('.chat-typing-dots');
    if (dots) dots.remove();
    rebuildMsgView();
  },

  disableInput(): void {
    const input = el('chatInput') as HTMLTextAreaElement | null;
    const sendBtn = el('chatSendBtn') as HTMLButtonElement | null;
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
  },

  enableInput(): void {
    const input = el('chatInput') as HTMLTextAreaElement | null;
    const sendBtn = el('chatSendBtn') as HTMLButtonElement | null;
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    el('chatInput')?.focus();
  },

  openAndSend(prompt: string): void {
    this.open();
    if (this.streaming) return;
    setTimeout(() => {
      const inp = el('chatInput') as HTMLTextAreaElement | null;
      if (inp) { inp.value = prompt; send(); }
    }, 300);
  },
};
