import { utils } from '../utils';

interface WorkflowNode {
  id: string;
  node_type: string;
  label: string;
  x: number;
  y: number;
  config: Record<string, any>;
}

interface WorkflowEdge {
  id: string;
  from_node: string;
  to_node: string;
}

interface CanvasCallbacks {
  onNodesChange: (nodes: WorkflowNode[]) => void;
  onEdgesChange: (edges: WorkflowEdge[]) => void;
  onSelectNode: (node: WorkflowNode | null) => void;
  onContextMenu: (node: WorkflowNode | null, e: MouseEvent) => void;
}

const NODE_W = 160;
const NODE_H = 60;

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) * 0.5;
  const cpx1 = x1 + Math.max(dx, 40);
  const cpx2 = x2 - Math.max(dx, 40);
  return `M${x1},${y1} C${cpx1},${y1} ${cpx2},${y2} ${x2},${y2}`;
}

export class WorkflowCanvas {
  private container: HTMLElement;
  private canvasEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private callbacks: CanvasCallbacks;
  private nodes: WorkflowNode[] = [];
  private edges: WorkflowEdge[] = [];
  private selectedNodeId: string | null = null;
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartOffX = 0;
  private panStartOffY = 0;
  private dragInfo: {
    nodeId: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null = null;

  constructor(container: HTMLElement, callbacks: CanvasCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.canvasEl = document.createElement('div');
    this.canvasEl.className = 'wf-canvas';
    container.appendChild(this.canvasEl);
    this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgEl.classList.add('wf-svg');
    this.canvasEl.appendChild(this.svgEl);
    this.bindEvents();
  }

  setData(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
    this.nodes = nodes;
    this.edges = edges;
    this.render();
  }

  addNode(node: WorkflowNode): void {
    this.nodes.push(node);
    this.render();
    this.callbacks.onNodesChange(this.nodes);
  }

  removeNode(id: string): void {
    this.nodes = this.nodes.filter(n => n.id !== id);
    this.edges = this.edges.filter(e => e.from_node !== id && e.to_node !== id);
    if (this.selectedNodeId === id) {
      this.selectedNodeId = null;
      this.callbacks.onSelectNode(null);
    }
    this.render();
    this.callbacks.onNodesChange(this.nodes);
    this.callbacks.onEdgesChange(this.edges);
  }

  updateNode(id: string, updates: Partial<WorkflowNode>): void {
    const node = this.nodes.find(n => n.id === id);
    if (node) {
      Object.assign(node, updates);
      this.render();
      this.callbacks.onNodesChange(this.nodes);
    }
  }

  getNodes(): WorkflowNode[] {
    return this.nodes;
  }

  getEdges(): WorkflowEdge[] {
    return this.edges;
  }

  getSelectedNode(): WorkflowNode | null {
    return this.nodes.find(n => n.id === this.selectedNodeId) ?? null;
  }

  private screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.canvasEl.getBoundingClientRect();
    return {
      x: (screenX - rect.left - this.offX) / this.scale,
      y: (screenY - rect.top - this.offY) / this.scale,
    };
  }

  private render(): void {
    this.renderConnections();
    this.renderNodes();
  }

