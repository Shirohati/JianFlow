import { conversationApi, streamChat, personaApi, userApi, skillApi, type SkillParams } from '../api';
import { store } from '../store';
import { router } from '../router';
import { initIcons, getIconHTML } from '../icons';
import type { AiChatRequest, Conversation, AiPersona, UserProfile } from '../api';
import { ChatMessage, renderMessages, updateMessageElement } from '../chat/chat-message';
import { setSkillStatus, setOnTrigger, renderToolbar, bindSkillButtons, updateToolbarState, SkillName, triggerSkill } from '../chat/chat-skill';
import { renderForm, initTagsInput } from '../chat/chat-form';

let messages: ChatMessage[] = [];
let sessionId = 'session_' + Date.now();
let conversations: Conversation[] = [];
let streamingCleanup: (() => void) | null = null;
let currentPersona: AiPersona | null = null;
let userProfile: UserProfile | null = null;

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
  try {
    const outcome = await triggerSkill('init', { form_data: data });
    messages.push({ role: 'user', content: '【已提交初始化问卷】' });
    messages.push({ role: 'assistant', content: outcome.reply });
    renderMsgView();
    setSkillStatus('init', 'done');
    updateToolbarState();
    setTimeout(() => { loadUserProfile(); checkInitStatus(); }, 1000);
  } catch (err: any) {
    messages.push({ role: 'assistant', content: '保存失败：' + (err?.message || String(err)) });
    renderMsgView();
  }
}

async function handleSkillTrigger(name: SkillName): Promise<void> {
  // init 特殊处理：渲染表单等待用户填写
  if (name === 'init') {
    try {
      const schema = await skillApi.getInitForm();
      messages.push({ role: 'user', content: '点击「初始化」' });
      messages.push({ role: 'assistant', content: '欢迎使用笺流！请填写以下问卷让我了解您：' });
      renderMsgView();
      // 在最后一条 assistant 消息后追加表单 DOM
      const lastMsg = document.querySelector('#chatMessages .chat-msg:last-child') as HTMLElement;
      if (lastMsg) {
        const formWrapper = document.createElement('div');
        formWrapper.innerHTML = renderForm(schema);
        lastMsg.appendChild(formWrapper);
        initTagsInput(formWrapper);
      }
      setSkillStatus('init', 'running');
      updateToolbarState();
    } catch (err: any) {
      messages.push({ role: 'assistant', content: '加载表单失败：' + (err?.message || String(err)) });
      renderMsgView();
    }
    return;
  }

  // morning/evening/report 走 triggerSkill 单次完成
  setSkillStatus(name, 'running');
  updateToolbarState();
  const labelMap = { morning: '晨间规划', evening: '晚间总结', report: '周报月报' } as const;
  messages.push({ role: 'user', content: `执行：${labelMap[name]}` });
  renderMsgView();

  try {
    let params: SkillParams = {};
    if (name === 'report') {
      const dateRange = window.prompt('请输入时间范围（如：这周、上周、上个月、最近7天）');
      if (!dateRange) {
        setSkillStatus(name, 'ready');
        updateToolbarState();
        return;
      }
      params = { date_range_text: dateRange };
    }

    const outcome = await triggerSkill(name, params);
    messages.push({ role: 'assistant', content: outcome.reply });
    renderMsgView();
    setSkillStatus(name, 'done');
    updateToolbarState();
  } catch (err: any) {
    messages.push({ role: 'assistant', content: '执行失败：' + (err?.message || String(err)) });
    renderMsgView();
    setSkillStatus(name, 'ready');
    updateToolbarState();
  }
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
  const convHistory = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
  const request: AiChatRequest = { session_id: sessionId, message: text, page: currentPage, history: convHistory };

  const showThinking = (store.get<any>('activitySettings') as any)?.show_thinking === true;
  (window as any).__showThinking = showThinking;

  try {
    streamingCleanup = await streamChat(request, {
      onToken: (token) => {
        const msg = messages[msgIdx];
        if (!msg) return;
        msg.content += token;
        // 节流：最多每 40ms 更新一次 DOM
        if (!msg._tokenTimer) {
          msg._tokenTimer = setTimeout(() => {
            msg._tokenTimer = undefined;
            const displayContent = msg.content;
            if (displayContent !== msg._displayContent) {
              msg._displayContent = displayContent;
              updateMessageElement(messages, msgIdx);
            }
          }, 40);
        }
      },
      onReasoning: (reasoning) => {
        const msg = messages[msgIdx];
        if (!msg) return;
        msg.reasoning = (msg.reasoning || '') + reasoning;
        if (!msg._reasoningTimer) {
          msg._reasoningTimer = setTimeout(() => {
            msg._reasoningTimer = undefined;
            updateMessageElement(messages, msgIdx);
          }, 100);
        }
      },
      onDone: (result) => {
        const doneMsg = messages[msgIdx];
        if (doneMsg) {
          if (doneMsg._tokenTimer) { clearTimeout(doneMsg._tokenTimer); doneMsg._tokenTimer = undefined; }
          if (doneMsg._reasoningTimer) { clearTimeout(doneMsg._reasoningTimer); doneMsg._reasoningTimer = undefined; }
        }
        messages[msgIdx].content = result.content;
        chatPanel.streaming = false;
        chatPanel.enableInput();
        renderMsgView();
        loadConversations();
        setTimeout(() => {
          loadUserProfile();
          checkInitStatus();
          const currentPage = store.get<string>('currentPage');
          if (currentPage) {
            router.navigate(currentPage);
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
