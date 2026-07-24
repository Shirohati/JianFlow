import { store } from '../store';
import { taskApi, categoryApi, connectionApi } from '../api';
import { utils } from '../utils';
import { initIcons } from '../icons';
import { history } from '../history';
import { toast } from '../components/toast';
import type { TaskItem, Category, Connection } from '../api';

function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}

const GRID = 20;
const NW = 210;
const DRAG_TH = 3;

interface DragInfo {
  noteId: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  origGX: number;
  origGY: number;
  moved: boolean;
  isMultiDrag: boolean;
  origPositions: Map<string, { x: number; y: number }>;
  isGroupNode: boolean;
  groupId: string | null;
  /** Feature: dragging a subtask out to create a new note */
  isSubtaskDrag: boolean;
  subtaskData: { title: string; content: string; parentId: string } | null;
}

interface ConnDraw {
  fromId: string;
  startX: number;
  startY: number;
}

interface ResizeInfo {
  noteId: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  noteEl: HTMLElement;
  scrollEl: HTMLElement | null;
  rafId: number;
  pendingW: number;
  pendingH: number;
}

let drag: DragInfo | null = null;
let resizeInfo: ResizeInfo | null = null;
let openIds = new Set<string>();
let selectedIds = new Set<string>();
let collapsedGroups = new Set<string>();
let boardZCounter = 10;
let canvasScale = 1;
let canvasOffX = 0;
let canvasOffY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartOffX = 0;
let panStartOffY = 0;
let dyeTimer: number | null = null;
let dyeTarget: { type: 'category' | 'type'; value: string } | null = null;
let currentBoardTab: string = '';
let groupNames = new Map<string, string>();
let _rendering = false;
let _renderPending = false;
let wasDragged = false;

function applyCanvasTransform(): void {
  const canvas = document.getElementById('bCanvas');
  if (canvas) {
    canvas.style.transform = `translate(${canvasOffX}px, ${canvasOffY}px) scale(${canvasScale})`;
    canvas.style.transformOrigin = '0 0';
  }
}
let dockPanel: string | null = null;
let connDraw: ConnDraw | null = null;
let selectedConn: string | null = null;

interface BoxSelect {
  startX: number;
  startY: number;
  el: HTMLDivElement;
}
let boxSelect: BoxSelect | null = null;

function startDyeTimer(type: 'category' | 'type', value: string, cb: () => void) {
  clearDyeTimer();
  dyeTarget = { type, value };
  dyeTimer = window.setTimeout(() => { cb(); clearDyeTimer(); }, 800);
}
function clearDyeTimer() {
  if (dyeTimer !== null) { clearTimeout(dyeTimer); dyeTimer = null; }
  dyeTarget = null;
}

function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1) * 0.5;
  const cpx1 = x1 + Math.max(dx, 40);
  const cpx2 = x2 - Math.max(dx, 40);
  return `M${x1},${y1} C${cpx1},${y1} ${cpx2},${y2} ${x2},${y2}`;
}

function screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
  const wrap = document.querySelector('.board-canvas-wrap') as HTMLElement;
  if (!wrap) return { x: screenX, y: screenY };
  const wr = wrap.getBoundingClientRect();
  return {
    x: (screenX - wr.left - canvasOffX) / canvasScale,
    y: (screenY - wr.top - canvasOffY) / canvasScale,
  };
}

/** Adjust open note positions to avoid viewport overflow */
function adjustOpenPositions(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  document.querySelectorAll('.note--open').forEach(el => {
    const noteEl = el as HTMLElement;
    const rect = noteEl.getBoundingClientRect();
    // If overflowing right, shift left
    if (rect.right > vw) {
      const overflow = rect.right - vw;
      noteEl.style.left = (parseFloat(noteEl.style.left) - overflow / canvasScale) + 'px';
    }
    // If overflowing bottom, shift up
    if (rect.bottom > vh) {
      const overflow = rect.bottom - vh;
      noteEl.style.top = (parseFloat(noteEl.style.top) - overflow / canvasScale) + 'px';
    }
  });
}

