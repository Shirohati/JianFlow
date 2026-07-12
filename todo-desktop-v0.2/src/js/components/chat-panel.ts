import { taskApi, activityApi, goalApi, conversationApi, streamChat, personaApi, userApi, timeRecordApi } from '../api';
import { store } from '../store';
import { initIcons, getIconHTML } from '../icons';
import { invoke } from '@tauri-apps/api/core';
import type { AiChatRequest, Conversation, AiPersona, UserProfile } from '../api';
import { ChatMessage, renderMessages, updateMessageElement } from '../chat/chat-message';
import { setSkillStatus, setOnTrigger, renderToolbar, bindSkillButtons, updateToolbarState, SkillName } from '../chat/chat-skill';

let messages: ChatMessage[] = [];
let sessionId = 'session_' + Date.now();
let conversations: Conversation[] = [];
let streamingCleanup: (() => void) | null = null;
let currentPersona: AiPersona | null = null;
let userProfile: UserProfile | null = null;
let currentSkill: SkillName | null = null;

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

async function loadUserProfile(): Promise<void> {
  try {
    userProfile = await userApi.getProfile();
    renderProfilePanel();
  } catch {
    userProfile = null;
  }
}

async function checkInitStatus(): Promise<boolean> {
  try {
    const profile = await userApi.getProfile();
    const hasInit = !!(profile as any).profile_json;
    setSkillStatus('init', 'ready');
    if (hasInit) {
      setSkillStatus('morning', 'ready');
      setSkillStatus('evening', 'ready');
      setSkillStatus('report', 'ready');
    } else {
      setSkillStatus('morning', 'locked');
      setSkillStatus('evening', 'locked');
      setSkillStatus('report', 'locked');
    }
    updateToolbarState();
    return hasInit;
  } catch {
    return false;
  }
}

