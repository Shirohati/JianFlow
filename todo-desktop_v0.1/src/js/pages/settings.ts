import { store } from '../store';
import { settingsApi, categoryApi, statsApi, timeRecordApi, timeTypeApi, presetApi, goalApi, countdownApi } from '../api';
import { initIcons } from '../icons';
import { toast } from '../components/toast';
import { utils } from '../utils';
import type { AppSettings, Category, TimeType, PomodoroPreset, Goal, Countdown } from '../api';

function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}

export const settingsPage = {
  async init(): Promise<void> {
    const inner = document.querySelector('#page-settings .page__inner');
    if (!inner) return;

    const settings = await settingsApi.get();
    store.set('settings', settings);

    const categories = await categoryApi.list();
    store.set('categories', categories);

    const timeTypes = await timeTypeApi.list();
    store.set('timeTypes', timeTypes);

    const presets = await presetApi.list();
    store.set('pomodoroPresets', presets);

    const goals = await goalApi.list();
    store.set('goals', goals);

    const countdowns = await countdownApi.list();
    store.set('countdowns', countdowns);

    settingsPage.render(inner, settings, categories, timeTypes, presets, goals, countdowns);
    settingsPage.bindEvents(inner);
    initIcons();
  },

  render(
    container: Element,
    settings: AppSettings,
    categories: Category[],
    timeTypes: TimeType[],
    presets: PomodoroPreset[],
    goals: Goal[],
    countdowns: Countdown[]
  ): void {
    const dailyGoal = goals.find(g => g.goal_type === 'daily');
    const weeklyGoal = goals.find(g => g.goal_type === 'weekly');

    container.innerHTML = `
      <h2 class="page-title">${icon('settings')} 设置</h2>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('palette', 'size="14"')} 外观</h3>
        <div class="settings-row">
          <span class="settings-label">主题</span>
          <select class="input settings-select" data-key="theme">
            <option value="warm" ${settings.theme === 'warm' ? 'selected' : ''}>暖色</option>
            <option value="cool" ${settings.theme === 'cool' ? 'selected' : ''}>冷色</option>
            <option value="minimal" ${settings.theme === 'minimal' ? 'selected' : ''}>简约</option>
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>暗色</option>
          </select>
        </div>
        <div class="settings-row">
          <span class="settings-label">便签板背景</span>
          <select class="input settings-select" data-key="board_bg_style">
            <option value="cork" ${settings.board_bg_style === 'cork' ? 'selected' : ''}>软木板</option>
            <option value="grid" ${settings.board_bg_style === 'grid' ? 'selected' : ''}>简约网格</option>
            <option value="glass" ${settings.board_bg_style === 'glass' ? 'selected' : ''}>毛玻璃</option>
          </select>
        </div>
        <div class="settings-row">
          <span class="settings-label">便签间距</span>
          <select class="input settings-select" data-key="note_spacing">
            <option value="8" ${settings.note_spacing === 8 ? 'selected' : ''}>紧凑 (8px)</option>
            <option value="16" ${settings.note_spacing === 16 ? 'selected' : ''}>舒适 (16px)</option>
            <option value="24" ${settings.note_spacing === 24 ? 'selected' : ''}>宽松 (24px)</option>
          </select>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('zap', 'size="14"')} 行为</h3>
        <div class="settings-row">
          <span class="settings-label">开机自启</span>
          <label class="settings-toggle">
            <input type="checkbox" data-key="startup_minimized" ${settings.startup_minimized ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <span class="settings-label">自动移入未完成待办</span>
          <label class="settings-toggle">
            <input type="checkbox" data-key="move_uncompleted" ${settings.move_uncompleted ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('tag', 'size="14"')} 分类管理</h3>
        <div class="settings-categories" id="settingsCategories">
          ${categories.map(c => `
            <div class="settings-category-item" data-id="${c.id}">
              <span class="settings-category-dot" style="background:${c.color}"></span>
              <span class="settings-category-name">${c.name}</span>
              <button class="btn btn--ghost btn--sm settings-category-edit" data-id="${c.id}" title="编辑">${icon('pencil', 'size="14"')}</button>
              <button class="btn btn--ghost btn--sm settings-category-delete" data-id="${c.id}" title="删除">${icon('trash-2', 'size="14"')}</button>
            </div>
          `).join('')}
        </div>
        <div class="settings-category-add">
          <input class="input input--sm settings-cat-name" placeholder="分类名称" />
          <input type="color" class="settings-cat-color" value="#6366f1" />
          <button class="btn btn--primary btn--sm" id="addCategoryBtn">${icon('plus', 'size="14"')} 添加</button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('clock', 'size="14"')} 时间类型</h3>
        <div id="settingsTimeTypes">
          ${timeTypes.map(tt => `
            <div class="settings-category-item" data-tt-id="${tt.id}">
              <span class="settings-category-dot" style="background:${tt.color}"></span>
              <span class="settings-category-name">${tt.name}</span>
              <button class="btn btn--ghost btn--sm tt-edit" data-tt-id="${tt.id}" data-tt-name="${tt.name}" data-tt-color="${tt.color}" title="编辑">${icon('pencil', 'size="14"')}</button>
              <button class="btn btn--ghost btn--sm tt-delete" data-tt-id="${tt.id}" title="删除">${icon('trash-2', 'size="14"')}</button>
            </div>
          `).join('')}
        </div>
        <div class="settings-category-add">
          <input class="input input--sm tt-name-input" placeholder="类型名称" />
          <input type="color" class="settings-cat-color tt-color-input" value="#5b7fff" />
          <button class="btn btn--primary btn--sm" id="addTimeTypeBtn">${icon('plus', 'size="14"')} 添加</button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('timer', 'size="14"')} 番茄预设</h3>
        <div id="settingsPresets">
          ${presets.map(p => `
            <div class="settings-category-item" data-preset-id="${p.id}">
              <span class="settings-category-dot" style="background:${p.color}"></span>
              <span class="settings-category-name">${p.time_type} · ${p.duration_minutes}分钟 · ${p.mode === 'countdown' ? '倒计时' : '正向'}</span>
              <button class="btn btn--ghost btn--sm preset-edit" data-preset-id="${p.id}" data-preset-type="${p.time_type}" data-preset-duration="${p.duration_minutes}" data-preset-mode="${p.mode}" data-preset-color="${p.color}" title="编辑">${icon('pencil', 'size="14"')}</button>
              <button class="btn btn--ghost btn--sm preset-delete" data-preset-id="${p.id}" title="删除">${icon('trash-2', 'size="14"')}</button>
            </div>
          `).join('') || '<div style="font-size:var(--text-xs);color:var(--text-lighter);padding:var(--space-2)">暂无预设</div>'}
        </div>
        <div class="settings-category-add">
          <select class="input input--sm preset-type-select">
            ${timeTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
          </select>
          <input type="number" class="input input--sm preset-duration-input" placeholder="分钟" value="25" min="1" max="180" style="width:72px" />
          <select class="input input--sm preset-mode-select">
            <option value="countdown">倒计时</option>
            <option value="stopwatch">正向</option>
          </select>
          <input type="color" class="settings-cat-color preset-color-input" value="#5b7fff" />
          <button class="btn btn--primary btn--sm" id="addPresetBtn">${icon('plus', 'size="14"')} 添加</button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('target', 'size="14"')} 学习目标</h3>
        <div class="settings-row">
          <span class="settings-label">每日目标 (分钟)</span>
          <input type="number" class="input input--sm goal-daily-input" value="${dailyGoal ? dailyGoal.target_minutes : 120}" min="0" max="720" style="width:80px" />
        </div>
        <div class="settings-row">
          <span class="settings-label">每周目标 (分钟)</span>
          <input type="number" class="input input--sm goal-weekly-input" value="${weeklyGoal ? weeklyGoal.target_minutes : 600}" min="0" max="5040" style="width:80px" />
        </div>
        <button class="btn btn--primary btn--sm" id="saveGoalsBtn" style="margin-top:var(--space-2)">${icon('save', 'size="14"')} 保存目标</button>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('quote', 'size="14"')} 格言</h3>
        <div id="settingsQuotes"></div>
        <div class="settings-category-add">
          <input class="input input--sm quote-input" placeholder="输入格言" style="flex:2" />
          <button class="btn btn--primary btn--sm" id="addQuoteBtn">${icon('plus', 'size="14"')} 添加</button>
        </div>
        <div class="settings-row" style="margin-top:var(--space-2)">
          <span class="settings-label">显示模式</span>
          <select class="input input--sm settings-select" data-key="quote_mode">
            <option value="random" ${settings.quote_mode === 'random' ? 'selected' : ''}>随机</option>
            <option value="sequential" ${settings.quote_mode === 'sequential' ? 'selected' : ''}>顺序</option>
          </select>
        </div>
        <div class="settings-row">
          <span class="settings-label">切换间隔 (秒)</span>
          <input type="number" class="input input--sm" data-key="quote_interval" value="${settings.quote_interval}" min="5" max="300" style="width:80px" />
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('hourglass', 'size="14"')} 倒计时</h3>
        <div id="settingsCountdowns">
          ${countdowns.map(cd => `
            <div class="settings-category-item" data-cd-id="${cd.id}">
              <span class="settings-category-dot" style="background:${cd.color || '#5b7fff'}"></span>
              <span class="settings-category-name">${utils.escapeHtml(cd.title)} · ${cd.target_date}</span>
              <button class="btn btn--ghost btn--sm cd-delete" data-cd-id="${cd.id}" title="删除">${icon('trash-2', 'size="14"')}</button>
            </div>
          `).join('') || '<div style="font-size:var(--text-xs);color:var(--text-lighter);padding:var(--space-2)">暂无倒计时</div>'}
        </div>
        <div class="settings-category-add">
          <input class="input input--sm cd-title-input" placeholder="名称" />
          <input type="date" class="input input--sm cd-date-input" />
          <input type="color" class="settings-cat-color cd-color-input" value="#5b7fff" />
          <button class="btn btn--primary btn--sm" id="addCountdownBtn">${icon('plus', 'size="14"')} 添加</button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('clock', 'size="14"')} 导入时长</h3>
        <div class="settings-row" style="flex-wrap:wrap;gap:var(--space-2)">
          <select class="input input--sm" id="importTypeSelect">
            ${timeTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
          </select>
          <input type="number" class="input input--sm" id="importTotalMin" placeholder="分钟数" min="1" style="width:80px" />
          <button class="btn btn--primary btn--sm" id="bulkImportBtn">${icon('plus', 'size="14"')} 累加导入</button>
        </div>
        <div class="settings-row" style="flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-2)">
          <select class="input input--sm" id="importDetailType">
            ${timeTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
          </select>
          <input type="date" class="input input--sm" id="importDateInput" style="width:140px" />
          <input type="time" class="input input--sm" id="importStartTime" style="width:100px" />
          <span style="color:var(--text-lighter)">~</span>
          <input type="time" class="input input--sm" id="importEndTime" style="width:100px" />
          <button class="btn btn--sm" id="detailImportBtn">${icon('file-plus', 'size="14"')} 逐条导入</button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('database', 'size="14"')} 数据</h3>
        <div class="settings-row">
          <span class="settings-label">导出所有数据</span>
          <button class="btn btn--sm" id="exportDataBtn">${icon('download', 'size="14"')} 导出</button>
        </div>
        <div class="settings-row">
          <span class="settings-label">导入老版本数据</span>
          <button class="btn btn--sm" id="importDataBtn">${icon('upload', 'size="14"')} 导入</button>
          <input type="file" id="importFileInput" accept=".json" style="display:none" />
        </div>
        <div class="settings-row">
          <span class="settings-label">清空所有待办</span>
          <button class="btn btn--danger btn--sm" id="resetTasksBtn">${icon('list-x', 'size="14"')} 清空待办</button>
        </div>
        <div class="settings-row">
          <span class="settings-label">清空所有数据</span>
          <button class="btn btn--danger btn--sm" id="resetDataBtn">${icon('trash-2', 'size="14"')} 清空</button>
        </div>
      </div>
    `;

    settingsPage.renderQuotes(container, settings);
  },

  renderQuotes(container: Element, settings: AppSettings): void {
    let quotes: string[] = [];
    try { quotes = JSON.parse(settings.quotes || '[]'); } catch { quotes = []; }
    const el = container.querySelector('#settingsQuotes');
    if (!el) return;

    el.innerHTML = quotes.length > 0 ? quotes.map((q, i) => `
      <div class="settings-category-item">
        <span class="settings-category-name" style="font-style:italic">「${utils.escapeHtml(q)}」</span>
        <button class="btn btn--ghost btn--sm quote-delete" data-idx="${i}" title="删除">${icon('x', 'size="14"')}</button>
      </div>
    `).join('') : '<div style="font-size:var(--text-xs);color:var(--text-lighter);padding:var(--space-2)">暂无格言</div>';

    el.querySelectorAll('.quote-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        let qs: string[] = [];
        try { qs = JSON.parse(settings.quotes || '[]'); } catch { qs = []; }
        qs.splice(idx, 1);
        await settingsApi.update({ quotes: JSON.stringify(qs) } as Partial<AppSettings>);
        settings.quotes = JSON.stringify(qs);
        settingsPage.renderQuotes(container, settings);
        toast.info('格言已删除');
      });
    });
  },

  bindEvents(container: Element): void {
    container.querySelectorAll('.settings-select').forEach(el => {
      el.addEventListener('change', async (e) => {
        const key = (el as HTMLElement).dataset.key!;
        const value = (e.target as HTMLSelectElement).value;
        const isNumber = key === 'note_spacing';
        await settingsApi.update({ [key]: isNumber ? parseInt(value) : value } as Partial<AppSettings>);
        if (key === 'theme') {
          document.documentElement.setAttribute('data-theme', value);
        }
        if (key === 'board_bg_style') {
          document.documentElement.setAttribute('data-board-bg', value);
        }
        if (key === 'note_spacing') {
          document.documentElement.style.setProperty('--note-spacing', value + 'px');
        }
        toast.success('设置已保存');
      });
    });

    container.querySelectorAll('.settings-toggle input').forEach(el => {
      el.addEventListener('change', async (e) => {
        const key = (el as HTMLElement).dataset.key!;
        const value = (e.target as HTMLInputElement).checked;
        await settingsApi.update({ [key]: value } as Partial<AppSettings>);
        toast.success('设置已保存');
      });
    });

    container.querySelectorAll('input[data-key="quote_interval"]').forEach(el => {
      el.addEventListener('change', async (e) => {
        const key = (el as HTMLElement).dataset.key!;
        const value = (e.target as HTMLInputElement).value;
        await settingsApi.update({ [key]: value } as Partial<AppSettings>);
        toast.success('设置已保存');
      });
    });

    document.getElementById('addCategoryBtn')?.addEventListener('click', async () => {
      const nameInput = container.querySelector('.settings-cat-name') as HTMLInputElement;
      const colorInput = container.querySelector('.settings-cat-color') as HTMLInputElement;
      const name = nameInput.value.trim();
      if (!name) { toast.warning('请输入分类名称'); return; }
      await categoryApi.create(name, colorInput.value);
      nameInput.value = '';
      toast.success('分类已添加');
      settingsPage.init();
    });

    container.querySelectorAll('.settings-category-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        await categoryApi.delete(id);
        toast.info('分类已删除');
        settingsPage.init();
      });
    });

    container.querySelectorAll('.settings-category-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        const categories = store.get<Category[]>('categories') ?? [];
        const cat = categories.find(c => c.id === id);
        if (!cat) return;
        const newName = prompt('新名称:', cat.name);
        if (!newName) return;
        const newColor = prompt('新颜色 (十六进制):', cat.color);
        if (!newColor) return;
        await categoryApi.update(id, newName, newColor);
        toast.success('分类已更新');
        settingsPage.init();
      });
    });

    document.getElementById('addTimeTypeBtn')?.addEventListener('click', async () => {
      const nameInput = container.querySelector('.tt-name-input') as HTMLInputElement;
      const colorInput = container.querySelector('.tt-color-input') as HTMLInputElement;
      const name = nameInput.value.trim();
      if (!name) { toast.warning('请输入类型名称'); return; }
      await timeTypeApi.create(name, colorInput.value);
      nameInput.value = '';
      toast.success('时间类型已添加');
      settingsPage.init();
    });

    container.querySelectorAll('.tt-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.ttId!;
        await timeTypeApi.delete(id);
        toast.info('时间类型已删除');
        settingsPage.init();
      });
    });

    container.querySelectorAll('.tt-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const el = btn as HTMLElement;
        const id = el.dataset.ttId!;
        const oldName = el.dataset.ttName!;
        const oldColor = el.dataset.ttColor!;
        const newName = prompt('修改类型名称:', oldName);
        if (!newName || newName === oldName) return;
        const newColor = prompt('修改颜色 (十六进制):', oldColor);
        if (!newColor) return;
        await timeTypeApi.update(id, { name: newName, color: newColor });
        toast.success('时间类型已更新');
        settingsPage.init();
      });
    });

    document.getElementById('addPresetBtn')?.addEventListener('click', async () => {
      const typeSelect = container.querySelector('.preset-type-select') as HTMLSelectElement;
      const durationInput = container.querySelector('.preset-duration-input') as HTMLInputElement;
      const modeSelect = container.querySelector('.preset-mode-select') as HTMLSelectElement;
      const colorInput = container.querySelector('.preset-color-input') as HTMLInputElement;
      const timeType = typeSelect.value;
      const duration = parseInt(durationInput.value) || 25;
      const mode = modeSelect.value;
      const color = colorInput.value;
      if (!timeType) return;
      await presetApi.create({ time_type: timeType, duration_minutes: duration, mode, color });
      toast.success('预设已添加');
      settingsPage.init();
    });

    container.querySelectorAll('.preset-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.presetId!;
        await presetApi.delete(id);
        toast.info('预设已删除');
        settingsPage.init();
      });
    });

    container.querySelectorAll('.preset-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const el = btn as HTMLElement;
        const id = el.dataset.presetId!;
        const oldType = el.dataset.presetType!;
        const oldDuration = el.dataset.presetDuration!;
        const oldMode = el.dataset.presetMode!;
        const oldColor = el.dataset.presetColor!;
        const newType = prompt('修改类型:', oldType);
        if (!newType) return;
        const newDuration = prompt('修改时长(分钟):', oldDuration);
        if (!newDuration) return;
        const newMode = prompt('修改模式(countdown/stopwatch):', oldMode);
        if (!newMode) return;
        const newColor = prompt('修改颜色:', oldColor);
        if (!newColor) return;
        await presetApi.update(id, { time_type: newType, duration_minutes: parseInt(newDuration), mode: newMode, color: newColor });
        toast.success('预设已更新');
        settingsPage.init();
      });
    });

    document.getElementById('saveGoalsBtn')?.addEventListener('click', async () => {
      const dailyInput = container.querySelector('.goal-daily-input') as HTMLInputElement;
      const weeklyInput = container.querySelector('.goal-weekly-input') as HTMLInputElement;
      const daily = parseInt(dailyInput.value) || 120;
      const weekly = parseInt(weeklyInput.value) || 600;
      await goalApi.set('daily', daily);
      await goalApi.set('weekly', weekly);
      toast.success('目标已保存');
    });

    document.getElementById('addQuoteBtn')?.addEventListener('click', async () => {
      const input = container.querySelector('.quote-input') as HTMLInputElement;
      const text = input.value.trim();
      if (!text) return;
      const settings = store.get<AppSettings>('settings');
      let quotes: string[] = [];
      try { quotes = JSON.parse(settings?.quotes || '[]'); } catch { quotes = []; }
      quotes.push(text);
      await settingsApi.update({ quotes: JSON.stringify(quotes) } as Partial<AppSettings>);
      input.value = '';
      toast.success('格言已添加');
      settingsPage.init();
    });

    document.getElementById('addCountdownBtn')?.addEventListener('click', async () => {
      const titleInput = container.querySelector('.cd-title-input') as HTMLInputElement;
      const dateInput = container.querySelector('.cd-date-input') as HTMLInputElement;
      const colorInput = container.querySelector('.cd-color-input') as HTMLInputElement;
      const title = titleInput.value.trim();
      const date = dateInput.value;
      if (!title || !date) { toast.warning('请填写名称和日期'); return; }
      await countdownApi.create(title, date, colorInput.value);
      titleInput.value = '';
      dateInput.value = '';
      toast.success('倒计时已添加');
      settingsPage.init();
    });

    container.querySelectorAll('.cd-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.cdId!;
        await countdownApi.delete(id);
        toast.info('倒计时已删除');
        settingsPage.init();
      });
    });

    document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
      const data = await statsApi.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learning-todo-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('数据已导出');
    });

    document.getElementById('resetTasksBtn')?.addEventListener('click', async () => {
      if (!confirm('确定要清空所有待办吗？统计数据和设置将保留。此操作不可恢复！')) return;
      const result = await statsApi.resetTasks();
      toast.success(result || '待办已清空');
      settingsPage.init();
    });

    document.getElementById('resetDataBtn')?.addEventListener('click', async () => {
      if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) return;
      await statsApi.reset();
      toast.success('数据已清空');
      settingsPage.init();
    });

    // Import time - bulk
    document.getElementById('bulkImportBtn')?.addEventListener('click', async () => {
      const type = (document.getElementById('importTypeSelect') as HTMLSelectElement)?.value;
      const min = parseInt((document.getElementById('importTotalMin') as HTMLInputElement)?.value) || 0;
      if (!type || min <= 0) { toast.info('请选择类型并输入分钟数'); return; }
      await timeRecordApi.create({
        id: 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        date: utils.getTodayStr(),
        time_type: type,
        start_time: null,
        end_time: null,
        total_minutes: min,
        pauses: '[]',
        source: 'import',
        note: '',
        created_at: new Date().toISOString(),
      });
      (document.getElementById('importTotalMin') as HTMLInputElement).value = '';
      toast.success(`累加导入成功: +${Math.floor(min / 60)}h${min % 60 > 0 ? (min % 60) + 'm' : ''}`);
    });

    // Import time - detail
    document.getElementById('detailImportBtn')?.addEventListener('click', async () => {
      const type = (document.getElementById('importDetailType') as HTMLSelectElement)?.value;
      const date = (document.getElementById('importDateInput') as HTMLInputElement)?.value;
      const start = (document.getElementById('importStartTime') as HTMLInputElement)?.value;
      const end = (document.getElementById('importEndTime') as HTMLInputElement)?.value;
      if (!type || !date || !start || !end) { toast.info('请填写完整信息'); return; }
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const totalMin = (eh * 60 + em) - (sh * 60 + sm);
      if (totalMin <= 0) { toast.info('结束时间必须大于开始时间'); return; }
      await timeRecordApi.create({
        id: 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        date,
        time_type: type,
        start_time: start,
        end_time: end,
        total_minutes: totalMin,
        pauses: '[]',
        source: 'import',
        note: '',
        created_at: new Date().toISOString(),
      });
      toast.success(`逐条导入成功: ${Math.floor(totalMin / 60)}h${totalMin % 60 > 0 ? (totalMin % 60) + 'm' : ''}`);
    });

    document.getElementById('importDataBtn')?.addEventListener('click', () => {
      document.getElementById('importFileInput')?.click();
    });

    document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
       const file = (e.target as HTMLInputElement).files?.[0];
       if (!file) return;
       try {
         const text = await file.text();
         const result = await statsApi.importLegacyJson(text);
         toast.success(result || '老版本数据导入成功');
         settingsPage.init();
       } catch (err: any) {
         toast.error('导入失败: ' + (err?.message || '请检查文件格式'));
       }
       (e.target as HTMLInputElement).value = '';
     });
  },
};