export const boardPage = {
  async init(): Promise<void> {
    const inner = document.querySelector('#page-board .page__inner');
    if (!inner) return;
    const cats = await categoryApi.list();
    store.set('categories', cats);
    const tasks = await taskApi.list();
    store.set('allTasks', tasks);
    boardPage.renderSkeleton(inner);
    boardPage.bindEvents();
    await boardPage.render();
    history.subscribe(() => boardPage.render());
  },

  renderSkeleton(c: Element): void {
    c.innerHTML = `
      <div class="board-tabs" id="boardTabs"></div>
      <div class="board-toolbar">
        <button class="btn btn--ghost btn--sm" id="bUndo" disabled>${icon('undo-2')} 撤销</button>
        <button class="btn btn--ghost btn--sm" id="bRedo" disabled>${icon('redo-2')} 重做</button>
        <div style="flex:1"></div>
        <button class="btn btn--ghost btn--sm" id="bTrash" title="回收站">${icon('trash-2')}</button>
        <button class="btn btn--ghost btn--sm" id="bShelf" title="收纳盒">${icon('archive')}</button>
        <button class="btn btn--ghost btn--sm" id="bTrophy" title="陈列柜">${icon('trophy')}</button>
        <div style="width:1px;height:20px;background:var(--border);margin:0 4px"></div>
        <button class="btn btn--sm" id="bArrange">${icon('grid-3x3')} 整理</button>
        <button class="btn btn--ghost btn--sm" id="bGroup" title="合并选中便签">${icon('layers')} 合并</button>
        <button class="btn btn--primary btn--sm" id="bAdd">${icon('plus')} 新便签</button>
      </div>
      <div class="board-canvas-wrap">
        <div class="dye-zone dye-zone--category" id="dyeCat"></div>
        <div class="dye-zone dye-zone--type" id="dyeType">
          <div class="dye-item" data-dye-type="note" style="--dye-color:var(--cat-default)">${icon('sticky-note')} 便签</div>
          <div class="dye-item" data-dye-type="plan" style="--dye-color:var(--color-primary)">${icon('target')} 计划</div>
        </div>
        <div class="board-canvas" id="bCanvas">
          <svg class="board-connections" id="connSvg"></svg>
        </div>
        <div class="board-dock" id="bDock">
          <div class="dock-item dock-item--trash" data-dock="trashed">${icon('trash-2')}<span>回收站</span></div>
          <div class="dock-item dock-item--shelf" data-dock="shelved">${icon('archive')}<span>收纳盒</span></div>
          <div class="dock-item dock-item--trophy" data-dock="completed">${icon('trophy')}<span>陈列柜</span></div>
        </div>
      </div>`;
  },

  async render(): Promise<void> {
    if (_rendering) { _renderPending = true; return; }
    _rendering = true;
    try {
    const tasks = await taskApi.list({ status: 'active' });
    store.set('allTasks', tasks);
    const notes = tasks.filter(t => t.grid_x !== null && t.grid_y !== null && t.sub_type !== 'task');
    store.set('boardNotes', notes);
    const conns = await connectionApi.list();
    store.set('connections', conns);
    const cats = store.get<Category[]>('categories') ?? [];
    boardPage.renderDye(cats);
    boardPage.renderBoardTabs(notes);
    boardPage.renderNotes(notes, cats, tasks);
    requestAnimationFrame(() => {
      boardPage.renderConnections(notes, cats, conns);
    });
    boardPage.renderEmpty(notes);
    boardPage.updateHistBtns();
    boardPage.bindTimeSlotInputs();
    boardPage.bindTooltips();
    applyCanvasTransform();
    initIcons();
    adjustOpenPositions();
    } finally {
      _rendering = false;
      if (_renderPending) {
        _renderPending = false;
        boardPage.render();
      }
    }
  },

  renderDye(cats: Category[]): void {
    const z = document.getElementById('dyeCat');
    if (!z) return;
    z.innerHTML = cats.map(c =>
      `<div class="dye-item" data-dye-category="${c.id}" style="--dye-color:${c.color}"><span class="dye-color-dot" style="background:${c.color}"></span>${c.name}</div>`
    ).join('');
  },

  renderBoardTabs(notes: TaskItem[]): void {
    const el = document.getElementById('boardTabs');
    if (!el) return;
    const tabs = new Set<string>();
    notes.forEach(n => { if (n.board_tab) tabs.add(n.board_tab); });
    let html = `<button class="board-tabs__tab ${currentBoardTab === '' ? 'board-tabs__tab--active' : ''}" data-tab="">全部</button>`;
    tabs.forEach(tab => {
      html += `<button class="board-tabs__tab ${currentBoardTab === tab ? 'board-tabs__tab--active' : ''}" data-tab="${utils.escapeHtml(tab)}" data-tab-name="${utils.escapeHtml(tab)}">${utils.escapeHtml(tab)}</button>`;
    });
    html += `<button class="board-tabs__add" id="boardTabAdd" title="添加分区">${icon('plus', 'size="14"')}</button>`;
    el.innerHTML = html;
    initIcons();
  },

  renderNotes(notes: TaskItem[], cats: Category[], allTasks: TaskItem[]): void {
    const canvas = document.getElementById('bCanvas');
    if (!canvas) return;

    // Filter notes by current board tab
    const filtered = notes.filter(n => (n.board_tab ?? '') === currentBoardTab);

    // Group notes by group_id
    const grouped = new Map<string, TaskItem[]>();
    for (const n of filtered) {
      if (n.group_id) {
        if (!grouped.has(n.group_id)) grouped.set(n.group_id, []);
        grouped.get(n.group_id)!.push(n);
      }
    }

    // Collect IDs of notes hidden by collapsed groups
    const hiddenIds = new Set<string>();
    for (const [gid, gNotes] of grouped) {
      if (collapsedGroups.has(gid)) {
        gNotes.forEach(n => hiddenIds.add(n.id));
      }
    }

    let html = '';

    // Render group overlays first (behind notes, z-index lower)
    for (const [gid, gNotes] of grouped) {
      html += boardPage.renderGroupOverlay(gid, gNotes, allTasks);
    }

    // Render notes, skipping those hidden by collapsed groups
    for (const n of filtered) {
      if (hiddenIds.has(n.id)) continue;
      html += boardPage.renderNote(n, cats, allTasks);
    }

    // Save SVG before replacing content
    const existingSvg = document.getElementById('connSvg');
    canvas.innerHTML = html;
    // Re-append SVG as first child (so it's behind notes)
    if (existingSvg) {
      existingSvg.innerHTML = '';
      canvas.insertBefore(existingSvg, canvas.firstChild);
    } else {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'connSvg';
      svg.classList.add('board-connections');
      canvas.insertBefore(svg, canvas.firstChild);
    }
  },

  renderGroupOverlay(gid: string, gNotes: TaskItem[], allTasks: TaskItem[]): string {
    const isCollapsed = collapsedGroups.has(gid);
    const totalCount = gNotes.length;
    const doneCount = gNotes.filter(n => {
      if (n.type !== 'plan') return false;
      return boardPage.calcProg(n.id, allTasks).total > 0 && boardPage.calcProg(n.id, allTasks).done === boardPage.calcProg(n.id, allTasks).total;
    }).length;
    const groupName = groupNames.get(gid) || `${gNotes.length}个便签`;

    // Get category color from first note
    const cats = store.get<Category[]>('categories') ?? [];
    const firstCat = cats.find(c => c.id === gNotes[0]?.category_id);
    const groupColor = firstCat ? firstCat.color : '#8e8e8e';

    if (isCollapsed) {
      // Collapsed: render as a single node-like element
      const first = gNotes[0];
      const x = first.grid_x ?? 0;
      const y = first.grid_y ?? 0;
      return `<div class="note note--node note--group-node" data-group-id="${gid}" style="left:${x}px;top:${y}px;--note-color:${groupColor};z-index:5">
      <div class="note__node-dot" style="background:${groupColor}"></div>
      <span class="note__node-label">${utils.escapeHtml(groupName)}</span>
      <div class="note__port note__port--in" data-port="in" data-group="${gid}"></div>
      <div class="note__port note__port--out" data-port="out" data-group="${gid}"></div>
    </div>`;
    }

    // Expanded: colored border box around all notes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    gNotes.forEach(n => {
      const x = n.grid_x ?? 0;
      const y = n.grid_y ?? 0;
      const isOpen = openIds.has(n.id);
      const w = isOpen ? (n.open_width ?? 280) : (n.note_width ?? 210);
      const h = isOpen ? (n.open_height ?? 200) : (n.note_height ?? 120);
      minX = Math.min(minX, x - 12);
      minY = Math.min(minY, y - 36);
      maxX = Math.max(maxX, x + w + 12);
      maxY = Math.max(maxY, y + h + 12);
    });

    const gw = maxX - minX;
    const gh = maxY - minY;
    return `<div class="note-group" data-group-id="${gid}" style="left:${minX}px;top:${minY}px;width:${gw}px;height:${gh}px;border-color:${groupColor};background:${groupColor}10;">
    <div class="note-group__header" data-group-id="${gid}">
      <button class="note-group__toggle" data-group-id="${gid}">${icon('chevron-down', 'size="14"')}</button>
      <span class="note-group__title">${utils.escapeHtml(groupName)}</span>
      <span class="note-group__count">${doneCount}/${totalCount}</span>
      <button class="note-group__ungroup" data-group-id="${gid}" title="分解组">${icon('split', 'size="12"')}</button>
    </div>
    <span class="note-group__name-badge" style="color:${groupColor}">${utils.escapeHtml(groupName)}</span>
  </div>`;
  },

  renderNote(n: TaskItem, cats: Category[], allTasks: TaskItem[]): string {
    const cat = cats.find(c => c.id === n.category_id);
    const cc = cat ? cat.color : '#8e8e8e';
    const isOpen = openIds.has(n.id);
    const prog = n.type === 'plan' ? boardPage.calcProg(n.id, allTasks) : null;
    const zIdx = isOpen ? ++boardZCounter : 1;
    const pinBadge = n.pin_date ? `<span class="note__pin-badge" title="贴附于${n.pin_date}">${icon('pin', 'size="8"')}</span>` : '';
    const selClass = selectedIds.has(n.id) ? ' note--selected' : '';
    const isNode = !isOpen && n.node_mode === true;

    if (isOpen) {
      const wStyle = n.open_width ? `width:${n.open_width}px;` : 'width:280px;';
      const hStyle = n.open_height ? `max-height:${n.open_height}px;overflow-y:auto;` : '';
      return `<div class="note note--open${selClass}" data-id="${n.id}" style="left:${n.grid_x}px;top:${n.grid_y}px;--note-color:${cc};z-index:${zIdx};${wStyle}">
        <div class="note__port note__port--in" data-port="in" data-id="${n.id}" title="输入连接点"></div>
        <div class="note__port note__port--out" data-port="out" data-id="${n.id}" title="输出连接点"></div>
        <div class="note__preview-header">
          <div class="note__drag-handle" data-id="${n.id}">${icon('grip-vertical')}</div>
          <span class="note__title" data-field="title">${utils.escapeHtml(n.title)}</span>
          <span class="note__cat-dot" style="background:${cc}"></span>
          ${pinBadge}
        </div>
        <div class="note__open-scroll" style="${hStyle}">
        ${boardPage.renderOpen(n, cc, cats, allTasks)}
        </div>
        <div class="note__resize-handle" data-id="${n.id}"></div>
      </div>`;
    }

    if (isNode) {
      return `<div class="note note--node${selClass}" data-id="${n.id}" style="left:${n.grid_x}px;top:${n.grid_y}px;--note-color:${cc};z-index:${zIdx}">
    <div class="note__node-dot" style="background:${cc}"></div>
    <div class="note__port note__port--in" data-port="in" data-id="${n.id}"></div>
    <div class="note__port note__port--out" data-port="out" data-id="${n.id}"></div>
  </div>`;
    }

    const cprev = n.content ? `<span class="note__content-preview">${utils.escapeHtml(n.content.slice(0, 30)).replace(/\n/g, ' ')}${n.content.length > 30 ? '…' : ''}</span>` : '';
    let pprog = '';
    if (n.type === 'plan' && prog && prog.total > 0) {
      const pct = Math.round((prog.done / prog.total) * 100);
      pprog = `<div class="note__preview-progress"><div class="note__preview-progress-fill" style="width:${pct}%"></div></div>`;
    }

    let tooltipHtml = '';
    if (n.content) {
      tooltipHtml += `<div class="note__tooltip-content">${utils.escapeHtml(n.content.slice(0, 200)).replace(/\n/g, '<br>')}</div>`;
    }
    if (n.type === 'plan') {
      const subTasks = allTasks.filter(t => t.parent_id === n.id && t.sub_type === 'task');
      if (subTasks.length > 0) {
        tooltipHtml += `<div class="note__tooltip-tasks">`;
        subTasks.forEach(t => {
          const done = t.todo_status === 'completed';
          tooltipHtml += `<div class="note__tooltip-task ${done ? 'note__tooltip-task--done' : ''}">${done ? '✓' : '○'} ${utils.escapeHtml(t.title)}</div>`;
        });
        tooltipHtml += `</div>`;
      }
    }

    const pwStyle = n.note_width ? `width:${n.note_width}px;` : '';
    return `<div class="note note--preview${selClass}" data-id="${n.id}" style="left:${n.grid_x}px;top:${n.grid_y}px;--note-color:${cc};z-index:${zIdx};${pwStyle}">
      <div class="note__port note__port--in" data-port="in" data-id="${n.id}" title="输入连接点"></div>
      <div class="note__port note__port--out" data-port="out" data-id="${n.id}" title="输出连接点"></div>
      <div class="note__preview-header">
        <div class="note__drag-handle" data-id="${n.id}">${icon('grip-vertical')}</div>
        <span class="note__title" data-field="title">${utils.escapeHtml(n.title)}</span>
        <span class="note__cat-dot" style="background:${cc}"></span>
        ${pinBadge}
      </div>
      ${cprev}
      <div class="note__preview-info">
        ${prog && prog.total > 0 ? `<span class="note__progress-mini">${prog.done}/${prog.total}</span>` : ''}
        ${n.deadline ? `<span class="note__deadline-mini">${n.deadline.slice(5)}</span>` : ''}
      </div>
      ${pprog}
      <div class="note__resize-handle" data-id="${n.id}"></div>
    </div>`;
  },

  renderOpen(n: TaskItem, _cc: string, _cats: Category[], allTasks: TaskItem[]): string {
    let h = `<div class="note__open-body">`;
    h += `<div class="note__content" data-field="content">${n.content ? utils.escapeHtml(n.content).replace(/\n/g, '<br>') : '<span style="color:var(--text-lighter)">点击编辑内容…</span>'}</div>`;
    if (n.type === 'plan') {
      const prog = boardPage.calcProg(n.id, allTasks);
      if (prog && prog.total > 0) {
        const pct = Math.round((prog.done / prog.total) * 100);
        h += `<div class="note__progress-bar"><div class="note__progress-fill" style="width:${pct}%"></div></div>`;
      }
      const subs = allTasks.filter(t => t.parent_id === n.id && t.sub_type === 'task');
      h += `<div class="note__subtasks">`;
      h += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <span style="font-size:var(--text-2xs);color:var(--text-lighter);font-weight:var(--weight-medium)">任务</span>
        <div style="display:flex;gap:2px">
          <button class="btn btn--ghost btn--xs note__subtask-sequel-btn" data-parent="${n.id}" title="依次顺延添加到待办">${icon('calendar-range', 'size="12"')} 顺延</button>
          <button class="btn btn--ghost btn--xs note__subtask-add-btn" data-parent="${n.id}">${icon('plus', 'size="12"')} 添加</button>
        </div>
      </div>`;
      subs.forEach(t => {
        const done = t.todo_status === 'completed';
        const hasContent = t.content && t.content.trim();
        h += `<div class="note__subtask-item" data-id="${t.id}">
          <button class="note__subtask-toggle" data-id="${t.id}">${done ? icon('check-square') : icon('square')}</button>
          <div class="note__subtask-drag" data-subtask-drag="${t.id}">${icon('grip-vertical', 'size="10"')}</div>
          <div class="note__subtask-body">
            <span class="note__subtask-text ${done ? 'note__subtask-text--completed' : ''}" data-field="subtask-title" data-sub-id="${t.id}">${utils.escapeHtml(t.title)}</span>
            <div class="note__subtask-content ${hasContent ? '' : 'note__subtask-content--empty'}" data-field="subtask-content" data-sub-id="${t.id}">${hasContent ? utils.escapeHtml(t.content) : '<span class="note__subtask-content-placeholder">点击添加备注...</span>'}</div>
          </div>
          <div class="note__subtask-actions">
            <button class="note__subtask-quick" data-action="today" data-id="${t.id}">今日</button>
            <button class="note__subtask-quick" data-action="tomorrow" data-id="${t.id}">明日</button>
            <button class="btn btn--ghost btn--xs note__subtask-delete" data-id="${t.id}">${icon('trash-2', 'size="12"')}</button>
          </div>
        </div>`;
      });
      h += `</div>`;
    }
    if (n.type === 'plan') {
      if (n.time_start || n.time_end) {
        h += `<div class="note__time-slot-row">
          <span class="note__time-slot-label">${icon('calendar', 'size="12"')} 日期段</span>
          <input type="date" class="input input--xs note__time-start" data-id="${n.id}" value="${n.time_start ?? ''}" />
          <span style="color:var(--text-lighter)">~</span>
          <input type="date" class="input input--xs note__time-end" data-id="${n.id}" value="${n.time_end ?? ''}" />
          <button class="btn btn--ghost btn--xs note__time-remove" data-id="${n.id}" title="移除日期段">${icon('x', 'size="10"')}</button>
        </div>`;
      } else {
        h += `<button class="btn btn--ghost btn--xs note__time-add" data-id="${n.id}">${icon('calendar', 'size="12"')} 添加日期段</button>`;
      }
    }
    if (n.deadline) h += `<div class="note__meta">${icon('calendar')} ${n.deadline}</div>`;
    h += `<div class="note__actions"><button class="btn btn--ghost btn--sm note-menu-btn">${icon('more-horizontal')}</button></div>`;
    h += `</div>`;
    return h;
  },

  renderConnections(notes: TaskItem[], cats: Category[], conns: Connection[]): void {
    const svg = document.getElementById('connSvg');
    if (!svg) return;
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];

    // Helper to find element for a note (including collapsed group fallback)
    function getNoteEl(noteId: string, note: TaskItem | undefined): HTMLElement | null {
      let noteEl = document.querySelector(`.note[data-id="${noteId}"]`) as HTMLElement;
      if (!noteEl && note) {
        // Note is hidden in collapsed group - find the group element
        const gid = note.group_id;
        if (gid) {
          noteEl = document.querySelector(`.note--group-node[data-group-id="${gid}"]`) as HTMLElement;
        }
      }
      return noteEl;
    }

    let html = '';
    conns.forEach(conn => {
      const fromNote = notes.find(n => n.id === conn.from_id);
      const toNote = notes.find(n => n.id === conn.to_id);
      if (!fromNote || !toNote) return;
      const fromCat = cats.find(c => c.id === fromNote.category_id);
      const color = fromCat ? fromCat.color : '#8e8e8e';
      const pEl = getNoteEl(conn.from_id, fromNote);
      const nEl = getNoteEl(conn.to_id, toNote);
      if (!pEl || !nEl) return;
      const pR = pEl.getBoundingClientRect();
      const nR = nEl.getBoundingClientRect();
      const canvasRect = document.getElementById('bCanvas')?.getBoundingClientRect();
      if (!canvasRect) return;
      const x1 = (pR.right - canvasRect.left) / canvasScale;
      const y1 = (pR.top + pR.height / 2 - canvasRect.top) / canvasScale;
      const x2 = (nR.left - canvasRect.left) / canvasScale;
      const y2 = (nR.top + nR.height / 2 - canvasRect.top) / canvasScale;
      const key = `${conn.from_id}->${conn.to_id}`;
      const sel = selectedConn === key ? 'note__conn--selected' : '';
      let connClass = `note__conn ${sel}`;
      if (fromNote.type === 'plan') {
        const prog = boardPage.calcProg(fromNote.id, allTasks);
        if (prog.total > 0 && prog.done === prog.total) {
          connClass += ' note__conn--plan-done';
        }
      } else if (fromNote.type === 'note') {
        connClass += ' note__conn--note';
      }
      html += `<path class="${connClass}" d="${bezier(x1, y1, x2, y2)}" data-from="${conn.from_id}" data-to="${conn.to_id}" stroke="${color}" />`;
    });
    svg.innerHTML = html;
  },

  calcProg(id: string, all?: TaskItem[]): { done: number; total: number } {
    const ts = (all ?? store.get<TaskItem[]>('allTasks') ?? []).filter(t => t.parent_id === id && t.sub_type === 'task');
    return { done: ts.filter(t => t.todo_status === 'completed').length, total: ts.length };
  },

  renderEmpty(notes: TaskItem[]): void {
    document.querySelector('.board-empty-state')?.remove();
    if (notes.length > 0) return;
    const c = document.getElementById('bCanvas');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'board-empty-state empty-state';
    el.innerHTML = `${icon('layout-grid')}<p style="font-size:var(--text-base);font-weight:var(--weight-medium);color:var(--text-light)">画布空空如也</p><p>双击画布创建便签</p><p>拖拽右侧圆点⬤ 到另一便签左侧圆点可创建连线</p>`;
    c.appendChild(el);
    initIcons();
  },

  updateHistBtns(): void {
    const u = document.getElementById('bUndo') as HTMLButtonElement | null;
    const r = document.getElementById('bRedo') as HTMLButtonElement | null;
    if (u) u.disabled = !history.canUndo;
    if (r) r.disabled = !history.canRedo;
  },

  bindEvents(): void {
    const canvas = document.getElementById('bCanvas');
    if (!canvas) return;

    canvas.addEventListener('pointerdown', (e) => {
      const subtaskDrag = (e.target as HTMLElement).closest('[data-subtask-drag]') as HTMLElement | null;
      if (subtaskDrag) {
        e.preventDefault();
        e.stopPropagation();
        const subId = subtaskDrag.dataset.subtaskDrag!;
        const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
        const subTask = allTasks.find(t => t.id === subId);
        if (!subTask) return;
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        drag = {
          noteId: subId,
          startX: e.clientX,
          startY: e.clientY,
          offsetX: canvasPos.x - 0,
          offsetY: canvasPos.y - 0,
          origGX: 0,
          origGY: 0,
          moved: false,
          isMultiDrag: false,
          origPositions: new Map(),
          isGroupNode: false,
          groupId: null,
          isSubtaskDrag: true,
          subtaskData: { title: subTask.title, content: subTask.content || '', parentId: subTask.parent_id! },
        };
        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup', onDragUp);
        return;
      }

      const port = (e.target as HTMLElement).closest('.note__port') as HTMLElement | null;
      if (port) {
        e.preventDefault();
        e.stopPropagation();
        const portType = port.dataset.port;
        const noteId = port.dataset.id!;
        if (portType === 'out') {
          const rect = port.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          connDraw = {
            fromId: noteId,
            startX: (rect.left + rect.width / 2 - canvasRect.left) / canvasScale,
            startY: (rect.top + rect.height / 2 - canvasRect.top) / canvasScale,
          };
          document.addEventListener('pointermove', onConnMove);
          document.addEventListener('pointerup', onConnUp);
        } else if (portType === 'in') {
          const conns = store.get<Connection[]>('connections') ?? [];
          const incoming = conns.filter(c => c.to_id === noteId);
          if (incoming.length > 0) {
            Promise.all(incoming.map(c => connectionApi.delete(c.from_id, c.to_id))).then(() => {
              toast.info(`已移除 ${incoming.length} 条连线`);
              boardPage.render();
            });
          } else {
            const rect = port.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            connDraw = {
              fromId: noteId,
              startX: (rect.left + rect.width / 2 - canvasRect.left) / canvasScale,
              startY: (rect.top + rect.height / 2 - canvasRect.top) / canvasScale,
            };
            document.addEventListener('pointermove', onConnMove);
            document.addEventListener('pointerup', onConnUp);
          }
        }
        return;
      }

      const resizeHandle = (e.target as HTMLElement).closest('.note__resize-handle') as HTMLElement | null;
      if (resizeHandle) {
        e.preventDefault();
        e.stopPropagation();
        const noteId = resizeHandle.dataset.id!;
        const noteEl2 = resizeHandle.closest('.note') as HTMLElement;
        const scrollEl = noteEl2.querySelector('.note__open-scroll') as HTMLElement | null;
        noteEl2.style.willChange = 'width, height';
        resizeInfo = {
          noteId,
          startX: e.clientX,
          startY: e.clientY,
          startW: noteEl2.offsetWidth,
          startH: noteEl2.offsetHeight,
          noteEl: noteEl2,
          scrollEl,
          rafId: 0,
          pendingW: noteEl2.offsetWidth,
          pendingH: noteEl2.offsetHeight,
        };
        document.addEventListener('pointermove', onResizeMove);
        document.addEventListener('pointerup', onResizeUp);
        return;
      }

      const noteEl = (e.target as HTMLElement).closest('.note') as HTMLElement | null;
      if (!noteEl) {
        // Check for group interactions (expanded group header, toggle, ungroup)
        const groupToggle = (e.target as HTMLElement).closest('.note-group__toggle') as HTMLElement | null;
        if (groupToggle) {
          const gid = groupToggle.dataset.groupId!;
          if (collapsedGroups.has(gid)) collapsedGroups.delete(gid); else collapsedGroups.add(gid);
          boardPage.render();
          return;
        }
        const groupUngroup = (e.target as HTMLElement).closest('.note-group__ungroup') as HTMLElement | null;
        if (groupUngroup) {
          boardPage.ungroupNotes(groupUngroup.dataset.groupId!);
          return;
        }
        const groupHeader = (e.target as HTMLElement).closest('.note-group__header') as HTMLElement | null;
        if (groupHeader) {
          const gid = groupHeader.dataset.groupId!;
          // If not clicking toggle/ungroup, start dragging the whole group
          const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
          const groupNotes = allTasks.filter(t => t.group_id === gid);
          if (groupNotes.length === 0) return;
          // Select all notes in the group for dragging
          selectedIds.clear();
          groupNotes.forEach(n => selectedIds.add(n.id));
          const origPositions = new Map<string, { x: number; y: number }>();
          groupNotes.forEach(n => origPositions.set(n.id, { x: n.grid_x ?? 0, y: n.grid_y ?? 0 }));
          const firstNote = groupNotes[0];
          const firstEl = document.querySelector(`.note[data-id="${firstNote.id}"]`) as HTMLElement;
          const rect = firstEl?.getBoundingClientRect();
          drag = {
            noteId: firstNote.id,
            startX: e.clientX,
            startY: e.clientY,
            offsetX: rect ? e.clientX - rect.left : 0,
            offsetY: rect ? e.clientY - rect.top : 0,
            origGX: firstNote.grid_x ?? 0,
            origGY: firstNote.grid_y ?? 0,
            moved: false,
            isMultiDrag: true,
            origPositions,
            isGroupNode: false,
            groupId: null,
            isSubtaskDrag: false,
            subtaskData: null,
          };
          document.addEventListener('pointermove', onDragMove);
          document.addEventListener('pointerup', onDragUp);
          return;
        }

        if ((e.target as HTMLElement).closest('.board-empty-state')) return;

        // Start panning on empty space drag; Ctrl+drag = box select
        if (e.ctrlKey || e.metaKey) {
          // Box select mode
          selectedIds.clear();
          boardPage.render();
          const startPos = screenToCanvas(e.clientX, e.clientY);
          const selEl = document.createElement('div');
          selEl.className = 'board-box-select';
          selEl.style.left = startPos.x + 'px';
          selEl.style.top = startPos.y + 'px';
          selEl.style.width = '0';
          selEl.style.height = '0';
          canvas.appendChild(selEl);
          boxSelect = { startX: startPos.x, startY: startPos.y, el: selEl };
          document.addEventListener('pointermove', onBoxSelectMove);
          document.addEventListener('pointerup', onBoxSelectUp);
          return;
        }

        // Pan mode: detect click vs drag
        isPanning = false;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartOffX = canvasOffX;
        panStartOffY = canvasOffY;
        const panHandler = (moveE: PointerEvent) => {
          const dx = moveE.clientX - panStartX;
          const dy = moveE.clientY - panStartY;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            isPanning = true;
            document.removeEventListener('pointermove', panHandler);
            document.removeEventListener('pointerup', panUpHandler);
            canvasOffX = panStartOffX + (moveE.clientX - panStartX);
            canvasOffY = panStartOffY + (moveE.clientY - panStartY);
            applyCanvasTransform();
            document.addEventListener('pointermove', onPanMove);
            document.addEventListener('pointerup', onPanUp);
          }
        };
        const panUpHandler = (_upE: PointerEvent) => {
          document.removeEventListener('pointermove', panHandler);
          document.removeEventListener('pointerup', panUpHandler);
          if (!isPanning) {
            selectedIds.clear();
            boardPage.render();
          }
          isPanning = false;
        };
        document.addEventListener('pointermove', panHandler);
        document.addEventListener('pointerup', panUpHandler);
        return;
      }

      // Check for collapsed group node drag
      const groupNode = noteEl.closest('.note--group-node') as HTMLElement | null;
      if (groupNode) {
        const gid = groupNode.dataset.groupId!;
        const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
        const groupNotes = allTasks.filter(t => t.group_id === gid);
        if (groupNotes.length === 0) return;
        selectedIds.clear();
        groupNotes.forEach(n => selectedIds.add(n.id));
        const origPositions = new Map<string, { x: number; y: number }>();
        groupNotes.forEach(n => origPositions.set(n.id, { x: n.grid_x ?? 0, y: n.grid_y ?? 0 }));
        const pos = screenToCanvas(e.clientX, e.clientY);
        const groupLeft = parseInt(groupNode.style.left) || 0;
        const groupTop = parseInt(groupNode.style.top) || 0;
        drag = {
          noteId: groupNotes[0].id,
          startX: e.clientX,
          startY: e.clientY,
          offsetX: pos.x - groupLeft,
          offsetY: pos.y - groupTop,
          origGX: groupNotes[0].grid_x ?? 0,
          origGY: groupNotes[0].grid_y ?? 0,
          moved: false,
          isMultiDrag: true,
          origPositions,
          isGroupNode: true,
          groupId: gid,
          isSubtaskDrag: false,
          subtaskData: null,
        };
        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup', onDragUp);
        return;
      }

      const currentZ = parseInt(noteEl.style.zIndex ?? '1');
      if (currentZ <= boardZCounter) {
        noteEl.style.zIndex = String(++boardZCounter);
      }

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const noteId = noteEl.dataset.id!;
        if (selectedIds.has(noteId)) {
          selectedIds.delete(noteId);
        } else {
          selectedIds.add(noteId);
        }
        boardPage.render();
        return;
      }

      const isEditable = (e.target as HTMLElement).closest('[contenteditable="true"]');
      if (isEditable) { e.stopPropagation(); return; }

      const isAction = (e.target as HTMLElement).closest('.note__port, .note-menu-btn, .note__subtask-toggle, .note__subtask-quick, .note__subtask-delete, .note__subtask-add-btn, [data-subtask-drag], button, input');
      if (isAction) return;

      const isField = (e.target as HTMLElement).closest('[data-field]');
      if (isField && openIds.has(noteEl.dataset.id!)) return;

      const noteId = noteEl.dataset.id!;
      // Don't prevent default on right-click - let contextmenu event fire
      if (e.button === 2) return;
      e.preventDefault();

      const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
      const note = allTasks.find(t => t.id === noteId);

      // If this note is in the current selection, drag all selected notes
      const isMultiDrag = selectedIds.has(noteId) && selectedIds.size > 1;
      const origPositions = new Map<string, { x: number; y: number }>();
      if (isMultiDrag) {
        for (const sid of selectedIds) {
          const sn = allTasks.find(t => t.id === sid);
          if (sn) {
            const selEl = document.querySelector(`.note[data-id="${sid}"]`) as HTMLElement;
            const vx = selEl ? parseFloat(selEl.style.left) || sn.grid_x || 0 : sn.grid_x ?? 0;
            const vy = selEl ? parseFloat(selEl.style.top) || sn.grid_y || 0 : sn.grid_y ?? 0;
            origPositions.set(sid, { x: vx, y: vy });
          }
        }
      }

      // Calculate offset in canvas coordinate space using visual position
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const noteCanvasX = parseFloat(noteEl.style.left) || note?.grid_x || 0;
      const noteCanvasY = parseFloat(noteEl.style.top) || note?.grid_y || 0;
      const offsetX = canvasPos.x - noteCanvasX;
      const offsetY = canvasPos.y - noteCanvasY;

      drag = {
        noteId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX,
        offsetY,
        origGX: note?.grid_x ?? 0,
        origGY: note?.grid_y ?? 0,
        moved: false,
        isMultiDrag,
        origPositions,
        isGroupNode: false,
        groupId: null,
        isSubtaskDrag: false,
        subtaskData: null,
      };

      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragUp);
    });

    canvas.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.note__port')) return;
      if (t.closest('.note__drag-handle')) return;
      if (t.closest('.note__subtask-toggle')) { boardPage.toggleSub((t.closest('.note__subtask-toggle') as HTMLElement)!.dataset.id!); return; }
      if (t.closest('.note__subtask-quick')) { const b = t.closest('.note__subtask-quick') as HTMLElement; boardPage.quickSub(b.dataset.id!, b.dataset.action!); return; }
      if (t.closest('.note__subtask-delete')) { boardPage.delSub((t.closest('.note__subtask-delete') as HTMLElement)!.dataset.id!); return; }
      if (t.closest('.note__subtask-add-btn')) { boardPage.showInput((t.closest('.note__subtask-add-btn') as HTMLElement)!.dataset.parent!, 'subtask'); return; }
      if (t.closest('.note__subtask-sequel-btn')) { boardPage.sequelSubtasks((t.closest('.note__subtask-sequel-btn') as HTMLElement)!.dataset.parent!); return; }
      if (t.closest('.note-menu-btn')) { const n = t.closest('.note') as HTMLElement; if (n) boardPage.showMenu(n.dataset.id!, e); return; }
      if (t.closest('.dock-item')) { toggleDock((t.closest('.dock-item') as HTMLElement)!.dataset.dock!); return; }

      const subtaskTitleEl = t.closest('[data-field="subtask-title"]') as HTMLElement | null;
      if (subtaskTitleEl) { const subId = subtaskTitleEl.dataset.subId!; boardPage.startEditSubtask(subId); return; }

      const subtaskContentEl = t.closest('[data-field="subtask-content"]') as HTMLElement | null;
      if (subtaskContentEl) { const subId = subtaskContentEl.dataset.subId!; boardPage.startEditSubtaskContent(subId); return; }

      const titleEl = t.closest('[data-field="title"]') as HTMLElement | null;
      if (titleEl && !titleEl.closest('[contenteditable="true"]')) { const n = titleEl.closest('.note') as HTMLElement; if (n && openIds.has(n.dataset.id!)) { boardPage.startEdit(n.dataset.id!, 'title', e); return; } }
      const contentEl = t.closest('[data-field="content"]') as HTMLElement | null;
      if (contentEl) { const n = contentEl.closest('.note') as HTMLElement; if (n && openIds.has(n.dataset.id!)) { if (contentEl.closest('[contenteditable="true"]')) return; boardPage.startEdit(n.dataset.id!, 'content', e); return; } }

      const connPath = t.closest('.note__conn') as HTMLElement | null;
      if (connPath) {
        const fromId = connPath.dataset.from!;
        const toId = connPath.dataset.to!;
        const key = `${fromId}->${toId}`;
        selectedConn = selectedConn === key ? null : key;
        boardPage.render();
        return;
      }

      if (t.closest('.note')) {
        if (wasDragged) { wasDragged = false; return; }
        if (!e.ctrlKey && !e.metaKey && selectedIds.size > 0) {
          const noteEl = t.closest('.note') as HTMLElement;
          if (!selectedIds.has(noteEl.dataset.id!)) {
            selectedIds.clear();
            boardPage.render();
          }
        }
        return;
      }
      if (!e.ctrlKey && !e.metaKey) selectedIds.clear();
      wasDragged = false;
      if (openIds.size > 0) { openIds.clear(); boardPage.render(); }
      if (dockPanel) { dockPanel = null; renderDockEl(); }
    });

    canvas.addEventListener('dblclick', (e) => {
      // Double-click on group title = rename
      const groupTitle = (e.target as HTMLElement).closest('.note-group__title') as HTMLElement | null;
      if (groupTitle) {
        const gid = (groupTitle.closest('.note-group') as HTMLElement | null)?.dataset.groupId;
        if (gid) {
          const currentName = groupNames.get(gid) || '';
          const newName = prompt('输入分组名称:', currentName);
          if (newName !== null) {
            groupNames.set(gid, newName.trim());
            boardPage.render();
          }
        }
        return;
      }

      const noteEl = (e.target as HTMLElement).closest('.note') as HTMLElement | null;
      if (!noteEl) {
        // Double-click on empty canvas = create note
        const pos = screenToCanvas(e.clientX, e.clientY);
        boardPage.createNote(utils.snapToGrid(pos.x, GRID), utils.snapToGrid(pos.y, GRID));
        return;
      }
      // Double-click on note content = full-screen edit
      const contentEl = (e.target as HTMLElement).closest('[data-field="content"]') as HTMLElement | null;
      const noteId = noteEl.dataset.id;
      if (contentEl && noteId) {
        boardPage.openFullScreenEdit(noteId);
        return;
      }
      // Double-click on note title = start editing title
      const titleEl = (e.target as HTMLElement).closest('[data-field="title"]') as HTMLElement | null;
      if (titleEl && noteId && openIds.has(noteId) && titleEl.contentEditable !== 'true') {
        boardPage.startEdit(noteId, 'title');
        return;
      }
    });

    canvas.addEventListener('contextmenu', (e) => {
      const subtaskEl = (e.target as HTMLElement).closest('.note__subtask-item') as HTMLElement;
      if (subtaskEl) {
        e.preventDefault();
        const subId = subtaskEl.dataset.id;
        if (subId) boardPage.showSubtaskMenu(subId, e);
        return;
      }
      const n = (e.target as HTMLElement).closest('.note') as HTMLElement;
      if (!n) return;
      e.preventDefault();
      boardPage.showMenu(n.dataset.id!, e);
    });

    canvas.addEventListener('keydown', (e) => {
      const inp = (e.target as HTMLElement).closest('.note__subtask-input') as HTMLInputElement | null;
      if (inp) {
        if (e.key === 'Enter') { e.preventDefault(); const row = inp.closest('.note__subtask-add-row') as HTMLElement; const v = inp.value.trim(); if (row?.dataset.parent && v) boardPage.addSub(row.dataset.parent, v); }
        else if (e.key === 'Escape') inp.closest('.note__subtask-add-row')?.remove();
      }
      if (e.key === 'Delete' && selectedConn) {
        const key = selectedConn;
        const parts = key.split('->');
        if (parts.length === 2) {
          connectionApi.delete(parts[0], parts[1]).then(() => {
            history.push({ type: 'connection_delete', connection: { from_id: parts[0], to_id: parts[1] } });
            toast.info('连线已移除');
            boardPage.render();
          });
        }
        selectedConn = null;
      }
      if (e.key === 'Delete' && selectedIds.size > 0) {
        const ids = [...selectedIds];
        selectedIds.clear();
        Promise.all(ids.map(id => taskApi.update(id, { status: 'trashed' }))).then(() => {
          toast.info(`已移除 ${ids.length} 个便签`);
          ids.forEach(id => openIds.delete(id));
          boardPage.render();
        });
      }
    });

    document.getElementById('bAdd')?.addEventListener('click', () => boardPage.createNote(20, 20));
    document.getElementById('bArrange')?.addEventListener('click', () => boardPage.arrange());
    document.getElementById('bGroup')?.addEventListener('click', () => boardPage.groupSelected());
    document.getElementById('bUndo')?.addEventListener('click', async () => { await history.undo(); await boardPage.render(); });
    document.getElementById('bRedo')?.addEventListener('click', async () => { await history.redo(); await boardPage.render(); });
    document.getElementById('bTrash')?.addEventListener('click', () => toggleDock('trashed'));
    document.getElementById('bShelf')?.addEventListener('click', () => toggleDock('shelved'));
    document.getElementById('bTrophy')?.addEventListener('click', () => toggleDock('completed'));

    // Board tab events (delegated)
    document.getElementById('boardTabs')?.addEventListener('click', (e) => {
      const tabBtn = (e.target as HTMLElement).closest('.board-tabs__tab') as HTMLElement | null;
      if (tabBtn) {
        currentBoardTab = tabBtn.dataset.tab ?? '';
        boardPage.render();
        return;
      }
      const addBtn = (e.target as HTMLElement).closest('#boardTabAdd') as HTMLElement | null;
      if (addBtn) {
        const name = prompt('输入分区名称:');
        if (name && name.trim()) {
          currentBoardTab = name.trim();
          boardPage.render();
        }
      }
    });

    // Tab right-click context menu
    document.getElementById('boardTabs')?.addEventListener('contextmenu', (e) => {
      const tabBtn = (e.target as HTMLElement).closest('.board-tabs__tab') as HTMLElement | null;
      if (!tabBtn || !tabBtn.dataset.tab) return;
      e.preventDefault();
      const tabName = tabBtn.dataset.tab!;
      const menu = document.createElement('div');
      menu.className = 'sort-picker';
      menu.style.position = 'fixed';
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
      menu.innerHTML = `
        <button class="sort-picker__item" data-a="renameTab">${icon('edit')} 重命名</button>
        <button class="sort-picker__item" data-a="deleteTab" style="color:var(--color-danger)">${icon('trash-2')} 删除分区</button>
      `;
      document.body.appendChild(menu);
      initIcons();
      const close = () => menu.remove();
      menu.addEventListener('click', async (ev) => {
        const b = (ev.target as HTMLElement).closest('.sort-picker__item') as HTMLElement | null;
        if (!b) return;
        const a = b.dataset.a;
        close();
        if (a === 'renameTab') {
          const newName = prompt('输入新名称:', tabName);
          if (newName && newName.trim() && newName.trim() !== tabName) {
            const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
            const tabNotes = allTasks.filter(t => t.board_tab === tabName);
            await Promise.all(tabNotes.map(t => taskApi.update(t.id, { board_tab: newName.trim() })));
            currentBoardTab = newName.trim();
            await boardPage.render();
          }
        } else if (a === 'deleteTab') {
          if (!confirm(`删除分区"${tabName}"？便签将移至默认分区`)) return;
          const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
          const tabNotes = allTasks.filter(t => t.board_tab === tabName);
          await Promise.all(tabNotes.map(t => taskApi.update(t.id, { board_tab: null })));
          currentBoardTab = '';
          await boardPage.render();
        }
      });
      setTimeout(() => { document.addEventListener('click', function h(evt) { if (!menu.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
    });

    window.addEventListener('resize', () => { boardPage.renderConnections(store.get<TaskItem[]>('boardNotes') ?? [], store.get<Category[]>('categories') ?? [], store.get<Connection[]>('connections') ?? []); });

    // Ctrl+Wheel zoom
    const boardArea = document.querySelector('.board-canvas-wrap') as HTMLElement | null;
    if (boardArea) {
      boardArea.addEventListener('wheel', (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          const newScale = Math.max(0.3, Math.min(3, canvasScale + delta));
          const rect = (boardArea as HTMLElement).getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          canvasOffX = mx - (mx - canvasOffX) * (newScale / canvasScale);
          canvasOffY = my - (my - canvasOffY) * (newScale / canvasScale);
          canvasScale = newScale;
          applyCanvasTransform();
          boardPage.renderConnections(store.get<TaskItem[]>('boardNotes') ?? [], store.get<Category[]>('categories') ?? [], store.get<Connection[]>('connections') ?? []);
        }
      }, { passive: false });
    }

    // Middle-click to pan canvas
    const boardEl = document.querySelector('.board-canvas-wrap') as HTMLElement | null;
    if (boardEl) {
      boardEl.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button === 1 && !(e.target as HTMLElement).closest('.note') && !(e.target as HTMLElement).closest('.note-group__header')) {
            e.preventDefault();
            isPanning = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            panStartOffX = canvasOffX;
            panStartOffY = canvasOffY;
            (boardEl as HTMLElement).style.cursor = 'grabbing';
            document.addEventListener('pointermove', onPanMove);
            document.addEventListener('pointerup', onPanUpMiddle);
          }
      });
    }
  },

  showInput(parentId: string, _type: 'subtask'): void {
    document.querySelector('.note__subtask-add-row')?.remove();
    const c = document.querySelector(`.note[data-id="${parentId}"] .note__subtasks`);
    if (!c) return;
    const row = document.createElement('div');
    row.className = 'note__subtask-add-row';
    row.dataset.parent = parentId;
    row.innerHTML = `<input class="input input--sm note__subtask-input" type="text" placeholder="添加任务… Enter确认" />`;
    c.appendChild(row);
    (row.querySelector('input')!).focus();
  },

  async toggleSub(id: string): Promise<void> {
    const t = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === id);
    if (!t) return;
    const ns = t.todo_status === 'completed' ? 'pending' : 'completed';
    history.push({ type: 'update', taskId: id, before: { todo_status: t.todo_status }, after: { todo_status: ns } });
    await taskApi.update(id, { todo_status: ns });
    boardPage.updateSubtaskLocal(id, ns);
  },

  async quickSub(id: string, action: string): Promise<void> {
    const t = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === id);
    if (!t) return;
    const d = action === 'today' ? utils.getTodayStr() : (() => { const x = new Date(); x.setDate(x.getDate() + 1); return utils.formatDate(x); })();
    history.push({ type: 'update', taskId: id, before: { todo_date: t.todo_date }, after: { todo_date: d } });
    await taskApi.update(id, { todo_date: d, todo_status: 'pending' });
    toast.success(action === 'today' ? '已安排今日' : '已安排明日');
    boardPage.updateSubtaskLocal(id, 'pending');
  },

  async delSub(id: string): Promise<void> {
    const t = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === id);
    if (!t) return;
    history.push({ type: 'delete', taskId: id, before: t, after: null });
    await taskApi.delete(id);
    const itemEl = document.querySelector(`.note__subtask-item[data-id="${id}"]`);
    if (itemEl) {
      itemEl.remove();
      const allTasks = await taskApi.list({ status: 'active' });
      store.set('allTasks', allTasks);
      const parentNote = itemEl.closest('.note') as HTMLElement;
      if (parentNote) {
        const parentId = parentNote.dataset.id;
        if (parentId) boardPage.updateProgressLocal(parentId, allTasks);
      }
    } else {
      await boardPage.render();
    }
  },

  async addSub(parentId: string, title: string): Promise<void> {
    const all = store.get<TaskItem[]>('allTasks') ?? [];
    const p = all.find(t => t.id === parentId);
    const c = await taskApi.create({ type: p?.type ?? 'plan', sub_type: 'task', title, content: '', category_id: p?.category_id ?? 'cat_default', priority: 0, sort_order: all.filter(t => t.parent_id === parentId && t.sub_type === 'task').length, status: 'active', collapsed: false, parent_id: parentId, todo_status: 'pending' });
    history.push({ type: 'create', taskId: c.id, before: null, after: c });
    toast.success('子任务已添加');
    const allTasks = await taskApi.list({ status: 'active' });
    store.set('allTasks', allTasks);
    const subtasksEl = document.querySelector(`.note[data-id="${parentId}"] .note__subtasks`);
    if (subtasksEl) {
      const addRow = subtasksEl.querySelector('.note__subtask-add-row');
      const itemEl = document.createElement('div');
      itemEl.className = 'note__subtask-item';
      itemEl.dataset.id = c.id;
      itemEl.innerHTML = `
        <button class="note__subtask-toggle" data-id="${c.id}">${icon('square')}</button>
        <span class="note__subtask-text">${utils.escapeHtml(title)}</span>
        <div class="note__subtask-actions">
          <button class="note__subtask-quick" data-action="today" data-id="${c.id}">今日</button>
          <button class="note__subtask-quick" data-action="tomorrow" data-id="${c.id}">明日</button>
          <button class="btn btn--ghost btn--xs note__subtask-delete" data-id="${c.id}">${icon('trash-2', 'size="12"')}</button>
        </div>`;
      if (addRow) {
        subtasksEl.insertBefore(itemEl, addRow);
      } else {
        subtasksEl.appendChild(itemEl);
      }
      boardPage.updateProgressLocal(parentId, allTasks);
      initIcons();
    } else {
      await boardPage.render();
    }
  },

  updateSubtaskLocal(id: string, newStatus: string): void {
    const itemEl = document.querySelector(`.note__subtask-item[data-id="${id}"]`);
    if (!itemEl) return;
    const toggleBtn = itemEl.querySelector('.note__subtask-toggle') as HTMLElement;
    const textEl = itemEl.querySelector('.note__subtask-text') as HTMLElement;
    if (toggleBtn) toggleBtn.innerHTML = newStatus === 'completed' ? icon('check-square') : icon('square');
    if (textEl) textEl.classList.toggle('note__subtask-text--completed', newStatus === 'completed');
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const task = allTasks.find(t => t.id === id);
    if (task) {
      (task as any).todo_status = newStatus;
    }
    const parentNote = itemEl.closest('.note') as HTMLElement;
    if (parentNote) {
      const parentId = parentNote.dataset.id;
      if (parentId) boardPage.updateProgressLocal(parentId, allTasks);
    }
    initIcons();
  },

  updateProgressLocal(parentId: string, allTasks: TaskItem[]): void {
    const prog = boardPage.calcProg(parentId, allTasks);
    const noteEl = document.querySelector(`.note[data-id="${parentId}"]`);
    if (!noteEl) return;
    const progBar = noteEl.querySelector('.note__progress-bar') as HTMLElement | null;
    if (prog && prog.total > 0) {
      const pct = Math.round((prog.done / prog.total) * 100);
      if (progBar) {
        const fill = progBar.querySelector('.note__progress-fill') as HTMLElement;
        if (fill) fill.style.width = pct + '%';
      } else {
        const subtasksEl = noteEl.querySelector('.note__subtasks');
        if (subtasksEl) {
          const bar = document.createElement('div');
          bar.className = 'note__progress-bar';
          bar.innerHTML = `<div class="note__progress-fill" style="width:${pct}%"></div>`;
          subtasksEl.parentElement?.insertBefore(bar, subtasksEl);
        }
      }
    }
  },

  startEditSubtask(subId: string): void {
    const el = document.querySelector(`.note__subtask-text[data-sub-id="${subId}"]`) as HTMLElement | null;
    if (!el) return;
    const t = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === subId);
    if (t) el.innerText = t.title ?? '';
    el.contentEditable = 'true';
    el.classList.add('note__subtask-text--editing');
    el.focus();
    const rng = document.createRange();
    rng.selectNodeContents(el);
    rng.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(rng);
    let saved = false;
    const cleanup = () => { el.contentEditable = 'false'; el.classList.remove('note__subtask-text--editing'); };
    const save = async () => {
      if (saved) return;
      saved = true;
      const nv = el.innerText?.trim() ?? '';
      cleanup();
      const tk = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === subId);
      if (!tk) return;
      if (nv !== tk.title) {
        await taskApi.update(subId, { title: nv });
      }
    };
    const blurH = () => { save(); el.removeEventListener('blur', blurH); };
    el.addEventListener('keydown', function h(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); saved = true; cleanup(); el.removeEventListener('keydown', h); el.removeEventListener('blur', blurH); }
    });
    el.addEventListener('blur', blurH);
  },

  startEditSubtaskContent(subId: string): void {
    const el = document.querySelector(`.note__subtask-content[data-sub-id="${subId}"]`) as HTMLElement | null;
    if (!el) return;
    const t = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === subId);
    const placeholder = el.querySelector('.note__subtask-content-placeholder');
    if (placeholder) placeholder.remove();
    el.innerText = t?.content?.trim() ?? '';
    el.contentEditable = 'true';
    el.classList.add('note__subtask-text--editing');
    el.classList.remove('note__subtask-content--empty');
    el.focus();
    const rng = document.createRange();
    rng.selectNodeContents(el);
    rng.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(rng);
    let saved = false;
    const cleanup = () => { el.contentEditable = 'false'; el.classList.remove('note__subtask-text--editing'); };
    const save = async () => {
      if (saved) return;
      saved = true;
      const nv = el.innerText?.trim() ?? '';
      cleanup();
      if (!nv) {
        el.innerHTML = '<span class="note__subtask-content-placeholder">点击添加备注...</span>';
        el.classList.add('note__subtask-content--empty');
      }
      const tk = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === subId);
      if (!tk) return;
      if (nv !== (tk.content ?? '')) {
        await taskApi.update(subId, { content: nv });
      }
    };
    const blurH = () => { save(); el.removeEventListener('blur', blurH); };
    el.addEventListener('keydown', function h(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); saved = true; cleanup(); el.removeEventListener('keydown', h); el.removeEventListener('blur', blurH); }
    });
    el.addEventListener('blur', blurH);
  },

  async sequelSubtasks(parentId: string): Promise<void> {
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const subs = allTasks.filter(t => t.parent_id === parentId && t.sub_type === 'task');
    if (subs.length === 0) { toast.info('没有子任务'); return; }
    const today = new Date();
    let created = 0;
    for (let i = 0; i < subs.length; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = utils.formatDate(d);
      const existing = allTasks.find(t => t.parent_id === parentId && t.sub_type === 'task' && t.todo_date === dateStr && t.title === subs[i].title);
      if (existing) continue;
      await taskApi.update(subs[i].id, { todo_date: dateStr, todo_status: 'pending' });
      created++;
    }
    if (created > 0) {
      toast.success(`已顺延安排 ${created} 个子任务到待办`);
    } else {
      toast.info('所有子任务已在待办中');
    }
    await boardPage.render();
  },

  bindTimeSlotInputs(): void {
    document.querySelectorAll('.note__time-start, .note__time-end').forEach(input => {
      input.addEventListener('change', async (e) => {
        const el = e.target as HTMLInputElement;
        const id = el.dataset.id!;
        const field = el.classList.contains('note__time-start') ? 'time_start' : 'time_end';
        await taskApi.update(id, { [field]: el.value || null });
      });
    });
    document.querySelectorAll('.note__time-add').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const el = e.currentTarget as HTMLElement;
        const id = el.dataset.id!;
        const today = utils.getTodayStr();
        await taskApi.update(id, { time_start: today });
        await boardPage.render();
      });
    });
    document.querySelectorAll('.note__time-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const el = e.currentTarget as HTMLElement;
        const id = el.dataset.id!;
        await taskApi.update(id, { time_start: null, time_end: null });
        await boardPage.render();
      });
    });
  },

  bindTooltips(): void {
    // Remove any existing tooltip on interaction
    const removeTooltip = () => {
      const tip = document.getElementById('board-tooltip');
      if (tip) tip.remove();
    };

    // Global dismissal handlers (only add once)
    if (!document.getElementById('board-tooltip-script')) {
      const marker = document.createElement('script');
      marker.id = 'board-tooltip-script';
      marker.type = 'text/mark';
      marker.style.display = 'none';
      document.body.appendChild(marker);
      const handler = () => removeTooltip();
      document.addEventListener('pointerdown', handler);
      document.addEventListener('scroll', handler, true);
    }

    document.querySelectorAll('.note--preview, .note--node').forEach(noteEl => {
      const noteId = (noteEl as HTMLElement).dataset.id!;
      let tooltipTimer: number | null = null;

      noteEl.addEventListener('mouseenter', () => {
        removeTooltip();
        const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
        const n = allTasks.find(t => t.id === noteId);
        if (!n) return;
        let html = '';
        // Always show title for nodes
        if ((noteEl as HTMLElement).classList.contains('note--node')) {
          html += `<div class="note__tooltip-title" style="font-weight:bold;margin-bottom:4px">${utils.escapeHtml(n.title)}</div>`;
        }
        if (n.content) {
          html += `<div class="note__tooltip-content">${utils.escapeHtml(n.content.slice(0, 200)).replace(/\n/g, '<br>')}</div>`;
        }
        if (n.type === 'plan') {
          const subTasks = allTasks.filter(t => t.parent_id === n.id && t.sub_type === 'task');
          if (subTasks.length > 0) {
            html += `<div class="note__tooltip-tasks">`;
            subTasks.forEach(t => {
              const done = t.todo_status === 'completed';
              html += `<div class="note__tooltip-task ${done ? 'note__tooltip-task--done' : ''}">${done ? '✓' : '○'} ${utils.escapeHtml(t.title)}</div>`;
            });
            html += `</div>`;
          }
        }
        if (!html) return;
        const tip = document.createElement('div');
        tip.id = 'board-tooltip';
        tip.className = 'note__tooltip note__tooltip--portal';
        tip.innerHTML = html;
        document.body.appendChild(tip);
        const rect = (noteEl as HTMLElement).getBoundingClientRect();
        tip.style.position = 'fixed';
        tip.style.display = 'block';
        tip.style.zIndex = '999999';
        // Smart direction: check viewport boundaries
        const tipW = tip.offsetWidth;
        const tipH = tip.offsetHeight;
        let tipLeft = rect.left;
        let tipTop = rect.bottom + 4;
        if (tipLeft + tipW > window.innerWidth) tipLeft = rect.right - tipW;
        if (tipTop + tipH > window.innerHeight) tipTop = rect.top - tipH - 4;
        tipLeft = Math.max(0, tipLeft);
        tipTop = Math.max(0, tipTop);
        tip.style.left = tipLeft + 'px';
        tip.style.top = tipTop + 'px';
        // Auto-dismiss after 3 seconds
        tooltipTimer = window.setTimeout(() => removeTooltip(), 3000);
      });
      noteEl.addEventListener('mouseleave', () => {
        removeTooltip();
        if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
      });
    });
  },

  async createConnection(fromId: string, toId: string): Promise<void> {
    if (fromId === toId) return;
    const conns = store.get<Connection[]>('connections') ?? [];
    if (conns.some(c => c.from_id === fromId && c.to_id === toId)) {
      toast.info('已存在连线');
      return;
    }
    await connectionApi.create(fromId, toId);
    history.push({ type: 'connection_create', connection: { from_id: fromId, to_id: toId } });
    toast.success('连线已创建');
    await boardPage.render();
  },

  showDye(): void {
    document.getElementById('dyeCat')?.classList.add('dye-zone--visible');
    document.getElementById('dyeType')?.classList.add('dye-zone--visible');
    document.getElementById('bDock')?.classList.add('board-dock--visible');
  },
  hideDye(): void {
    document.getElementById('dyeCat')?.classList.remove('dye-zone--visible');
    document.getElementById('dyeType')?.classList.remove('dye-zone--visible');
    document.getElementById('bDock')?.classList.remove('board-dock--visible');
  },

  checkDye(cx: number, cy: number): void {
    ['dyeCat', 'dyeType'].forEach(zid => {
      const z = document.getElementById(zid);
      if (!z) return;
      z.querySelectorAll('.dye-item').forEach(item => {
        const el = item as HTMLElement;
        const r = el.getBoundingClientRect();
        const hover = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
        el.style.transform = hover ? 'scale(1.15)' : '';
        el.style.boxShadow = hover ? '0 0 8px var(--dye-color)' : '';
        if (hover && drag) {
          const key = zid === 'dyeCat' ? 'dyeCategory' : 'dyeType';
          const val = el.dataset[key]!;
          const dtype = zid === 'dyeCat' ? 'category' : 'type';
          if (!dyeTarget || dyeTarget.type !== dtype || dyeTarget.value !== val) {
            startDyeTimer(dtype, val, async () => {
              if (!drag) return;
              let ids = [drag.noteId];
              if (selectedIds.has(drag.noteId) && selectedIds.size > 1) {
                ids = [...selectedIds];
              }
              if (dtype === 'type') await Promise.all(ids.map(id => taskApi.updateTypeCascade(id, val)));
              else await Promise.all(ids.map(id => taskApi.update(id, { category_id: val })));
              toast.success(dtype === 'category' ? `分类已更改${ids.length > 1 ? ` (${ids.length}个)` : ''}` : `类型已更改${ids.length > 1 ? ` (${ids.length}个)` : ''}`);
              selectedIds.clear();
              await boardPage.render();
            });
          }
        } else if (!hover && dyeTarget) {
          const key = zid === 'dyeCat' ? 'dyeCategory' : 'dyeType';
          if (dyeTarget.value === el.dataset[key]) clearDyeTimer();
        }
      });
    });
  },

  checkDock(cx: number, cy: number): void {
    const d = document.getElementById('bDock');
    if (!d) return;
    d.querySelectorAll('.dock-item').forEach(i => {
      const r = (i as HTMLElement).getBoundingClientRect();
      (i as HTMLElement).style.transform = (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) ? 'scale(1.2)' : '';
    });
  },

  getDock(cx: number, cy: number): string | null {
    const d = document.getElementById('bDock');
    if (!d) return null;
    for (const i of d.querySelectorAll('.dock-item')) {
      const r = (i as HTMLElement).getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return (i as HTMLElement).dataset.dock ?? null;
    }
    return null;
  },

  async groupSelected(): Promise<void> {
    if (selectedIds.size < 2) { toast.info('请选择至少2个便签'); return; }
    const gid = 'grp_' + Date.now();
    const ids = [...selectedIds];
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const batchEntries = ids.map(id => {
      const t = allTasks.find(t => t.id === id);
      return { taskId: id, before: { group_id: t?.group_id ?? null } as Partial<TaskItem> | null, after: { group_id: gid } as Partial<TaskItem> | null };
    });
    await Promise.all(ids.map(id => taskApi.update(id, { group_id: gid })));
    history.push({ type: 'batch', entries: batchEntries });
    toast.success(`已合并 ${ids.length} 个便签`);
    selectedIds.clear();
    await boardPage.render();
  },

  async ungroupNotes(gid: string): Promise<void> {
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const groupNotes = allTasks.filter(t => t.group_id === gid);
    const batchEntries = groupNotes.map(t => ({
      taskId: t.id,
      before: { group_id: gid } as Partial<TaskItem> | null,
      after: { group_id: null } as Partial<TaskItem> | null,
    }));
    await Promise.all(groupNotes.map(t => taskApi.update(t.id, { group_id: null })));
    history.push({ type: 'batch', entries: batchEntries });
    toast.success(`已分解 ${groupNotes.length} 个便签`);
    collapsedGroups.delete(gid);
    await boardPage.render();
  },

  async doDock(noteId: string, action: string): Promise<void> {
    const sm: Record<string, string> = { trashed: 'trashed', shelved: 'shelved', completed: 'completed' };
    const mm: Record<string, string> = { trashed: '已移至回收站', shelved: '已移至收纳盒', completed: '已标记完成' };
    const ns = sm[action]; if (!ns) return;
    let ids = [noteId];
    if (selectedIds.has(noteId) && selectedIds.size > 1) {
      ids = [...selectedIds];
    }
    await Promise.all(ids.map(id => taskApi.update(id, { status: ns })));
    toast.success(`${mm[action]}${ids.length > 1 ? ` ${ids.length} 个便签` : ''}`);
    ids.forEach(id => openIds.delete(id));
    selectedIds.clear();
    await boardPage.render();
  },

  startEdit(noteId: string, field: string, clickEvent?: MouseEvent): void {
    const el = document.querySelector(`.note[data-id="${noteId}"] [data-field="${field}"]`) as HTMLElement | null;
    if (!el) return;
    // If already editing, just focus without resetting text
    if (el.contentEditable === 'true') {
      if (clickEvent) {
        const range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
        if (range) {
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
        }
      }
      el.focus();
      return;
    }
    const t = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === noteId);
    if (t) el.innerText = (t as any)[field] ?? '';
    el.contentEditable = 'true';
    el.classList.add(field === 'title' ? 'note__title--editing' : 'note__content--editing');
    el.focus();
    if (clickEvent) {
      const range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
      if (range) {
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    } else {
      const rng = document.createRange();
      rng.selectNodeContents(el);
      rng.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(rng);
    }
    let saved = false;
    const cleanup = () => { el.contentEditable = 'false'; el.classList.remove(field === 'title' ? 'note__title--editing' : 'note__content--editing'); };
    const save = async () => {
      if (saved) return;
      saved = true;
      const nv = el.innerText?.trim() ?? '';
      cleanup();
      const tk = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === noteId);
      if (!tk) return;
      const ov = (tk as any)[field] ?? '';
      if (nv !== ov) {
        history.push({ type: 'update', taskId: noteId, before: { [field]: ov }, after: { [field]: nv } });
        await taskApi.update(noteId, { [field]: nv });
      }
    };
    const blurH = () => { save(); el.removeEventListener('blur', blurH); };
    el.addEventListener('keydown', function h(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); saved = true; cleanup(); el.removeEventListener('keydown', h); el.removeEventListener('blur', blurH); }
    });
    el.addEventListener('blur', blurH);
  },

  openFullScreenEdit(noteId: string): void {
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const note = allTasks.find(t => t.id === noteId);
    if (!note) return;

    const existing = document.querySelector('.fullscreen-editor');
    if (existing) existing.remove();

    const editor = document.createElement('div');
    editor.className = 'fullscreen-editor';
    editor.innerHTML = `
      <div class="fullscreen-editor__header">
        <div class="fullscreen-editor__header-left">
          <span class="fullscreen-editor__title">${utils.escapeHtml(note.title)}</span>
          <div class="fullscreen-editor__mode-switch">
            <button class="btn btn--sm fullscreen-editor__mode-btn fullscreen-editor__mode-btn--active" data-mode="plain">${icon('file-text')} 记事本</button>
            <button class="btn btn--sm fullscreen-editor__mode-btn" data-mode="markdown">${icon('code')} Markdown</button>
          </div>
        </div>
        <div class="fullscreen-editor__header-right">
          <span class="fullscreen-editor__word-count"></span>
          <button class="btn btn--ghost fullscreen-editor__close">${icon('x', 'size="20"')} 关闭</button>
        </div>
      </div>
      <div class="fullscreen-editor__body">
        <div class="fullscreen-editor__toolbar">
          <button class="btn btn--ghost btn--xs" data-fmt="bold" title="加粗 Ctrl+B">${icon('bold')}</button>
          <button class="btn btn--ghost btn--xs" data-fmt="italic" title="斜体 Ctrl+I">${icon('italic')}</button>
          <button class="btn btn--ghost btn--xs" data-fmt="strikethrough" title="删除线">${icon('strikethrough')}</button>
          <span class="fullscreen-editor__toolbar-divider"></span>
          <button class="btn btn--ghost btn--xs" data-fmt="heading" title="标题">${icon('heading')}</button>
          <button class="btn btn--ghost btn--xs" data-fmt="code" title="代码">${icon('code')}</button>
          <button class="btn btn--ghost btn--xs" data-fmt="link" title="链接">${icon('link')}</button>
          <span class="fullscreen-editor__toolbar-divider"></span>
          <button class="btn btn--ghost btn--xs" data-fmt="list" title="列表">${icon('list')}</button>
          <button class="btn btn--ghost btn--xs" data-fmt="quote" title="引用">${icon('quote')}</button>
          <span class="fullscreen-editor__toolbar-divider"></span>
          <button class="btn btn--ghost btn--xs" data-fmt="undo" title="撤销 Ctrl+Z">${icon('undo-2')}</button>
          <button class="btn btn--ghost btn--xs" data-fmt="redo" title="重做 Ctrl+Y">${icon('redo-2')}</button>
        </div>
        <div class="fullscreen-editor__panes">
          <textarea class="fullscreen-editor__textarea" placeholder="在此输入内容...">${note.content || ''}</textarea>
          <div class="fullscreen-editor__preview" style="display:none"></div>
        </div>
      </div>
      <div class="fullscreen-editor__statusbar">
        <span class="fullscreen-editor__status-text">行 1, 列 1</span>
        <span class="fullscreen-editor__save-hint">Ctrl+S 保存 · Esc 关闭</span>
      </div>
    `;
    document.body.appendChild(editor);
    initIcons();

    const content = note.content || '';
    const hasMarkdown = /[#*`\[\]>\-_]/.test(content);
    let currentMode: 'plain' | 'markdown' = hasMarkdown ? 'markdown' : 'plain';
    let undoStack: string[] = [content];
    let redoStack: string[] = [];
    let undoLock = false;

    const textarea = editor.querySelector('.fullscreen-editor__textarea') as HTMLTextAreaElement;
    const preview = editor.querySelector('.fullscreen-editor__preview') as HTMLElement;
    const wordCount = editor.querySelector('.fullscreen-editor__word-count') as HTMLElement;
    const statusText = editor.querySelector('.fullscreen-editor__status-text') as HTMLElement;
    const modeBtns = editor.querySelectorAll('.fullscreen-editor__mode-btn');
    const toolbarBtns = editor.querySelectorAll('[data-fmt]');

    // Auto-switch to markdown mode if content looks like markdown
    if (currentMode === 'markdown') {
      modeBtns.forEach(b => b.classList.remove('fullscreen-editor__mode-btn--active'));
      (document.querySelector('.fullscreen-editor__mode-btn[data-mode="markdown"]') as HTMLElement)?.classList.add('fullscreen-editor__mode-btn--active');
      preview.style.display = 'block';
      textarea.style.width = '50%';
      editor.classList.add('fullscreen-editor--split');
      updatePreview();
    }

    function updateWordCount() {
      const text = textarea.value;
      const chars = text.length;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      wordCount.textContent = `${chars} 字符 · ${words} 词`;
    }

    function updateStatusBar() {
      const text = textarea.value;
      const lines = text.substring(0, textarea.selectionStart).split('\n');
      const line = lines.length;
      const col = lines[lines.length - 1].length + 1;
      statusText.textContent = `行 ${line}, 列 ${col}`;
    }

    function updatePreview() {
      if (currentMode === 'markdown') {
        preview.innerHTML = utils.renderMarkdown(textarea.value);
      }
    }

    function pushUndo(val: string) {
      if (undoLock) return;
      undoStack.push(val);
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
    }

    function wrapSelection(prefix: string, suffix: string = '') {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selected = text.substring(start, end);
      const replacement = prefix + (selected || 'text') + (suffix || prefix);
      textarea.setRangeText(replacement, start, end, 'end');
      pushUndo(text);
      textarea.focus();
      updateWordCount();
      updateStatusBar();
      updatePreview();
    }

    function addPrefixLine(prefix: string) {
      const start = textarea.selectionStart;
      const text = textarea.value;
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      textarea.setRangeText(prefix, lineStart, lineStart, 'end');
      pushUndo(text);
      textarea.focus();
      updateWordCount();
      updateStatusBar();
      updatePreview();
    }

    function handleTab(e: KeyboardEvent) {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      // If text selected, indent all lines in selection
      if (start !== end) {
        const lines = text.substring(start, end).split('\n');
        const indented = lines.map((l, i) => i === 0 ? '  ' + l : l).join('\n');
        textarea.setRangeText(indented, start, end, 'end');
      } else {
        textarea.setRangeText('  ', start, start, 'end');
      }
      pushUndo(text);
      updateWordCount();
      updateStatusBar();
      updatePreview();
    }

    function handleShiftTab(e: KeyboardEvent) {
      e.preventDefault();
      const start = textarea.selectionStart;
      const text = textarea.value;
      const before = text.substring(0, start);
      if (before.endsWith('  ')) {
        textarea.value = before.slice(0, -2) + text.substring(start);
        textarea.selectionStart = textarea.selectionEnd = start - 2;
      }
      pushUndo(text);
      updateWordCount();
      updateStatusBar();
      updatePreview();
    }

    function formatAction(action: string) {
      switch (action) {
        case 'bold': wrapSelection('**'); break;
        case 'italic': wrapSelection('*'); break;
        case 'strikethrough': wrapSelection('~~'); break;
        case 'heading': addPrefixLine('## '); break;
        case 'code': wrapSelection('`', '`'); break;
        case 'link':
          const url = prompt('输入链接URL:', 'https://');
          if (url) wrapSelection('[', `](${url})`);
          break;
        case 'list': addPrefixLine('- '); break;
        case 'quote': addPrefixLine('> '); break;
        case 'undo':
          if (undoStack.length > 1) {
            undoLock = true;
            redoStack.push(undoStack.pop()!);
            textarea.value = undoStack[undoStack.length - 1];
            undoLock = false;
          }
          break;
        case 'redo':
          if (redoStack.length > 0) {
            undoLock = true;
            const val = redoStack.pop()!;
            undoStack.push(val);
            textarea.value = val;
            undoLock = false;
          }
          break;
      }
      updateWordCount();
      updateStatusBar();
      updatePreview();
    }

    const close = async () => {
      const newContent = textarea.value;
      if (newContent !== (note.content || '')) {
        await taskApi.update(noteId, { content: newContent });
        (note as any).content = newContent;
      }
      editor.remove();
      await boardPage.render();
    };

    // Mode switching
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('fullscreen-editor__mode-btn--active'));
        btn.classList.add('fullscreen-editor__mode-btn--active');
        currentMode = (btn as HTMLElement).dataset.mode as 'plain' | 'markdown';
        if (currentMode === 'markdown') {
          preview.style.display = 'block';
          textarea.style.width = '50%';
          editor.classList.add('fullscreen-editor--split');
          updatePreview();
        } else {
          preview.style.display = 'none';
          textarea.style.width = '100%';
          editor.classList.remove('fullscreen-editor--split');
        }
        textarea.focus();
      });
    });

    // Toolbar actions
    toolbarBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.fmt!;
        formatAction(action);
        textarea.focus();
      });
    });

    // Textarea events
    textarea.addEventListener('input', () => {
      updateWordCount();
      updateStatusBar();
      updatePreview();
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        handleTab(e);
      } else if (e.key === 'Tab' && e.shiftKey) {
        handleShiftTab(e);
      } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        close();
      } else if (e.key === 'Escape') {
        close();
      } else if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        formatAction('bold');
      } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        formatAction('italic');
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        formatAction('undo');
      } else if ((e.key === 'y' || (e.key === 'z' && e.shiftKey)) && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        formatAction('redo');
      }
    });

    textarea.addEventListener('select', updateStatusBar);
    textarea.addEventListener('click', updateStatusBar);
    textarea.addEventListener('keyup', updateStatusBar);

    editor.querySelector('.fullscreen-editor__close')?.addEventListener('click', close);
    textarea.focus();
    updateWordCount();
    updateStatusBar();
  },

  showMenu(noteId: string, e: MouseEvent): void {
    document.querySelector('.sort-picker')?.remove();
    if (!selectedIds.has(noteId)) {
      selectedIds.clear();
      selectedIds.add(noteId);
    }
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const ids = [...selectedIds];
    const count = ids.length;
    const t = allTasks.find(t => t.id === noteId);
    if (!t) return;
    const p = document.createElement('div');
    p.className = 'sort-picker';
    p.style.position = 'fixed';
    p.style.visibility = 'hidden';
    p.style.left = e.clientX + 'px';
    p.style.top = e.clientY + 'px';
    const label = count > 1 ? ` (${count}个)` : '';
    const cats = store.get<Category[]>('categories') ?? [];
    const catColorRow = cats.map(c => `<button class="sort-picker__color-btn" data-a="color" data-cat="${c.id}" style="background:${c.color}" title="${c.name}"></button>`).join('');
    p.innerHTML = `
      <div class="sort-picker__color-row">${catColorRow}<input type="color" class="sort-picker__color-input" data-a="customColor" value="${cats.find(c => c.id === t.category_id)?.color ?? '#8e8e8e'}" title="自定义颜色" /></div>
      <button class="sort-picker__item" data-a="pinToDaily">${icon('pin')} 贴附到每日</button>
      <button class="sort-picker__item" data-a="trash">${icon('trash-2')} 移至回收站${label}</button>
      <button class="sort-picker__item" data-a="shelf">${icon('archive')} 移至收纳盒${label}</button>
      <button class="sort-picker__item" data-a="complete">${icon('check-circle')} 标记完成${label}</button>
      ${count === 1 && t.type === 'note' ? `<button class="sort-picker__item" data-a="toPlan">${icon('target')} 转为计划</button>` : ''}
      ${count === 1 && t.type === 'plan' ? `<button class="sort-picker__item" data-a="toNote">${icon('sticky-note')} 转为便签</button>` : ''}
      ${count === 1 ? `<button class="sort-picker__item" data-a="toNode">${icon('minimize-2')} 缩小为节点</button>` : ''}
      ${count === 1 && t.node_mode === true ? `<button class="sort-picker__item" data-a="expandNote">${icon('maximize-2')} 展开便签</button>` : ''}
      ${count > 1 ? `<button class="sort-picker__item" data-a="toPlan">${icon('target')} 全部转为计划</button>
      <button class="sort-picker__item" data-a="toNote">${icon('sticky-note')} 全部转为便签</button>
      <button class="sort-picker__item" data-a="group">${icon('layers')} 合并为组</button>` : ''}
      ${t.group_id ? `<button class="sort-picker__item" data-a="renameGroup" data-gid="${t.group_id}">${icon('edit')} 命名分组</button>` : ''}
      <button class="sort-picker__item" data-a="delete" style="color:var(--color-danger)">${icon('trash')} 彻底删除${label}</button>`;
    // Add "move to tab" options
    const allNotes = store.get<TaskItem[]>('boardNotes') ?? [];
    const existingTabs = new Set<string>();
    allNotes.forEach(n => { if (n.board_tab) existingTabs.add(n.board_tab); });
    if (existingTabs.size > 0 || currentBoardTab) {
      let tabItems = '';
      existingTabs.forEach(tab => {
        if (tab !== (t.board_tab ?? '')) {
          tabItems += `<button class="sort-picker__item" data-a="moveTab" data-tab="${utils.escapeHtml(tab)}">${icon('folder')} 移至"${utils.escapeHtml(tab)}"</button>`;
        }
      });
      tabItems += `<button class="sort-picker__item" data-a="moveTab" data-tab="">${icon('folder')} 移至默认分区</button>`;
      p.innerHTML += tabItems;
    }
    document.body.appendChild(p);
    // Smart menu direction: adjust position to avoid viewport overflow
    const menuW = p.offsetWidth;
    const menuH = p.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let menuLeft = e.clientX;
    let menuTop = e.clientY;
    if (menuLeft + menuW > vw) menuLeft = menuLeft - menuW;
    if (menuTop + menuH > vh) menuTop = menuTop - menuH;
    menuLeft = Math.max(0, menuLeft);
    menuTop = Math.max(0, menuTop);
    p.style.left = menuLeft + 'px';
    p.style.top = menuTop + 'px';
    p.style.visibility = '';
    initIcons();
    const close = () => p.remove();
    p.addEventListener('click', async (ev) => {
      const colorBtn = (ev.target as HTMLElement).closest('.sort-picker__color-btn') as HTMLElement | null;
      if (colorBtn) {
        const catId = colorBtn.dataset.cat!;
        await Promise.all(ids.map(id => taskApi.update(id, { category_id: catId })));
        toast.success('分类已更改');
        close();
        selectedIds.clear();
        await boardPage.render();
        return;
      }
      const b = (ev.target as HTMLElement).closest('.sort-picker__item') as HTMLElement | null;
      if (!b) return;
      const a = b.dataset.a; close();
      if (!a) return;
      const statusMap: Record<string, string> = { trash: 'trashed', shelf: 'shelved', complete: 'completed' };
      if (statusMap[a]) {
        const ns = statusMap[a];
        await Promise.all(ids.map(id => taskApi.update(id, { status: ns })));
        toast.success(`已${a === 'trash' ? '移至回收站' : a === 'shelf' ? '移至收纳盒' : '标记完成'}${count > 1 ? ` ${count} 个便签` : ''}`);
        ids.forEach(id => openIds.delete(id));
      } else if (a === 'pinToDaily') {
        await Promise.all(ids.map(id => taskApi.update(id, { pin_date: utils.getTodayStr() })));
        toast.success(`已贴附到每日${count > 1 ? ` ${count} 个便签` : ''}`);
      } else if (a === 'toPlan') {
        await Promise.all(ids.map(id => taskApi.updateTypeCascade(id, 'plan')));
        toast.success(`已转为计划${count > 1 ? ` ${count} 个` : ''}`);
      } else if (a === 'toNote') {
        await Promise.all(ids.map(id => taskApi.updateTypeCascade(id, 'note')));
        toast.success(`已转为便签${count > 1 ? ` ${count} 个` : ''}`);
      } else if (a === 'toNode') {
        await taskApi.update(noteId, { node_mode: true });
        toast.success('已缩小为节点');
      } else if (a === 'expandNote') {
        await taskApi.update(noteId, { node_mode: false });
        toast.success('已展开便签');
      } else if (a === 'delete') {
        await Promise.all(ids.map(id => taskApi.delete(id)));
        toast.success(`已彻底删除${count > 1 ? ` ${count} 个` : ''}便签`);
        ids.forEach(id => openIds.delete(id));
      } else if (a === 'group') {
        const gid = 'grp_' + Date.now();
        const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
        const batchEntries = ids.map(id => {
          const t = allTasks.find(t => t.id === id);
          return { taskId: id, before: { group_id: t?.group_id ?? null } as Partial<TaskItem> | null, after: { group_id: gid } as Partial<TaskItem> | null };
        });
        await Promise.all(ids.map(id => taskApi.update(id, { group_id: gid })));
        history.push({ type: 'batch', entries: batchEntries });
        toast.success(`已合并 ${count} 个便签`);
      } else if (a === 'renameGroup') {
        const gid = b.dataset.gid;
        if (gid) {
          const currentName = groupNames.get(gid) || '';
          const newName = prompt('输入分组名称:', currentName);
          if (newName !== null) {
            groupNames.set(gid, newName.trim());
            await boardPage.render();
          }
        }
      } else if (a === 'moveTab') {
        const tab = b.dataset.tab ?? null;
        await Promise.all(ids.map(id => taskApi.update(id, { board_tab: tab })));
        toast.success(`已移动到${tab || '默认'}分区`);
      }
      selectedIds.clear();
      await boardPage.render();
    });
    const colorInput = p.querySelector('.sort-picker__color-input') as HTMLInputElement | null;
    if (colorInput) {
      colorInput.addEventListener('input', async (ev) => {
        ev.stopPropagation();
        const color = colorInput.value;
        await categoryApi.create('自定义', color);
        const cats = await categoryApi.list();
        const newCat = cats[cats.length - 1];
        if (newCat) {
          await Promise.all(ids.map(id => taskApi.update(id, { category_id: newCat.id })));
          toast.success('颜色已更改');
          store.set('categories', cats);
        }
        close();
        selectedIds.clear();
        await boardPage.render();
      });
    }
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!p.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  showSubtaskMenu(subId: string, e: MouseEvent): void {
    document.querySelector('.sort-picker')?.remove();
    const t = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === subId);
    if (!t) return;
    const today = utils.getTodayStr();
    const tomorrow = (() => { const x = new Date(); x.setDate(x.getDate() + 1); return utils.formatDate(x); })();
    const dayAfter = (() => { const x = new Date(); x.setDate(x.getDate() + 2); return utils.formatDate(x); })();
    const p = document.createElement('div');
    p.className = 'sort-picker';
    p.style.position = 'fixed';
    p.style.left = e.clientX + 'px';
    p.style.top = e.clientY + 'px';
    p.innerHTML = `
      <div class="sort-picker__label">添加到待办</div>
      <button class="sort-picker__item" data-a="today">${icon('calendar-day')} 今天 (${today.slice(5)})</button>
      <button class="sort-picker__item" data-a="tomorrow">${icon('calendar-plus')} 明天 (${tomorrow.slice(5)})</button>
      <button class="sort-picker__item" data-a="dayAfter">${icon('calendar')} 后天 (${dayAfter.slice(5)})</button>
      <button class="sort-picker__item" data-a="pickDate">${icon('calendar-range')} 选择日期…</button>
      <div style="height:1px;background:var(--border-light);margin:var(--space-1) 0"></div>
      <button class="sort-picker__item" data-a="toggle">${t.todo_status === 'completed' ? icon('circle') : icon('check-circle')} ${t.todo_status === 'completed' ? '标记未完成' : '标记完成'}</button>
      <button class="sort-picker__item" data-a="delete" style="color:var(--color-danger)">${icon('trash-2')} 删除任务</button>`;
    document.body.appendChild(p);
    initIcons();
    const close = () => p.remove();
    p.addEventListener('click', async (ev) => {
      const b = (ev.target as HTMLElement).closest('.sort-picker__item') as HTMLElement | null;
      if (!b) return;
      const a = b.dataset.a;
      close();
      switch (a) {
        case 'today':
          await taskApi.update(subId, { todo_date: today, todo_status: 'pending' });
          toast.success('已添加到今日待办');
          break;
        case 'tomorrow':
          await taskApi.update(subId, { todo_date: tomorrow, todo_status: 'pending' });
          toast.success('已添加到明日待办');
          break;
        case 'dayAfter':
          await taskApi.update(subId, { todo_date: dayAfter, todo_status: 'pending' });
          toast.success('已添加到后天待办');
          break;
        case 'pickDate':
          boardPage.showDatePicker(subId, e);
          return;
        case 'toggle':
          const ns = t.todo_status === 'completed' ? 'pending' : 'completed';
          await taskApi.update(subId, { todo_status: ns });
          toast.success(ns === 'completed' ? '已完成' : '已恢复');
          break;
        case 'delete':
          await taskApi.delete(subId);
          toast.info('任务已删除');
          break;
      }
      await boardPage.render();
    });
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!p.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  showDatePicker(subId: string, e: MouseEvent): void {
    document.querySelector('.sort-picker')?.remove();
    const p = document.createElement('div');
    p.className = 'sort-picker';
    p.style.position = 'fixed';
    p.style.left = e.clientX + 'px';
    p.style.top = e.clientY + 'px';
    let html = `<div class="sort-picker__label">选择日期</div>`;
    html += `<div style="padding:var(--space-2)">`;
    html += `<input type="date" class="input input--sm" id="subtaskDatePicker" value="${utils.getTodayStr()}" style="width:100%" />`;
    html += `<button class="btn btn--primary btn--sm" style="width:100%;margin-top:var(--space-2)" id="subtaskDateConfirm">确认</button>`;
    html += `</div>`;
    p.innerHTML = html;
    document.body.appendChild(p);
    const confirmBtn = p.querySelector('#subtaskDateConfirm');
    const dateInput = p.querySelector('#subtaskDatePicker') as HTMLInputElement;
    const close = () => p.remove();
    confirmBtn?.addEventListener('click', async () => {
      const date = dateInput?.value;
      if (date) {
        await taskApi.update(subId, { todo_date: date, todo_status: 'pending' });
        toast.success(`已添加到 ${date.slice(5)} 待办`);
        close();
        await boardPage.render();
      }
    });
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!p.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  async createNote(x: number, y: number, type: string = 'note'): Promise<void> {
    const c = await taskApi.create({ type, sub_type: 'note', title: type === 'note' ? '新便签' : '新计划', content: '', category_id: 'cat_default', priority: 0, sort_order: 0, status: 'active', collapsed: false, grid_x: x, grid_y: y, board_tab: currentBoardTab || null });
    history.push({ type: 'create', taskId: c.id, before: null, after: c });
    toast.success('便签已创建');
    openIds.add(c.id);
    await boardPage.render();
  },

  async arrange(): Promise<void> {
    const notes = store.get<TaskItem[]>('boardNotes') ?? [];
    const conns = store.get<Connection[]>('connections') ?? [];
    const cats = store.get<Category[]>('categories') ?? [];

    const noteMap = new Map(notes.map(n => [n.id, n]));
    const hasIncoming = new Set(conns.map(c => c.to_id));
    const childrenOf = new Map<string, string[]>();
    conns.forEach(c => {
      const arr = childrenOf.get(c.from_id) ?? [];
      arr.push(c.to_id);
      childrenOf.set(c.from_id, arr);
    });

    const roots = notes.filter(n => !hasIncoming.has(n.id));
    const visited = new Set<string>();
    const layers: string[][] = [];
    let queue = roots.map(r => r.id);
    if (queue.length === 0 && notes.length > 0) {
      queue = [notes[0].id];
    }

    while (queue.length > 0) {
      layers.push([...queue]);
      queue.forEach(id => visited.add(id));
      const next: string[] = [];
      for (const id of queue) {
        const children = childrenOf.get(id) ?? [];
        for (const cid of children) {
          if (!visited.has(cid)) next.push(cid);
        }
      }
      queue = next;
    }

    const unvisited = notes.filter(n => !visited.has(n.id));
    if (unvisited.length > 0) {
      const byCat: Record<string, TaskItem[]> = {};
      unvisited.forEach(n => {
        const key = n.category_id ?? 'default';
        if (!byCat[key]) byCat[key] = [];
        byCat[key].push(n);
      });
      Object.values(byCat).forEach(group => {
        layers.push(group.map(n => n.id));
      });
    }

    const sp = 20;
    const colW = NW + sp;
    const rowH = 70 + sp;
    const updates: Promise<any>[] = [];
    const batchEntries: Array<{ taskId: string; before: Partial<TaskItem> | null; after: Partial<TaskItem> | null }> = [];

    layers.forEach((layer, li) => {
      const sorted = layer
        .map(id => noteMap.get(id))
        .filter((n): n is TaskItem => !!n)
        .sort((a, b) => {
          const ca = cats.findIndex(c => c.id === a.category_id);
          const cb = cats.findIndex(c => c.id === b.category_id);
          if (ca !== cb) return ca - cb;
          if (a.type !== b.type) return a.type === 'note' ? -1 : 1;
          return b.priority - a.priority;
        });
      sorted.forEach((n, ni) => {
        const x = utils.snapToGrid(li * colW + 20, GRID);
        const y = utils.snapToGrid(ni * rowH + 20, GRID);
        if (n.grid_x !== x || n.grid_y !== y) {
          batchEntries.push({ taskId: n.id, before: { grid_x: n.grid_x, grid_y: n.grid_y }, after: { grid_x: x, grid_y: y } });
          updates.push(taskApi.update(n.id, { grid_x: x, grid_y: y }));
        }
      });
    });

    await Promise.all(updates);
    if (batchEntries.length > 0) {
      history.push({ type: 'batch', entries: batchEntries });
    }
    toast.success('画布已整理');
    await boardPage.render();
  },

  async restoreNote(id: string): Promise<void> {
    const all = await taskApi.list();
    const t = all.find(t => t.id === id);
    if (!t) return;
    history.push({ type: 'update', taskId: id, before: { status: t.status }, after: { status: 'active' } });
    await taskApi.update(id, { status: 'active' });
    toast.success('已恢复');
    await boardPage.render();
  },
};

function onPanMove(e: PointerEvent) {
  if (!isPanning) return;
  canvasOffX = panStartOffX + (e.clientX - panStartX);
  canvasOffY = panStartOffY + (e.clientY - panStartY);
  applyCanvasTransform();
  boardPage.renderConnections(store.get<TaskItem[]>('boardNotes') ?? [], store.get<Category[]>('categories') ?? [], store.get<Connection[]>('connections') ?? []);
}

function onPanUp() {
  isPanning = false;
}

function onPanUpMiddle() {
  document.removeEventListener('pointermove', onPanMove);
  document.removeEventListener('pointerup', onPanUpMiddle);
  if (isPanning) {
    isPanning = false;
    const boardEl = document.querySelector('.board-canvas-wrap') as HTMLElement | null;
    if (boardEl) boardEl.style.cursor = '';
  }
}

function onDragMove(e: PointerEvent) {
  if (!drag) return;
  const d = drag;
  const dx = e.clientX - d.startX;
  const dy = e.clientY - d.startY;
  if (!d.moved) {
    if (Math.abs(dx) < DRAG_TH && Math.abs(dy) < DRAG_TH) return;
    d.moved = true;
    if (d.isSubtaskDrag) {
      const ghost = document.createElement('div');
      ghost.className = 'note note--preview note--dragging';
      ghost.id = 'subtask-drag-ghost';
      ghost.style.position = 'fixed';
      ghost.style.width = '180px';
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '999999';
      ghost.style.cursor = 'grabbing';
      ghost.innerHTML = `<div class="note__preview-header"><div class="note__drag-handle" style="opacity:0.6">${icon('grip-vertical')}</div><span class="note__title">${utils.escapeHtml(d.subtaskData?.title || '')}</span></div>`;
      document.body.appendChild(ghost);
      initIcons();
      boardPage.showDye();
      return;
    }
    if (d.isMultiDrag) {
      for (const sid of selectedIds) {
        document.querySelector(`.note[data-id="${sid}"]`)?.classList.add('note--dragging');
      }
      // Also add dragging class to collapsed group if present
      const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
      const firstNote = allTasks.find(t => t.id === d.noteId);
      if (firstNote?.group_id) {
        document.querySelector(`.note--group-node[data-group-id="${firstNote.group_id}"]`)?.classList.add('note--dragging');
      }
    } else {
      document.querySelector(`.note[data-id="${d.noteId}"]`)?.classList.add('note--dragging');
    }
    boardPage.showDye();
  }

  if (d.isSubtaskDrag) {
    const ghost = document.getElementById('subtask-drag-ghost') as HTMLElement;
    if (ghost) {
      ghost.style.left = (e.clientX - 90) + 'px';
      ghost.style.top = (e.clientY - 20) + 'px';
    }
    boardPage.checkDye(e.clientX, e.clientY);
    boardPage.checkDock(e.clientX, e.clientY);
    return;
  }
  if (d.isMultiDrag) {
    // Move all selected notes by the same delta (in canvas coordinate space)
    const ddx = dx / canvasScale;
    const ddy = dy / canvasScale;
    for (const sid of selectedIds) {
      const el = document.querySelector(`.note[data-id="${sid}"]`) as HTMLElement;
      const orig = d.origPositions.get(sid);
      if (!el || !orig) continue;
      el.style.left = Math.max(0, orig.x + ddx) + 'px';
      el.style.top = Math.max(0, orig.y + ddy) + 'px';
    }
    // Also move collapsed group node if present
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const firstNote = allTasks.find(t => t.id === d.noteId);
    if (firstNote?.group_id) {
      const groupEl = document.querySelector(`.note--group-node[data-group-id="${firstNote.group_id}"]`) as HTMLElement;
      if (groupEl) {
        const orig = d.origPositions.get(d.noteId);
        if (orig) {
          groupEl.style.left = Math.max(0, orig.x + ddx) + 'px';
          groupEl.style.top = Math.max(0, orig.y + ddy) + 'px';
        }
      }
    }
  } else {
    const noteEl = document.querySelector(`.note[data-id="${d.noteId}"]`) as HTMLElement;
    if (!noteEl) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    let nx = pos.x - d.offsetX;
    let ny = pos.y - d.offsetY;
    nx = Math.max(0, nx);
    ny = Math.max(0, ny);
    noteEl.style.left = nx + 'px';
    noteEl.style.top = ny + 'px';
  }
  boardPage.checkDye(e.clientX, e.clientY);
  boardPage.checkDock(e.clientX, e.clientY);
  boardPage.renderConnections(store.get<TaskItem[]>('boardNotes') ?? [], store.get<Category[]>('categories') ?? [], store.get<Connection[]>('connections') ?? []);
}

async function onDragUp(e: PointerEvent) {
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragUp);
  if (!drag) return;
  const { noteId, moved, origGX, origGY, isMultiDrag, origPositions, isSubtaskDrag, subtaskData } = drag;
  const noteEl = document.querySelector(`.note[data-id="${noteId}"]`);

  if (isSubtaskDrag) {
    document.getElementById('subtask-drag-ghost')?.remove();
    boardPage.hideDye();
    const dockAction = boardPage.getDock(e.clientX, e.clientY);
    if (!dockAction && moved) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const snapX = utils.snapToGrid(Math.max(0, pos.x - 100), GRID);
      const snapY = utils.snapToGrid(Math.max(0, pos.y - 40), GRID);
      const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
      const parentTask = allTasks.find(t => t.id === subtaskData?.parentId);
      const newNote = await taskApi.create({
        type: 'note',
        sub_type: 'note',
        title: subtaskData?.title || '新便签',
        content: subtaskData?.content || '',
        category_id: parentTask?.category_id ?? 'cat_default',
        priority: parentTask?.priority ?? 0,
        sort_order: 0,
        status: 'active',
        collapsed: false,
        group_id: parentTask?.group_id ?? null,
        board_tab: parentTask?.board_tab ?? (currentBoardTab || null),
        grid_x: snapX,
        grid_y: snapY,
      });
      history.push({ type: 'create', taskId: newNote.id, before: null, after: newNote });
      toast.success(`已将"${subtaskData?.title}"拖出为新便签`);
    }
    drag = null;
    await boardPage.render();
    return;
  }

  if (moved) {
    wasDragged = true;
    if (isMultiDrag) {
      for (const sid of selectedIds) {
        document.querySelector(`.note[data-id="${sid}"]`)?.classList.remove('note--dragging');
      }
      // Also remove dragging class from collapsed group
      const allTasks2 = store.get<TaskItem[]>('allTasks') ?? [];
      const firstNote2 = allTasks2.find(t => t.id === noteId);
      if (firstNote2?.group_id) {
        document.querySelector(`.note--group-node[data-group-id="${firstNote2.group_id}"]`)?.classList.remove('note--dragging');
      }
    } else {
      noteEl?.classList.remove('note--dragging');
    }
    boardPage.hideDye();
    const dockAction = boardPage.getDock(e.clientX, e.clientY);
    if (dockAction) {
      boardPage.doDock(noteId, dockAction);
    } else if (isMultiDrag) {
      // Save all selected note positions
      const updates: Promise<any>[] = [];
      const batchEntries: Array<{ taskId: string; before: Partial<TaskItem> | null; after: Partial<TaskItem> | null }> = [];
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const ddx = dx / canvasScale;
      const ddy = dy / canvasScale;
      for (const sid of selectedIds) {
        const orig = origPositions.get(sid);
        if (!orig) continue;
        // Calculate new position from original + delta (don't rely on DOM element which may be hidden)
        const snapX = utils.snapToGrid(Math.max(0, orig.x + ddx), GRID);
        const snapY = utils.snapToGrid(Math.max(0, orig.y + ddy), GRID);
        if (snapX !== orig.x || snapY !== orig.y) {
          batchEntries.push({ taskId: sid, before: { grid_x: orig.x, grid_y: orig.y }, after: { grid_x: snapX, grid_y: snapY } });
          updates.push(taskApi.update(sid, { grid_x: snapX, grid_y: snapY }));
        }
      }
      await Promise.all(updates);
      if (batchEntries.length > 0) {
        history.push({ type: 'batch', entries: batchEntries });
      }
      await boardPage.render();
    } else {
      const applied = dyeTarget !== null;
      const el2 = noteEl as HTMLElement | null;
      const curX = parseInt(el2?.style.left ?? '0');
      const curY = parseInt(el2?.style.top ?? '0');
      const snapX = utils.snapToGrid(Math.max(0, curX), GRID);
      const snapY = utils.snapToGrid(Math.max(0, curY), GRID);
      const fx = applied ? origGX : snapX;
      const fy = applied ? origGY : snapY;
      if (applied && el2) { el2.style.left = fx + 'px'; el2.style.top = fy + 'px'; }

      if (fx !== origGX || fy !== origGY) {
        history.push({ type: 'update', taskId: noteId, before: { grid_x: origGX, grid_y: origGY }, after: { grid_x: fx, grid_y: fy } });
        await taskApi.update(noteId, { grid_x: fx, grid_y: fy });
      }
      await boardPage.render();
    }
  } else {
    // Check if clicking on a collapsed group node
    if (drag.isGroupNode && drag.groupId) {
      collapsedGroups.delete(drag.groupId);
      await boardPage.render();
      drag = null;
      return;
    }
    // Click (not drag)
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const noteData = allTasks.find(t => t.id === noteId);
    const isNodeNote = noteData && noteData.node_mode === true;
    if (isNodeNote || openIds.has(noteId)) {
      // Node click = expand, open click = collapse
      if (openIds.has(noteId)) {
        // Save current open size before closing (to open_width/open_height, independent of node/preview size)
        const noteEl2 = document.querySelector(`.note[data-id="${noteId}"]`) as HTMLElement;
        if (noteEl2) {
          const w = noteEl2.offsetWidth;
          const h = noteEl2.offsetHeight;
          if (w > 0 && h > 0) {
            await taskApi.update(noteId, { open_width: w, open_height: h });
          }
        }
        openIds.delete(noteId);
      } else {
        openIds.add(noteId);
      }
    } else {
      // Preview click = toggle open
      if (openIds.has(noteId)) {
        // Save current open size before closing
        const noteEl2 = document.querySelector(`.note[data-id="${noteId}"]`) as HTMLElement;
        if (noteEl2) {
          const w = noteEl2.offsetWidth;
          const h = noteEl2.offsetHeight;
          if (w > 0 && h > 0) {
            await taskApi.update(noteId, { open_width: w, open_height: h });
          }
        }
        openIds.delete(noteId);
      } else {
        openIds.add(noteId);
      }
    }
    await boardPage.render();
  }
  drag = null;
}

