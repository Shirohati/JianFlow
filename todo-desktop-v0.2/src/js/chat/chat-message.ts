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
  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // 代码块
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过结束的 ```
      result.push(`<pre><code class="language-${lang}">${codeLines.join('\n')}</code></pre>`);
      continue;
    }
    // 表格（GFM：当前行有 |，且下一行是分隔行）
    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      result.push(renderTable(tableLines));
      continue;
    }
    // 分割线
    if (/^(---|\*\*\*)\s*$/.test(line)) {
      result.push('<hr>');
      i++;
      continue;
    }
    // 标题 # / ## / ###
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      result.push(`<h${level + 1}>${renderInline(hMatch[2])}</h${level + 1}>`);
      i++;
      continue;
    }
    // 引用块（escapeHtml 已将 > 转为 &gt;）
    if (line.startsWith('&gt; ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('&gt; ')) {
        quoteLines.push(lines[i].slice(5));
        i++;
      }
      result.push(`<blockquote>${renderInline(quoteLines.join('<br>'))}</blockquote>`);
      continue;
    }
    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      result.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^[-*]\s+/, ''))}</li>`);
        i++;
      }
      result.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    // 普通段落
    if (line.trim()) {
      result.push(`<p>${renderInline(line)}</p>`);
    } else {
      result.push('<br>');
    }
    i++;
  }
  return result.join('\n');
}

function renderTable(lines: string[]): string {
  const splitRow = (l: string): string[] => {
    let s = l.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map(c => c.trim());
  };
  const rows = lines.map(splitRow);
  // 找到分隔行（每个单元格都是 :-- / -- / :--: 等形式）并排除
  const isSeparator = (r: string[]): boolean => r.length > 0 && r.every(c => /^:?-+:?$/.test(c));
  const dataRows = rows.filter(r => !isSeparator(r));
  if (dataRows.length < 1) return lines.join('<br>');
  const header = dataRows[0];
  const body = dataRows.slice(1);
  let html = '<table><thead><tr>';
  header.forEach(h => { html += `<th>${renderInline(h)}</th>`; });
  html += '</tr></thead><tbody>';
  body.forEach(row => {
    html += '<tr>';
    row.forEach(cell => { html += `<td>${renderInline(cell)}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function renderInline(text: string): string {
  let t = text;
  // 行内代码（先处理，避免内部内容被其他规则误伤）
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 粗体
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // 链接 [文本](URL)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  return t;
}