  private renderNodes(): void {
    const existing = this.canvasEl.querySelectorAll('.wf-node');
    existing.forEach(el => el.remove());
    this.nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'wf-node';
      el.dataset.id = n.id;
      if (n.id === this.selectedNodeId) el.classList.add('wf-node--selected');
      el.style.left = n.x + 'px';
      el.style.top = n.y + 'px';
      el.innerHTML = `
        <div class="wf-node__header">
          <span class="wf-node__dot" style="background:${this.getNodeColor(n.node_type)}"></span>
          <span class="wf-node__label">${utils.escapeHtml(n.label)}</span>
        </div>
        <span class="wf-node__type">${this.getNodeTypeLabel(n.node_type)}</span>
        <div class="wf-node__port wf-node__port--in"></div>
        <div class="wf-node__port wf-node__port--out"></div>
      `;
      this.canvasEl.appendChild(el);
    });
  }

  private renderConnections(): void {
    let html = '';
    this.edges.forEach(edge => {
      const fromNode = this.nodes.find(n => n.id === edge.from_node);
      const toNode = this.nodes.find(n => n.id === edge.to_node);
      if (!fromNode || !toNode) return;
      const x1 = fromNode.x + NODE_W / 2;
      const y1 = fromNode.y + NODE_H;
      const x2 = toNode.x + NODE_W / 2;
      const y2 = toNode.y;
      const color = this.getNodeColor(fromNode.node_type);
      html += `<path class="wf-edge" d="${bezierPath(x1, y1, x2, y2)}" stroke="${color}" data-from="${edge.from_node}" data-to="${edge.to_node}" />`;
    });
    this.svgEl.innerHTML = html;
  }

  private getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      data_source: '#5b7fff',
      ai_analysis: '#9b7fd4',
      tool: '#e0a83c',
      output: '#4caf84',
    };
    return colors[type] || '#8e8e8e';
  }

  private getNodeTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      data_source: '数据源',
      ai_analysis: 'AI分析',
      tool: '工具',
      output: '输出',
    };
    return labels[type] || type;
  }

  private applyTransform(): void {
    this.canvasEl.style.transform = `translate(${this.offX}px, ${this.offY}px) scale(${this.scale})`;
    this.canvasEl.style.transformOrigin = '0 0';
  }

  private bindEvents(): void {
    this.container.addEventListener('wheel', (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(0.3, Math.min(3, this.scale + delta));
        const rect = this.container.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        this.offX = mx - (mx - this.offX) * (newScale / this.scale);
        this.offY = my - (my - this.offY) * (newScale / this.scale);
        this.scale = newScale;
        this.applyTransform();
      }
    }, { passive: false });

    this.canvasEl.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        this.isPanning = true;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.panStartOffX = this.offX;
        this.panStartOffY = this.offY;
        document.addEventListener('pointermove', this.onPanMove);
        document.addEventListener('pointerup', this.onPanUp);
        return;
      }

      const nodeEl = (e.target as HTMLElement).closest('.wf-node') as HTMLElement | null;
      if (nodeEl) {
        const nodeId = nodeEl.dataset.id!;
        if (e.button === 2) return;
        this.selectedNodeId = nodeId;
        this.render();
        const node = this.nodes.find(n => n.id === nodeId) ?? null;
        this.callbacks.onSelectNode(node);

        const pos = this.screenToCanvas(e.clientX, e.clientY);
        this.dragInfo = {
          nodeId,
          startX: e.clientX,
          startY: e.clientY,
          offsetX: pos.x - node!.x,
          offsetY: pos.y - node!.y,
          origX: node!.x,
          origY: node!.y,
          moved: false,
        };
        document.addEventListener('pointermove', this.onDragMove);
        document.addEventListener('pointerup', this.onDragUp);
        return;
      }

      this.isPanning = false;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panStartOffX = this.offX;
      this.panStartOffY = this.offY;
      const panHandler = (moveE: PointerEvent) => {
        const dx = moveE.clientX - this.panStartX;
        const dy = moveE.clientY - this.panStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this.isPanning = true;
          document.removeEventListener('pointermove', panHandler);
          document.removeEventListener('pointerup', panUpHandler);
          this.offX = this.panStartOffX + (moveE.clientX - this.panStartX);
          this.offY = this.panStartOffY + (moveE.clientY - this.panStartY);
          this.applyTransform();
          document.addEventListener('pointermove', this.onPanMove);
          document.addEventListener('pointerup', this.onPanUp);
        }
      };
      const panUpHandler = () => {
        document.removeEventListener('pointermove', panHandler);
        document.removeEventListener('pointerup', panUpHandler);
        if (!this.isPanning) {
          this.selectedNodeId = null;
          this.callbacks.onSelectNode(null);
          this.render();
        }
      };
      document.addEventListener('pointermove', panHandler);
      document.addEventListener('pointerup', panUpHandler);
    });

    this.canvasEl.addEventListener('click', (e: MouseEvent) => {
      const connPath = (e.target as HTMLElement).closest('.wf-edge') as HTMLElement | null;
      if (connPath) {
        const fromId = connPath.dataset.from!;
        const toId = connPath.dataset.to!;
        this.edges = this.edges.filter(edge => !(edge.from_node === fromId && edge.to_node === toId));
        this.render();
        this.callbacks.onEdgesChange(this.edges);
        return;
      }
      const nodeEl = (e.target as HTMLElement).closest('.wf-node') as HTMLElement | null;
      if (!nodeEl && !this.isPanning) {
        this.selectedNodeId = null;
        this.callbacks.onSelectNode(null);
        this.render();
      }
    });

    this.canvasEl.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      const nodeEl = (e.target as HTMLElement).closest('.wf-node') as HTMLElement | null;
      if (nodeEl) {
        const nodeId = nodeEl.dataset.id!;
        this.selectedNodeId = nodeId;
        this.render();
        this.callbacks.onContextMenu(this.nodes.find(n => n.id === nodeId) ?? null, e);
      } else {
        this.callbacks.onContextMenu(null, e);
      }
    });
  }

  private onDragMove = (e: PointerEvent): void => {
    if (!this.dragInfo) return;
    const d = this.dragInfo;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      d.moved = true;
    }
    if (d.moved) {
      const pos = this.screenToCanvas(e.clientX, e.clientY);
      const nx = Math.max(0, pos.x - d.offsetX);
      const ny = Math.max(0, pos.y - d.offsetY);
      const nodeEl = this.canvasEl.querySelector(`.wf-node[data-id="${d.nodeId}"]`) as HTMLElement;
      if (nodeEl) {
        nodeEl.style.left = nx + 'px';
        nodeEl.style.top = ny + 'px';
      }
    }
  };

  private onDragUp = (e: PointerEvent): void => {
    document.removeEventListener('pointermove', this.onDragMove);
    document.removeEventListener('pointerup', this.onDragUp);
    if (!this.dragInfo) return;
    const d = this.dragInfo;
    if (d.moved) {
      const pos = this.screenToCanvas(e.clientX, e.clientY);
      const nx = utils.snapToGrid(Math.max(0, pos.x - d.offsetX), 20);
      const ny = utils.snapToGrid(Math.max(0, pos.y - d.offsetY), 20);
      const node = this.nodes.find(n => n.id === d.nodeId);
      if (node) {
        node.x = nx;
        node.y = ny;
      }
      this.render();
      this.callbacks.onNodesChange(this.nodes);
    }
    this.dragInfo = null;
  };

  private onPanMove = (e: PointerEvent): void => {
    if (!this.isPanning) return;
    this.offX = this.panStartOffX + (e.clientX - this.panStartX);
    this.offY = this.panStartOffY + (e.clientY - this.panStartY);
    this.applyTransform();
  };

  private onPanUp = (): void => {
    this.isPanning = false;
    document.removeEventListener('pointermove', this.onPanMove);
    document.removeEventListener('pointerup', this.onPanUp);
  };

  destroy(): void {
    document.removeEventListener('pointermove', this.onDragMove);
    document.removeEventListener('pointerup', this.onDragUp);
    document.removeEventListener('pointermove', this.onPanMove);
    document.removeEventListener('pointerup', this.onPanUp);
    this.container.innerHTML = '';
  }
}