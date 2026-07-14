export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  _displayContent?: string;
  _tokenTimer?: ReturnType<typeof setTimeout>;
  _reasoningTimer?: ReturnType<typeof setTimeout>;
}

export function renderMessages(messages: ChatMessage[]): string {
  return messages.map((m, idx) => renderSingleMessage(m, idx)).join('');
}

function renderSingleMessage(msg: ChatMessage, idx: number): string {
  const roleClass = `chat-msg--${msg.role}`;
  const displayContent = (msg._displayContent ?? msg.content);

  let html = `<div class="chat-msg ${roleClass}" data-msg-index="${idx}">`;

  if (msg.role === 'assistant' && msg.reasoning) {
    html += `
      <details class="chat-thinking">
        <summary class="chat-thinking-summary">思考链</summary>
        <div class="chat-thinking-content">${escapeHtml(msg.reasoning || '')}</div>
      </details>`;
  }

  html += `<div class="chat-msg-content">${renderMarkdown(displayContent)}</div>`;

  html += '</div>';
  return html;
}

// 使用轻量级更新：只更新消息气泡中的内容文本，不重建整个 DOM
export function updateMessageElement(messages: ChatMessage[], idx: number): void {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const msg = messages[idx];
  if (!msg) return;

  const msgEls = el.querySelectorAll('.chat-msg');
  if (idx < 0 || idx >= msgEls.length) return;

  const target = msgEls[idx] as HTMLElement;

  // 更新思考链
  if (msg.reasoning) {
    let details = target.querySelector('.chat-thinking') as HTMLDetailsElement;
    if (!details) {
      details = document.createElement('details');
      details.className = 'chat-thinking';
      const summary = document.createElement('summary');
      summary.className = 'chat-thinking-summary';
      summary.textContent = '思考链';
      details.appendChild(summary);
      const content = document.createElement('div');
      content.className = 'chat-thinking-content';
      details.appendChild(content);
      target.insertBefore(details, target.firstChild);
    }
    const contentDiv = details.querySelector('.chat-thinking-content');
    if (contentDiv) contentDiv.textContent = msg.reasoning;
  }

  // 更新消息内容：只替换 chat-msg-content 的 innerHTML
  let contentEl = target.querySelector('.chat-msg-content');

  if (contentEl) {
    contentEl.innerHTML = renderMarkdown(msg.content);
  } else {
    // 还没有内容元素，首次渲染
    const div = document.createElement('div');
    div.className = 'chat-msg-content';
    div.innerHTML = renderMarkdown(msg.content);
    target.appendChild(div);
  }

  // 只在用户靠近底部时自动滚动，避免强制布局
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
    el.scrollTop = el.scrollHeight;
  }
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
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}