function onResizeMove(e: PointerEvent) {
  if (!resizeInfo) return;
  const dx = e.clientX - resizeInfo.startX;
  const dy = e.clientY - resizeInfo.startY;
  resizeInfo.pendingW = Math.max(40, resizeInfo.startW + dx);
  resizeInfo.pendingH = Math.max(36, resizeInfo.startH + dy);
  if (resizeInfo.rafId) return;
  resizeInfo.rafId = requestAnimationFrame(() => {
    if (!resizeInfo) return;
    const { noteEl, scrollEl, pendingW, pendingH } = resizeInfo;
    noteEl.style.width = pendingW + 'px';
    noteEl.style.height = pendingH + 'px';
    if (scrollEl) {
      scrollEl.style.maxHeight = (pendingH - 40) + 'px';
      scrollEl.style.overflowY = 'auto';
    }
    const notes = store.get<TaskItem[]>('boardNotes') ?? [];
    const cats = store.get<Category[]>('categories') ?? [];
    const conns = store.get<Connection[]>('connections') ?? [];
    boardPage.renderConnections(notes, cats, conns);
    resizeInfo.rafId = 0;
  });
}

async function onResizeUp(_e: PointerEvent) {
  document.removeEventListener('pointermove', onResizeMove);
  document.removeEventListener('pointerup', onResizeUp);
  if (!resizeInfo) return;
  const { noteId, noteEl, rafId } = resizeInfo;
  if (rafId) cancelAnimationFrame(rafId);
  noteEl.style.willChange = '';
  const w = noteEl.offsetWidth;
  const h = noteEl.offsetHeight;
  // Save to open_width/open_height if note is open, note_width/note_height if preview
  if (openIds.has(noteId)) {
    await taskApi.update(noteId, { open_width: w, open_height: h });
  } else {
    await taskApi.update(noteId, { note_width: w, note_height: h });
  }
  resizeInfo = null;
}

