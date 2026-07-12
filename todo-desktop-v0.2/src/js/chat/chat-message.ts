import { parseFormSchema, renderForm } from './chat-form';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
}

export function renderMessages(messages: ChatMessage[]): string {
  return messages.map((m, idx) => renderSingleMessage(m, idx)).join('');
}

function renderSingleMessage(msg: ChatMessage, idx: number): string {
  const roleClass = `chat-msg--${msg.role}`;
  const hasForm = msg.content.includes('【FORM】') && !msg.content.includes('【FORM_DATA】');
  const hasFormData = msg.content.includes('【FORM_DATA】');

  let html = `<div class="chat-msg ${roleClass}" data-msg-index="${idx}">`;

  if (msg.role === 'assistant' && msg.reasoning) {
    const showThinking = (window as any).__showThinking === true;
    html += `
      <details class="chat-thinking"${showThinking ? ' open' : ''}>
        <summary>思考链</summary>
        <div class="chat-thinking-content">${escapeHtml(msg.reasoning || '')}</div>
      </details>`;
  }

  if (hasForm) {
    const textParts = msg.content.split(/【FORM】[\s\S]*?【\/FORM】/);
    html += textParts.map(p => p.trim()).filter(Boolean).map(p => `<div class="chat-msg-content">${renderMarkdown(p)}</div>`).join('');
    const schema = parseFormSchema(msg.content);
    if (schema) {
      html += renderForm(schema);
    } else {
      html += `<div class="cf-form-placeholder" data-form-idx="${idx}"></div>`;
    }
  } else if (hasFormData) {
    const textParts = msg.content.replace(/【FORM_DATA】[\s\S]*?【\/FORM_DATA】/g, '');
    html += `<div class="chat-msg-content">${renderMarkdown(textParts || '(表单已提交)')}</div>`;
    html += `<div class="cf-form-submitted">已提交</div>`;
  } else {
    html += `<div class="chat-msg-content">${renderMarkdown(msg.content)}</div>`;
  }

  html += '</div>';
  return html;
}

export function updateMessageElement(messages: ChatMessage[], idx: number, showThinking: boolean): void {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const msg = messages[idx];
  if (!msg) return;

  const msgEls = el.querySelectorAll('.chat-msg');
  if (idx < 0 || idx >= msgEls.length) return;

  const target = msgEls[idx] as HTMLElement;
  const hasForm = msg.content.includes('【FORM】') && !msg.content.includes('【FORM_DATA】');

  let html = '';
  if (msg.reasoning) {
    html += `
      <details class="chat-thinking"${showThinking ? ' open' : ''}>
        <summary>思考链</summary>
        <div class="chat-thinking-content">${escapeHtml(msg.reasoning || '')}</div>
      </details>`;
  }

  if (hasForm) {
    const textParts = msg.content.split(/【FORM】[\s\S]*?【\/FORM】/);
    html += textParts.map(p => p.trim()).filter(Boolean).map(p => `<div class="chat-msg-content">${renderMarkdown(p)}</div>`).join('');
    const schema = parseFormSchema(msg.content);
    if (schema) {
      html += renderForm(schema);
    }
  } else {
    html += `<div class="chat-msg-content">${renderMarkdown(msg.content)}</div>`;
  }

  target.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

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
