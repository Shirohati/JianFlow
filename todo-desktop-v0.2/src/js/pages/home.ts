import { store } from '../store';
import { router } from '../router';
import { taskApi, categoryApi, dailyLogApi, settingsApi, timeRecordApi } from '../api';
import { utils } from '../utils';
import { initIcons } from '../icons';
import { toast } from '../components/toast';
import type { TaskItem, Category } from '../api';

function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}

const debounceSaveLog = utils.debounce(() => {
  const textarea = document.querySelector('.home-daily-log') as HTMLTextAreaElement | null;
  const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
  if (textarea && currentDate) {
    dailyLogApi.set(currentDate, textarea.value);
  }
}, 300);

const GRID = 20;
const DRAG_TH = 3;

interface HomeDragInfo {
  noteId: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  origHX: number;
  origHY: number;
  moved: boolean;
}

let homeDrag: HomeDragInfo | null = null;
let homeResizeInfo: { noteId: string; startX: number; startY: number; startW: number; startH: number; noteEl: HTMLElement; bodyEl: HTMLElement | null; rafId: number; pendingW: number; pendingH: number } | null = null;
let homeOpenIds = new Set<string>();
let homeZCounter = 50;

export const homePage = {
  async init(): Promise<void> {
    const inner = document.querySelector('#page-home .page__inner');
    if (!inner) return;
    const categories = await categoryApi.list();
    store.set('categories', categories);
    const settings = await settingsApi.get();
    store.set('settings', settings);
    homePage.renderSkeleton(inner);
    homePage.bindGlobalEvents();
    await homePage.render();
  },

  async migrateUncompleted(): Promise<void> {
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    const today = utils.getTodayStr();
    if (currentDate !== today) {
      toast.info('只能在今日页面迁移昨日待办');
      return;
    }
    const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return utils.formatDate(d); })();
    const allTasks = await taskApi.listAll();
    const yesterdayPending = allTasks.filter(t =>
      t.todo_date === yesterday && t.todo_status === 'pending' && t.status === 'active' && t.sub_type === 'task'
    );
    if (yesterdayPending.length === 0) {
      toast.info('昨日没有未完成的待办');
      return;
    }
    const todayTasks = allTasks.filter(t => t.todo_date === today && t.sub_type === 'task');
    const todayTexts = new Set(todayTasks.map(t => t.title));
    let migrated = 0;
    for (const t of yesterdayPending) {
      if (todayTexts.has(t.title)) continue;
      // Copy (not move): create a new task for today, keep the original unchanged
      await taskApi.create({
        type: t.type,
        sub_type: t.sub_type,
        title: t.title,
        content: t.content ?? '',
        category_id: t.category_id,
        priority: t.priority,
        sort_order: t.sort_order,
        status: 'active',
        collapsed: false,
        todo_date: today,
        todo_status: 'pending',
        parent_id: t.parent_id,
        recurrence: t.recurrence,
      });
      migrated++;
    }
    if (migrated > 0) {
      toast.info(`已复制 ${migrated} 条昨日未完成待办到今日`);
      await homePage.render();
    } else {
      toast.info('昨日未完成待办已在今日存在，无需迁移');
    }
  },

  renderSkeleton(container: Element): void {
    container.innerHTML = `
      <div class="home-date-nav">
        <button class="btn btn--icon home-prev-btn" title="前一天">${icon('chevron-left')}</button>
        <div class="home-date-center">
          <span class="home-date-text home-date-clickable"></span>
          <button class="btn btn--primary btn--sm home-today-btn">${icon('calendar-dot', 'size="14"')} 回到今日</button>
        </div>
        <button class="btn btn--icon home-next-btn" title="后一天">${icon('chevron-right')}</button>
        <div class="home-stats-badge">
          ${icon('list-checks', 'size="14"')} <span class="home-stats-done">0</span>/<span class="home-stats-total">0</span>
        </div>
        <div class="home-time-badge">
          ${icon('clock', 'size="14"')} <span class="home-time-total">0m</span>
        </div>
        <button class="btn btn--ghost btn--sm home-pin-add-btn">${icon('pin', 'size="14"')} 贴附便签</button>
        <button class="btn btn--ghost btn--sm home-migrate-btn" title="复制昨日未完成待办到今日">${icon('copy', 'size="14"')} 迁移昨日待办</button>
      </div>

      <div class="home-layout">
        <div class="home-main">
          <div class="home-section-header">
            <h3 class="home-section-title">${icon('list-todo', 'size="16"')} 待办事项</h3>
        <span class="home-task-count-badge" id="homeTaskCountBadge">0</span>
      </div>

      <div class="home-add-area">
        <input class="input home-add-input" placeholder="添加新待办..." />
        <select class="input input--sm task-rec-select">
          <option value="">不重复</option>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
        </select>
        <button class="btn btn--primary home-add-btn" title="添加">${icon('plus', 'size="18"')}</button>
      </div>

      <div class="home-task-list"></div>

      <div class="fold-panel fold-panel--open" id="dailyLogPanel">
        <div class="fold-panel__header">
          ${icon('book-open', 'size="16"')} <span>每日日志</span>
          ${icon('chevron-down', 'size="16"')}
        </div>
        <div class="fold-panel__body">
          <textarea class="input home-daily-log" placeholder="记录今天..."></textarea>
        </div>
      </div>
        </div>

        <div class="home-sidebar">
          <div class="home-sidebar__header">
            <span class="home-sidebar__title">${icon('calendar-clock', 'size="14"')} 日程</span>
            <div class="home-sidebar__actions">
              <button class="btn btn--ghost btn--sm home-schedule-template-btn" title="应用模板">${icon('layout-template', 'size="12"')}</button>
              <button class="btn btn--ghost btn--sm home-schedule-add-btn" title="添加日程">${icon('plus', 'size="12"')}</button>
            </div>
          </div>
          <div class="home-timeline-rail">
            <div class="home-timeline-grid"></div>
          </div>
        </div>
      </div>
    `;
  },

  bindGlobalEvents(): void {
    const container = document.querySelector('#page-home .page__inner');
    if (!container) return;

    container.querySelector('.home-prev-btn')?.addEventListener('click', () => homePage.goPrevDay());
    container.querySelector('.home-next-btn')?.addEventListener('click', () => homePage.goNextDay());
    container.querySelector('.home-today-btn')?.addEventListener('click', () => homePage.goToToday());
    container.querySelector('.home-pin-add-btn')?.addEventListener('click', () => homePage.showPinSelector());
    container.querySelector('.home-migrate-btn')?.addEventListener('click', () => homePage.migrateUncompleted());
    container.querySelector('.home-schedule-add-btn')?.addEventListener('click', () => homePage.showScheduleForm());
    container.querySelector('.home-schedule-template-btn')?.addEventListener('click', () => homePage.showTemplateManager());

    const addInput = container.querySelector('.home-add-input') as HTMLInputElement | null;
    const addBtn = container.querySelector('.home-add-btn');
    if (addBtn && addInput) {
      addBtn.addEventListener('click', () => {
        const text = addInput.value.trim();
        const recSelect = container.querySelector('.task-rec-select') as HTMLSelectElement | null;
        const recurrence = recSelect?.value || undefined;
        if (text) { homePage.addTodo(text, recurrence); addInput.value = ''; if (recSelect) recSelect.value = ''; }
      });
      addInput.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') {
          const text = addInput.value.trim();
          const recSelect = container.querySelector('.task-rec-select') as HTMLSelectElement | null;
          const recurrence = recSelect?.value || undefined;
          if (text) { homePage.addTodo(text, recurrence); addInput.value = ''; if (recSelect) recSelect.value = ''; }
        }
      });
    }

    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const foldHeader = target.closest('.fold-panel__header') as HTMLElement | null;
      if (foldHeader) { foldHeader.closest('.fold-panel')?.classList.toggle('fold-panel--open'); return; }
      const toggleBtn = target.closest('.task-toggle') as HTMLElement | null;
      if (toggleBtn) { homePage.toggleTodo(toggleBtn.dataset.id!); return; }
      const deleteBtn = target.closest('.task-delete') as HTMLElement | null;
      if (deleteBtn) {
        const id = deleteBtn.dataset.id!;
        const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
        const task = allTasks.find(t => t.id === id);
        if (task?.recurrence) {
          homePage.showRecurringTaskMenu(id, e);
        } else {
          homePage.deleteTodo(id);
        }
        return;
      }
      const sourceLink = target.closest('.task-source-link') as HTMLElement | null;
      if (sourceLink) { const parentId = sourceLink.dataset.parentId; if (parentId) { store.set('boardOpenNoteId', parentId); router.navigate('board'); } return; }
      const attachBtn = target.closest('.task-attach-btn') as HTMLElement | null;
      if (attachBtn) { homePage.showAttachSelector(attachBtn.dataset.id!); return; }
      const todoTitleEl = target.closest('[data-field="todo-title"]') as HTMLElement | null;
      if (todoTitleEl) { homePage.startEditTodo(todoTitleEl.dataset.taskId!); return; }
      const dateText = target.closest('.home-date-clickable') as HTMLElement | null;
      if (dateText) { homePage.showMiniCalendar(); return; }
    });

    const page = document.getElementById('page-home');
    if (page) {
      page.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const pinRemoveBtn = target.closest('.home-note__unpin') as HTMLElement | null;
        if (pinRemoveBtn) { homePage.removePin(pinRemoveBtn.dataset.id!); return; }
        const jumpBtn = target.closest('.home-note__jump') as HTMLElement | null;
        if (jumpBtn) { store.set('boardOpenNoteId', jumpBtn.dataset.id!); router.navigate('board'); return; }
        const titleEl = target.closest('[data-field="title"]') as HTMLElement | null;
        if (titleEl) { const n = titleEl.closest('.home-note') as HTMLElement; if (n && homeOpenIds.has(n.dataset.id!)) { homePage.startEdit(n.dataset.id!, 'title'); return; } }
        const contentEl = target.closest('[data-field="content"]') as HTMLElement | null;
        if (contentEl) { const n = contentEl.closest('.home-note') as HTMLElement; if (n && homeOpenIds.has(n.dataset.id!)) { homePage.startEdit(n.dataset.id!, 'content'); return; } }
        const subtaskToggle = target.closest('.home-note__subtask-toggle') as HTMLElement | null;
        if (subtaskToggle) { homePage.toggleSubtask(subtaskToggle.dataset.id!); return; }
      });

      page.addEventListener('contextmenu', ((e: Event) => {
        const me = e as MouseEvent;
        const noteEl = (me.target as HTMLElement).closest('.home-note--floating') as HTMLElement | null;
        if (noteEl) {
          me.preventDefault();
          homePage.showPinContextMenu(noteEl.dataset.id!, me);
        } else if (!(me.target as HTMLElement).closest('.home-date-nav, .home-task-list, .home-add-area, .fold-panel, button, input, select, textarea')) {
          me.preventDefault();
          homePage.showEmptySpaceContextMenu(me);
        }
      }) as EventListener);
    }

    const dailyLog = container.querySelector('.home-daily-log') as HTMLTextAreaElement | null;
    if (dailyLog) dailyLog.addEventListener('input', () => debounceSaveLog());

    window.addEventListener('resize', () => homePage.onWindowResize());
  },

  onWindowResize(): void {
    const page = document.getElementById('page-home');
    if (!page) return;
    const pw = page.clientWidth;
    const ph = page.clientHeight;
    document.querySelectorAll('.home-note--floating').forEach(el => {
      const noteEl = el as HTMLElement;
      const x = parseInt(noteEl.style.left);
      const y = parseInt(noteEl.style.top);
      const nw = noteEl.offsetWidth;
      const nh = noteEl.offsetHeight;
      const cx = Math.min(x, Math.max(0, pw - nw));
      const cy = Math.min(y, Math.max(0, ph - nh));
      noteEl.style.left = cx + 'px';
      noteEl.style.top = cy + 'px';
    });
  },

  async render(): Promise<void> {
    homePage.saveAllEdits();
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    homePage.renderDateNav(currentDate);
    await taskApi.generateRecurring(currentDate);
    const tasks = await taskApi.list({ todo_date: currentDate, status: 'active' });
    store.set('tasks', tasks);
    const allTasks = await taskApi.list({ status: 'active' });
    store.set('allTasks', allTasks);
    homePage.renderPinnedNotes(allTasks);
    homePage.renderTimeline(tasks, allTasks);
    homePage.renderTaskList(tasks, allTasks);
    homePage.renderStats(tasks);
    // Load time records for current date
    const timeRecords = await timeRecordApi.list(currentDate);
    store.set('timeRecords', timeRecords);
    homePage.renderStats(tasks);
    const log = await dailyLogApi.get(currentDate);
    const logTextarea = document.querySelector('.home-daily-log') as HTMLTextAreaElement | null;
    if (logTextarea) logTextarea.value = log || '';
    initIcons();
  },

  saveAllEdits(): void {
    const editables = document.querySelectorAll('#page-home [contenteditable="true"]');
    editables.forEach(el => {
      const fieldEl = el as HTMLElement;
      const noteEl = fieldEl.closest('.home-note') as HTMLElement | null;
      if (!noteEl) return;
      const noteId = noteEl.dataset.id;
      const field = fieldEl.dataset.field;
      if (!noteId || !field) return;
      const nv = fieldEl.innerText?.trim() ?? '';
      const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
      const tk = allTasks.find(t => t.id === noteId);
      if (!tk) return;
      const ov = (tk as any)[field] ?? '';
      if (nv !== ov) {
        taskApi.update(noteId, { [field]: nv });
        (tk as any)[field] = nv;
      }
      fieldEl.contentEditable = 'false';
      fieldEl.classList.remove(field === 'title' ? 'home-note__title--editing' : 'home-note__content--editing');
    });
  },

  renderPinnedNotes(allTasks: TaskItem[]): void {
    const existingPositions: Record<string, { left: number; top: number; zIndex: string }> = {};
    document.querySelectorAll('.home-note--floating').forEach(el => {
      const noteEl = el as HTMLElement;
      const id = noteEl.dataset.id;
      if (id) {
        existingPositions[id] = {
          left: parseInt(noteEl.style.left),
          top: parseInt(noteEl.style.top),
          zIndex: noteEl.style.zIndex,
        };
      }
    });
    document.querySelectorAll('.home-note--floating').forEach(el => el.remove());
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    const cats = store.get<Category[]>('categories') ?? [];
    const pins = allTasks.filter(t =>
      t.sub_type !== 'task' && (t.pin_date === currentDate || t.pin_date === 'longterm') && t.status === 'active'
    );
    if (pins.length === 0) return;
    const page = document.getElementById('page-home');
    if (!page) return;
    const pw = page.clientWidth;
    const ph = page.clientHeight;

    const unpositioned = pins.filter(p => p.home_x === null || p.home_y === null);
    if (unpositioned.length > 0) {
      const colW = 210;
      const sp = 16;
      const cols = Math.max(1, Math.floor(pw / (colW + sp)));
      let maxRow = 0;
      const positioned = pins.filter(p => p.home_x !== null && p.home_y !== null);
      positioned.forEach(p => {
        const row = Math.floor((p.home_y ?? 0) / (80 + sp));
        if (row > maxRow) maxRow = row;
      });
      const startRow = maxRow + 1;
      unpositioned.forEach((p, i) => {
        const col = i % cols;
        const row = startRow + Math.floor(i / cols);
        const x = utils.snapToGrid(col * (colW + sp) + 10, GRID);
        const y = utils.snapToGrid(row * (80 + sp) + 10, GRID);
        taskApi.update(p.id, { home_x: x, home_y: y });
        p.home_x = x;
        p.home_y = y;
      });
    }

    pins.forEach(n => {
      const cat = cats.find(c => c.id === n.category_id);
      const cc = cat ? cat.color : '#8e8e8e';
      const isOpen = homeOpenIds.has(n.id);
      const prog = n.type === 'plan' ? homePage.calcProgress(n.id, allTasks) : null;
      const saved = existingPositions[n.id];
      let x: number, y: number, zIdx: number;
      if (saved) {
        x = saved.left;
        y = saved.top;
        zIdx = parseInt(saved.zIndex);
        if (isOpen && zIdx <= homeZCounter) {
          zIdx = ++homeZCounter;
        }
      } else {
        x = Math.min(n.home_x ?? 10, Math.max(0, pw - 200));
        y = Math.min(n.home_y ?? 10, Math.max(0, ph - 60));
        zIdx = isOpen ? ++homeZCounter : 50;
      }
      const isLongterm = n.pin_date === 'longterm';
      const wStyle = isOpen ? (n.open_width ? `width:${n.open_width}px;` : 'width:280px;') : (n.note_width ? `width:${n.note_width}px;` : '');
      const hStyle = isOpen ? (n.open_height ? `max-height:${n.open_height}px;overflow-y:auto;` : '') : (n.note_height ? `max-height:${n.note_height}px;overflow-y:auto;` : '');

      const el = document.createElement('div');
      el.className = `home-note home-note--floating ${isOpen ? 'home-note--open' : 'home-note--preview'}`;
      el.dataset.id = n.id;
      el.style.cssText = `left:${x}px;top:${y}px;--note-color:${cc};z-index:${zIdx};${wStyle}`;

      let inner = `<div class="home-note__header">`;
      inner += `<span class="home-note__type-badge home-note__type-badge--${n.type}">${n.type === 'plan' ? '计划' : '便签'}</span>`;
      if (isLongterm) inner += `<span class="home-note__pin-label">${icon('pin', 'size="10"')} 长期</span>`;
      inner += `<button class="home-note__jump" data-id="${n.id}" title="跳转到目标板">${icon('external-link', 'size="12"')}</button>`;
      inner += `<button class="home-note__unpin" data-id="${n.id}" title="取消贴附">${icon('x', 'size="12"')}</button>`;
      inner += `</div>`;

      inner += `<span class="home-note__title" data-field="title">${utils.escapeHtml(n.title)}</span>`;

      if (!isOpen && n.content) {
        inner += `<span class="home-note__content-preview">${utils.escapeHtml(n.content.slice(0, 40)).replace(/\n/g, ' ')}${n.content.length > 40 ? '…' : ''}</span>`;
      }

      if (!isOpen && prog && prog.total > 0) {
        const pct = Math.round((prog.done / prog.total) * 100);
        inner += `<div class="home-note__progress-mini"><div class="home-note__progress-track"><div class="home-note__progress-fill" style="width:${pct}%"></div></div><span>${prog.done}/${prog.total}</span></div>`;
      }

      if (!isOpen) {
        let tooltipHtml = '';
        if (n.content) {
          tooltipHtml += `<div class="home-note__tooltip-content">${utils.escapeHtml(n.content.slice(0, 200)).replace(/\n/g, '<br>')}</div>`;
        }
        if (n.type === 'plan') {
          const subTasks = allTasks.filter(t => t.parent_id === n.id && t.sub_type === 'task');
          if (subTasks.length > 0) {
            tooltipHtml += `<div class="home-note__tooltip-tasks">`;
            subTasks.forEach(t => {
              const done = t.todo_status === 'completed';
              tooltipHtml += `<div class="home-note__tooltip-task ${done ? 'home-note__tooltip-task--done' : ''}">${done ? '✓' : '○'} ${utils.escapeHtml(t.title)}</div>`;
            });
            tooltipHtml += `</div>`;
          }
        }
        if (tooltipHtml) {
          inner += `<div class="home-note__tooltip">${tooltipHtml}</div>`;
        }
      }

      if (isOpen) {
        inner += `<div class="home-note__open-body" style="${hStyle}">`;
        inner += `<div class="home-note__content" data-field="content">${n.content ? utils.escapeHtml(n.content).replace(/\n/g, '<br>') : '<span style="color:var(--text-lighter)">点击编辑内容…</span>'}</div>`;
        if (n.type === 'plan') {
          const subTasks = allTasks.filter(t => t.parent_id === n.id && t.sub_type === 'task');
          if (subTasks.length > 0) {
            inner += `<div class="home-note__subtasks">`;
            subTasks.forEach(t => {
              const done = t.todo_status === 'completed';
              inner += `<div class="home-note__subtask" data-id="${t.id}">
                <button class="home-note__subtask-toggle" data-id="${t.id}">${done ? icon('check-square', 'size="14"') : icon('square', 'size="14"')}</button>
                <span class="home-note__subtask-text ${done ? 'home-note__subtask-text--done' : ''}">${utils.escapeHtml(t.title)}</span>
              </div>`;
            });
            inner += `</div>`;
          }
        }
        inner += `</div>`;
      }

      inner += `<div class="note__resize-handle" data-id="${n.id}"></div>`;

      el.innerHTML = inner;
      page.appendChild(el);
    });

    homePage.bindFloatingNotes();
    initIcons();
  },

  showEmptySpaceContextMenu(e: MouseEvent): void {
    document.querySelector('.pin-ctx-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'pin-ctx-menu sort-picker';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <button class="sort-picker__item" data-a="createNote">${icon('sticky-note')} 创建便签</button>
    `;
    document.body.appendChild(menu);
    initIcons();

    const clickX = e.clientX;
    const clickY = e.clientY;
    const close = () => menu.remove();
    menu.addEventListener('click', async (ev) => {
      const btn = (ev.target as HTMLElement).closest('.sort-picker__item') as HTMLElement | null;
      if (!btn) return;
      const a = btn.dataset.a;
      close();
      if (a === 'createNote') {
        const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
        const page = document.getElementById('page-home');
        const pr = page?.getBoundingClientRect();
        const x = pr ? utils.snapToGrid(clickX - pr.left, GRID) : 10;
        const y = pr ? utils.snapToGrid(clickY - pr.top, GRID) : 10;
        const c = await taskApi.create({
          type: 'note',
          sub_type: 'note',
          title: '新便签',
          content: '',
          category_id: 'cat_default',
          priority: 0,
          sort_order: 0,
          status: 'active',
          collapsed: false,
          pin_date: currentDate,
          home_x: x,
          home_y: y,
        });
        homeOpenIds.add(c.id);
        toast.success('便签已创建');
        await homePage.render();
      }
    });
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!menu.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  showPinContextMenu(noteId: string, e: MouseEvent): void {
    document.querySelector('.pin-ctx-menu')?.remove();
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const note = allTasks.find(t => t.id === noteId);
    if (!note) return;
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    const isLongterm = note.pin_date === 'longterm';

    const menu = document.createElement('div');
    menu.className = 'pin-ctx-menu sort-picker';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      ${isLongterm ? `<button class="sort-picker__item" data-a="toDaily">${icon('calendar-day')} 改为今日贴附</button>` : `<button class="sort-picker__item" data-a="toLongterm">${icon('pin')} 改为长期贴附</button>`}
      <button class="sort-picker__item" data-a="toBoard">${icon('layout-grid')} 转为目标板便签</button>
      <button class="sort-picker__item" data-a="unpin">${icon('x')} 取消贴附</button>
    `;
    document.body.appendChild(menu);
    initIcons();

    const close = () => menu.remove();
    menu.addEventListener('click', async (ev) => {
      const btn = (ev.target as HTMLElement).closest('.sort-picker__item') as HTMLElement | null;
      if (!btn) return;
      const a = btn.dataset.a;
      close();
      if (a === 'toDaily') {
        await taskApi.update(noteId, { pin_date: currentDate });
        toast.success('已改为今日贴附');
      } else if (a === 'toLongterm') {
        await taskApi.update(noteId, { pin_date: 'longterm' });
        toast.success('已改为长期贴附');
      } else if (a === 'toBoard') {
        await taskApi.update(noteId, { pin_date: null, home_x: null, home_y: null });
        homeOpenIds.delete(noteId);
        toast.success('已转为目标板便签');
      } else if (a === 'unpin') {
        await taskApi.update(noteId, { pin_date: null, home_x: null, home_y: null });
        homeOpenIds.delete(noteId);
        toast.info('已取消贴附');
      }
      await homePage.render();
    });
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!menu.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  bindFloatingNotes(): void {
    document.querySelectorAll('.home-note--floating').forEach(noteEl => {
      noteEl.addEventListener('pointerdown', ((e: Event) => {
        const pe = e as PointerEvent;
        const target = e.target as HTMLElement;

        const resizeHandle = target.closest('.note__resize-handle') as HTMLElement | null;
        if (resizeHandle) {
          e.preventDefault();
          e.stopPropagation();
          const noteId = (noteEl as HTMLElement).dataset.id!;
          const nel = noteEl as HTMLElement;
          const bodyEl = nel.querySelector('.home-note__open-body') as HTMLElement | null;
          nel.style.willChange = 'width, height';
          homeResizeInfo = {
            noteId,
            startX: pe.clientX,
            startY: pe.clientY,
            startW: nel.offsetWidth,
            startH: nel.offsetHeight,
            noteEl: nel,
            bodyEl,
            rafId: 0,
            pendingW: nel.offsetWidth,
            pendingH: nel.offsetHeight,
          };
          document.addEventListener('pointermove', onHomeResizeMove);
          document.addEventListener('pointerup', onHomeResizeUp);
          return;
        }

        const isEditable = target.closest('[contenteditable="true"]');
        if (isEditable) return;
        const isAction = target.closest('.home-note__unpin, .home-note__jump, button, input');
        if (isAction) return;
        const isField = target.closest('[data-field]');
        if (isField && homeOpenIds.has((noteEl as HTMLElement).dataset.id!)) return;

        const noteId = (noteEl as HTMLElement).dataset.id!;
        pe.preventDefault();

        const zIdx = parseInt((noteEl as HTMLElement).style.zIndex ?? '50');
        if (zIdx <= homeZCounter) {
          (noteEl as HTMLElement).style.zIndex = String(++homeZCounter);
        }

        const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
        const note = allTasks.find(t => t.id === noteId);
        const rect = (noteEl as HTMLElement).getBoundingClientRect();

        homeDrag = {
          noteId,
          startX: pe.clientX,
          startY: pe.clientY,
          offsetX: pe.clientX - rect.left,
          offsetY: pe.clientY - rect.top,
          origHX: note?.home_x ?? 0,
          origHY: note?.home_y ?? 0,
          moved: false,
        };

        document.addEventListener('pointermove', onHomeDragMove);
        document.addEventListener('pointerup', onHomeDragUp);
      }) as EventListener);
    });
  },

  startEdit(noteId: string, field: string): void {
    const el = document.querySelector(`.home-note[data-id="${noteId}"] [data-field="${field}"]`) as HTMLElement | null;
    if (!el) return;
    const t = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === noteId);
    if (t) el.innerText = (t as any)[field] ?? '';
    el.contentEditable = 'true';
    el.classList.add(field === 'title' ? 'home-note__title--editing' : 'home-note__content--editing');
    el.focus();
    const rng = document.createRange();
    rng.selectNodeContents(el);
    rng.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(rng);
    let saved = false;
    const cleanup = () => { el.contentEditable = 'false'; el.classList.remove(field === 'title' ? 'home-note__title--editing' : 'home-note__content--editing'); };
    const save = async () => {
      if (saved) return;
      saved = true;
      const nv = el.innerText?.trim() ?? '';
      cleanup();
      const tk = (store.get<TaskItem[]>('allTasks') ?? []).find(t => t.id === noteId);
      if (!tk) return;
      const ov = (tk as any)[field] ?? '';
      if (nv !== ov) {
        await taskApi.update(noteId, { [field]: nv });
      }
    };
    const blurH = () => { save(); el.removeEventListener('blur', blurH); };
    el.addEventListener('keydown', function h(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); saved = true; cleanup(); el.removeEventListener('keydown', h); el.removeEventListener('blur', blurH); }
    });
    el.addEventListener('blur', blurH);
  },

  calcProgress(noteId: string, allTasks: TaskItem[]): { done: number; total: number } {
    const subTasks = allTasks.filter(t => t.parent_id === noteId && t.sub_type === 'task');
    return { done: subTasks.filter(t => t.todo_status === 'completed').length, total: subTasks.length };
  },

  renderDateNav(dateStr: string): void {
    const textEl = document.querySelector('.home-date-text');
    if (textEl) textEl.textContent = utils.formatDateDisplay(dateStr);
    const todayBtn = document.querySelector('.home-today-btn') as HTMLElement | null;
    if (todayBtn) {
      const isToday = dateStr === utils.getTodayStr();
      todayBtn.style.display = isToday ? 'none' : '';
      if (!isToday) todayBtn.classList.add('btn--primary'); else todayBtn.classList.remove('btn--primary');
    }
  },

  renderStats(tasks: TaskItem[]): void {
    const total = tasks.length;
    const done = tasks.filter(t => t.todo_status === 'completed').length;
    const doneEl = document.querySelector('.home-stats-done');
    const totalEl = document.querySelector('.home-stats-total');
    if (doneEl) doneEl.textContent = String(done);
    if (totalEl) totalEl.textContent = String(total);
    const badge = document.getElementById('homeTaskCountBadge');
    if (badge) { const pending = total - done; badge.textContent = String(pending); badge.style.display = pending > 0 ? '' : 'none'; }

    // Daily time
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    const records = store.get<any[]>('timeRecords') ?? [];
    const dayMinutes = records.filter(r => r.date === currentDate).reduce((s, r) => s + (r.total_minutes || 0), 0);
    const timeEl = document.querySelector('.home-time-total');
    if (timeEl) {
      const h = Math.floor(dayMinutes / 60);
      const m = dayMinutes % 60;
      timeEl.textContent = h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`;
    }
  },

  renderTaskList(tasks: TaskItem[], allTasks: TaskItem[]): void {
    const el = document.querySelector('.home-task-list');
    if (!el) return;
    const categories = store.get<Category[]>('categories') ?? [];
    const todoTasks = tasks.filter(t => t.sub_type !== 'schedule');
    const pending = todoTasks.filter(t => t.todo_status !== 'completed');
    const completed = todoTasks.filter(t => t.todo_status === 'completed');
    const all = [...pending, ...completed];
    if (all.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state__icon">${icon('inbox', 'size="48"')}</div><p class="empty-state__text">今天还没有待办，添加一个吧</p></div>`;
      return;
    }
    let html = '';
    if (pending.length > 0) html += pending.map(t => homePage.renderTaskItem(t, allTasks, categories)).join('');
    if (completed.length > 0) {
      html += `<div class="home-completed-header">${icon('check-circle-2', 'size="14"')} 已完成 (${completed.length})</div>`;
      html += completed.map(t => homePage.renderTaskItem(t, allTasks, categories)).join('');
    }
    el.innerHTML = html;
  },

  renderTaskItem(t: TaskItem, allTasks: TaskItem[], categories: Category[]): string {
    const isCompleted = t.todo_status === 'completed';
    const isRecurring = t.recurrence !== null && t.recurrence !== undefined;
    const cat = categories.find(c => c.id === t.category_id);
    const catName = cat ? cat.name : '';
    const catColor = cat ? cat.color : '#8e8e8e';
    const parentTask = t.parent_id ? allTasks.find(p => p.id === t.parent_id) : null;
    const parentName = parentTask ? parentTask.title : '';
    const hasParent = !!t.parent_id;
    const scheduleLabel = t.schedule_start ? `${t.schedule_start}${t.schedule_end ? '-' + t.schedule_end : ''}` : '';
    return `
    <div class="task-item ${isCompleted ? 'task-completed' : ''}" data-id="${t.id}">
      <button class="task-toggle" data-id="${t.id}">
        ${isCompleted ? icon('check-circle-2', 'size="20"') : icon('circle', 'size="20"')}
      </button>
      <div class="task-content">
        <span class="task-text" data-field="todo-title" data-task-id="${t.id}">${isRecurring ? `<span class="task-recurring">${icon('repeat', 'size="14"')}</span>` : ''}${utils.escapeHtml(t.title)}</span>
        <span class="task-meta">
          ${scheduleLabel ? `<span class="tag tag--schedule">${icon('clock', 'size="10"')} ${scheduleLabel}</span>` : ''}
          ${catName ? `<span class="tag tag--cat" style="--tag-color:${catColor}">${catName}</span>` : ''}
          ${parentName ? `<span class="task-source">${icon('link', 'size="12"')} <a class="task-source-link" data-parent-id="${t.parent_id}">${utils.escapeHtml(parentName)}</a></span>` : ''}
        </span>
      </div>
      ${!hasParent ? `<button class="task-attach-btn" data-id="${t.id}" title="挂靠到便签">${icon('map-pin', 'size="14"')}</button>` : ''}
      ${t.recurrence ? `<span class="task-recurrence" title="重复: ${t.recurrence === 'daily' ? '每天' : t.recurrence === 'weekly' ? '每周' : '每月'}">${t.recurrence === 'daily' ? '🔁每天' : t.recurrence === 'weekly' ? '🔁每周' : '🔁每月'}</span>` : ''}
      <button class="btn btn--ghost btn--sm task-delete" data-id="${t.id}" title="删除">${icon('trash-2', 'size="14"')}</button>
    </div>`;
  },

  showPinSelector(): void {
    const existing = document.querySelector('.pin-selector');
    if (existing) existing.remove();
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    const availableNotes = allTasks.filter(t =>
      t.sub_type !== 'task' && t.grid_x !== null && t.status === 'active' && (!t.pin_date || t.pin_date !== currentDate)
    );
    const categories = store.get<Category[]>('categories') ?? [];
    const selector = document.createElement('div');
    selector.className = 'pin-selector';
    let html = `<div style="padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--border-light)">
      <div style="display:flex;gap:var(--space-1);margin-bottom:var(--space-1)">
        <button class="btn btn--sm pin-type-btn active" data-pin-type="daily">今日贴附</button>
        <button class="btn btn--sm pin-type-btn" data-pin-type="longterm">长期贴附</button>
      </div>
    </div>`;
    if (availableNotes.length === 0) {
      html += `<div class="pin-selector__empty">${icon('info', 'size="14"')} 暂无可贴附的便签</div>`;
    } else {
      html += availableNotes.map(t => {
        const cat = categories.find(c => c.id === t.category_id);
        const catColor = cat ? cat.color : '#8e8e8e';
        return `<button class="pin-selector__item" data-id="${t.id}">
          <span class="pin-selector__dot" style="background:${catColor}"></span>
          <span class="pin-selector__type">${t.type === 'plan' ? '计划' : '便签'}</span>
          <span class="pin-selector__label">${utils.escapeHtml(t.title)}</span>
        </button>`;
      }).join('');
    }
    selector.innerHTML = html;
    const addBtn = document.querySelector('.home-pin-add-btn') as HTMLElement;
    if (!addBtn) return;
    const rect = addBtn.getBoundingClientRect();
    selector.style.left = rect.left + 'px';
    selector.style.top = rect.bottom + 'px';
    document.body.appendChild(selector);
    let pinType = 'daily';
    selector.querySelectorAll('.pin-type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selector.querySelectorAll('.pin-type-btn').forEach(b => b.classList.remove('active'));
        (btn as HTMLElement).classList.add('active');
        pinType = (btn as HTMLElement).dataset.pinType!;
      });
    });
    selector.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('.pin-selector__item') as HTMLElement | null;
      if (!btn) return;
      const id = btn.dataset.id!;
      const pinDate = pinType === 'longterm' ? 'longterm' : currentDate;
      selector.remove();
      await taskApi.update(id, { pin_date: pinDate });
      toast.success(pinType === 'longterm' ? '已长期贴附' : '已贴附到今日');
      await homePage.render();
    });
    setTimeout(() => { document.addEventListener('click', function handler(evt) { if (!selector.contains(evt.target as Node)) { selector.remove(); document.removeEventListener('click', handler); } }); }, 0);
  },

  async removePin(noteId: string): Promise<void> {
    await taskApi.update(noteId, { pin_date: null, home_x: null, home_y: null });
    toast.info('已取消贴附');
    homeOpenIds.delete(noteId);
    await homePage.render();
  },

  // ─── Schedule Timeline ───

  renderTimeline(_tasks: TaskItem[], allTasks: TaskItem[]): void {
    const grid = document.querySelector('.home-timeline-grid') as HTMLElement | null;
    if (!grid) return;
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    const cats = store.get<Category[]>('categories') ?? [];

    const scheduleItems = allTasks.filter(t =>
      t.status === 'active' &&
      t.schedule_start &&
      t.todo_date === currentDate
    );

    if (scheduleItems.length === 0) {
      grid.innerHTML = `<div class="home-timeline-empty">${icon('calendar-clock', 'size="16"')}<br>暂无日程</div>`;
      return;
    }

    let minHour = 6, maxHour = 22;
    scheduleItems.forEach(t => {
      const sh = parseInt((t.schedule_start ?? '06:00').split(':')[0]);
      const eh = t.schedule_end ? parseInt(t.schedule_end.split(':')[0]) + 1 : sh + 1;
      if (sh < minHour) minHour = Math.max(0, sh);
      if (eh > maxHour) maxHour = Math.min(24, eh);
    });

    const HOUR_H = 36;
    const totalH = maxHour - minHour;
    const gridH = totalH * HOUR_H;

    let html = '';

    // Hour ticks on the rail
    for (let h = minHour; h < maxHour; h++) {
      const label = `${String(h).padStart(2, '0')}`;
      html += `<div class="home-tl-hour" style="height:${HOUR_H}px">
        <span class="home-tl-tick"></span>
        <span class="home-tl-label">${label}</span>
      </div>`;
    }

    // Schedule dots on the rail — sorted by created_at so later items render on top
    const sortedItems = [...scheduleItems].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    sortedItems.forEach((t, idx) => {
      const cat = cats.find(c => c.id === t.category_id);
      const cc = cat ? cat.color : '#5b7fff';
      const [sh, sm] = (t.schedule_start ?? '06:00').split(':').map(Number);
      const startMin = sh * 60 + (sm || 0);
      let endMin = startMin + 60;
      if (t.schedule_end) {
        const [eh, em] = t.schedule_end.split(':').map(Number);
        endMin = eh * 60 + (em || 0);
      }
      const top = (startMin - minHour * 60) / 60 * HOUR_H;
      const height = Math.max(6, (endMin - startMin) / 60 * HOUR_H);
      const isCompleted = t.todo_status === 'completed';
      const timeLabel = `${t.schedule_start}${t.schedule_end ? '-' + t.schedule_end : ''}`;
      const duration = endMin - startMin;

      html += `<div class="home-tl-block${isCompleted ? ' home-tl-block--done' : ''}" data-id="${t.id}" data-start-min="${startMin}" data-duration="${duration}" style="top:${top}px;height:${height}px;--block-color:${cc};z-index:${idx + 1}">
        <div class="home-tl-block__dot" style="background:${cc}"></div>
        <div class="home-tl-block__bar" style="background:${cc}"></div>
        <div class="home-tl-block__tip">
          <div class="home-tl-block__tip-title">${utils.escapeHtml(t.title)}</div>
          <div class="home-tl-block__tip-time">${timeLabel}</div>
        </div>
      </div>`;
    });

    // Current time indicator
    const today = utils.getTodayStr();
    if (currentDate === today) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin >= minHour * 60 && nowMin <= maxHour * 60) {
        const nowTop = (nowMin - minHour * 60) / 60 * HOUR_H;
        html += `<div class="home-tl-now" style="top:${nowTop}px"></div>`;
      }
    }

    grid.innerHTML = html;
    grid.style.height = gridH + 'px';
    grid.style.position = 'relative';

    // Store timeline config for drag calculations
    (grid as any)._tlConfig = { minHour, HOUR_H, maxHour };

    // Bind block pointer events for drag + click + multi-select
    grid.querySelectorAll('.home-tl-block').forEach(block => {
      const el = block as HTMLElement;
      let startY = 0;
      let startTop = 0;
      let moved = false;

      el.addEventListener('pointerdown', (e: PointerEvent) => {
        e.stopPropagation();
        const id = el.dataset.id!;
        const ctrlKey = e.ctrlKey || e.metaKey;

        // Multi-select with Ctrl+click
        if (ctrlKey) {
          el.classList.toggle('home-tl-block--selected');
          return;
        }

        // Deselect others if not ctrl
        grid.querySelectorAll('.home-tl-block--selected').forEach(b => {
          if (b !== el) b.classList.remove('home-tl-block--selected');
        });

        startY = e.clientY;
        startTop = parseFloat(el.style.top);
        moved = false;
        el.setPointerCapture(e.pointerId);

        const onMove = (ev: PointerEvent) => {
          const dy = ev.clientY - startY;
          if (!moved && Math.abs(dy) > 3) {
            moved = true;
            el.classList.add('home-tl-block--dragging');
            // Bring to top
            const maxZ = Math.max(...Array.from(grid.querySelectorAll('.home-tl-block')).map(b => parseInt((b as HTMLElement).style.zIndex || '1')));
            el.style.zIndex = String(maxZ + 1);
          }
          if (moved) {
            const newTop = Math.max(0, startTop + dy);
            el.style.top = newTop + 'px';

            // Also move selected blocks
            grid.querySelectorAll('.home-tl-block--selected').forEach(sel => {
              if (sel !== el) {
                const selBlock = sel as HTMLElement;
                const selStartTop = parseFloat(selBlock.dataset._dragStartTop || selBlock.style.top);
                selBlock.style.top = Math.max(0, selStartTop + dy) + 'px';
              }
            });
          }
        };

        const onUp = async (ev: PointerEvent) => {
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.classList.remove('home-tl-block--dragging');

          // Store initial top for selected blocks before drag
          if (!moved) {
            // It was a click, not a drag - show context menu
            homePage.showScheduleContextMenu(id, ev);
            return;
          }

          // Calculate new time from position
          const cfg = (grid as any)._tlConfig;
          const finalTop = parseFloat(el.style.top);
          const newStartMin = Math.round((finalTop / cfg.HOUR_H + cfg.minHour) * 60 / 15) * 15;
          const duration = parseInt(el.dataset.duration || '60');
          const newEndMin = newStartMin + duration;

          const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          const newStart = fmt(newStartMin);
          const newEnd = fmt(newEndMin);

          // Update this block
          await taskApi.update(id, { schedule_start: newStart, schedule_end: newEnd });

          // Also update selected blocks
          const selectedIds: string[] = [];
          grid.querySelectorAll('.home-tl-block--selected').forEach(sel => {
            const selBlock = sel as HTMLElement;
            const selId = selBlock.dataset.id!;
            if (selId !== id) selectedIds.push(selId);
          });

          for (const selId of selectedIds) {
            const selBlock = grid.querySelector(`.home-tl-block[data-id="${selId}"]`) as HTMLElement;
            if (!selBlock) continue;
            const selTop = parseFloat(selBlock.style.top);
            const selStartMin = Math.round((selTop / cfg.HOUR_H + cfg.minHour) * 60 / 15) * 15;
            const selDuration = parseInt(selBlock.dataset.duration || '60');
            const selEndMin = selStartMin + selDuration;
            await taskApi.update(selId, {
              schedule_start: fmt(selStartMin),
              schedule_end: fmt(selEndMin),
            });
          }

          // Clear selection
          grid.querySelectorAll('.home-tl-block--selected').forEach(b => b.classList.remove('home-tl-block--selected'));

          await homePage.render();
        };

        // Store initial tops for selected blocks
        grid.querySelectorAll('.home-tl-block--selected').forEach(sel => {
          const selBlock = sel as HTMLElement;
          selBlock.dataset._dragStartTop = selBlock.style.top;
        });

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
      });
    });

    initIcons();
  },

  showScheduleForm(editId?: string): void {
    const existing = document.querySelector('.schedule-form');
    if (existing) existing.remove();
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const cats = store.get<Category[]>('categories') ?? [];
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    const editTask = editId ? allTasks.find(t => t.id === editId) : null;

    const form = document.createElement('div');
    form.className = 'schedule-form sort-picker';
    form.style.position = 'fixed';
    form.style.left = '50%';
    form.style.top = '50%';
    form.style.transform = 'translate(-50%, -50%)';
    form.style.minWidth = '280px';
    form.style.zIndex = '1000';

    let html = `<div class="schedule-form__title">${editTask ? '编辑日程' : '添加日程'}</div>
      <div class="schedule-form__field">
        <label>标题</label>
        <input class="input input--sm schedule-form__name" value="${editTask ? utils.escapeHtml(editTask.title) : ''}" placeholder="日程名称">
      </div>
      <div class="schedule-form__row">
        <div class="schedule-form__field">
          <label>开始</label>
          <input type="time" class="input input--sm schedule-form__start" value="${editTask?.schedule_start ?? '09:00'}">
        </div>
        <div class="schedule-form__field">
          <label>结束</label>
          <input type="time" class="input input--sm schedule-form__end" value="${editTask?.schedule_end ?? '10:00'}">
        </div>
      </div>
      <div class="schedule-form__field">
        <label>分类</label>
        <select class="input input--sm schedule-form__cat">
          ${cats.map(c => `<option value="${c.id}"${(editTask?.category_id ?? 'cat_default') === c.id ? ' selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>`;

    // Option to link to existing todo — shown for both create and edit
    const currentLinkedTodo = editTask && editTask.sub_type !== 'task' ? null : editId;
    // For independent schedules, find if any todo points to this schedule via parent_id or same title+date
    const linkedTodo = !currentLinkedTodo ? allTasks.find(t =>
      t.sub_type === 'task' && t.todo_date === currentDate &&
      t.schedule_start === editTask?.schedule_start && t.title === editTask?.title
    ) : null;
    const allTodos = allTasks.filter(t =>
      t.sub_type === 'task' && t.todo_date === currentDate && t.status === 'active'
    );
    const unassignedTodos = allTodos.filter(t => !t.schedule_start);

    html += `<div class="schedule-form__field">
      <label>关联待办（可选）</label>
      <select class="input input--sm schedule-form__todo">
        <option value="">不关联</option>
        ${editTask?.sub_type !== 'task' ? '' : `<option value="__self" selected>此日程即为待办本身</option>`}
        ${unassignedTodos.map(t => `<option value="${t.id}">${utils.escapeHtml(t.title)}</option>`).join('')}
        ${linkedTodo ? `<option value="${linkedTodo.id}" selected>${utils.escapeHtml(linkedTodo.title)} (已关联)</option>` : ''}
      </select>
    </div>`;

    html += `<div class="schedule-form__actions">
        <button class="btn btn--primary btn--sm schedule-form__save">${editTask ? '保存' : '添加'}</button>
        <button class="btn btn--ghost btn--sm schedule-form__cancel">取消</button>
      </div>`;

    form.innerHTML = html;
    document.body.appendChild(form);
    initIcons();

    const close = () => form.remove();
    form.querySelector('.schedule-form__cancel')?.addEventListener('click', close);
    form.querySelector('.schedule-form__save')?.addEventListener('click', async () => {
      const name = (form.querySelector('.schedule-form__name') as HTMLInputElement).value.trim();
      const start = (form.querySelector('.schedule-form__start') as HTMLInputElement).value;
      const end = (form.querySelector('.schedule-form__end') as HTMLInputElement).value;
      const catId = (form.querySelector('.schedule-form__cat') as HTMLSelectElement).value;
      const todoSelect = form.querySelector('.schedule-form__todo') as HTMLSelectElement | null;
      const linkTodoId = todoSelect?.value || '';

      if (!name) { toast.info('请输入日程名称'); return; }
      if (!start) { toast.info('请选择开始时间'); return; }

      close();

      if (editTask) {
        const updates: Partial<TaskItem> = { title: name, schedule_start: start, schedule_end: end || null, category_id: catId };
        // Handle todo linking changes
        const todoSelect = form.querySelector('.schedule-form__todo') as HTMLSelectElement | null;
        const linkVal = todoSelect?.value || '';
        if (editTask.sub_type === 'schedule') {
          // Independent schedule: if linked to a todo, transfer schedule to that todo and delete this schedule
          if (linkVal && linkVal !== '__self') {
            await taskApi.update(linkVal, { schedule_start: start, schedule_end: end || null });
            await taskApi.delete(editTask.id);
            toast.success('已关联到待办');
          } else {
            await taskApi.update(editTask.id, updates);
            toast.success('日程已更新');
          }
        } else {
          // This is a todo with schedule: if unlinked, remove schedule from todo and create independent schedule
          if (linkVal === '') {
            await taskApi.update(editTask.id, { schedule_start: null, schedule_end: null });
            await taskApi.create({
              type: 'note', sub_type: 'schedule', title: name, content: '',
              category_id: catId, priority: 0, sort_order: 0, status: 'active',
              collapsed: false, todo_date: currentDate,
              schedule_start: start, schedule_end: end || null,
            });
            toast.success('已取消关联，日程已转为独立');
          } else {
            await taskApi.update(editTask.id, updates);
            toast.success('日程已更新');
          }
        }
      } else if (linkTodoId) {
        await taskApi.update(linkTodoId, { schedule_start: start, schedule_end: end || null });
        toast.success('已为待办安排时间');
      } else {
        await taskApi.create({
          type: 'note',
          sub_type: 'schedule',
          title: name,
          content: '',
          category_id: catId,
          priority: 0,
          sort_order: 0,
          status: 'active',
          collapsed: false,
          todo_date: currentDate,
          schedule_start: start,
          schedule_end: end || null,
        });
        toast.success('日程已添加');
      }
      await homePage.render();
    });

    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!form.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  showScheduleContextMenu(id: string, e: MouseEvent): void {
    document.querySelector('.schedule-ctx-menu')?.remove();
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const task = allTasks.find(t => t.id === id);
    if (!task) return;
    const isTodo = task.sub_type === 'task';

    const menu = document.createElement('div');
    menu.className = 'schedule-ctx-menu sort-picker';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.zIndex = '1001';
    menu.innerHTML = `
      <button class="sort-picker__item" data-a="edit">${icon('pencil', 'size="14"')} 编辑</button>
      ${isTodo ? `<button class="sort-picker__item" data-a="unlink">${icon('unlink', 'size="14"')} 取消时间安排</button>` : ''}
      <button class="sort-picker__item" data-a="delete" style="color:var(--color-danger)">${icon('trash-2', 'size="14"')} 删除</button>
    `;
    document.body.appendChild(menu);
    initIcons();

    const close = () => menu.remove();
    menu.addEventListener('click', async (ev) => {
      const btn = (ev.target as HTMLElement).closest('.sort-picker__item') as HTMLElement | null;
      if (!btn) return;
      const a = btn.dataset.a;
      close();
      if (a === 'edit') {
        homePage.showScheduleForm(id);
      } else if (a === 'unlink') {
        await taskApi.update(id, { schedule_start: null, schedule_end: null });
        toast.info('已取消时间安排');
        await homePage.render();
      } else if (a === 'delete') {
        await taskApi.delete(id);
        toast.info('已删除');
        await homePage.render();
      }
    });
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!menu.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  // ─── Schedule Templates ───

  getTemplates(): { name: string; items: { title: string; start: string; end: string; category_id: string }[] }[] {
    try { return JSON.parse(localStorage.getItem('schedule_templates') || '[]'); } catch { return []; }
  },

  saveTemplates(templates: { name: string; items: { title: string; start: string; end: string; category_id: string }[] }[]): void {
    localStorage.setItem('schedule_templates', JSON.stringify(templates));
  },

  showTemplateManager(): void {
    const existing = document.querySelector('.template-manager');
    if (existing) existing.remove();
    const templates = homePage.getTemplates();
    const cats = store.get<Category[]>('categories') ?? [];
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();

    const modal = document.createElement('div');
    modal.className = 'template-manager sort-picker';
    modal.style.position = 'fixed';
    modal.style.left = '50%';
    modal.style.top = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.minWidth = '340px';
    modal.style.maxWidth = '420px';
    modal.style.zIndex = '1000';

    let html = `<div class="schedule-form__title">${icon('layout-template', 'size="16"')} 日程模板</div>`;

    // Existing templates
    if (templates.length > 0) {
      templates.forEach((tmpl, idx) => {
        html += `<div class="tmpl-item">
          <div class="tmpl-item__header">
            <span class="tmpl-item__name">${utils.escapeHtml(tmpl.name)}</span>
            <span class="tmpl-item__count">${tmpl.items.length}项</span>
          </div>
          <div class="tmpl-item__preview">
            ${tmpl.items.map(i => `<span class="tmpl-item__slot" style="--block-color:${cats.find(c => c.id === i.category_id)?.color ?? '#5b7fff'}">${i.start} ${utils.escapeHtml(i.title)}</span>`).join('')}
          </div>
          <div class="tmpl-item__actions">
            <button class="btn btn--primary btn--xs tmpl-apply" data-idx="${idx}">应用到今日</button>
            <button class="btn btn--ghost btn--xs tmpl-edit" data-idx="${idx}">编辑</button>
            <button class="btn btn--ghost btn--xs tmpl-delete" data-idx="${idx}" style="color:var(--color-danger)">删除</button>
          </div>
        </div>`;
      });
    } else {
      html += `<div style="padding:var(--space-3);text-align:center;color:var(--text-lighter);font-size:var(--text-xs)">暂无模板，创建一个吧</div>`;
    }

    // Create new template
    html += `<div style="padding:var(--space-2) var(--space-3);border-top:1px solid var(--border-light)">
      <div style="display:flex;gap:var(--space-1);align-items:center">
        <input class="input input--sm tmpl-new-name" placeholder="模板名称（如：工作日）" style="flex:1">
        <button class="btn btn--primary btn--sm tmpl-save-current">从今日日程创建</button>
      </div>
    </div>`;

    html += `<div class="schedule-form__actions">
      <button class="btn btn--ghost btn--sm tmpl-close">关闭</button>
    </div>`;

    modal.innerHTML = html;
    document.body.appendChild(modal);
    initIcons();

    const close = () => modal.remove();
    modal.querySelector('.tmpl-close')?.addEventListener('click', close);

    // Apply template
    modal.querySelectorAll('.tmpl-apply').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        const tmpl = templates[idx];
        if (!tmpl) return;
        for (const item of tmpl.items) {
          await taskApi.create({
            type: 'note',
            sub_type: 'schedule',
            title: item.title,
            content: '',
            category_id: item.category_id || 'cat_default',
            priority: 0,
            sort_order: 0,
            status: 'active',
            collapsed: false,
            todo_date: currentDate,
            schedule_start: item.start,
            schedule_end: item.end || null,
          });
        }
        toast.success(`已应用模板「${tmpl.name}」，添加 ${tmpl.items.length} 条日程`);
        close();
        await homePage.render();
      });
    });

    // Delete template
    modal.querySelectorAll('.tmpl-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        templates.splice(idx, 1);
        homePage.saveTemplates(templates);
        close();
        homePage.showTemplateManager();
      });
    });

    // Edit template
    modal.querySelectorAll('.tmpl-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        homePage.showTemplateEditor(idx);
        close();
      });
    });

    // Save current day as template
    modal.querySelector('.tmpl-save-current')?.addEventListener('click', () => {
      const name = (modal.querySelector('.tmpl-new-name') as HTMLInputElement).value.trim();
      if (!name) { toast.info('请输入模板名称'); return; }
      const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
      const scheduleItems = allTasks.filter(t =>
        t.status === 'active' && t.schedule_start && t.todo_date === currentDate
      );
      if (scheduleItems.length === 0) { toast.info('今日没有日程可保存为模板'); return; }
      const items = scheduleItems.map(t => ({
        title: t.title,
        start: t.schedule_start!,
        end: t.schedule_end || '',
        category_id: t.category_id || 'cat_default',
      }));
      templates.push({ name, items });
      homePage.saveTemplates(templates);
      toast.success(`已保存模板「${name}」`);
      close();
      homePage.showTemplateManager();
    });

    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!modal.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  showTemplateEditor(idx: number): void {
    const templates = homePage.getTemplates();
    const tmpl = templates[idx];
    if (!tmpl) return;
    const cats = store.get<Category[]>('categories') ?? [];

    const existing = document.querySelector('.template-editor');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.className = 'template-editor sort-picker';
    modal.style.position = 'fixed';
    modal.style.left = '50%';
    modal.style.top = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.minWidth = '320px';
    modal.style.maxHeight = '80vh';
    modal.style.overflowY = 'auto';
    modal.style.zIndex = '1000';

    let html = `<div class="schedule-form__title">编辑模板：${utils.escapeHtml(tmpl.name)}</div>`;
    tmpl.items.forEach((item, i) => {
      html += `<div class="tmpl-edit-item" data-idx="${i}">
        <div class="tmpl-edit-item__row">
          <input class="input input--xs tmpl-ei-title" value="${utils.escapeHtml(item.title)}" placeholder="标题" style="flex:1">
          <input type="time" class="input input--xs tmpl-ei-start" value="${item.start}" style="width:80px">
          <input type="time" class="input input--xs tmpl-ei-end" value="${item.end}" style="width:80px">
          <select class="input input--xs tmpl-ei-cat" style="width:70px">
            ${cats.map(c => `<option value="${c.id}"${c.id === item.category_id ? ' selected' : ''}>${c.name}</option>`).join('')}
          </select>
          <button class="btn btn--ghost btn--xs tmpl-ei-del" data-i="${i}" style="color:var(--color-danger)">${icon('x', 'size="10"')}</button>
        </div>
      </div>`;
    });
    html += `<div style="padding:var(--space-1) var(--space-3)">
      <button class="btn btn--ghost btn--xs tmpl-add-item">${icon('plus', 'size="10"')} 添加时段</button>
    </div>`;
    html += `<div class="schedule-form__actions">
      <button class="btn btn--primary btn--sm tmpl-save-edit">保存</button>
      <button class="btn btn--ghost btn--sm tmpl-cancel-edit">取消</button>
    </div>`;

    modal.innerHTML = html;
    document.body.appendChild(modal);
    initIcons();

    // Helper: collect current form values into tmpl.items
    const collectFormValues = () => {
      const items: typeof tmpl.items = [];
      modal.querySelectorAll('.tmpl-edit-item').forEach(el => {
        const row = el as HTMLElement;
        const title = (row.querySelector('.tmpl-ei-title') as HTMLInputElement).value.trim();
        const start = (row.querySelector('.tmpl-ei-start') as HTMLInputElement).value;
        const end = (row.querySelector('.tmpl-ei-end') as HTMLInputElement).value;
        const catId = (row.querySelector('.tmpl-ei-cat') as HTMLSelectElement).value;
        if (title || start) items.push({ title: title || '未命名', start: start || '09:00', end, category_id: catId });
      });
      tmpl.items = items;
    };

    // Delete item
    modal.querySelectorAll('.tmpl-ei-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt((btn as HTMLElement).dataset.i!);
        collectFormValues();
        tmpl.items.splice(i, 1);
        templates[idx] = tmpl;
        homePage.saveTemplates(templates);
        modal.remove();
        homePage.showTemplateEditor(idx);
      });
    });

    // Add item
    modal.querySelector('.tmpl-add-item')?.addEventListener('click', () => {
      collectFormValues();
      tmpl.items.push({ title: '新时段', start: '09:00', end: '10:00', category_id: 'cat_default' });
      templates[idx] = tmpl;
      homePage.saveTemplates(templates);
      modal.remove();
      homePage.showTemplateEditor(idx);
    });

    // Save
    modal.querySelector('.tmpl-save-edit')?.addEventListener('click', () => {
      const items: typeof tmpl.items = [];
      modal.querySelectorAll('.tmpl-edit-item').forEach(el => {
        const row = el as HTMLElement;
        const title = (row.querySelector('.tmpl-ei-title') as HTMLInputElement).value.trim();
        const start = (row.querySelector('.tmpl-ei-start') as HTMLInputElement).value;
        const end = (row.querySelector('.tmpl-ei-end') as HTMLInputElement).value;
        const catId = (row.querySelector('.tmpl-ei-cat') as HTMLSelectElement).value;
        if (title && start) items.push({ title, start, end, category_id: catId });
      });
      templates[idx].items = items;
      homePage.saveTemplates(templates);
      toast.success('模板已保存');
      modal.remove();
    });

    modal.querySelector('.tmpl-cancel-edit')?.addEventListener('click', () => modal.remove());
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!modal.contains(evt.target as Node)) { modal.remove(); document.removeEventListener('click', h); } }); }, 0);
  },

  showAttachSelector(todoId: string): void {
    const existing = document.querySelector('.pin-selector');
    if (existing) existing.remove();
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const planNotes = allTasks.filter(t => t.sub_type !== 'task' && t.id !== todoId && t.grid_x !== null && t.status === 'active');
    const categories = store.get<Category[]>('categories') ?? [];
    const selector = document.createElement('div');
    selector.className = 'pin-selector';
    if (planNotes.length === 0) {
      selector.innerHTML = `<div class="pin-selector__empty">${icon('info', 'size="14"')} 暂无可挂靠的便签</div>`;
    } else {
      selector.innerHTML = planNotes.map(t => {
        const cat = categories.find(c => c.id === t.category_id);
        const catColor = cat ? cat.color : '#8e8e8e';
        return `<button class="pin-selector__item" data-id="${t.id}">
          <span class="pin-selector__dot" style="background:${catColor}"></span>
          <span class="pin-selector__label">${utils.escapeHtml(t.title)}</span>
        </button>`;
      }).join('');
    }
    const attachBtn = document.querySelector(`.task-attach-btn[data-id="${todoId}"]`) as HTMLElement;
    if (!attachBtn) return;
    const rect = attachBtn.getBoundingClientRect();
    selector.style.left = rect.left + 'px';
    selector.style.top = rect.bottom + 'px';
    document.body.appendChild(selector);
    selector.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('.pin-selector__item') as HTMLElement | null;
      if (!btn) return;
      const planId = btn.dataset.id!;
      selector.remove();
      await taskApi.update(todoId, { parent_id: planId, sub_type: 'task' });
      toast.success('已挂靠到便签');
      await homePage.render();
    });
    setTimeout(() => { document.addEventListener('click', function handler(evt) { if (!selector.contains(evt.target as Node)) { selector.remove(); document.removeEventListener('click', handler); } }); }, 0);
  },

  async addTodo(text: string, recurrence?: string): Promise<void> {
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    await taskApi.create({ type: 'note', sub_type: 'task', title: text, content: '', category_id: 'cat_default', priority: 0, sort_order: 0, status: 'active', collapsed: false, todo_date: currentDate, todo_status: 'pending', recurrence });
    toast.success('已添加待办');
    await homePage.render();
  },

  async toggleTodo(id: string): Promise<void> {
    const tasks = store.get<TaskItem[]>('tasks') ?? [];
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newStatus = task.todo_status === 'completed' ? 'pending' : 'completed';
    await taskApi.update(id, { todo_status: newStatus });
    toast.success(newStatus === 'completed' ? '已完成' : '已恢复待办');
    await homePage.render();
  },

  async toggleSubtask(id: string): Promise<void> {
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    const task = allTasks.find(t => t.id === id);
    if (!task) return;
    const newStatus = task.todo_status === 'completed' ? 'pending' : 'completed';
    await taskApi.update(id, { todo_status: newStatus });
    toast.success(newStatus === 'completed' ? '已完成' : '已恢复待办');
    await homePage.render();
  },

  async deleteTodo(id: string): Promise<void> {
    await taskApi.delete(id);
    toast.info('已删除待办');
    await homePage.render();
  },

  showRecurringTaskMenu(id: string, e: Event): void {
    document.querySelector('.recurring-ctx-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'recurring-ctx-menu sort-picker';
    menu.style.position = 'fixed';
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.zIndex = '1001';
    menu.innerHTML = `
      <button class="sort-picker__item" data-a="this">${icon('trash-2', 'size="14"')} 仅删除此条</button>
      <button class="sort-picker__item" data-a="stop">${icon('pause', 'size="14"')} 停止重复（保留此条）</button>
      <button class="sort-picker__item" data-a="all" style="color:var(--color-danger)">${icon('trash-2', 'size="14"')} 删除所有重复实例</button>
    `;
    document.body.appendChild(menu);
    initIcons();

    const close = () => menu.remove();
    menu.addEventListener('click', async (ev) => {
      const btn = (ev.target as HTMLElement).closest('.sort-picker__item') as HTMLElement | null;
      if (!btn) return;
      const a = btn.dataset.a;
      close();
      const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
      if (a === 'this') {
        await homePage.deleteTodo(id);
      } else if (a === 'stop') {
        await taskApi.update(id, { recurrence: null });
        toast.info('已停止重复');
        await homePage.render();
      } else if (a === 'all') {
        const task = allTasks.find(t => t.id === id);
        if (!task) return;
        // Delete all instances with same title or parent_id pointing to this
        const idsToDelete = allTasks
          .filter(t => t.id === id || t.parent_id === id || (t.title === task.title && t.recurrence && !t.parent_id))
          .map(t => t.id);
        await Promise.all(idsToDelete.map(i => taskApi.delete(i)));
        toast.info(`已删除 ${idsToDelete.length} 条重复任务`);
        await homePage.render();
      }
    });
    setTimeout(() => { document.addEventListener('click', function h(evt) { if (!menu.contains(evt.target as Node)) { close(); document.removeEventListener('click', h); } }); }, 0);
  },

  startEditTodo(todoId: string): void {
    const el = document.querySelector(`.task-text[data-task-id="${todoId}"]`) as HTMLElement | null;
    if (!el) return;
    const t = (store.get<TaskItem[]>('tasks') ?? []).find(t => t.id === todoId);
    if (!t) return;
    el.innerText = t.title ?? '';
    el.contentEditable = 'true';
    el.classList.add('task-text--editing');
    el.focus();
    const rng = document.createRange();
    rng.selectNodeContents(el);
    rng.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(rng);
    let saved = false;
    const cleanup = () => { el.contentEditable = 'false'; el.classList.remove('task-text--editing'); };
    const save = async () => {
      if (saved) return;
      saved = true;
      const nv = el.innerText?.trim() ?? '';
      cleanup();
      if (nv !== t.title) {
        await taskApi.update(todoId, { title: nv });
      }
    };
    const blurH = () => { save(); el.removeEventListener('blur', blurH); };
    el.addEventListener('keydown', function h(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); saved = true; cleanup(); el.removeEventListener('keydown', h); el.removeEventListener('blur', blurH); }
    });
    el.addEventListener('blur', blurH);
  },

  goPrevDay(): void {
    const d = new Date(store.get<string>('currentDate') ?? utils.getTodayStr());
    d.setDate(d.getDate() - 1);
    store.set('currentDate', utils.formatDate(d));
    homeOpenIds.clear();
    homePage.render();
  },

  showMiniCalendar(): void {
    const existing = document.querySelector('.mini-calendar');
    if (existing) { existing.remove(); return; }
    const currentDate = store.get<string>('currentDate') ?? utils.getTodayStr();
    const d = new Date(currentDate);
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = utils.getTodayStr();

    const cal = document.createElement('div');
    cal.className = 'mini-calendar';
    const dateEl = document.querySelector('.home-date-text');
    const rect = dateEl?.getBoundingClientRect();
    if (rect) {
      cal.style.position = 'fixed';
      cal.style.left = rect.left + 'px';
      cal.style.top = (rect.bottom + 4) + 'px';
    }

    const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    let html = `<div class="mini-calendar__header">${year}年${monthNames[month]}</div>`;
    html += `<div class="mini-calendar__weekdays">`;
    ['日','一','二','三','四','五','六'].forEach(w => { html += `<span>${w}</span>`; });
    html += `</div><div class="mini-calendar__days">`;
    for (let i = 0; i < firstDay; i++) html += `<span></span>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === today;
      const isCurrent = dateStr === currentDate;
      html += `<span class="mini-calendar__day${isToday ? ' mini-calendar__day--today' : ''}${isCurrent ? ' mini-calendar__day--current' : ''}" data-date="${dateStr}">${day}</span>`;
    }
    html += `</div>`;
    cal.innerHTML = html;
    document.body.appendChild(cal);

    cal.addEventListener('click', (e) => {
      const dayEl = (e.target as HTMLElement).closest('.mini-calendar__day') as HTMLElement | null;
      if (dayEl && dayEl.dataset.date) {
        store.set('currentDate', dayEl.dataset.date);
        homeOpenIds.clear();
        cal.remove();
        homePage.render();
      }
    });

    setTimeout(() => {
      document.addEventListener('click', function h(evt) {
        if (!cal.contains(evt.target as Node)) { cal.remove(); document.removeEventListener('click', h); }
      });
    }, 0);
  },

  goNextDay(): void {
    const d = new Date(store.get<string>('currentDate') ?? utils.getTodayStr());
    d.setDate(d.getDate() + 1);
    store.set('currentDate', utils.formatDate(d));
    homeOpenIds.clear();
    homePage.render();
  },

  goToToday(): void {
    store.set('currentDate', utils.getTodayStr());
    homeOpenIds.clear();
    homePage.render();
  },
};

function onHomeDragMove(e: PointerEvent) {
  if (!homeDrag) return;
  const dx = e.clientX - homeDrag.startX;
  const dy = e.clientY - homeDrag.startY;
  if (!homeDrag.moved) {
    if (Math.abs(dx) < DRAG_TH && Math.abs(dy) < DRAG_TH) return;
    homeDrag.moved = true;
    document.querySelector(`.home-note[data-id="${homeDrag.noteId}"]`)?.classList.add('home-note--dragging');
  }
  const noteEl = document.querySelector(`.home-note[data-id="${homeDrag.noteId}"]`) as HTMLElement;
  if (!noteEl) return;
  const page = document.getElementById('page-home');
  if (!page) return;
  const pr = page.getBoundingClientRect();
  const pw = pr.width;
  const ph = pr.height;
  const nw = noteEl.offsetWidth;
  const nh = noteEl.offsetHeight;
  let nx = e.clientX - pr.left - homeDrag.offsetX;
  let ny = e.clientY - pr.top - homeDrag.offsetY;
  nx = Math.max(0, Math.min(nx, pw - nw));
  ny = Math.max(0, Math.min(ny, ph - nh));
  noteEl.style.left = nx + 'px';
  noteEl.style.top = ny + 'px';
}

async function onHomeDragUp(_e: PointerEvent) {
  document.removeEventListener('pointermove', onHomeDragMove);
  document.removeEventListener('pointerup', onHomeDragUp);
  if (!homeDrag) return;
  const { noteId, moved, origHX, origHY } = homeDrag;
  const noteEl = document.querySelector(`.home-note[data-id="${noteId}"]`);
  if (moved) {
    noteEl?.classList.remove('home-note--dragging');
    const el2 = noteEl as HTMLElement | null;
    const curX = parseInt(el2?.style.left ?? '0');
    const curY = parseInt(el2?.style.top ?? '0');
    const snapX = utils.snapToGrid(Math.max(0, curX), GRID);
    const snapY = utils.snapToGrid(Math.max(0, curY), GRID);
    if (snapX !== origHX || snapY !== origHY) {
      await taskApi.update(noteId, { home_x: snapX, home_y: snapY });
    }
  } else {
    homePage.saveAllEdits();
    if (homeOpenIds.has(noteId)) {
      // Save current open size before closing (to open_width/open_height)
      const noteEl2 = document.querySelector(`.home-note[data-id="${noteId}"]`) as HTMLElement;
      if (noteEl2) {
        const w = noteEl2.offsetWidth;
        const h = noteEl2.offsetHeight;
        if (w > 0 && h > 0) {
          await taskApi.update(noteId, { open_width: w, open_height: h });
        }
      }
      homeOpenIds.delete(noteId);
    } else {
      homeOpenIds.add(noteId);
    }
    const allTasks = store.get<TaskItem[]>('allTasks') ?? [];
    homePage.renderPinnedNotes(allTasks);
  }
  homeDrag = null;
}

function onHomeResizeMove(e: PointerEvent) {
  if (!homeResizeInfo) return;
  const dx = e.clientX - homeResizeInfo.startX;
  const dy = e.clientY - homeResizeInfo.startY;
  homeResizeInfo.pendingW = Math.max(160, homeResizeInfo.startW + dx);
  homeResizeInfo.pendingH = Math.max(80, homeResizeInfo.startH + dy);
  if (homeResizeInfo.rafId) return;
  homeResizeInfo.rafId = requestAnimationFrame(() => {
    if (!homeResizeInfo) return;
    const { noteEl, bodyEl, pendingW, pendingH } = homeResizeInfo;
    noteEl.style.width = pendingW + 'px';
    noteEl.style.height = pendingH + 'px';
    if (bodyEl) {
      bodyEl.style.maxHeight = (pendingH - 60) + 'px';
      bodyEl.style.overflowY = 'auto';
    }
    homeResizeInfo.rafId = 0;
  });
}

async function onHomeResizeUp(_e: PointerEvent) {
  document.removeEventListener('pointermove', onHomeResizeMove);
  document.removeEventListener('pointerup', onHomeResizeUp);
  if (!homeResizeInfo) return;
  const { noteId, noteEl, rafId } = homeResizeInfo;
  if (rafId) cancelAnimationFrame(rafId);
  noteEl.style.willChange = '';
  const w = noteEl.offsetWidth;
  const h = noteEl.offsetHeight;
  if (homeOpenIds.has(noteId)) {
    await taskApi.update(noteId, { open_width: w, open_height: h });
  } else {
    await taskApi.update(noteId, { note_width: w, note_height: h });
  }
  homeResizeInfo = null;
}
