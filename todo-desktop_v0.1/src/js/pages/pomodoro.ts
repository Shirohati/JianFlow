import { store } from '../store';
import { presetApi, timeRecordApi, timeTypeApi, goalApi, countdownApi, settingsApi, lockApi, type ForegroundInfo } from '../api';
import { utils } from '../utils';
import { initIcons } from '../icons';
import { toast } from '../components/toast';
import type { PomodoroPreset, TimeType, Goal, Countdown, AppSettings, TimeRecord } from '../api';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { feedbackSound, feedbackBurst, feedbackFlash } from '../feedback';

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
let lockActive = false;
let lockYielded = false;
let lockPollTimer: number | null = null;
let lockWarned = false;
let lockUnlisten: UnlistenFn | null = null;
let lockStopUnlisten: UnlistenFn | null = null;
let lockWarnLabel: HTMLSpanElement | null = null;
let lockActionCooldownUntil = 0;
const LOCK_ACTION_COOLDOWN = 600;

interface LockEntry {
  type: 'app' | 'site' | 'keyword';
  value: string;
}

function parseLockEntries(whitelist: string[]): LockEntry[] {
  const entries: LockEntry[] = [];
  for (const raw of whitelist) {
    const v = raw.trim();
    if (!v) continue;
    if (/\.exe$/i.test(v)) {
      entries.push({ type: 'app', value: v });
    } else if (/\S\.\S/.test(v) || /^https?:\/\//i.test(v)) {
      entries.push({ type: 'site', value: v });
    } else {
      entries.push({ type: 'keyword', value: v });
    }
  }
  return entries;
}

function siteHost(value: string): string {
  let host = value.trim().replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0];
  host = host.replace(/^www\./i, '');
  return host.toLowerCase();
}

function buildLockEntriesHTML(): string {
  const s = store.get<AppSettings>('settings');
  let whitelist: string[] = [];
  try { whitelist = JSON.parse(s?.pomodoro_lock_whitelist || '[]'); } catch { whitelist = []; }
  const entries = parseLockEntries(whitelist);
  if (entries.length === 0) return '';
  const buttons = entries.map(e => {
    if (e.type === 'app') {
      return `<button class="pomo-lock-entry pomo-lock-entry--app" data-lock-app="${utils.escapeHtml(e.value)}">${icon('app-window', 'size="13"')} ${utils.escapeHtml(e.value.replace(/\.exe$/i, ''))}</button>`;
    }
    if (e.type === 'site') {
      const host = siteHost(e.value);
      return `<button class="pomo-lock-entry pomo-lock-entry--site" data-lock-site="${utils.escapeHtml(e.value)}">${icon('globe', 'size="13"')} ${utils.escapeHtml(host || e.value)}</button>`;
    }
    return `<button class="pomo-lock-entry pomo-lock-entry--kw" data-lock-kw="${utils.escapeHtml(e.value)}">${icon('text', 'size="13"')} ${utils.escapeHtml(e.value)}</button>`;
  }).join('');
  return `
    <div class="pomo-lock-overlay__entries-title">白名单快捷入口</div>
    <div class="pomo-lock-overlay__entries">${buttons}</div>
    <div class="pomo-lock-overlay__hint-sub">点击应用/网站/关键词可快捷切换到对应窗口</div>
  `;
}

function applyLockStyle(overlay: HTMLElement): void {
  const s = store.get<AppSettings>('settings');
  const style = s?.pomodoro_lock_style || 'default';
  overlay.classList.remove('pomo-lock-overlay--pop', 'pomo-lock-overlay--swiss', 'pomo-lock-overlay--industrial');
  if (style === 'pop') {
    overlay.classList.add('pomo-lock-overlay--pop');
  } else if (style === 'swiss') {
    overlay.classList.add('pomo-lock-overlay--swiss');
  } else if (style === 'industrial') {
    overlay.classList.add('pomo-lock-overlay--industrial');
  }
}

