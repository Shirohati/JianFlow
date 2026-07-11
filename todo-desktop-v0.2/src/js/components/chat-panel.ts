import { taskApi, activityApi, goalApi, connectionApi, conversationApi, streamChat, personaApi } from '../api';
import { store } from '../store';
import { initIcons, getIconHTML } from '../icons';
import type { AiChatRequest, Conversation, AiPersona } from '../api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
}

const SCENARIOS = [
  { id: 'plan', label: '晨间规划', icon: 'sun' },
  { id: 'weekly', label: '周报生成', icon: 'calendar-range' },
  { id: 'analyze', label: '分析建议', icon: 'bar-chart-3' },
  { id: 'free', label: '自由问答', icon: 'message-square' },
];

const SCENARIO_PROMPTS: Record<string, string> = {
  plan: '帮我规划今天的学习和工作，根据我的待办事项和习惯给出建议。',
  weekly: '帮我分析本周的学习数据，生成一份周报总结。',
  analyze: '根据我当前的数据，给我一些提升生产力的建议。',
  free: '',
};

let messages: ChatMessage[] = [];
let sessionId = 'session_' + Date.now();
let conversations: Conversation[] = [];
let streamingCleanup: (() => void) | null = null;
let currentPersona: AiPersona | null = null;

function escapeHtml(str: string): string {
  const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return str.replace(/[&<>"]/g, c => m[c] || c);
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/### (.+)/g, '<h4>$1</h4>');
  html = html.replace(/## (.+)/g, '<h3>$1</h3>');
  html = html.replace(/# (.+)/g, '<h2>$1</h2>');
  html = html.replace(/- (.+)/g, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

async function loadConversations(): Promise<void> {
  try { conversations = await conversationApi.list(); } catch { conversations = []; }
  renderConversationList();
}

async function loadCurrentPersona(): Promise<void> {
  const settings = store.get<any>('activitySettings');
  const personaId = settings?.current_persona_id || '';
  try {
    const list = await personaApi.list();
    if (personaId) {
      currentPersona = list.find((p: AiPersona) => p.id === personaId) || null;
    } else {
      currentPersona = list.find((p: AiPersona) => p.id === 'persona_default') || null;
    }
  } catch {
    currentPersona = null;
  }
}

async function switchConversation(id: string): Promise<void> {
  if (chatPanel.streaming) return;
  sessionId = id;
  if (streamingCleanup) { streamingCleanup(); streamingCleanup = null; }
  try {
    const conv = await conversationApi.get(id);
    if (conv) {
      messages = conv.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    } else {
      messages = [];
    }
  } catch { messages = []; }
  renderMsgView();
  renderConversationList();
}

function newConversation(): void {
  if (chatPanel.streaming) return;
  sessionId = 'session_' + Date.now();
  messages = [];
  if (streamingCleanup) { streamingCleanup(); streamingCleanup = null; }
  renderMsgView();
  renderConversationList();
}

function renderMsgView(): void {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  if (messages.length === 0) {
    el.innerHTML = `
      <div class="chat-welcome">
        <p>你好！我是笺流 AI 管家，可以帮你：</p>
        <ul>
          <li>📋 规划每日安排</li>
          <li>📊 分析学习数据</li>
          <li>📝 生成周报总结</li>
          <li>💬 回答你的问题</li>
        </ul>
      </div>
    `;
    return;
  }
  el.innerHTML = messages.map(m => {
    if (m.role === 'assistant' && m.reasoning) {
      const showThinking = (store.get<any>('activitySettings') as any)?.show_thinking === true;
      return `
        <div class="chat-msg chat-msg--${m.role}">
          <details class="chat-thinking"${showThinking ? ' open' : ''}>
            <summary>🧠 思考链</summary>
            <div class="chat-thinking-content">${escapeHtml(m.reasoning)}</div>
          </details>
          <div class="chat-msg-content">${renderMarkdown(m.content)}</div>
        </div>
      `;
    }
    return `
      <div class="chat-msg chat-msg--${m.role}">
        <div class="chat-msg-content">${renderMarkdown(m.content)}</div>
      </div>
    `;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function renderConversationList(): void {
  const el = document.getElementById('chatConvList');
  if (!el) return;
  if (conversations.length === 0) {
    el.innerHTML = `<span class="chat-conv-label">当前对话</span>`;
    return;
  }
  el.innerHTML = `
    <span class="chat-conv-label">对话历史</span>
    <div class="chat-conv-items">
      ${conversations.map(c => `
        <div class="chat-conv-item${c.id === sessionId ? ' active' : ''}" data-conv-id="${c.id}">
          <span class="chat-conv-title">${escapeHtml(c.title || '新对话')}</span>
          <span class="chat-conv-time">${c.updated_at?.slice(5, 16) || ''}</span>
        </div>
      `).join('')}
    </div>
  `;
  el.querySelectorAll('.chat-conv-item').forEach(item => {
    item.addEventListener('click', () => switchConversation((item as HTMLElement).dataset.convId!));
  });
}

function updatePersonaDisplay(): void {
  const nameEl = document.getElementById('chatPersonaName');
  const welcomeEl = document.getElementById('chatWelcomeMsg');
  if (nameEl) {
    nameEl.textContent = currentPersona ? currentPersona.name : 'AI 管家';
  }
  if (welcomeEl) {
    welcomeEl.textContent = currentPersona?.greeting || '你好！我是笺流 AI 管家，可以帮你：';
  }
}

export const chatPanel = {
  isOpen: false,
  streaming: false,

  init(): void {
    const html = `
      <div id="chatToggle" class="chat-toggle">
        ${getIconHTML('bot', { size: '22' })}
      </div>
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
        <div class="chat-messages" id="chatMessages">
          <div class="chat-welcome">
            <p id="chatWelcomeMsg">你好！我是笺流 AI 管家，可以帮你：</p>
            <ul id="chatWelcomeList">
              <li>📋 规划每日安排</li>
              <li>📊 分析学习数据</li>
              <li>📝 生成周报总结</li>
              <li>💬 回答你的问题</li>
            </ul>
          </div>
        </div>
        <div class="chat-input-area">
          <textarea id="chatInput" class="chat-input" placeholder="输入消息..." rows="2"></textarea>
          <button id="chatSendBtn" class="btn btn--primary btn--icon">${getIconHTML('send', { size: '16' })}</button>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.id = 'chatRoot';
    div.innerHTML = html;
    document.body.appendChild(div);

    this.bindEvents();
    initIcons();
    // 加载保存的对话
    loadConversations();
    // 加载当前人设
    loadCurrentPersona().then(() => updatePersonaDisplay());
  },

  bindEvents(): void {
    document.getElementById('chatToggle')?.addEventListener('click', () => this.toggle());
    document.getElementById('chatCloseBtn')?.addEventListener('click', () => this.close());
    document.getElementById('chatNewBtn')?.addEventListener('click', () => newConversation());

    document.getElementById('chatSendBtn')?.addEventListener('click', () => this.send());
    document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
        e.preventDefault();
        this.send();
      }
    });

    document.querySelectorAll('.chat-scenario-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.scenario!;
        const prompt = SCENARIO_PROMPTS[id];
        if (prompt) {
          (document.getElementById('chatInput') as HTMLTextAreaElement).value = prompt;
          this.send();
        }
      });
    });
  },

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  },

  open(): void {
    const panel = document.getElementById('chatPanel');
    const toggle = document.getElementById('chatToggle');
    if (panel) panel.style.display = 'flex';
    if (toggle) toggle.style.display = 'none';
    this.isOpen = true;
    document.getElementById('chatInput')?.focus();
    loadConversations();
    loadCurrentPersona().then(() => updatePersonaDisplay());
  },

  close(): void {
    if (this.streaming && streamingCleanup) {
      streamingCleanup();
      streamingCleanup = null;
    }
    this.streaming = false;
    const panel = document.getElementById('chatPanel');
    const toggle = document.getElementById('chatToggle');
    if (panel) panel.style.display = 'none';
    if (toggle) toggle.style.display = 'flex';
    this.isOpen = false;
  },

  async gatherPageData(): Promise<string> {
    const parts: string[] = [];
    const page = (store.get<string>('currentPage') || 'home') as string;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    try {
      const todayTasks = await taskApi.list({ todo_date: today });
      const done = todayTasks.filter((t: any) => t.todo_status === 'completed' || t.status === 'done');
      const active = todayTasks.filter((t: any) => !(t.todo_status === 'completed' || t.status === 'done'));
      if (todayTasks.length > 0) {
        parts.push(`=== 今日待办 (${today}) ===`);
        parts.push(`未完成 ${active.length} 项，已完成 ${done.length} 项`);
        if (active.length > 0) {
          parts.push('未完成列表：');
          active.forEach((t: any) => parts.push(`  - ${t.title} (ID:${t.id.slice(0,8)}...)${t.deadline ? ` 截止:${t.deadline}` : ''}`));
        }
        if (done.length > 0) {
          parts.push('已完成列表：');
          done.forEach((t: any) => parts.push(`  - ${t.title}`));
        }
      } else {
        parts.push(`今日 (${today}) 无待办任务`);
      }
    } catch { parts.push('今日待办数据：获取失败'); }

    try {
      const yesterdayTasks = await taskApi.list({ todo_date: yesterday });
      if (yesterdayTasks.length > 0) {
        const d = yesterdayTasks.filter((t: any) => t.todo_status === 'completed' || t.status === 'done');
        const u = yesterdayTasks.filter((t: any) => !(t.todo_status === 'completed' || t.status === 'done'));
        parts.push(`=== 昨日待办 (${yesterday}) ===`);
        parts.push(`未完成 ${u.length} 项，已完成 ${d.length} 项`);
        if (u.length > 0) {
          parts.push('未完成列表：');
          u.forEach((t: any) => parts.push(`  - ${t.title} (ID:${t.id.slice(0,8)}...)`));
        }
        if (d.length > 0) {
          parts.push('已完成列表：');
          d.forEach((t: any) => parts.push(`  - ${t.title}`));
        }
      }
    } catch { /* 忽略 */ }

    try {
      const state = await activityApi.getState();
      if (state) parts.push(`活动监测：${state.paused ? '已暂停' : '运行中'}`);
    } catch { /* ignore */ }

    try {
      const score = await activityApi.getProductivityScore(today);
      if (score) parts.push(`今日生产力评分：${score.score}分 (${score.level})`);
    } catch { /* ignore */ }

    if (page === 'board') {
      try {
        const goals = await goalApi.list();
        if (goals.length > 0) parts.push(`学习目标：${goals.map((g: any) => `${g.goal_type} ${g.target_minutes}分钟/天`).join('，')}`);
      } catch { /* ignore */ }
      try {
        const conns = await connectionApi.list();
        if (conns.length > 0) parts.push(`连接线：${conns.length} 条`);
      } catch { /* ignore */ }
      try {
        const all = await taskApi.list({});
        const boardNotes = all.filter((t: any) => t.grid_x !== null && t.grid_y !== null && t.sub_type !== 'task');
        if (boardNotes.length > 0) {
          const types = [...new Set(boardNotes.map((t: any) => t.type))];
          parts.push(`=== 目标板内容 (${boardNotes.length} 项, 类型: ${types.join('/')}) ===`);
          boardNotes.forEach((t: any) => {
            const content = t.note || t.content || '';
            parts.push(`  - [${t.type}] ${t.title}${content ? `: ${content.slice(0, 80)}` : ''} (ID:${t.id.slice(0,8)}...)${t.board_tab ? ` tab:${t.board_tab}` : ''}`);
          });
        }
      } catch { /* ignore */ }
    }

    return parts.join('\n');
  },

  async send(): Promise<void> {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    const text = input.value.trim();
    if (!text || this.streaming) return;
    input.value = '';

    messages.push({ role: 'user', content: text });
    const msgIdx = messages.length; // index for the coming assistant message
    messages.push({ role: 'assistant', content: '', reasoning: '' });
    renderMsgView();
    this.streaming = true;
    this.disableInput();

    const currentPage = store.get<string>('currentPage') || 'home';
    const pageData = await this.gatherPageData();
    const convHistory = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    const request: AiChatRequest = { session_id: sessionId, message: text, page: currentPage, page_data: pageData, history: convHistory };

    try {
      streamingCleanup = await streamChat(request, {
        onToken: (token) => {
          const msg = messages[msgIdx];
          if (msg) msg.content += token;
          this.updateMsgElement(msgIdx);
        },
        onReasoning: (reasoning) => {
          const msg = messages[msgIdx];
          if (msg) msg.reasoning = (msg.reasoning || '') + reasoning;
          this.updateMsgElement(msgIdx);
        },
        onDone: (result) => {
          messages[msgIdx].content = result.content;
          this.streaming = false;
          this.enableInput();
          renderMsgView();
          loadConversations();
        },
        onError: (error) => {
          messages[msgIdx] = { role: 'assistant', content: '抱歉，出了点问题：' + error + '\n\n请检查 AI 配置是否正确。' };
          this.streaming = false;
          this.enableInput();
          renderMsgView();
        },
      });
    } catch (err: any) {
      messages[msgIdx] = { role: 'assistant', content: '抱歉，出了点问题：' + (err?.message || String(err)) + '\n\n请检查 AI 配置是否正确。' };
      this.streaming = false;
      this.enableInput();
      renderMsgView();
    }
  },

  updateMsgElement(idx: number): void {
    const el = document.getElementById('chatMessages');
    if (!el) return;
    const msg = messages[idx];
    if (!msg) return;
    const msgEls = el.querySelectorAll('.chat-msg');
    if (idx >= 0 && idx < msgEls.length) {
      const target = msgEls[idx] as HTMLElement;
      if (msg.reasoning) {
        const showThinking = (store.get<any>('activitySettings') as any)?.show_thinking === true;
        target.innerHTML = `
          <details class="chat-thinking"${showThinking ? ' open' : ''}>
            <summary>🧠 思考链</summary>
            <div class="chat-thinking-content">${escapeHtml(msg.reasoning || '')}</div>
          </details>
          <div class="chat-msg-content">${renderMarkdown(msg.content)}</div>
        `;
      } else {
        target.innerHTML = `<div class="chat-msg-content">${renderMarkdown(msg.content)}</div>`;
      }
    }
    el.scrollTop = el.scrollHeight;
  },

  disableInput(): void {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    const btn = document.getElementById('chatSendBtn') as HTMLButtonElement;
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
  },

  enableInput(): void {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    const btn = document.getElementById('chatSendBtn') as HTMLButtonElement;
    if (input) input.disabled = false;
    if (btn) btn.disabled = false;
    if (input) input.focus();
  },

  openAndSend(prompt: string): void {
    this.open();
    if (this.streaming) return;
    setTimeout(() => {
      (document.getElementById('chatInput') as HTMLTextAreaElement).value = prompt;
      this.send();
    }, 300);
  },
};