function onConnMove(e: PointerEvent) {
  if (!connDraw) return;
  const svg = document.getElementById('connSvg');
  if (!svg) return;
  const canvas = document.getElementById('bCanvas')?.getBoundingClientRect();
  if (!canvas) return;
  const mx = (e.clientX - canvas.left) / canvasScale;
  const my = (e.clientY - canvas.top) / canvasScale;
  let existing = svg.querySelector('.note__conn-draw') as SVGPathElement | null;
  if (!existing) {
    existing = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    existing.classList.add('note__conn-draw');
    existing.setAttribute('fill', 'none');
    existing.setAttribute('stroke', 'var(--color-primary)');
    existing.setAttribute('stroke-width', '2');
    existing.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(existing);
  }
  existing.setAttribute('d', bezier(connDraw.startX, connDraw.startY, mx, my));
}

async function onConnUp(e: PointerEvent) {
  document.removeEventListener('pointermove', onConnMove);
  document.removeEventListener('pointerup', onConnUp);
  document.querySelector('.note__conn-draw')?.remove();
  if (!connDraw) return;
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const port = (target as HTMLElement)?.closest('.note__port') as HTMLElement | null;
  if (port) {
    const portType = port.dataset.port;
    const portId = port.dataset.id!;
    if (portType === 'in' && portId !== connDraw.fromId) {
      await boardPage.createConnection(connDraw.fromId, portId);
    } else if (portType === 'out' && portId !== connDraw.fromId) {
      await boardPage.createConnection(portId, connDraw.fromId);
    }
  }
  connDraw = null;
}

