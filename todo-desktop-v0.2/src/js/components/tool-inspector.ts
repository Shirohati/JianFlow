export interface ToolExecutionEvent {
  tool: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  args: Record<string, any>;
  result?: string;
  started_at?: string;
  duration_ms?: number;
}

function esc(str: string): string {
  const m: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return str.replace(/[&<>"]/g, c => m[c] || c);
}

function fmtArgs(args: Record<string, any>): string {
  return Object.entries(args).map(([k, v]) =>
    `<span class="chat-tool-arg-key">${esc(k)}</span><span class="chat-tool-arg-value">${esc(typeof v === 'string' ? v : JSON.stringify(v))}</span>`
  ).join('');
}

export class ToolInspector {
  private container: HTMLElement;
  private executions: ToolExecutionEvent[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  addExecution(event: ToolExecutionEvent): void {
    this.executions.push({ ...event, status: 'pending' });
    this.render();
  }

  updateExecution(tool: string, updates: Partial<ToolExecutionEvent>): void {
    for (let i = this.executions.length - 1; i >= 0; i--) {
      if (this.executions[i].tool === tool && this.executions[i].status === 'pending') {
        this.executions[i] = { ...this.executions[i], ...updates };
        this.render();
        return;
      }
    }
  }

  clear(): void {
    this.executions = [];
    this.render();
  }

  private render(): void {
    const statusLabels: Record<string, string> = {
      pending: '待执行', running: '执行中', completed: '已完成', failed: '失败',
    };
    this.container.innerHTML = this.executions.map(ex => {
      const hasArgs = Object.keys(ex.args || {}).length > 0;
      const timeParts: string[] = [];
      if (ex.started_at) timeParts.push(ex.started_at);
      if (ex.duration_ms != null) timeParts.push(`${ex.duration_ms}ms`);
      const timeStr = timeParts.length > 0 ? `<span class="chat-tool-time">${timeParts.join(' ')}</span>` : '';
      return `<div class="chat-tool-execution chat-tool-execution--${ex.status}">
  <div class="chat-tool-execution-header">
    <span class="chat-tool-name">${esc(ex.tool)}</span>
    <span class="chat-tool-status chat-tool-status--${ex.status}">${statusLabels[ex.status] || ex.status}</span>
  </div>
  ${hasArgs ? `<details class="chat-tool-args"><summary>参数</summary><div class="chat-tool-args-body">${fmtArgs(ex.args)}</div></details>` : ''}
  ${ex.result ? `<div class="chat-tool-result">${esc(ex.result)}</div>` : ''}
  ${timeStr}
</div>`;
    }).join('');
    this.container.scrollTop = this.container.scrollHeight;
  }
}
