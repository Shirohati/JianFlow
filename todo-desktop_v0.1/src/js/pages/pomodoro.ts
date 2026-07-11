import { store } from '../store';
import { presetApi, timeRecordApi, timeTypeApi, goalApi, countdownApi, settingsApi } from '../api';
import { utils } from '../utils';
import { initIcons } from '../icons';
import { toast } from '../components/toast';
import type { PomodoroPreset, TimeType, Goal, Countdown, AppSettings, TimeRecord } from '../api';

function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}

interface PomoState {
  running: boolean;
  paused: boolean;
  mode: 'countdown' | 'stopwatch';
  timeType: string;
  color: string;
  durationMinutes: number;
  elapsedSeconds: number;
  startTime: string | null;
  pauses: { at: number; resumedAt: number }[];
}

let pomoState: PomoState | null = null;
let pomoInterval: number | null = null;
let quoteIdx = -1;
let quoteTimer: number | null = null;

export const pomodoroPage = {
  async init(): Promise<void> {
    const inner = document.querySelector('#page-pomodoro .page__inner');
    if (!inner) return;

    // Don't re-initialize if timer is already running
    if (pomoState && pomoState.running) {
      const presets = await presetApi.list();
      const timeTypes = await timeTypeApi.list();
      const goals = await goalApi.list();
      const countdowns = await countdownApi.list();
      const settings = await settingsApi.get();
      store.set('pomodoroPresets', presets);
      store.set('timeTypes', timeTypes);
      store.set('goals', goals);
      store.set('countdowns', countdowns);
      pomodoroPage.render(inner, presets, timeTypes, goals, countdowns, settings);
      pomodoroPage.bindEvents(inner);
      initIcons();
      pomodoroPage.loadTodayRecords();
      pomodoroPage.loadQuotes(settings);
      pomodoroPage.updateTimerUI();
      // Restart the tick interval since DOM was recreated
      pomodoroPage.startTick();

      const layout = document.querySelector('.pomo-layout') as HTMLElement;
      const timerCard = document.querySelector('.pomo-timer-card') as HTMLElement;
      const presets2 = document.querySelector('.pomo-presets') as HTMLElement;
      const quickRow = document.querySelector('.pomo-quick-row') as HTMLElement;
      const startBtn = document.getElementById('pomoStart');
      const pauseBtn = document.getElementById('pomoPause');
      const stopBtn = document.getElementById('pomoStop');
      const progress = document.getElementById('pomoProgress');

      if (startBtn) startBtn.style.display = 'none';
      if (quickRow) quickRow.style.display = 'none';
      if (presets2) presets2.style.display = 'none';
      if (pauseBtn) pauseBtn.style.display = '';
      if (stopBtn) stopBtn.style.display = '';
      if (progress) progress.style.display = '';
      if (timerCard) timerCard.classList.add('pomo-timer-card--running');
      if (layout) layout.classList.add('pomo-layout--running');
      return;
    }

    const presets = await presetApi.list();
    const timeTypes = await timeTypeApi.list();
    const goals = await goalApi.list();
    const countdowns = await countdownApi.list();
    const settings = await settingsApi.get();

    store.set('pomodoroPresets', presets);
    store.set('timeTypes', timeTypes);
    store.set('goals', goals);
    store.set('countdowns', countdowns);

    pomodoroPage.render(inner, presets, timeTypes, goals, countdowns, settings);
    pomodoroPage.bindEvents(inner);
    initIcons();
  },

  render(
    container: Element,
    presets: PomodoroPreset[],
    timeTypes: TimeType[],
    goals: Goal[],
    countdowns: Countdown[],
    settings: AppSettings
  ): void {
    const dailyGoal = goals.find(g => g.goal_type === 'daily');
    const dailyTarget = dailyGoal ? dailyGoal.target_minutes : 120;
    const todayMin = pomodoroPage.getTodayMinutes();

    container.innerHTML = `
      <div class="pomo-layout">
        <div class="pomo-main">
          <div class="pomo-timer-card">
            <div class="pomo-timer-type" id="pomoTypeName" style="color:var(--color-primary)">准备开始</div>
            <div class="pomo-timer-display" id="pomoTimer">00:00</div>
            <div class="pomo-timer-progress" id="pomoProgress" style="display:none">
              <div class="pomo-progress-bar" id="pomoProgressBar"></div>
            </div>
            <div class="pomo-timer-controls">
              <button class="btn btn--primary pomo-ctrl-btn" id="pomoStart">${icon('play', 'size="18"')} 开始</button>
              <button class="btn pomo-ctrl-btn" id="pomoPause" style="display:none">${icon('pause', 'size="18"')} 暂停</button>
              <button class="btn btn--danger pomo-ctrl-btn" id="pomoStop" style="display:none">${icon('square', 'size="16"')} 停止</button>
            </div>
          </div>

          <div class="pomo-quick">
            <div class="pomo-quick-row">
              <input type="number" class="input input--sm pomo-quick-min" id="pomoQuickMin" value="25" min="1" max="180" style="width:64px" />
              <span style="font-size:var(--text-sm);color:var(--text-lighter)">分钟</span>
              <select class="input input--sm pomo-quick-type" id="pomoQuickType">
                ${timeTypes.map(t => `<option value="${t.name}" data-color="${t.color}">${t.name}</option>`).join('')}
              </select>
              <select class="input input--sm pomo-quick-mode" id="pomoQuickMode">
                <option value="countdown">倒计时</option>
                <option value="stopwatch">正向计时</option>
              </select>
              <button class="btn btn--primary btn--sm" id="pomoQuickStart">${icon('play', 'size="14"')} 快速开始</button>
            </div>
          </div>

          <div class="pomo-presets" id="pomoPresets">
            <div class="pomo-presets-label">${icon('zap', 'size="14"')} 预设快捷</div>
            <div class="pomo-presets-row">
              ${presets.length > 0 ? presets.map(p => `
                <button class="pomo-preset-btn" data-id="${p.id}" style="--preset-color:${p.color};border-color:${p.color}40">
                  <span class="pomo-preset-dot" style="background:${p.color}"></span>
                  <span>${p.time_type} ${p.duration_minutes}m</span>
                  <span style="font-size:var(--text-2xs);color:var(--text-lighter)">${p.mode === 'countdown' ? '倒计时' : '正向'}</span>
                </button>
              `).join('') : '<span style="font-size:var(--text-xs);color:var(--text-lighter)">暂无预设，去设置页创建</span>'}
            </div>
          </div>
        </div>

        <div class="pomo-sidebar">
          <div class="pomo-goal-card">
            <div class="pomo-goal-title">${icon('target', 'size="14"')} 今日目标</div>
            <div class="pomo-goal-progress">
              <div class="pomo-goal-bar">
                <div class="pomo-goal-fill" style="width:${Math.min(100, Math.round((todayMin / dailyTarget) * 100))}%"></div>
              </div>
              <div class="pomo-goal-text">${todayMin}m / ${dailyTarget}m</div>
            </div>
          </div>

          <div class="pomo-quote-card" id="pomoQuoteCard" style="display:none">
            <div class="pomo-quote-text" id="pomoQuoteText"></div>
          </div>

          ${countdowns.length > 0 ? `
          <div class="pomo-countdown-card">
            <div class="pomo-countdown-title">${icon('hourglass', 'size="14"')} 倒计时</div>
            ${countdowns.slice(0, 5).map(cd => {
              const diff = new Date(cd.target_date + 'T00:00:00').getTime() - Date.now();
              const days = Math.max(0, Math.ceil(diff / 86400000));
              return `<div class="pomo-countdown-item">
                <span class="pomo-countdown-dot" style="background:${cd.color || '#5b7fff'}"></span>
                <span class="pomo-countdown-name">${utils.escapeHtml(cd.title)}</span>
                <span class="pomo-countdown-days">${days}天</span>
              </div>`;
            }).join('')}
          </div>
          ` : ''}

          <div class="pomo-today-card">
            <div class="pomo-today-title">${icon('list-checks', 'size="14"')} 今日记录</div>
            <div id="pomoTodayRecords" class="pomo-today-list"></div>
          </div>
        </div>
      </div>
    `;

    pomodoroPage.loadTodayRecords();
    pomodoroPage.loadQuotes(settings);
  },

  bindEvents(container: Element): void {
    document.getElementById('pomoStart')?.addEventListener('click', () => {
      const min = parseInt((document.getElementById('pomoQuickMin') as HTMLInputElement)?.value || '25');
      const typeSelect = document.getElementById('pomoQuickType') as HTMLSelectElement;
      const modeSelect = document.getElementById('pomoQuickMode') as HTMLSelectElement;
      const timeType = typeSelect?.value || '学习';
      const color = typeSelect?.selectedOptions[0]?.dataset.color || '#5b7fff';
      const mode = (modeSelect?.value || 'countdown') as 'countdown' | 'stopwatch';
      pomodoroPage.start(min, mode, timeType, color);
    });

    document.getElementById('pomoQuickStart')?.addEventListener('click', () => {
      const min = parseInt((document.getElementById('pomoQuickMin') as HTMLInputElement)?.value || '25');
      const typeSelect = document.getElementById('pomoQuickType') as HTMLSelectElement;
      const modeSelect = document.getElementById('pomoQuickMode') as HTMLSelectElement;
      const timeType = typeSelect?.value || '学习';
      const color = typeSelect?.selectedOptions[0]?.dataset.color || '#5b7fff';
      const mode = (modeSelect?.value || 'countdown') as 'countdown' | 'stopwatch';
      pomodoroPage.start(min, mode, timeType, color);
    });

    document.getElementById('pomoPause')?.addEventListener('click', () => pomodoroPage.togglePause());
    document.getElementById('pomoStop')?.addEventListener('click', () => pomodoroPage.stop());

    container.querySelectorAll('.pomo-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const presets = store.get<PomodoroPreset[]>('pomodoroPresets') ?? [];
        const p = presets.find(pr => pr.id === id);
        if (p) pomodoroPage.start(p.duration_minutes, p.mode as 'countdown' | 'stopwatch', p.time_type, p.color);
      });
    });
  },

  start(durationMinutes: number, mode: 'countdown' | 'stopwatch', timeType: string, color: string): void {
    if (pomoState?.running) {
      toast.warning('已有番茄钟在运行');
      return;
    }

    pomoState = {
      running: true,
      paused: false,
      mode,
      timeType,
      color,
      durationMinutes,
      elapsedSeconds: 0,
      startTime: new Date().toTimeString().slice(0, 5),
      pauses: [],
    };

    pomodoroPage.updateTimerUI();
    pomodoroPage.startTick();
    pomodoroPage.startQuotes();

    const layout = document.querySelector('.pomo-layout') as HTMLElement;
    const timerCard = document.querySelector('.pomo-timer-card') as HTMLElement;
    const presets = document.querySelector('.pomo-presets') as HTMLElement;
    const quickRow = document.querySelector('.pomo-quick-row') as HTMLElement;
    const startBtn = document.getElementById('pomoStart');
    const pauseBtn = document.getElementById('pomoPause');
    const stopBtn = document.getElementById('pomoStop');
    const progress = document.getElementById('pomoProgress');

    if (startBtn) startBtn.style.display = 'none';
    if (quickRow) quickRow.style.display = 'none';
    if (presets) presets.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = '';
    if (stopBtn) stopBtn.style.display = '';
    if (progress) progress.style.display = '';

    if (timerCard) {
      timerCard.classList.add('pomo-timer-card--running');
    }
    if (layout) {
      layout.classList.add('pomo-layout--running');
    }
  },

  togglePause(): void {
    if (!pomoState || !pomoState.running) return;
    pomoState.paused = !pomoState.paused;

    if (pomoState.paused) {
      pomoState.pauses.push({ at: pomoState.elapsedSeconds, resumedAt: -1 });
    } else {
      const last = pomoState.pauses[pomoState.pauses.length - 1];
      if (last && last.resumedAt === -1) {
        last.resumedAt = pomoState.elapsedSeconds;
      }
    }

    pomodoroPage.updateTimerUI();
  },

  async stop(): Promise<void> {
    if (!pomoState) return;

    const wasRunning = pomoState.running;
    const savedState = { ...pomoState, pauses: [...pomoState.pauses] };

    // Immediately clear interval and null out state to prevent any further ticks
    pomodoroPage.stopTick();
    pomoState = null;

    if (wasRunning && savedState.elapsedSeconds >= 60) {
      const totalMinutes = Math.round(savedState.elapsedSeconds / 60);
      const now = new Date();
      const endTime = now.toTimeString().slice(0, 5);

      const record: Partial<TimeRecord> = {
        id: 'tr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
        date: utils.getTodayStr(),
        time_type: savedState.timeType,
        start_time: savedState.startTime,
        end_time: endTime,
        total_minutes: totalMinutes,
        pauses: JSON.stringify(savedState.pauses),
        source: 'pomodoro',
        note: '',
        created_at: new Date().toISOString(),
      };

      await timeRecordApi.create(record);
      toast.success(`${savedState.timeType} ${totalMinutes}分钟 已记录`);
      // Refresh store so daily goal progress updates
      const todayRecords = await timeRecordApi.list(utils.getTodayStr());
      store.set('timeRecords', todayRecords);
      pomodoroPage.loadTodayRecords();
    } else if (wasRunning) {
      toast.info('时长不足1分钟，未记录');
    }

    const layout = document.querySelector('.pomo-layout') as HTMLElement;
    const timerCard = document.querySelector('.pomo-timer-card') as HTMLElement;
    const presets = document.querySelector('.pomo-presets') as HTMLElement;
    const startBtn = document.getElementById('pomoStart');
    const quickRow = document.querySelector('.pomo-quick-row') as HTMLElement;
    const pauseBtn = document.getElementById('pomoPause');
    const stopBtn = document.getElementById('pomoStop');
    const progress = document.getElementById('pomoProgress');
    const typeName = document.getElementById('pomoTypeName');
    const timer = document.getElementById('pomoTimer');

    if (startBtn) startBtn.style.display = '';
    if (quickRow) quickRow.style.display = '';
    if (presets) presets.style.display = '';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
    if (progress) progress.style.display = 'none';
    if (typeName) { typeName.textContent = '准备开始'; typeName.style.color = 'var(--color-primary)'; }
    if (timer) { timer.textContent = '00:00'; timer.classList.remove('pomo-timer--paused'); }
    if (timerCard) timerCard.classList.remove('pomo-timer-card--running');
    if (layout) layout.classList.remove('pomo-layout--running');

    const progressBar = document.getElementById('pomoProgressBar') as HTMLElement;
    if (progressBar) progressBar.style.width = '0%';

    pomodoroPage.stopQuotes();
  },

  startTick(): void {
    pomodoroPage.stopTick();
    pomoInterval = window.setInterval(() => {
      if (!pomoState || !pomoState.running || pomoState.paused) return;
      pomoState.elapsedSeconds++;

      if (pomoState.mode === 'countdown') {
        const totalSec = pomoState.durationMinutes * 60;
        if (pomoState.elapsedSeconds >= totalSec) {
          const typeName = pomoState.timeType;
          pomodoroPage.stopTick();
          pomodoroPage.stop();
          toast.success(`${typeName ?? '番茄钟'} 时间到！`);
          return;
        }
      }

      pomodoroPage.updateTimerUI();
    }, 1000);
  },

  stopTick(): void {
    if (pomoInterval !== null) {
      clearInterval(pomoInterval);
      pomoInterval = null;
    }
  },

  updateTimerUI(): void {
    if (!pomoState) return;
    const typeName = document.getElementById('pomoTypeName');
    const timer = document.getElementById('pomoTimer');
    const progressBar = document.getElementById('pomoProgressBar');

    if (typeName) {
      typeName.textContent = pomoState.timeType;
      typeName.style.color = pomoState.color;
    }

    if (timer) {
      let displaySec: number;
      if (pomoState.mode === 'countdown') {
        const totalSec = pomoState.durationMinutes * 60;
        displaySec = Math.max(0, totalSec - pomoState.elapsedSeconds);
      } else {
        displaySec = pomoState.elapsedSeconds;
      }
      const h = Math.floor(displaySec / 3600);
      const m = Math.floor((displaySec % 3600) / 60);
      const s = displaySec % 60;
      timer.textContent = h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      timer.classList.toggle('pomo-timer--paused', pomoState.paused);
    }

    if (progressBar && pomoState.mode === 'countdown') {
      const totalSec = pomoState.durationMinutes * 60;
      const pct = Math.min(100, (pomoState.elapsedSeconds / totalSec) * 100);
      progressBar.style.width = pct + '%';
    }

    const pauseBtn = document.getElementById('pomoPause');
    if (pauseBtn) {
      pauseBtn.innerHTML = pomoState.paused
        ? `${icon('play', 'size="18"')} 继续`
        : `${icon('pause', 'size="18"')} 暂停`;
      initIcons();
    }
  },

  getTodayMinutes(): number {
    const records = store.get<TimeRecord[]>('timeRecords') ?? [];
    const today = utils.getTodayStr();
    return records
      .filter(r => r.date === today && !(r.source === 'import' && !r.start_time))
      .reduce((sum, r) => sum + (r.total_minutes || 0), 0);
  },

  async loadTodayRecords(): Promise<void> {
    const list = document.getElementById('pomoTodayRecords');
    if (!list) return;

    const today = utils.getTodayStr();
    const records = await timeRecordApi.list(today);

    if (records.length === 0) {
      list.innerHTML = '<div style="font-size:var(--text-xs);color:var(--text-lighter);padding:var(--space-2)">暂无记录</div>';
      return;
    }

    list.innerHTML = records.map(r => `
      <div class="pomo-record-item">
        <span class="pomo-record-type">${utils.escapeHtml(r.time_type)}</span>
        <span class="pomo-record-time">${r.start_time || ''}${r.end_time ? ' - ' + r.end_time : ''}</span>
        <span class="pomo-record-dur">${r.total_minutes}m</span>
      </div>
    `).join('');
  },

  loadQuotes(settings: AppSettings): void {
    let quotes: string[] = [];
    try { quotes = JSON.parse(settings.quotes || '[]'); } catch { quotes = []; }
    if (quotes.length === 0) return;

    const card = document.getElementById('pomoQuoteCard');
    const text = document.getElementById('pomoQuoteText');
    if (!card || !text) return;

    card.style.display = '';
    const mode = settings.quote_mode || 'random';
    const interval = parseInt(settings.quote_interval || '30');

    const showQuote = () => {
      if (mode === 'random') {
        text.textContent = '「' + quotes[Math.floor(Math.random() * quotes.length)] + '」';
      } else {
        quoteIdx = (quoteIdx + 1) % quotes.length;
        text.textContent = '「' + quotes[quoteIdx] + '」';
      }
    };

    showQuote();
    quoteTimer = window.setInterval(showQuote, interval * 1000);
  },

  startQuotes(): void {
    if (quoteTimer) return;
    const settings = store.get<AppSettings>('settings');
    if (settings) pomodoroPage.loadQuotes(settings);
  },

  stopQuotes(): void {
    if (quoteTimer) {
      clearInterval(quoteTimer);
      quoteTimer = null;
    }
  },
};