function buildLockOverlay(): HTMLElement {
  const existing = document.getElementById('pomoLockOverlay');
  if (existing) return existing;
  const overlay = document.createElement('div');
  overlay.id = 'pomoLockOverlay';
  overlay.className = 'pomo-lock-overlay';
  applyLockStyle(overlay);
  overlay.innerHTML = `
    <div class="pomo-lock-bg" aria-hidden="true">
      <div class="pomo-lock-bg__orb pomo-lock-bg__orb--a"></div>
      <div class="pomo-lock-bg__orb pomo-lock-bg__orb--b"></div>
      <div class="pomo-lock-bg__grid"></div>
    </div>
    <div class="pomo-lock-overlay__card">
      <div class="pomo-lock-overlay__badge">
        <span class="pomo-lock-overlay__badge-dot"></span>
        <span id="pomoLockBadgeText">专注守护中</span>
      </div>
      <div class="pomo-lock-overlay__icon">${icon('shield', 'size="30"')}</div>
      <div class="pomo-lock-overlay__title">保持专注</div>
      <div class="pomo-lock-overlay__timer" id="pomoLockTimer">--:--</div>
      <div class="pomo-lock-overlay__hint">仅允许白名单应用与指定网站，其余将被拦截</div>
      <div class="pomo-lock-overlay__alert" id="pomoLockAlert" hidden></div>
      <div class="pomo-lock-overlay__entries-wrap" id="pomoLockEntries">${buildLockEntriesHTML()}</div>
      <div class="pomo-lock-overlay__actions">
        <button class="pomo-lock-overlay__stop" id="pomoLockStop">${icon('power', 'size="14"')} 结束本次专注</button>
      </div>
      <div class="pomo-lock-overlay__keys">${icon('keyboard', 'size="12"')} Ctrl+Alt+L 随时结束并解锁</div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#pomoLockStop')?.addEventListener('click', () => { void pomodoroPage.stop(); });
  overlay.querySelectorAll<HTMLButtonElement>('.pomo-lock-entry--app').forEach(btn => {
    btn.addEventListener('click', async () => {
      const exe = btn.dataset.lockApp ?? '';
      const ok = await lockApi.activateApp(exe).catch(() => false);
      if (!ok) toast.info(`未找到 ${exe} 的已打开窗口`);
    });
  });
  overlay.querySelectorAll<HTMLButtonElement>('.pomo-lock-entry--site').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.lockSite ?? '';
      const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      await openUrl(full).catch(() => toast.warning('打开浏览器失败'));
    });
  });
  overlay.querySelectorAll<HTMLButtonElement>('.pomo-lock-entry--kw').forEach(btn => {
    btn.addEventListener('click', async () => {
      const kw = btn.dataset.lockKw ?? '';
      const ok = await lockApi.activateTitle(kw).catch(() => false);
      if (!ok) toast.info(`未找到标题含「${kw}」的窗口`);
    });
  });
  lockWarnLabel = overlay.querySelector('#pomoLockAlert') as HTMLSpanElement | null;
  initIcons();
  return overlay;
}

const BROWSER_EXES = ['chrome.exe', 'msedge.exe', 'firefox.exe', '360chrome.exe', '360se.exe', 'qqbrowser.exe', 'sogouexplorer.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe', 'centbrowser.exe', 'maxthon.exe', 'world.exe', 'iexplore.exe', 'seamonkey.exe'];

// 必要系统窗口：这些是操作系统的核心交互界面，不应被锁机拦截
const SYSTEM_EXES = [
  // 内核与会话基础
  'csrss.exe', 'winlogon.exe', 'wininit.exe', 'lsass.exe', 'lsaiso.exe', 'services.exe', 'smss.exe', 'svchost.exe',
  // 控制台与宿主进程
  'conhost.exe', 'dllhost.exe', 'fontdrvhost.exe', 'usermodefontdrvhost.exe', 'taskhost.exe', 'taskhostw.exe', 'taskhostex.exe',
  // Shell 与 UX
  'sihost.exe', 'systemsettings.exe', 'textinputhost.exe', 'ctfmon.exe', 'searchhost.exe', 'searchapp.exe',
  'runtimebroker.exe', 'widgetex.exe', 'widgetservice.exe', 'gamebar.exe', 'gamebarpresencewriter.exe',
  'securityhealthsystray.exe', 'securityhealthservice.exe',
  // 桌面与窗口管理
  'explorer.exe', 'dwm.exe', 'taskmgr.exe', 'startmenuexperiencehost.exe', 'shellexperiencehost.exe',
  'lockapp.exe', 'applicationframehost.exe', 'microsoft.ui.xaml.app.exe', 'windows.internal.shell.admin.app.exe',
  // 安全桌面 / UAC
  'consent.exe',
  // 系统托盘气泡与通知
  'notificationcontroller.exe',
];
// 系统装饰/遮罩窗口类：不承载任何内容，放行后真实窗口会再次触发前台事件做最终判定
const SYSTEM_CLASSES = [
  'dialogblockwindow',        // 模态对话框遮罩（dwm 对话框管理器创建）
  'sysshadow',                // 窗口阴影
  'tooltips_class32',         // 工具提示
  'notifyiconoverflowwindow', // 托盘溢出区
  'dummy_dwm_manager_window', // DWM 空管理窗口
];
const SYSTEM_TITLES = ['program manager', '任务管理器', 'windows 桌面', 'task manager', '开始', 'start', 'secure desktop', '安全桌面'];

function isOwnWindow(info: ForegroundInfo): boolean {
  const exe = (info.exe || '').trim().toLowerCase();
  return exe.indexOf('learning_todo') !== -1 || exe.indexOf('笺流') !== -1;
}

function isSystemWindow(info: ForegroundInfo): boolean {
  const title = (info.title || '').trim().toLowerCase();
  const exe = (info.exe || '').trim().toLowerCase();
  const cls = (info.class || '').trim().toLowerCase();
  if (SYSTEM_EXES.includes(exe)) return true;
  if (SYSTEM_CLASSES.includes(cls)) return true;
  return SYSTEM_TITLES.some(t => title.includes(t));
}

function isForegroundAllowed(info: ForegroundInfo): boolean {
  const s = store.get<AppSettings>('settings');
  let whitelist: string[] = [];
  try { whitelist = JSON.parse(s?.pomodoro_lock_whitelist || '[]'); } catch { whitelist = []; }
  const title = (info.title || '').trim().toLowerCase();
  const exe = (info.exe || '').trim().toLowerCase();
  // 系统窗口（桌面/任务管理器等）始终放行
  if (isSystemWindow(info)) return true;
  // 无任何标识信息的窗口（多为系统内部装饰窗口）：放行，交由后续前台事件判定
  if (title.length === 0 && exe.length === 0) return true;
  const entries = parseLockEntries(whitelist);
  return entries.some(e => {
    const v = e.value.toLowerCase();
    if (e.type === 'app') return exe === v;
    if (e.type === 'site') {
      // 网站类：进程必须为浏览器，且窗口标题包含站点域名/主机名
      const isBrowser = BROWSER_EXES.includes(exe) || exe.includes('browser');
      if (!isBrowser) return false;
      const host = siteHost(v);
      if (!host) return false;
      return title.includes(host) || title.includes(host.replace(/^www\./i, ''));
    }
    // 关键词类：标题或进程名包含
    return (title.length > 0 && title.includes(v)) || (exe.length > 0 && exe.includes(v));
  });
}

function checkForeground(info: ForegroundInfo): void {
  const now = Date.now();
  // 防抖：切换动作后短暂忽略前台事件，避免 yield/resume 反复抖动
  if (now < lockActionCooldownUntil) return;
  // 本应用锁屏窗口自身获得前台：不做任何切换，防止循环闪烁
  if (isOwnWindow(info)) return;

  const ok = isForegroundAllowed(info);
  const overlay = document.getElementById('pomoLockOverlay');
  if (!ok) {
    // 违规前台：若已让位给白名单应用，立即恢复锁屏
    if (lockYielded) {
      lockYielded = false;
      lockActionCooldownUntil = now + LOCK_ACTION_COOLDOWN;
      lockApi.resume().catch(() => {});
      if (overlay) {
        overlay.classList.remove('pomo-lock-overlay--yielded');
        const badge = document.getElementById('pomoLockBadgeText');
        if (badge) badge.textContent = '专注守护中';
      }
    }
    if (lockWarnLabel && lockWarnLabel.hidden && info.title) {
      lockWarnLabel.textContent = `${info.title} 不在白名单内，已拦截`;
      lockWarnLabel.hidden = false;
    }
    if (!lockWarned) {
      lockWarned = true;
      overlay?.classList.add('pomo-lock-overlay--warn');
      setTimeout(() => overlay?.classList.remove('pomo-lock-overlay--warn'), 1400);
      const s = store.get<AppSettings>('settings');
      if (s?.feedback_sound_enabled) feedbackSound('lock-warn');
    }
  } else {
    lockWarned = false;
    if (lockWarnLabel) lockWarnLabel.hidden = true;
    // 白名单/系统前台：让位（隐藏锁屏窗口，放行 Alt+Tab）
    if (!lockYielded) {
      lockYielded = true;
      lockActionCooldownUntil = now + LOCK_ACTION_COOLDOWN;
      lockApi.yield().catch(() => {});
      if (overlay) {
        overlay.classList.add('pomo-lock-overlay--yielded');
        const badge = document.getElementById('pomoLockBadgeText');
        if (badge) badge.textContent = '已放行白名单应用';
      }
    }
  }
}

async function pollForeground(): Promise<void> {
  const info = await lockApi.foreground().catch(() => ({ title: '', exe: '', class: '' }));
  checkForeground(info);
}

function startLock(): void {
  if (lockActive) return;
  lockActive = true;
  lockWarned = false;
  lockYielded = false;
  buildLockOverlay();
  lockApi.enter().catch(() => {});
  // 推送式前台监听：Rust 端 SetWinEventHook 在切换前台时实时通知
  void listen<ForegroundInfo>('pomo://foreground', (e) => {
    checkForeground(e.payload);
  }).then(un => { lockUnlisten = un; }).catch(() => {});
  // 全局快捷键 Ctrl+Alt+L：让位期间随时结束番茄钟
  void listen('pomo://global-stop', () => {
    void pomodoroPage.stop();
  }).then(un => { lockStopUnlisten = un; }).catch(() => {});
  // 兜底轮询：每 1.5s 检查一次当前前台窗口
  void pollForeground();
  lockPollTimer = window.setInterval(() => { void pollForeground(); }, 1500);
}

function stopLock(): void {
  lockActive = false;
  if (lockPollTimer !== null) { clearInterval(lockPollTimer); lockPollTimer = null; }
  if (lockUnlisten) { lockUnlisten(); lockUnlisten = null; }
  if (lockStopUnlisten) { lockStopUnlisten(); lockStopUnlisten = null; }
  document.getElementById('pomoLockOverlay')?.remove();
  lockWarnLabel = null;
  // 让位中超时/结束：先恢复窗口再完全解锁
  if (lockYielded) { lockYielded = false; lockApi.resume().catch(() => {}); }
  lockApi.exit().catch(() => {});
}

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
      store.set('settings', settings);
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
    store.set('settings', settings);

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

          <div class="pomo-lock-card">
            <div class="settings-row" style="justify-content:space-between">
              <span class="settings-label">开启专注锁机</span>
              <label class="settings-toggle">
                <input type="checkbox" data-key="pomodoro_lock_enabled" ${settings.pomodoro_lock_enabled ? 'checked' : ''} />
                <span class="settings-toggle-slider"></span>
              </label>
            </div>
            <div class="pomo-lock-card__hint">运行中锁定屏幕，仅白名单应用/网站可用；白名单在设置页配置</div>
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

    container.querySelectorAll('.pomo-lock-card .settings-toggle input').forEach(el => {
      el.addEventListener('change', async (e) => {
        const value = (e.target as HTMLInputElement).checked;
        await settingsApi.update({ pomodoro_lock_enabled: value } as Partial<AppSettings>);
        toast.success('锁机设置已保存');
      });
    });

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

    const s = store.get<AppSettings>('settings');
    if (s?.pomodoro_lock_enabled) startLock();

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
    stopLock();

    if (wasRunning && savedState.elapsedSeconds >= 60) {
      const totalMinutes = Math.round(savedState.elapsedSeconds / 60);
      const now = new Date();
      const endTime = now.toTimeString().slice(0, 5);

      const oldTotal = pomodoroPage.getTodayMinutes();

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

      const newTotal = pomodoroPage.getTodayMinutes();
      const s = store.get<AppSettings>('settings');
      const goals = store.get<Goal[]>('goals');
      const dailyGoal = goals?.find(g => g.goal_type === 'daily');
      if (dailyGoal && s && newTotal >= dailyGoal.target_minutes && oldTotal < dailyGoal.target_minutes) {
        if (s.feedback_sound_enabled) feedbackSound('goal-reached');
        if (s.feedback_confetti_enabled) {
          feedbackBurst('goal-reached');
          feedbackFlash();
        }
      }
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
          const s = store.get<AppSettings>('settings');
          if (s?.feedback_sound_enabled) feedbackSound('pomo-done');
          if (s?.feedback_confetti_enabled) feedbackBurst('pomo-done');
          pomodoroPage.stop();
          toast.success(`${typeName ?? '番茄钟'} 时间到！`);
          return;
        }
      }

      if (pomoState.mode === 'stopwatch' && pomoState.elapsedSeconds > 0) {
        const s = store.get<AppSettings>('settings');
        const interval = s?.feedback_milestone_interval ?? 25;
        if (interval > 0 && pomoState.elapsedSeconds % (interval * 60) === 0) {
          if (s?.feedback_sound_enabled) feedbackSound('milestone');
          if (s?.feedback_confetti_enabled) feedbackBurst('milestone');
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

      const lockTimer = document.getElementById('pomoLockTimer');
      if (lockTimer) {
        lockTimer.textContent = timer.textContent;
        lockTimer.classList.toggle('pomo-lock-overlay__timer--paused', pomoState.paused);
      }
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
