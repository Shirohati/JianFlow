import { workflowApi } from '../api';
import { utils } from '../utils';
import { initIcons } from '../icons';
import { toast } from '../components/toast';
import { WorkflowCanvas } from '../components/workflow-canvas';
import type { WorkflowNode, WorkflowTemplate } from '../api';

function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}

let canvas: WorkflowCanvas | null = null;
let currentTemplateId: string | null = null;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
}

function createNode(type: WorkflowNode['node_type'], x: number, y: number): WorkflowNode {
  const labels: Record<string, string> = {
    data_source: '数据源',
    ai_analysis: 'AI分析',
    tool: '工具',
    output: '输出',
  };
  return {
    id: generateId('node'),
    node_type: type,
    label: labels[type] || type,
    x,
    y,
    config: {},
  };
}

function renderPropertiesPanel(container: HTMLElement): void {
  const node = canvas?.getSelectedNode();
  if (!node) {
    container.innerHTML = '<div class="wf-props__empty">选择一个节点查看属性</div>';
    return;
  }

  let html = `<div class="wf-props__header">节点属性</div>`;
  html += `<div class="wf-props__field">
    <label>名称</label>
    <input class="input input--sm wf-props__label" value="${utils.escapeHtml(node.label)}" />
  </div>`;
  html += `<div class="wf-props__field">
    <label>类型</label>
    <span class="wf-props__type-badge" style="background:${getNodeColor(node.node_type)}">${getNodeTypeLabel(node.node_type)}</span>
  </div>`;

  if (node.node_type === 'data_source') {
    const source = node.config.source || 'tasks';
    html += `<div class="wf-props__field">
      <label>数据源</label>
      <select class="input input--sm wf-props__source">
        <option value="tasks" ${source === 'tasks' ? 'selected' : ''}>待办事项</option>
        <option value="goals" ${source === 'goals' ? 'selected' : ''}>目标</option>
        <option value="activity" ${source === 'activity' ? 'selected' : ''}>活动记录</option>
        <option value="time" ${source === 'time' ? 'selected' : ''}>时间记录</option>
      </select>
    </div>`;
  } else if (node.node_type === 'ai_analysis') {
    const prompt = node.config.prompt || '';
    html += `<div class="wf-props__field">
      <label>分析提示</label>
      <textarea class="input input--sm wf-props__prompt" rows="3">${utils.escapeHtml(prompt)}</textarea>
    </div>`;
  } else if (node.node_type === 'tool') {
    const toolName = node.config.tool_name || '';
    html += `<div class="wf-props__field">
      <label>工具名称</label>
      <input class="input input--sm wf-props__tool-name" value="${utils.escapeHtml(toolName)}" placeholder="create_note, complete_task..." />
    </div>`;
  } else if (node.node_type === 'output') {
    const format = node.config.format || 'text';
    html += `<div class="wf-props__field">
      <label>输出格式</label>
      <select class="input input--sm wf-props__format">
        <option value="text" ${format === 'text' ? 'selected' : ''}>文本</option>
        <option value="html" ${format === 'html' ? 'selected' : ''}>HTML</option>
        <option value="json" ${format === 'json' ? 'selected' : ''}>JSON</option>
      </select>
    </div>`;
  }

  html += `<div style="margin-top:var(--space-3);display:flex;gap:var(--space-2);flex-wrap:wrap">
    <button class="btn btn--ghost btn--sm wf-props__delete-node">${icon('trash-2', 'size="14"')} 删除节点</button>
    ${canvas?.getNodes().length ? `<button class="btn btn--ghost btn--sm wf-props__connect">${icon('link', 'size="14"')} 连接</button>` : ''}
  </div>`;

  container.innerHTML = html;
  initIcons();

  const labelInput = container.querySelector('.wf-props__label') as HTMLInputElement;
  if (labelInput) {
    labelInput.addEventListener('change', () => {
      const val = labelInput.value.trim();
      if (val && canvas) {
        canvas.updateNode(node.id, { label: val });
      }
    });
  }

  const sourceSelect = container.querySelector('.wf-props__source') as HTMLSelectElement;
  if (sourceSelect) {
    sourceSelect.addEventListener('change', () => {
      if (canvas) {
        canvas.updateNode(node.id, { config: { ...node.config, source: sourceSelect.value } });
      }
    });
  }

  const promptTextarea = container.querySelector('.wf-props__prompt') as HTMLTextAreaElement;
  if (promptTextarea) {
    promptTextarea.addEventListener('change', () => {
      if (canvas) {
        canvas.updateNode(node.id, { config: { ...node.config, prompt: promptTextarea.value } });
      }
    });
  }

  const toolNameInput = container.querySelector('.wf-props__tool-name') as HTMLInputElement;
  if (toolNameInput) {
    toolNameInput.addEventListener('change', () => {
      if (canvas) {
        canvas.updateNode(node.id, { config: { ...node.config, tool_name: toolNameInput.value } });
      }
    });
  }

  const formatSelect = container.querySelector('.wf-props__format') as HTMLSelectElement;
  if (formatSelect) {
    formatSelect.addEventListener('change', () => {
      if (canvas) {
        canvas.updateNode(node.id, { config: { ...node.config, format: formatSelect.value } });
      }
    });
  }

  container.querySelector('.wf-props__delete-node')?.addEventListener('click', () => {
    if (canvas) {
      canvas.removeNode(node.id);
      renderPropertiesPanel(container);
    }
  });

  container.querySelector('.wf-props__connect')?.addEventListener('click', () => {
    const nodes = canvas?.getNodes() ?? [];
    const selected = canvas?.getSelectedNode();
    if (!selected) return;
    const others = nodes.filter(n => n.id !== selected.id);
    if (others.length === 0) { toast.info('没有其他节点可连接'); return; }
    showConnectMenu(selected, others);
  });
}