function toggleDock(action: string) {
  dockPanel = dockPanel === action ? null : action;
  renderDockEl();
}

async function renderDockEl() {
  document.querySelector('.board-dock-panel')?.remove();
  if (!dockPanel) return;
  const all = await taskApi.list();
  let filtered: TaskItem[] = [];
  let title = '';
  switch (dockPanel) {
    case 'trashed': filtered = all.filter(t => t.status === 'trashed'); title = '回收站'; break;
    case 'shelved': filtered = all.filter(t => t.status === 'shelved'); title = '收纳盒'; break;
    case 'completed': filtered = all.filter(t => t.status === 'completed'); title = '陈列柜'; break;
  }
  const p = document.createElement('div');
  p.className = 'board-dock-panel';
  let h = `<div class="board-dock-panel__title">${title}</div>`;
  if (filtered.length === 0) h += `<div style="font-size:var(--text-xs);color:var(--text-lighter);padding:var(--space-2)">暂无内容</div>`;
  else filtered.forEach(t => { h += `<div class="board-dock-panel__item"><span>${utils.escapeHtml(t.title)}</span><button class="board-dock-panel__restore" data-id="${t.id}">恢复</button></div>`; });
  p.innerHTML = h;
  document.body.appendChild(p);
  initIcons();
  p.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest('.board-dock-panel__restore') as HTMLElement | null;
    if (!btn) return;
    const id = btn.dataset.id!;
    await boardPage.restoreNote(id);
    dockPanel = null;
    renderDockEl();
  });
  setTimeout(() => { document.addEventListener('click', function h(evt) { if (!p.contains(evt.target as Node)) { p.remove(); dockPanel = null; document.removeEventListener('click', h); } }); }, 0);
}

