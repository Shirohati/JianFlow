import { store } from '../store';
import { settingsApi, categoryApi, statsApi, timeRecordApi, timeTypeApi, presetApi, goalApi, countdownApi, activityApi, aiApi, reminderApi, personaApi } from '../api';
import type { AiPersona } from '../api';
import { initIcons } from '../icons';
import { toast } from '../components/toast';
import { modal } from '../components/modal';
import { utils } from '../utils';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { AppSettings, Category, TimeType, PomodoroPreset, Goal, Countdown, ActivitySettings, ActivityState, CategoryRule, ActivityBatch } from '../api';

function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}

// 活动监测相关状态（模块级）
let activitySettings: ActivitySettings | null = null;
let activityState: ActivityState | null = null;
let activityBatches: ActivityBatch[] = [];

// 人设列表
let personaList: AiPersona[] = [];

function activityStatusBadge(state: ActivityState | null, settings: ActivitySettings | null): string {
  if (!settings || !settings.monitor_enabled) {
    return `<span class="activity-status-badge activity-status-badge--stopped">⚫ 已禁用</span>`;
  }
  if (!state) return `<span class="activity-status-badge activity-status-badge--stopped">⚫ 已停止</span>`;
  if (state.paused) return `<span class="activity-status-badge activity-status-badge--paused">🟡 已暂停</span>`;
  if (state.running) return `<span class="activity-status-badge activity-status-badge--running">🟢 运行中</span>`;
  return `<span class="activity-status-badge activity-status-badge--stopped">⚫ 已停止</span>`;
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

    // 加载活动监测相关数据（失败不影响主设置页）
    try {
      activitySettings = await activityApi.getSettings();
      store.set('activitySettings', activitySettings);
      activityState = await activityApi.getState();
    } catch (err) {
      console.error('activity settings load failed:', err);
      activitySettings = null;
      activityState = null;
    }
    try {
      activityBatches = await activityApi.getBatches();
    } catch (err) {
      console.error('activity batches load failed:', err);
      activityBatches = [];
    }

    // 加载人设列表
    try {
      personaList = await personaApi.list();
    } catch (err) {
      console.error('persona list load failed:', err);
      personaList = [];
    }

    settingsPage.render(inner, settings, categories, timeTypes, presets, goals, countdowns);
    settingsPage.bindEvents(inner);
    settingsPage.renderActivityBatches(inner);
    settingsPage.refreshReminderStatus();
    initIcons();
  },

  async refreshReminderStatus(): Promise<void> {
    const badge = document.getElementById('reminderStatusBadge');
    if (!badge) return;
    try {
      const running = await reminderApi.status();
      badge.textContent = running ? '运行中' : '已停止';
      badge.className = `badge ${running ? 'badge--success' : 'badge--ghost'}`;
    } catch {
      badge.textContent = '未知';
      badge.className = 'badge badge--ghost';
    }
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
          <span class="settings-label">导入老版本数据（导出格式）</span>
          <button class="btn btn--sm" id="importDataBtn">${icon('upload', 'size="14"')} 导入</button>
          <input type="file" id="importFileInput" accept=".json" style="display:none" />
        </div>
        <div class="settings-row">
          <span class="settings-label">从 v0.1 迁移全部数据</span>
          <button class="btn btn--primary btn--sm" id="importV01NativeBtn">${icon('file-up', 'size="14"')} 选择 v0.1 数据文件</button>
        </div>
        <div class="settings-row">
          <span class="settings-label">自动检测 v0.1 数据</span>
          <button class="btn btn--primary btn--sm" id="importV01AutoBtn">${icon('search', 'size="14"')} 自动导入</button>
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

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('monitor', 'size="14"')} 🖥 活动监测</h3>
        <div class="settings-row">
          <span class="settings-label">启用监测</span>
          <label class="settings-toggle">
            <input type="checkbox" data-act-key="monitor_enabled" ${activitySettings?.monitor_enabled ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <span class="settings-label">监测状态</span>
          <span id="actStatusBadge">${activityStatusBadge(activityState, activitySettings)}</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">暂停 / 恢复</span>
          <button class="btn btn--sm" id="actTogglePauseBtn">${icon('pause', 'size="14"')} 切换暂停</button>
        </div>
        <div class="settings-row">
          <span class="settings-label">采样间隔 (秒)</span>
          <input type="number" class="input input--sm" data-act-key="sample_interval_sec" value="${activitySettings?.sample_interval_sec ?? 10}" min="5" max="30" style="width:80px" />
        </div>
        <div class="settings-row">
          <span class="settings-label">空闲阈值 (分钟)</span>
          <input type="number" class="input input--sm" data-act-key="idle_threshold_min" value="${activitySettings?.idle_threshold_min ?? 5}" min="1" max="30" style="width:80px" />
        </div>
        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:var(--space-1)">
          <span class="settings-label">排除关键词 (一行一个)</span>
          <textarea class="input" id="actExcludeKeywords" rows="4" style="resize:vertical;font-family:var(--font-mono);font-size:var(--text-xs)">${activitySettings?.exclude_keywords?.join('\n') ?? ''}</textarea>
        </div>
        <div class="settings-row">
          <span class="settings-label">分类规则</span>
          <button class="btn btn--sm" id="actRulesBtn">${icon('list', 'size="14"')} 管理规则</button>
        </div>
      </div>

        <div class="settings-section">
        <h3 class="settings-section-title">${icon('sparkles', 'size="14"')} 🤖 AI 分析</h3>
        <div class="settings-row">
          <span class="settings-label">启用 AI 分析</span>
          <label class="settings-toggle">
            <input type="checkbox" data-act-key="ai_api_enabled" ${activitySettings?.ai_api_enabled ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:var(--space-1)">
          <span class="settings-label">人设</span>
          <div class="persona-selector" id="personaSelector">
            ${personaList.length > 0 ? personaList.map(p => `
              <label class="persona-card${activitySettings?.current_persona_id === p.id ? ' persona-card--active' : ''}${p.id === 'persona_default' && (!activitySettings?.current_persona_id) ? ' persona-card--active' : ''}" data-persona-id="${p.id}">
                <input type="radio" name="persona" value="${p.id}" ${activitySettings?.current_persona_id === p.id ? 'checked' : ''}${p.id === 'persona_default' && !activitySettings?.current_persona_id ? 'checked' : ''} style="display:none" />
                <span class="persona-card__name">${utils.escapeHtml(p.name)}</span>
                <span class="persona-card__desc">${utils.escapeHtml(p.description)}</span>
              </label>
            `).join('') : '<span style="font-size:var(--text-xs);color:var(--text-lighter)">暂无可用人设</span>'}
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">API Base URL</span>
          <input type="text" class="input input--sm" data-act-key="ai_api_base_url" value="${utils.escapeHtml(activitySettings?.ai_api_base_url ?? '')}" style="width:280px" placeholder="https://api.openai.com/v1" />
        </div>
        <div class="settings-row">
          <span class="settings-label">API Key</span>
          <input type="password" class="input input--sm" data-act-key="ai_api_key" value="${utils.escapeHtml(activitySettings?.ai_api_key ?? '')}" style="width:280px" placeholder="sk-..." />
        </div>
        <div class="settings-row">
          <span class="settings-label">模型名</span>
          <input type="text" class="input input--sm" data-act-key="ai_model" value="${utils.escapeHtml(activitySettings?.ai_model ?? '')}" style="width:200px" placeholder="gpt-4o-mini" />
        </div>
        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:var(--space-1)">
          <span class="settings-label">系统提示词</span>
          <textarea class="input" id="actAiSystemPrompt" rows="4" style="resize:vertical;font-size:var(--text-xs)">${utils.escapeHtml(activitySettings?.ai_system_prompt ?? '')}</textarea>
        </div>
        <div class="settings-row">
          <span class="settings-label">显示思考链</span>
          <label class="settings-toggle">
            <input type="checkbox" data-act-key="show_thinking" ${activitySettings?.show_thinking ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <span class="settings-label">严格模式</span>
          <label class="settings-toggle">
            <input type="checkbox" data-act-key="ai_strict_mode" ${activitySettings?.ai_strict_mode ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <span class="settings-label">测试连接</span>
          <button class="btn btn--sm" id="actAiTestBtn">${icon('zap', 'size="14"')} 测试</button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('bell', 'size="14"')} 🔔 提醒通知
          <span id="reminderStatusBadge" class="badge badge--ghost" style="margin-left:8px;font-size:var(--text-xs)">检查中...</span>
        </h3>
        <div class="settings-row">
          <span class="settings-label">空闲提醒</span>
          <label class="settings-toggle">
            <input type="checkbox" id="remindIdleToggle" ${activitySettings?.reminder_config?.idle_reminder_enabled ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <span class="settings-label">截止提醒</span>
          <label class="settings-toggle">
            <input type="checkbox" id="remindDeadlineToggle" ${activitySettings?.reminder_config?.deadline_reminder_enabled ? 'checked' : ''} />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <span class="settings-label">空闲阈值 (分钟)</span>
          <input type="number" class="input input--sm" id="remindIdleMin" value="${activitySettings?.reminder_config?.idle_threshold_min ?? 5}" min="1" max="60" style="width:80px" />
        </div>
        <div class="settings-row">
          <span class="settings-label">检查间隔 (分钟)</span>
          <input type="number" class="input input--sm" id="remindCheckInterval" value="${activitySettings?.reminder_config?.check_interval_min ?? 5}" min="1" max="30" style="width:80px" />
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">${icon('database', 'size="14"')} 📥 活动数据管理</h3>
        <div class="settings-row" style="flex-wrap:wrap;gap:var(--space-2)">
          <button class="btn btn--sm" id="actExportCsvBtn">${icon('file-text', 'size="14"')} 导出 CSV</button>
          <button class="btn btn--sm" id="actExportJsonBtn">${icon('file-text', 'size="14"')} 导出 JSON</button>
          <button class="btn btn--sm" id="actImportCsvBtn">${icon('upload', 'size="14"')} 导入 CSV</button>
          <button class="btn btn--sm" id="actImportJsonBtn">${icon('upload', 'size="14"')} 导入 JSON</button>
        </div>
        <div class="settings-row" style="flex-wrap:wrap;gap:var(--space-2);align-items:center">
          <span class="settings-label">清除某日数据</span>
          <input type="date" class="input input--sm" id="actClearDateInput" style="width:140px" />
          <button class="btn btn--danger btn--sm" id="actClearDateBtn">${icon('trash-2', 'size="14"')} 清除</button>
        </div>
        <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:var(--space-2)">
          <span class="settings-label">导入历史</span>
          <div id="actBatchesList"></div>
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

    document.getElementById('importV01NativeBtn')?.addEventListener('click', async () => {
      try {
        const filePath = await open({
          multiple: false,
          filters: [{ name: 'v0.1 Data', extensions: ['json'] }],
        });
        if (!filePath) return;
        const result = await statsApi.importV01Native(filePath as string);
        toast.success(result);
        settingsPage.init();
      } catch (err: any) {
        toast.error('迁移失败: ' + (err?.message || String(err)));
      }
    });

    document.getElementById('importV01AutoBtn')?.addEventListener('click', async () => {
      try {
        const result = await statsApi.importV01Auto();
        toast.success(result);
        settingsPage.init();
      } catch (err: any) {
        toast.error('自动导入失败: ' + (err?.message || String(err)));
      }
    });

    settingsPage.bindActivityEvents(container);
  },

  // 活动监测 / AI / 数据管理 相关事件绑定
  bindActivityEvents(container: Element): void {
    // 监测开关与数值字段
    container.querySelectorAll('[data-act-key]').forEach(el => {
      const key = (el as HTMLElement).dataset.actKey!;
      const tag = el.tagName.toLowerCase();
      const handler = async (): Promise<void> => {
        let value: string | number | boolean;
        if (tag === 'input' && (el as HTMLInputElement).type === 'checkbox') {
          value = (el as HTMLInputElement).checked;
        } else if (tag === 'input' && (el as HTMLInputElement).type === 'number') {
          value = parseInt((el as HTMLInputElement).value) || 0;
        } else {
          value = (el as HTMLInputElement).value;
        }
        try {
          activitySettings = await activityApi.updateSettings({ [key]: value } as Partial<ActivitySettings>);
          store.set('activitySettings', activitySettings);
          toast.success('设置已保存');
          settingsPage.refreshActivityStatus(container);
        } catch (err) {
          toast.error('保存失败');
          console.error(err);
        }
      };
      el.addEventListener('change', handler as EventListener);
    });

    // 排除关键词
    const excludeEl = container.querySelector('#actExcludeKeywords');
    if (excludeEl) {
      excludeEl.addEventListener('change', async (e) => {
        const text = (e.target as HTMLTextAreaElement).value;
        const keywords = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        try {
          activitySettings = await activityApi.updateSettings({ exclude_keywords: keywords } as Partial<ActivitySettings>);
          store.set('activitySettings', activitySettings);
          toast.success('排除关键词已保存');
        } catch (err) {
          toast.error('保存失败');
          console.error(err);
        }
      });
    }

    // 系统提示词
    const promptEl = container.querySelector('#actAiSystemPrompt');
    if (promptEl) {
      promptEl.addEventListener('change', async (e) => {
        const value = (e.target as HTMLTextAreaElement).value;
        try {
          activitySettings = await activityApi.updateSettings({ ai_system_prompt: value } as Partial<ActivitySettings>);
          store.set('activitySettings', activitySettings);
          toast.success('系统提示词已保存');
        } catch (err) {
          toast.error('保存失败');
          console.error(err);
        }
      });
    }

    // 提醒设置 - 空闲提醒开关
    const remindIdleToggle = container.querySelector('#remindIdleToggle');
    if (remindIdleToggle) {
      remindIdleToggle.addEventListener('change', async (e) => {
        const val = (e.target as HTMLInputElement).checked;
        try {
          activitySettings = await activityApi.updateSettings({ reminder_config: { ...activitySettings?.reminder_config, idle_reminder_enabled: val } } as Partial<ActivitySettings>);
          store.set('activitySettings', activitySettings);
          if (val) await reminderApi.start();
          else await reminderApi.stop();
          toast.success(val ? '空闲提醒已开启' : '空闲提醒已关闭');
          settingsPage.refreshReminderStatus();
        } catch (err) { toast.error('保存失败'); }
      });
    }

    // 提醒设置 - 截止提醒开关
    const remindDeadlineToggle = container.querySelector('#remindDeadlineToggle');
    if (remindDeadlineToggle) {
      remindDeadlineToggle.addEventListener('change', async (e) => {
        const val = (e.target as HTMLInputElement).checked;
        try {
          activitySettings = await activityApi.updateSettings({ reminder_config: { ...activitySettings?.reminder_config, deadline_reminder_enabled: val } } as Partial<ActivitySettings>);
          store.set('activitySettings', activitySettings);
          if (val) await reminderApi.start();
          toast.success(val ? '截止提醒已开启' : '截止提醒已关闭');
          settingsPage.refreshReminderStatus();
        } catch (err) { toast.error('保存失败'); }
      });
    }

    // 提醒设置 - 空闲阈值
    const remindIdleMin = container.querySelector('#remindIdleMin');
    if (remindIdleMin) {
      remindIdleMin.addEventListener('change', async (e) => {
        const val = parseInt((e.target as HTMLInputElement).value) || 5;
        try {
          activitySettings = await activityApi.updateSettings({ reminder_config: { ...activitySettings?.reminder_config, idle_threshold_min: val } } as Partial<ActivitySettings>);
          store.set('activitySettings', activitySettings);
          toast.success('空闲阈值已保存');
        } catch (err) { toast.error('保存失败'); }
      });
    }

    // 提醒设置 - 检查间隔
    const remindCheckInterval = container.querySelector('#remindCheckInterval');
    if (remindCheckInterval) {
      remindCheckInterval.addEventListener('change', async (e) => {
        const val = parseInt((e.target as HTMLInputElement).value) || 5;
        try {
          activitySettings = await activityApi.updateSettings({ reminder_config: { ...activitySettings?.reminder_config, check_interval_min: val } } as Partial<ActivitySettings>);
          store.set('activitySettings', activitySettings);
          toast.success('检查间隔已保存');
        } catch (err) { toast.error('保存失败'); }
      });
    }

    // 暂停/恢复
    document.getElementById('actTogglePauseBtn')?.addEventListener('click', async () => {
      try {
        const state = activityState;
        if (state && state.paused) {
          await activityApi.resume();
          toast.success('已恢复监测');
        } else {
          await activityApi.pause();
          toast.success('已暂停监测');
        }
        activityState = await activityApi.getState();
        settingsPage.refreshActivityStatus(container);
      } catch (err) {
        toast.error('操作失败');
        console.error(err);
      }
    });

    // 分类规则管理
    document.getElementById('actRulesBtn')?.addEventListener('click', () => settingsPage.openRulesModal());

    // 人设选择
    const personaSelector = document.getElementById('personaSelector');
    if (personaSelector) {
      personaSelector.querySelectorAll('.persona-card').forEach(card => {
        card.addEventListener('click', async () => {
          const id = (card as HTMLElement).dataset.personaId!;
          // 更新高亮
          personaSelector.querySelectorAll('.persona-card').forEach(c => c.classList.remove('persona-card--active'));
          card.classList.add('persona-card--active');
          (card.querySelector('input') as HTMLInputElement).checked = true;
          // 保存设置
          try {
            activitySettings = await activityApi.updateSettings({ current_persona_id: id } as Partial<ActivitySettings>);
            store.set('activitySettings', activitySettings);
            toast.success(`人设已切换为「${(card.querySelector('.persona-card__name') as HTMLElement)?.textContent || ''}」`);
          } catch (err) {
            toast.error('保存失败');
            console.error(err);
          }
        });
      });
    }

    // AI 测试连接
    document.getElementById('actAiTestBtn')?.addEventListener('click', async (e) => {
      const btn = e.target as HTMLElement;
      const original = btn.textContent;
      btn.textContent = '测试中...';
      btn.setAttribute('disabled', 'true');
      try {
        const result = await aiApi.test();
        toast.success('测试成功：' + result);
      } catch (err) {
        toast.error('测试失败：' + (err instanceof Error ? err.message : String(err)));
      } finally {
        btn.textContent = original;
        btn.removeAttribute('disabled');
        initIcons();
      }
    });

    // 导出 CSV
    document.getElementById('actExportCsvBtn')?.addEventListener('click', async () => {
      try {
        const content = await activityApi.exportCsv();
        const filePath = await save({
          defaultPath: `activity-${utils.getTodayStr()}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        });
        if (!filePath) return;
        await writeTextFile(filePath, content);
        toast.success('CSV 已导出');
      } catch (err) {
        toast.error('导出失败：' + (err instanceof Error ? err.message : String(err)));
      }
    });

    // 导出 JSON
    document.getElementById('actExportJsonBtn')?.addEventListener('click', async () => {
      try {
        const content = await activityApi.exportJson();
        const filePath = await save({
          defaultPath: `activity-${utils.getTodayStr()}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (!filePath) return;
        await writeTextFile(filePath, content);
        toast.success('JSON 已导出');
      } catch (err) {
        toast.error('导出失败：' + (err instanceof Error ? err.message : String(err)));
      }
    });

    // 导入 CSV
    document.getElementById('actImportCsvBtn')?.addEventListener('click', async () => {
      try {
        const filePath = await open({
          multiple: false,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        });
        if (!filePath) return;
        const content = await readTextFile(filePath as string);
        const batchId = await activityApi.importCsv(content);
        toast.success('CSV 导入成功，批次：' + batchId);
        activityBatches = await activityApi.getBatches();
        settingsPage.renderActivityBatches(container);
      } catch (err) {
        toast.error('导入失败：' + (err instanceof Error ? err.message : String(err)));
      }
    });

    // 导入 JSON
    document.getElementById('actImportJsonBtn')?.addEventListener('click', async () => {
      try {
        const filePath = await open({
          multiple: false,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (!filePath) return;
        const content = await readTextFile(filePath as string);
        const batchId = await activityApi.importJson(content);
        toast.success('JSON 导入成功，批次：' + batchId);
        activityBatches = await activityApi.getBatches();
        settingsPage.renderActivityBatches(container);
      } catch (err) {
        toast.error('导入失败：' + (err instanceof Error ? err.message : String(err)));
      }
    });

    // 清除某日数据
    document.getElementById('actClearDateBtn')?.addEventListener('click', async () => {
      const date = (document.getElementById('actClearDateInput') as HTMLInputElement)?.value;
      if (!date) { toast.warning('请选择日期'); return; }
      const ok = await modal.confirm({ title: '确认清除', message: `确定要清除 ${date} 的活动数据吗？` });
      if (!ok) return;
      try {
        const n = await activityApi.clearDate(date);
        toast.success(`已清除 ${n} 条记录`);
      } catch (err) {
        toast.error('清除失败：' + (err instanceof Error ? err.message : String(err)));
      }
    });
  },

  // 刷新监测状态徽章
  refreshActivityStatus(container: Element): void {
    const badge = container.querySelector('#actStatusBadge');
    if (badge) badge.innerHTML = activityStatusBadge(activityState, activitySettings);
  },

  // 渲染导入批次列表
  renderActivityBatches(container: Element): void {
    const el = container.querySelector('#actBatchesList');
    if (!el) return;
    if (activityBatches.length === 0) {
      el.innerHTML = '<div style="font-size:var(--text-xs);color:var(--text-lighter);padding:var(--space-2)">暂无导入历史</div>';
      return;
    }
    el.innerHTML = activityBatches.map(b => `
      <div class="import-batch-item" data-batch-id="${b.batch_id}">
        <span class="import-batch-date">${b.date}</span>
        <span class="import-batch-count">${b.count} 条</span>
        <span class="import-batch-duration">${utils.formatMinutes(Math.round(b.total_seconds / 60))}</span>
        <button class="btn btn--ghost btn--sm act-batch-delete" data-batch-id="${b.batch_id}" title="删除该批次">${icon('trash-2', 'size="14"')}</button>
      </div>
    `).join('');
    initIcons();
    el.querySelectorAll('.act-batch-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const batchId = (btn as HTMLElement).dataset.batchId!;
        const ok = await modal.confirm({ title: '确认删除', message: '删除该批次将一并移除其导入的所有会话，是否继续？' });
        if (!ok) return;
        try {
          const n = await activityApi.deleteBatch(batchId);
          toast.success(`已删除 ${n} 条记录`);
          activityBatches = await activityApi.getBatches();
          settingsPage.renderActivityBatches(container);
        } catch (err) {
          toast.error('删除失败：' + (err instanceof Error ? err.message : String(err)));
        }
      });
    });
  },

  // 分类规则管理弹窗
  async openRulesModal(): Promise<void> {
    let rules: CategoryRule[] = [];
    try {
      rules = await activityApi.getRules();
    } catch (err) {
      toast.error('加载规则失败：' + (err instanceof Error ? err.message : String(err)));
      return;
    }

    const renderRows = (list: CategoryRule[]): string => {
      if (list.length === 0) return '<div style="font-size:var(--text-xs);color:var(--text-lighter);padding:var(--space-2)">暂无规则</div>';
      return list.map(r => `
        <tr class="rules-table__row" data-rule-id="${r.id}">
          <td>${utils.escapeHtml(r.rule_type)}</td>
          <td>${utils.escapeHtml(r.mode)}</td>
          <td>${utils.escapeHtml(r.value)}</td>
          <td><span class="rules-table__cat" data-cat="${r.category}">${utils.escapeHtml(r.category)}</span></td>
          <td>${r.is_default
            ? '<span class="rules-table__default">默认</span>'
            : `<button class="btn btn--ghost btn--sm rule-delete" data-rule-id="${r.id}">${icon('trash-2', 'size="12"')}</button>`
          }</td>
        </tr>
      `).join('');
    };

    const content = `
      <div class="rules-modal">
        <table class="rules-table">
          <thead>
            <tr><th>类型</th><th>模式</th><th>值</th><th>分类</th><th>操作</th></tr>
          </thead>
          <tbody id="rulesTableBody">${renderRows(rules)}</tbody>
        </table>
        <div class="rules-add-form">
          <input class="input input--sm rule-add-type" placeholder="类型(process/web)" style="width:120px" />
          <select class="input input--sm rule-add-mode" style="width:90px">
            <option value="contains">包含</option>
            <option value="equals">等于</option>
            <option value="regex">正则</option>
          </select>
          <input class="input input--sm rule-add-value" placeholder="匹配值" style="width:140px" />
          <select class="input input--sm rule-add-category" style="width:90px">
            ${['学习', '编程', '浏览', '社交', '娱乐', '其他'].map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <button class="btn btn--primary btn--sm" id="ruleAddBtn">${icon('plus', 'size="14"')} 添加</button>
        </div>
        <div style="font-size:var(--text-2xs);color:var(--text-lighter);margin-top:var(--space-2)">默认规则（dcr_ 前缀）为只读，用户规则可删除。</div>
      </div>
    `;

    modal.open({
      title: '分类规则管理',
      content,
      onConfirm: async () => {
        try {
          await activityApi.setRules(rules);
          toast.success('规则已保存');
        } catch (err) {
          toast.error('保存失败：' + (err instanceof Error ? err.message : String(err)));
        }
      },
    });

    // 绑定删除与新增（操作本地 rules 列表，确认时统一保存）
    const tbody = document.getElementById('rulesTableBody');
    tbody?.querySelectorAll('.rule-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.ruleId!;
        rules = rules.filter(r => r.id !== id);
        tbody.innerHTML = renderRows(rules);
        initIcons();
        settingsPage.rebindRuleDeletes(tbody, rules);
      });
    });

    document.getElementById('ruleAddBtn')?.addEventListener('click', () => {
      const type = (document.querySelector('.rule-add-type') as HTMLInputElement)?.value.trim();
      const mode = (document.querySelector('.rule-add-mode') as HTMLSelectElement)?.value;
      const value = (document.querySelector('.rule-add-value') as HTMLInputElement)?.value.trim();
      const category = (document.querySelector('.rule-add-category') as HTMLSelectElement)?.value;
      if (!type || !value || !category) { toast.warning('请填写完整'); return; }
      const newRule: CategoryRule = {
        id: utils.generateId('cr'),
        rule_type: type,
        mode,
        value,
        category,
        is_default: false,
      };
      rules.push(newRule);
      if (tbody) {
        tbody.innerHTML = renderRows(rules);
        initIcons();
        settingsPage.rebindRuleDeletes(tbody, rules);
      }
      // 清空新增表单
      (document.querySelector('.rule-add-type') as HTMLInputElement).value = '';
      (document.querySelector('.rule-add-value') as HTMLInputElement).value = '';
    });
  },

  // 重新绑定规则删除按钮（删除后重建 DOM 需重新绑定）
  rebindRuleDeletes(tbody: HTMLElement, rules: CategoryRule[]): void {
    tbody.querySelectorAll('.rule-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.ruleId!;
        const idx = rules.findIndex(r => r.id === id);
        if (idx >= 0) {
          rules.splice(idx, 1);
          tbody.innerHTML = rules.map(r => `
            <tr class="rules-table__row" data-rule-id="${r.id}">
              <td>${utils.escapeHtml(r.rule_type)}</td>
              <td>${utils.escapeHtml(r.mode)}</td>
              <td>${utils.escapeHtml(r.value)}</td>
              <td><span class="rules-table__cat">${utils.escapeHtml(r.category)}</span></td>
              <td>${r.is_default
                ? '<span class="rules-table__default">默认</span>'
                : `<button class="btn btn--ghost btn--sm rule-delete" data-rule-id="${r.id}">${icon('trash-2', 'size="12"')}</button>`
              }</td>
            </tr>
          `).join('');
          initIcons();
          settingsPage.rebindRuleDeletes(tbody, rules);
        }
      });
    });
  },
};