function renderProfilePanel(): void {
  const el = document.getElementById('chatProfilePanel');
  if (!el || !userProfile) return;

  const insights = userProfile.insights || [];
  const recentInsights = insights.slice(-5).reverse();

  el.innerHTML = `
    <details class="chat-profile-details">
      <summary>用户画像</summary>
      <div class="chat-profile-content">
        ${userProfile.total_days_active > 0 ? `<div class="chat-profile-item">活跃 <strong>${userProfile.total_days_active}</strong> 天</div>` : ''}
        ${userProfile.average_daily_focus > 0 ? `<div class="chat-profile-item">日均专注 <strong>${userProfile.average_daily_focus}</strong> 分钟</div>` : ''}
        ${userProfile.common_categories.length > 0 ? `<div class="chat-profile-item">常用分类：${userProfile.common_categories.join('、')}</div>` : ''}
        ${recentInsights.length > 0 ? `
          <div class="chat-profile-insights">
            <div class="chat-profile-insights-title">最近洞察</div>
            ${recentInsights.map(i => `
              <div class="chat-profile-insight-item" data-insight-id="${i.id}">
                <span class="chat-profile-insight-type">${i.insight_type}</span>
                <span class="chat-profile-insight-content">${escapeHtml(i.content)}</span>
                <button class="chat-profile-insight-del" data-insight-id="${i.id}" title="删除">×</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </details>
  `;

  el.querySelectorAll('.chat-profile-insight-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.insightId!;
      try {
        await userApi.deleteInsight(id);
        await loadUserProfile();
      } catch { /* ignore */ }
    });
  });
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
  currentSkill = null;
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
        <p id="chatWelcomeMsg">你好！我是笺流 AI 管家，可以帮你：</p>
        <ul id="chatWelcomeList">
          <li>规划每日安排</li>
          <li>分析学习数据</li>
          <li>生成周报总结</li>
          <li>回答你的问题</li>
        </ul>
      </div>
    `;
    return;
  }
  el.innerHTML = renderMessages(messages);
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

function escapeHtml(str: string): string {
  const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return str.replace(/[&<>"]/g, c => m[c] || c);
}

async function handleFormSubmit(data: Record<string, any>): Promise<void> {
  if (currentSkill) {
    const skillName = currentSkill;
    currentSkill = null;

    if (skillName === 'init') {
      try {
        const result: any = await invoke('skill_submit', { name: 'init', formData: data });
        messages.push({ role: 'user', content: '【FORM_DATA】' + JSON.stringify(data) + '【/FORM_DATA】' });
        messages.push({ role: 'assistant', content: result.message || '已收到。' });
        renderMsgView();
        if (result.done) {
          setSkillStatus('init', 'done');
          updateToolbarState();
          setTimeout(() => { loadUserProfile(); checkInitStatus(); }, 1000);
        } else if (result.form_schema) {
          messages.push({ role: 'assistant', content: '【FORM】' + JSON.stringify(result.form_schema) + '【/FORM】' });
          currentSkill = 'init';
          renderMsgView();
        }
      } catch (err: any) {
        messages.push({ role: 'user', content: '【FORM_DATA】' + JSON.stringify(data) + '【/FORM_DATA】' });
        messages.push({ role: 'assistant', content: '处理出错：' + (err?.message || String(err)) });
        renderMsgView();
      }
    } else {
      setSkillStatus(skillName as SkillName, 'running');
      updateToolbarState();
      await doSend('【FORM_DATA】' + JSON.stringify(data) + '【/FORM_DATA】');
    }
  } else {
    const formDataStr = '【FORM_DATA】' + JSON.stringify(data) + '【/FORM_DATA】';
    await doSend(formDataStr);
  }
}

async function handleSkillTrigger(name: SkillName): Promise<void> {
  setSkillStatus(name, 'running');
  updateToolbarState();
  currentSkill = name;
  await doSend('/skill ' + name);
}

async function doSend(text: string): Promise<void> {
  if (!text || chatPanel.streaming) return;

  messages.push({ role: 'user', content: text });
  const msgIdx = messages.length;
  messages.push({ role: 'assistant', content: '', reasoning: '' });
  renderMsgView();
  chatPanel.streaming = true;
  chatPanel.disableInput();

  const currentPage = store.get<string>('currentPage') || 'home';
  const pageData = await chatPanel.gatherPageData();
  const convHistory = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
  const request: AiChatRequest = { session_id: sessionId, message: text, page: currentPage, page_data: pageData, history: convHistory };

  const showThinking = (store.get<any>('activitySettings') as any)?.show_thinking === true;
  (window as any).__showThinking = showThinking;

  try {
    streamingCleanup = await streamChat(request, {
      onToken: (token) => {
        const msg = messages[msgIdx];
        if (msg) msg.content += token;
        updateMessageElement(messages, msgIdx, showThinking);
      },
      onReasoning: (reasoning) => {
        const msg = messages[msgIdx];
        if (msg) msg.reasoning = (msg.reasoning || '') + reasoning;
        updateMessageElement(messages, msgIdx, showThinking);
      },
      onDone: (result) => {
        messages[msgIdx].content = result.content;
        chatPanel.streaming = false;
        chatPanel.enableInput();
        renderMsgView();
        loadConversations();
        setTimeout(() => {
          loadUserProfile();
          checkInitStatus();
          if (currentSkill) {
            setSkillStatus(currentSkill, 'running');
            updateToolbarState();
          }
        }, 2000);
      },
      onError: (error) => {
        messages[msgIdx] = { role: 'assistant', content: '抱歉，出了点问题：' + error + '\n\n请检查 AI 配置是否正确。' };
        chatPanel.streaming = false;
        chatPanel.enableInput();
        renderMsgView();
      },
    });
  } catch (err: any) {
    messages[msgIdx] = { role: 'assistant', content: '抱歉，出了点问题：' + (err?.message || String(err)) + '\n\n请检查 AI 配置是否正确。' };
    chatPanel.streaming = false;
    chatPanel.enableInput();
    renderMsgView();
  }
}

function setupFormEventDelegation(): void {
  const msgEl = document.getElementById('chatMessages');
  if (!msgEl) return;

  msgEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const formEl = target.closest('.cf-form') as HTMLElement;
    if (!formEl) return;

    if (target.closest('.cf-btn-submit')) {
      const formContainer = target.closest('.cf-form') as HTMLElement;
      if (!formContainer) return;
      const msgEl = formContainer.closest('.chat-msg') as HTMLElement;
      if (!msgEl) return;
      const idx = parseInt(msgEl.dataset.msgIndex!);
      const msg = messages[idx];
      if (!msg) return;

      // Collect form data
      const data: Record<string, any> = {};
      formContainer.querySelectorAll('[data-form-key]').forEach(el => {
        const key = (el as HTMLElement).dataset.formKey!;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          data[key] = el.value;
        } else if (el.classList.contains('cf-tags-container')) {
          const tags = el.querySelectorAll('.cf-tag');
          data[key] = Array.from(tags).map(t => t.textContent?.replace('×', '').trim() || '');
        }
      });

      handleFormSubmit(data);
    }
  });

  msgEl.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('cf-tags-input')) return;
    const input = target as HTMLInputElement;
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;
      const container = input.closest('.cf-tags-container');
      if (!container) return;
      const tagsContainer = container.querySelector('.cf-tags');
      if (!tagsContainer) return;
      const tag = document.createElement('span');
      tag.className = 'cf-tag';
      tag.textContent = val;
      const del = document.createElement('span');
      del.className = 'cf-tag-del';
      del.textContent = '×';
      del.addEventListener('click', () => tag.remove());
      tag.appendChild(del);
      tagsContainer.appendChild(tag);
      input.value = '';
    }
  });
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
        <div class="chat-messages" id="chatMessages">
          <div class="chat-welcome">
            <p id="chatWelcomeMsg">你好！我是笺流 AI 管家，可以帮你：</p>
            <ul id="chatWelcomeList">
              <li>规划每日安排</li>
              <li>分析学习数据</li>
              <li>生成周报总结</li>
              <li>回答你的问题</li>
            </ul>
          </div>
        </div>
        <div class="chat-input-area">
          <textarea id="chatInput" class="chat-input" placeholder="输入消息..." rows="2"></textarea>
          <button id="chatSendBtn" class="btn btn--primary btn--icon">${getIconHTML('send', { size: '16' })}</button>
        </div>
        ${renderToolbar()}
        <div id="chatProfilePanel" class="chat-profile-panel"></div>
      </div>
    `;

    const div = document.createElement('div');
    div.id = 'chatRoot';
    div.innerHTML = html;
    document.body.appendChild(div);

    setOnTrigger((name) => handleSkillTrigger(name));

    this.bindEvents();
    setupFormEventDelegation();
    initIcons();
    loadConversations();
    loadCurrentPersona().then(() => updatePersonaDisplay());
    loadUserProfile();
    checkInitStatus();
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

    const toolbarEl = document.getElementById('chatSkillBar');
    if (toolbarEl) bindSkillButtons(toolbarEl);
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
    loadUserProfile();
    checkInitStatus();
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

    try {
      const summary = await activityApi.getSummary(today);
      if (summary && summary.total_active_seconds > 0) {
        parts.push(`=== 今日活动监测 ===`);
        parts.push(`总活跃时长：${Math.round(summary.total_active_seconds / 60)} 分钟`);
        const cats = Object.entries(summary.category_breakdown).sort((a, b) => b[1] - a[1]);
        for (const [cat, sec] of cats) {
          parts.push(`${cat}: ${Math.round(sec / 60)} 分钟`);
        }
        const apps = summary.top_apps.slice(0, 8);
        if (apps.length > 0) {
          parts.push('Top 应用/窗口：');
          apps.forEach(a => parts.push(`  ${a.name} (${a.category}): ${Math.round(a.seconds / 60)} 分钟`));
        }
      }
    } catch { /* ignore */ }

    try {
      const sessions = await activityApi.getSessions(today);
      const notable = sessions
        .filter(s => s.duration_seconds >= 180)
        .sort((a, b) => b.duration_seconds - a.duration_seconds)
        .slice(0, 15);
      if (notable.length > 0) {
        parts.push(`较长片段（按时长倒序）：`);
        notable.forEach(s => {
          const start = s.start_time.slice(11, 16);
          const end = s.end_time.slice(11, 16);
          const label = s.web_title || s.window_title || s.process_name || '未知';
          parts.push(`  ${start}-${end} [${s.category}] ${label}（${Math.round(s.duration_seconds / 60)} 分钟）`);
        });
      }
    } catch { /* ignore */ }

    try {
      const records = await timeRecordApi.list(today);
      if (records.length > 0) {
        let totalPomo = 0;
        parts.push(`=== 今日专注/番茄钟记录 ===`);
        records.forEach(r => {
          totalPomo += r.total_minutes;
          parts.push(`  ${r.time_type}: ${r.total_minutes} 分钟${r.note ? ` — ${r.note}` : ''}`);
        });
        parts.push(`专注总时长：${totalPomo} 分钟`);
      }
    } catch { /* ignore */ }

    try {
      const todayTasks = await taskApi.list({ todo_date: today });
      const scheduled = todayTasks.filter((t: any) => t.schedule_start);
      if (scheduled.length > 0) {
        scheduled.sort((a: any, b: any) => (a.schedule_start || '').localeCompare(b.schedule_start || ''));
        parts.push(`=== 今日时间轴（带时段的任务） ===`);
        scheduled.forEach((t: any) => {
          const status = (t.todo_status === 'completed' || t.status === 'done') ? '✅' : '⬜';
          parts.push(`  ${status} ${t.schedule_start.slice(0,5)}${t.schedule_end ? '-' + t.schedule_end.slice(0,5) : ''} ${t.title}`);
        });
      }
    } catch { /* ignore */ }

    try {
      const all = await taskApi.list({});
      const boardNotes = all.filter((t: any) => t.grid_x !== null && t.grid_y !== null && t.sub_type !== 'task');
      if (boardNotes.length > 0) {
        const types = [...new Set(boardNotes.map((t: any) => t.type))];
        const tabs = [...new Set(boardNotes.map((t: any) => t.board_tab).filter(Boolean))];
        parts.push(`=== 目标板内容 (${boardNotes.length} 项, 类型: ${types.join('/')}) ===`);
        if (page === 'board') {
          boardNotes.forEach((t: any) => {
            const content = t.note || t.content || '';
            parts.push(`  - [${t.type}] ${t.title}${content ? `: ${content.slice(0, 80)}` : ''} (ID:${t.id.slice(0,8)}...)${t.board_tab ? ` tab:${t.board_tab}` : ''}`);
          });
        } else {
          // 非 board 页只展示概览：每类/每标签页几项
          if (tabs.length > 0) parts.push(`  标签页：${tabs.join('、')}`);
          const byType: Record<string, number> = {};
          boardNotes.forEach((t: any) => { byType[t.type] = (byType[t.type] || 0) + 1; });
          parts.push(`  分布：${Object.entries(byType).map(([k, v]) => `${k} ${v}项`).join('、')}`);
          parts.push(`  （如需查看详情，可用 board_read 工具）`);
        }
      }
    } catch { /* ignore */ }
    try {
      const goals = await goalApi.list();
      if (goals.length > 0) parts.push(`学习目标：${goals.map((g: any) => `${g.goal_type} ${g.target_minutes}分钟/天`).join('，')}`);
    } catch { /* ignore */ }

    return parts.join('\n');
  },

  send(): void {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    const text = input.value.trim();
    if (!text || this.streaming) return;
    input.value = '';
    doSend(text);
  },

  openAndSend(prompt: string): void {
    this.open();
    if (this.streaming) return;
    setTimeout(() => {
      (document.getElementById('chatInput') as HTMLTextAreaElement).value = prompt;
      this.send();
    }, 300);
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
};