function onBoxSelectMove(e: PointerEvent) {
  if (!boxSelect) return;
  const canvas = document.getElementById('bCanvas');
  if (!canvas) return;
  const curPos = screenToCanvas(e.clientX, e.clientY);
  const x = Math.min(boxSelect.startX, curPos.x);
  const y = Math.min(boxSelect.startY, curPos.y);
  const w = Math.abs(curPos.x - boxSelect.startX);
  const h = Math.abs(curPos.y - boxSelect.startY);
  boxSelect.el.style.left = x + 'px';
  boxSelect.el.style.top = y + 'px';
  boxSelect.el.style.width = w + 'px';
  boxSelect.el.style.height = h + 'px';

  const selRect = { left: x, top: y, right: x + w, bottom: y + h };
  canvas.querySelectorAll('.note').forEach(noteEl => {
    const ne = noteEl as HTMLElement;
    const nl = parseInt(ne.style.left);
    const nt = parseInt(ne.style.top);
    const nr = nl + ne.offsetWidth;
    const nb = nt + ne.offsetHeight;
    const overlap = nl < selRect.right && nr > selRect.left && nt < selRect.bottom && nb > selRect.top;
    const id = ne.dataset.id!;
    if (overlap) selectedIds.add(id); else selectedIds.delete(id);
  });
  canvas.querySelectorAll('.note').forEach(noteEl => {
    const ne = noteEl as HTMLElement;
    if (selectedIds.has(ne.dataset.id!)) {
      ne.classList.add('note--selected');
    } else {
      ne.classList.remove('note--selected');
    }
  });
}

function onBoxSelectUp(_e: PointerEvent) {
  document.removeEventListener('pointermove', onBoxSelectMove);
  document.removeEventListener('pointerup', onBoxSelectUp);
  if (boxSelect) {
    boxSelect.el.remove();
    boxSelect = null;
  }
  // Just select, don't auto-group. Grouping is via right-click menu.
}