function showConnectMenu(fromNode: WorkflowNode, targets: WorkflowNode[]): void {
  const existing = document.querySelector('.wf-connect-menu');
  if (existing) existing.remove();
  const menu = document.createElement('div');
  menu.className = 'wf-connect-menu sort-picker';
  menu.style.position = 'fixed';
  menu.style.left = '50%';
  menu.style.top = '50%';
  menu.style.transform = 'translate(-50%, -50%)';
  menu.style.zIndex = '1000';
  let html = `<div class="sort-picker__label">连接 ${utils.escapeHtml(fromNode.label)} 到:</div>`;
  targets.forEach(n => {
    const alreadyConnected = canvas?.getEdges().some(e => e.from_node === fromNode.id && e.to_node === n.id);
    if (!alreadyConnected) {
      html += `<button class="sort-picker__item" data-target="${n.id}">${icon('link')} ${utils.escapeHtml(n.label)}</button>`;
    }
  });
  if (!targets.some(n => !canvas?.getEdges().some(e => e.from_node === fromNode.id && e.to_node === n.id))) {
    html += `<div style="padding:var(--space-2);font-size:var(--text-xs);color:var(--text-lighter)">所有节点已连接</div>`;
  }
  html += `<div style="padding:var(--space-2)"><button class="btn btn--ghost btn--sm wf-connect-menu__cancel">取消</button></div>`;
  menu.innerHTML = html;
  document.body.appendChild(menu);
  initIcons();

  const close = () => menu.remove();
  menu.querySelector('.wf-connect-menu__cancel')?.addEventListener('click', close);
  menu.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.sort-picker__item') as HTMLElement | null;
    if (!btn) return;
    const targetId = btn.dataset.target;
    if (targetId && canvas) {
      const edges = canvas.getEdges();
      edges.push({ id: generateId('edge'), from_node: fromNode.id, to_node: targetId });
      canvas.setData(canvas.getNodes(), edges);
      toast.success('连接已创建');
    }
    close();
  });
  setTimeout(() => { document.addEventListener('click', function h(evt) { if (!menu.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
}

function getNodeColor(type: string): string {
  const colors: Record<string, string> = { data_source: '#5b7fff', ai_analysis: '#9b7fd4', tool: '#e0a83c', output: '#4caf84' };
  return colors[type] || '#8e8e8e';
}

function getNodeTypeLabel(type: string): string {
  const labels: Record<string, string> = { data_source: '数据源', ai_analysis: 'AI分析', tool: '工具', output: '输出' };
  return labels[type] || type;
}

export const workflowPage = {
  async init(): Promise<void> {
    const inner = document.querySelector('#page-workflow .page__inner');
    if (!inner) return;
    workflowPage.renderSkeleton(inner);
    workflowPage.bindEvents();
  },

  renderSkeleton(container: Element): void {
    container.innerHTML = `
      <div class="wf-toolbar">
        <div class="wf-toolbar__group">
          <span class="wf-toolbar__label">节点:</span>
          <button class="btn btn--sm wf-add-node" data-type="data_source">${icon('database')} 数据</button>
          <button class="btn btn--sm wf-add-node" data-type="ai_analysis">${icon('bot')} AI</button>
          <button class="btn btn--sm wf-add-node" data-type="tool">${icon('wrench')} 工具</button>
          <button class="btn btn--sm wf-add-node" data-type="output">${icon('output')} 输出</button>
        </div>
        <div style="flex:1"></div>
        <div class="wf-toolbar__group">
          <button class="btn btn--ghost btn--sm wf-execute-btn">${icon('play')} 执行</button>
          <button class="btn btn--ghost btn--sm wf-save-btn">${icon('save')} 保存</button>
          <button class="btn btn--ghost btn--sm wf-load-btn">${icon('folder-open')} 加载</button>
          <button class="btn btn--ghost btn--sm wf-clear-btn">${icon('trash-2')} 清空</button>
        </div>
      </div>
      <div class="wf-layout">
        <div class="wf-canvas-wrap" id="wfCanvasWrap"></div>
        <div class="wf-props" id="wfProps"></div>
      </div>
    `;
    const wrap = container.querySelector('#wfCanvasWrap') as HTMLElement;
    if (wrap) {
      canvas = new WorkflowCanvas(wrap, {
        onNodesChange: () => renderPropertiesPanel(container.querySelector('#wfProps') as HTMLElement),
        onEdgesChange: () => {},
        onSelectNode: () => renderPropertiesPanel(container.querySelector('#wfProps') as HTMLElement),
        onContextMenu: (_node, _e) => {},
      });
    }
    initIcons();
  },

  bindEvents(): void {
    const container = document.querySelector('#page-workflow .page__inner');

    container?.addEventListener('click', async (e) => {
      const addBtn = (e.target as HTMLElement).closest('.wf-add-node') as HTMLElement | null;
      if (addBtn) {
        const type = addBtn.dataset.type as WorkflowNode['node_type'];
        if (canvas) {
          const nodes = canvas.getNodes();
          const x = utils.snapToGrid(40 + (nodes.length % 4) * 200, 20);
          const y = utils.snapToGrid(40 + Math.floor(nodes.length / 4) * 120, 20);
          const node = createNode(type, x, y);
          canvas.addNode(node);
          toast.success(`已添加${getNodeTypeLabel(type)}节点`);
        }
        return;
      }

      if ((e.target as HTMLElement).closest('.wf-execute-btn')) {
        await workflowPage.execute();
        return;
      }

      if ((e.target as HTMLElement).closest('.wf-save-btn')) {
        workflowPage.showSaveDialog();
        return;
      }

      if ((e.target as HTMLElement).closest('.wf-load-btn')) {
        await workflowPage.showLoadDialog();
        return;
      }

      if ((e.target as HTMLElement).closest('.wf-clear-btn')) {
        if (canvas && confirm('清空画布将删除所有节点和连线，确认？')) {
          canvas.setData([], []);
          currentTemplateId = null;
          renderPropertiesPanel(document.querySelector('#wfProps') as HTMLElement);
          toast.info('画布已清空');
        }
        return;
      }
    });
  },

  async execute(): Promise<void> {
    if (!canvas) return;
    const nodes = canvas.getNodes();
    const edges = canvas.getEdges();
    if (nodes.length === 0) {
      toast.info('画布为空，请添加节点');
      return;
    }
    try {
      const result = await workflowApi.execute(nodes, edges);
      toast.show('执行结果:\n' + result, 'info', 5000);
    } catch (err: any) {
      toast.error('执行失败: ' + (err?.message || String(err)));
    }
  },

  showSaveDialog(): void {
    const existing = document.querySelector('.wf-save-dialog');
    if (existing) existing.remove();
    const dialog = document.createElement('div');
    dialog.className = 'wf-save-dialog sort-picker';
    dialog.style.position = 'fixed';
    dialog.style.left = '50%';
    dialog.style.top = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.style.zIndex = '1000';
    dialog.innerHTML = `
      <div class="sort-picker__label">保存工作流模板</div>
      <div style="padding:var(--space-2);display:flex;flex-direction:column;gap:var(--space-2)">
        <input class="input input--sm wf-save-name" placeholder="模板名称" value="" />
        <input class="input input--sm wf-save-desc" placeholder="描述（可选）" value="" />
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn--primary btn--sm wf-save-confirm">保存</button>
          <button class="btn btn--ghost btn--sm wf-save-cancel">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    const nameInput = dialog.querySelector('.wf-save-name') as HTMLInputElement;
    nameInput.focus();
    const close = () => dialog.remove();
    dialog.querySelector('.wf-save-cancel')?.addEventListener('click', close);
    dialog.querySelector('.wf-save-confirm')?.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { toast.info('请输入模板名称'); return; }
      const desc = (dialog.querySelector('.wf-save-desc') as HTMLInputElement).value.trim();
      if (!canvas) return;
      const template: WorkflowTemplate = {
        id: currentTemplateId || generateId('tmpl'),
        name,
        description: desc,
        nodes: canvas.getNodes(),
        edges: canvas.getEdges(),
      };
      try {
        await workflowApi.saveTemplate(template);
        currentTemplateId = template.id;
        toast.success('模板已保存');
        close();
      } catch (err: any) {
        toast.error('保存失败: ' + (err?.message || String(err)));
      }
    });
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!dialog.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  async showLoadDialog(): Promise<void> {
    const existing = document.querySelector('.wf-load-dialog');
    if (existing) existing.remove();
    let templates: WorkflowTemplate[];
    try {
      templates = await workflowApi.listTemplates();
    } catch {
      toast.error('加载模板列表失败');
      return;
    }
    const dialog = document.createElement('div');
    dialog.className = 'wf-load-dialog sort-picker';
    dialog.style.position = 'fixed';
    dialog.style.left = '50%';
    dialog.style.top = '50%';
    dialog.style.transform = 'translate(-50%, -50%)';
    dialog.style.zIndex = '1000';
    dialog.style.minWidth = '320px';
    let html = '<div class="sort-picker__label">加载工作流模板</div>';
    if (templates.length === 0) {
      html += '<div style="padding:var(--space-3);font-size:var(--text-xs);color:var(--text-lighter)">暂无保存的模板</div>';
    } else {
      html += templates.map(t => `
        <div class="wf-load-item" data-id="${t.id}">
          <div class="wf-load-item__info">
            <div class="wf-load-item__name">${utils.escapeHtml(t.name)}</div>
            ${t.description ? `<div class="wf-load-item__desc">${utils.escapeHtml(t.description)}</div>` : ''}
            <div class="wf-load-item__meta">${t.nodes.length} 个节点, ${t.edges.length} 条连线</div>
          </div>
          <div class="wf-load-item__actions">
            <button class="btn btn--primary btn--xs wf-load-item__apply" data-id="${t.id}">应用</button>
            <button class="btn btn--ghost btn--xs wf-load-item__delete" data-id="${t.id}" style="color:var(--color-danger)">删除</button>
          </div>
        </div>
      `).join('');
    }
    html += '<div style="padding:var(--space-2)"><button class="btn btn--ghost btn--sm wf-load-cancel" style="width:100%">关闭</button></div>';
    dialog.innerHTML = html;
    document.body.appendChild(dialog);
    initIcons();
    const close = () => dialog.remove();
    dialog.querySelector('.wf-load-cancel')?.addEventListener('click', close);
    dialog.addEventListener('click', async (e) => {
      const applyBtn = (e.target as HTMLElement).closest('.wf-load-item__apply') as HTMLElement | null;
      if (applyBtn) {
        const id = applyBtn.dataset.id!;
        const template = templates.find(t => t.id === id);
        if (template && canvas) {
          canvas.setData(template.nodes, template.edges);
          currentTemplateId = template.id;
          renderPropertiesPanel(document.querySelector('#wfProps') as HTMLElement);
          toast.success(`已加载 "${template.name}"`);
          close();
        }
        return;
      }
      const deleteBtn = (e.target as HTMLElement).closest('.wf-load-item__delete') as HTMLElement | null;
      if (deleteBtn) {
        const id = deleteBtn.dataset.id!;
        if (!confirm('确认删除此模板？')) return;
        try {
          await workflowApi.deleteTemplate(id);
          toast.info('模板已删除');
          close();
          await workflowPage.showLoadDialog();
        } catch (err: any) {
          toast.error('删除失败: ' + (err?.message || String(err)));
        }
        return;
      }
    });
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!dialog.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },
};