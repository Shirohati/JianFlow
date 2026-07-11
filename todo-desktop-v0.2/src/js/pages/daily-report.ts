import { store } from '../store';
import { activityApi, aiApi, taskApi, timeRecordApi, scoreApi } from '../api';
import { utils } from '../utils';
import { initIcons } from '../icons';
import { toast } from '../components/toast';
import { modal } from '../components/modal';
import type { ActivitySession, ActivitySummary, ProductivityScore, TimeRecord, TaskItem, DailyScoreRecord } from '../api';

function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}

// 分类颜色映射
const CATEGORY_COLORS: Record<string, string> = {
  '学习': '#10b981',
  '编程': '#6366f1',
  '浏览': '#3b82f6',
  '社交': '#f59e0b',
  '娱乐': '#ef4444',
  '其他': '#6b7280',
};

const CATEGORY_LIST = ['学习', '编程', '浏览', '社交', '娱乐', '其他'];

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['其他'];
}

function formatSec(sec: number): string {
  const m = Math.round(sec / 60);
  return utils.formatMinutes(m);
}

function formatSecShort(sec: number): string {
  const m = Math.round(sec / 60);
  return utils.formatMinutesShort(m);
}

// 将 HH:MM:SS 或 HH:MM 转为当日秒数（支持 "2026-07-09 10:30:00" 完整日期时间格式）
function timeStrToSeconds(t: string): number {
  const timePart = t.includes(' ') ? t.split(' ')[1] : t;
  const parts = timePart.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

function productivityLevel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: '优秀', color: '#10b981' };
  if (score >= 75) return { label: '良好', color: '#6366f1' };
  if (score >= 60) return { label: '中等', color: '#f59e0b' };
  return { label: '待改进', color: '#ef4444' };
}

// 简易 markdown 渲染：先转义，再处理符号
function renderMarkdown(md: string): string {
  const escaped = utils.escapeHtml(md);
  const lines = escaped.split('\n');
  const out: string[] = [];
  let inList = false;
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      out.push(`<p>${paragraph.join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const closeList = (): void => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      closeList(); flushParagraph();
      out.push(`<h3>${trimmed.slice(4)}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      closeList(); flushParagraph();
      out.push(`<h2>${trimmed.slice(3)}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      closeList(); flushParagraph();
      out.push(`<h2>${trimmed.slice(2)}</h2>`);
    } else if (trimmed.startsWith('> ')) {
      closeList(); flushParagraph();
      out.push(`<blockquote>${trimmed.slice(2)}</blockquote>`);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph();
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${trimmed.slice(2)}</li>`);
    } else if (trimmed === '') {
      closeList(); flushParagraph();
    } else {
      closeList();
      // 处理加粗 **text**
      paragraph.push(trimmed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'));
    }
  }
  closeList(); flushParagraph();
  return out.join('');
}

// 模块状态
let currentDate = utils.getTodayStr();
let summary: ActivitySummary | null = null;
let sessions: ActivitySession[] = [];
let productivity: ProductivityScore | null = null;
let scoreHistory: DailyScoreRecord[] = [];
let timeRecords: TimeRecord[] = [];
let tasks: TaskItem[] = [];
let cachedAi: string | null = null;

// 时间线段（用于点击检测）
interface TimelineSeg {
  type: 'activity' | 'pomo';
  startSec: number;
  endSec: number;
  color: string;
  label: string;
  session?: ActivitySession;
  record?: TimeRecord;
}
let timelineSegs: TimelineSeg[] = [];
// 防止重复添加 resize 监听器（每次进入页面都会调用 init）
let resizeBound = false;

export const dailyReportPage = {
  async init(): Promise<void> {
    const inner = document.querySelector('#page-daily-report .page__inner');
    if (!inner) return;
    currentDate = (store.get<string>('currentDate') as string) || utils.getTodayStr();
    dailyReportPage.render(inner);
    dailyReportPage.bindEvents();
    initIcons();
    await dailyReportPage.loadAll();
  },

  render(container: Element): void {
    container.innerHTML = `
      <h2 class="page-title">${icon('file-text')} 每日报告</h2>

      <div class="daily-report-date-nav">
        <button class="btn btn--icon" id="drPrevBtn" title="前一天">${icon('chevron-left')}</button>
        <div class="daily-report-date-center">
          <input type="date" id="drDateInput" class="input input--sm" value="${currentDate}" style="width:150px" />
          <button class="btn btn--primary btn--sm" id="drTodayBtn">${icon('calendar-dot', 'size="14"')} 今天</button>
        </div>
        <button class="btn btn--icon" id="drNextBtn" title="后一天">${icon('chevron-right')}</button>
      </div>

      <div class="daily-report-grid" id="drOverview">
        <div class="overview-stat">
          <span class="overview-stat__label">${icon('activity', 'size="14"')} 总活跃时长</span>
          <span class="overview-stat__value" id="drStatTotal">--</span>
        </div>
        <div class="overview-stat">
          <span class="overview-stat__label">${icon('timer', 'size="14"')} 专注时长</span>
          <span class="overview-stat__value" id="drStatFocus">--</span>
        </div>
        <div class="overview-stat">
          <span class="overview-stat__label">${icon('list-checks', 'size="14"')} 待办完成率</span>
          <span class="overview-stat__value" id="drStatTodo">--</span>
        </div>
        <div class="overview-stat">
          <span class="overview-stat__label">${icon('trending-up', 'size="14"')} 生产力评分</span>
          <span class="overview-stat__value" id="drStatScore">--</span>
          <span class="overview-stat__badge" id="drStatLevel"></span>
        </div>
      </div>

      <div class="report-card report-card--span2">
        <div class="report-card__header">
          <span class="report-card__title">${icon('bar-chart-3', 'size="14"')} 活动时间线</span>
          <span class="timeline-legend" id="drTimelineLegend"></span>
        </div>
        <div class="timeline-container">
          <canvas class="timeline-canvas" id="drTimelineCanvas" height="60"></canvas>
          <div class="timeline-axis"></div>
        </div>
      </div>

      <div class="daily-report-row">
        <div class="report-card daily-report-pie-card">
          <div class="report-card__header">
            <span class="report-card__title">${icon('pie-chart', 'size="14"')} 活动分类分布</span>
          </div>
          <div class="pie-chart-container" id="drPieChart"></div>
        </div>

        <div class="report-card daily-report-top-card">
          <div class="report-card__header">
            <span class="report-card__title">${icon('bar-chart', 'size="14"')} Top 应用排行</span>
          </div>
          <div class="top-app-list" id="drTopApps"></div>
        </div>
      </div>

      <div class="report-card report-card--span2">
        <div class="report-card__header">
          <span class="report-card__title">${icon('timer', 'size="14"')} 番茄钟会话</span>
        </div>
        <div class="report-list" id="drPomoList"></div>
      </div>

      <div class="report-card report-card--span2">
        <div class="report-card__header">
          <span class="report-card__title">${icon('list-checks', 'size="14"')} 待办完成情况</span>
        </div>
        <div class="todo-summary" id="drTodoSummary"></div>
        <div class="report-list" id="drTodoList"></div>
      </div>

      <div class="report-card report-card--span2 ai-summary-block">
        <div class="report-card__header">
          <span class="report-card__title">${icon('sparkles', 'size="14"')} AI 智能总结</span>
          <div class="ai-summary-actions">
            <button class="btn btn--sm" id="drAiTemplateBtn">${icon('file-text', 'size="14"')} 使用模板</button>
            <button class="btn btn--primary btn--sm" id="drAiGenerateBtn">${icon('sparkles', 'size="14"')} 生成AI总结</button>
          </div>
        </div>
        <div class="ai-summary-content" id="drAiContent">
          <div class="ai-empty">点击「生成AI总结」获取智能分析，或「使用模板」生成基础总结。</div>
        </div>
      </div>

      <div class="report-card report-card--span2">
        <div class="report-card__header">
          <span class="report-card__title">${icon('trending-up', 'size="14"')} 评分趋势</span>
        </div>
        <div id="drScoreTrend" class="score-trend-container"></div>
      </div>
    `;
  },

  bindEvents(): void {
    document.getElementById('drPrevBtn')?.addEventListener('click', () => dailyReportPage.shiftDate(-1));
    document.getElementById('drNextBtn')?.addEventListener('click', () => dailyReportPage.shiftDate(1));
    document.getElementById('drTodayBtn')?.addEventListener('click', () => {
      currentDate = utils.getTodayStr();
      (document.getElementById('drDateInput') as HTMLInputElement).value = currentDate;
      dailyReportPage.loadAll();
    });
    document.getElementById('drDateInput')?.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (v) { currentDate = v; dailyReportPage.loadAll(); }
    });

    document.getElementById('drAiGenerateBtn')?.addEventListener('click', () => dailyReportPage.generateAi());
    document.getElementById('drAiTemplateBtn')?.addEventListener('click', () => dailyReportPage.useTemplate());

    const canvas = document.getElementById('drTimelineCanvas') as HTMLCanvasElement | null;
    if (canvas) {
      canvas.addEventListener('click', (e) => dailyReportPage.onTimelineClick(e));
    }

    // 窗口尺寸变化时重绘时间线（仅绑定一次，避免内存泄漏）
    if (!resizeBound) {
      window.addEventListener('resize', dailyReportPage.onResize);
      resizeBound = true;
    }
  },

  onResize(): void {
    dailyReportPage.drawTimeline();
  },

  shiftDate(dir: number): void {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + dir);
    currentDate = utils.formatDate(d);
    (document.getElementById('drDateInput') as HTMLInputElement).value = currentDate;
    dailyReportPage.loadAll();
  },

  async loadAll(): Promise<void> {
    const date = currentDate;
    try {
      const [sumRes, sessRes, prodRes, trRes, taskRes, aiRes] = await Promise.all([
        activityApi.getSummary(date).catch(() => null),
        activityApi.getSessions(date).catch(() => [] as ActivitySession[]),
        activityApi.getProductivityScore(date).catch(() => null),
        timeRecordApi.list(date).catch(() => [] as TimeRecord[]),
        taskApi.list({ todo_date: date }).catch(() => [] as TaskItem[]),
        aiApi.getCached(date).catch(() => null),
      ]);
      summary = sumRes;
      sessions = sessRes;
      productivity = prodRes;
      timeRecords = trRes;
      tasks = taskRes;
      cachedAi = aiRes;
      // 加载评分历史
      try { scoreHistory = await scoreApi.getHistory(); } catch { scoreHistory = []; }
      dailyReportPage.renderAll();
    } catch (err) {
      toast.error('加载数据失败');
      console.error('daily-report load error:', err);
    }
  },

  renderAll(): void {
    dailyReportPage.renderOverview();
    dailyReportPage.renderTimelineLegend();
    dailyReportPage.drawTimeline();
    dailyReportPage.renderPieChart();
    dailyReportPage.renderTopApps();
    dailyReportPage.renderPomoList();
    dailyReportPage.renderTodo();
    dailyReportPage.renderCachedAi();
    dailyReportPage.renderScoreTrend();
    initIcons();
  },

  renderOverview(): void {
    const totalEl = document.getElementById('drStatTotal');
    const focusEl = document.getElementById('drStatFocus');
    const todoEl = document.getElementById('drStatTodo');
    const scoreEl = document.getElementById('drStatScore');
    const levelEl = document.getElementById('drStatLevel');

    if (totalEl) totalEl.textContent = summary ? formatSec(summary.total_active_seconds) : '--';

    if (focusEl) {
      const focusMin = timeRecords
        .filter(r => !(r.source === 'import' && !r.start_time))
        .reduce((s, r) => s + r.total_minutes, 0);
      focusEl.textContent = focusMin > 0 ? utils.formatMinutes(focusMin) : '--';
    }

    if (todoEl) {
      const total = tasks.length;
      const done = tasks.filter(t => t.todo_status === 'completed' || t.status === 'done').length;
      todoEl.textContent = total > 0 ? `${Math.round((done / total) * 100)}% (${done}/${total})` : '--';
    }

    if (scoreEl) scoreEl.textContent = productivity ? String(productivity.score) : '--';
    if (levelEl && productivity) {
      const lv = productivityLevel(productivity.score);
      levelEl.textContent = lv.label;
      levelEl.style.color = lv.color;
      levelEl.style.background = lv.color + '1a';
    } else if (levelEl) {
      levelEl.textContent = '';
    }
  },

  renderTimelineLegend(): void {
    const el = document.getElementById('drTimelineLegend');
    if (!el) return;
    el.innerHTML = CATEGORY_LIST.map(c => `<span class="timeline-legend-item"><span class="timeline-legend-dot" style="background:${categoryColor(c)}"></span>${c}</span>`).join('')
      + `<span class="timeline-legend-item"><span class="timeline-legend-dot timeline-legend-dot--pomo"></span>番茄钟</span>`;
  },

  drawTimeline(): void {
    const canvas = document.getElementById('drTimelineCanvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const container = canvas.parentElement;
    const width = container ? container.clientWidth : 700;
    const height = 60;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    ctx.fillRect(0, 0, width, height);

    // 构建时间线段
    timelineSegs = [];

    for (const s of sessions) {
      const startSec = timeStrToSeconds(s.start_time);
      const endSec = Math.max(startSec + s.duration_seconds, timeStrToSeconds(s.end_time));
      timelineSegs.push({
        type: 'activity',
        startSec,
        endSec,
        color: categoryColor(s.category),
        label: s.category,
        session: s,
      });
    }

    for (const r of timeRecords) {
      if (r.source === 'import' && !r.start_time) continue;
      if (!r.start_time || !r.end_time) continue;
      const startSec = timeStrToSeconds(r.start_time);
      const endSec = timeStrToSeconds(r.end_time);
      timelineSegs.push({
        type: 'pomo',
        startSec,
        endSec,
        color: '#000000',
        label: r.time_type,
        record: r,
      });
    }

    const daySec = 24 * 3600;
    const barH = 30;
    const barY = (height - barH) / 2;

    // 绘制活动会话段
    for (const seg of timelineSegs) {
      if (seg.type !== 'activity') continue;
      const x = (seg.startSec / daySec) * width;
      const w = Math.max(1, ((seg.endSec - seg.startSec) / daySec) * width);
      ctx.fillStyle = seg.color;
      ctx.fillRect(x, barY, w, barH);
    }

    // 绘制番茄钟段（半透明叠加）
    for (const seg of timelineSegs) {
      if (seg.type !== 'pomo') continue;
      const x = (seg.startSec / daySec) * width;
      const w = Math.max(1, ((seg.endSec - seg.startSec) / daySec) * width);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, barY - 4, w, barH + 8);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, barY - 4, w, barH + 8);
    }

    // 小时刻度
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.font = '10px sans-serif';
    ctx.lineWidth = 1;
    for (let h = 0; h <= 24; h += 3) {
      const x = (h / 24) * width;
      ctx.beginPath();
      ctx.moveTo(x, height - 8);
      ctx.lineTo(x, height - 4);
      ctx.stroke();
      if (h < 24) {
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(String(h), x + 2, height - 10);
      }
    }
  },

  onTimelineClick(e: MouseEvent): void {
    const canvas = e.target as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = canvas.width;
    const daySec = 24 * 3600;
    const clickSec = (x / width) * daySec;
    const barH = 30;
    const barY = (canvas.height - barH) / 2;
    if (y < barY - 6 || y > barY + barH + 6) return;

    // 优先匹配番茄钟段（叠加在上层）
    const pomoSeg = timelineSegs.find(s => s.type === 'pomo' && clickSec >= s.startSec && clickSec <= s.endSec);
    if (pomoSeg && pomoSeg.record) {
      dailyReportPage.showRecordDetail(pomoSeg.record);
      return;
    }
    // 活动会话段
    const actSeg = timelineSegs.find(s => s.type === 'activity' && clickSec >= s.startSec && clickSec <= s.endSec);
    if (actSeg && actSeg.session) {
      dailyReportPage.showSessionDetail(actSeg.session);
    }
  },

  showSessionDetail(session: ActivitySession): void {
    const detailHtml = `
      <div class="session-detail-modal">
        <div class="session-detail-row"><span>进程</span><strong>${utils.escapeHtml(session.process_name)}</strong></div>
        <div class="session-detail-row"><span>窗口标题</span><span>${utils.escapeHtml(session.window_title || '-')}</span></div>
        ${session.web_title ? `<div class="session-detail-row"><span>网页标题</span><span>${utils.escapeHtml(session.web_title)}</span></div>` : ''}
        <div class="session-detail-row"><span>时间段</span><span>${session.start_time} ~ ${session.end_time}</span></div>
        <div class="session-detail-row"><span>时长</span><strong>${formatSec(session.duration_seconds)}</strong></div>
        <div class="session-detail-row">
          <span>分类</span>
          <select class="input input--sm" id="sessionCategorySelect">
            ${CATEGORY_LIST.map(c => `<option value="${c}" ${c === session.category ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
    modal.open({
      title: '会话详情',
      content: detailHtml,
      onConfirm: async () => {
        const sel = document.getElementById('sessionCategorySelect') as HTMLSelectElement | null;
        if (!sel) return;
        const newCat = sel.value;
        if (newCat === session.category) return;
        try {
          await activityApi.updateSession(session.id, { category: newCat });
          toast.success('分类已更新');
          dailyReportPage.loadAll();
        } catch (err) {
          toast.error('更新失败');
          console.error(err);
        }
      },
      onCancel: () => { /* 取消 */ },
    });

    // 在 modal 渲染后插入删除按钮
    const body = document.querySelector('.modal__body');
    if (body) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--danger btn--sm';
      delBtn.style.marginTop = 'var(--space-3)';
      delBtn.textContent = '删除此会话';
      delBtn.addEventListener('click', async () => {
        const ok = await modal.confirm({ title: '确认删除', message: '确定要删除该活动会话吗？' });
        if (!ok) return;
        try {
          await activityApi.deleteSession(session.id);
          toast.success('会话已删除');
          modal.close();
          dailyReportPage.loadAll();
        } catch (err) {
          toast.error('删除失败');
          console.error(err);
        }
      });
      body.appendChild(delBtn);
    }
  },

  showRecordDetail(record: TimeRecord): void {
    modal.open({
      title: '番茄钟会话',
      content: `
        <div class="session-detail-modal">
          <div class="session-detail-row"><span>类型</span><strong>${utils.escapeHtml(record.time_type)}</strong></div>
          <div class="session-detail-row"><span>起止</span><span>${record.start_time || '-'} ~ ${record.end_time || '-'}</span></div>
          <div class="session-detail-row"><span>时长</span><strong>${utils.formatMinutes(record.total_minutes)}</strong></div>
          ${record.note ? `<div class="session-detail-row"><span>备注</span><span>${utils.escapeHtml(record.note)}</span></div>` : ''}
          <div class="session-detail-row"><span>来源</span><span>${record.source}</span></div>
        </div>
      `,
    });
  },

  renderPieChart(): void {
    const el = document.getElementById('drPieChart');
    if (!el) return;
    if (!summary || summary.total_active_seconds === 0) {
      el.innerHTML = '<div class="report-pie-empty">暂无数据</div>';
      return;
    }
    const breakdown = summary.category_breakdown || {};
    const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

    const size = 160;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 60;
    const strokeWidth = 24;
    const circumference = 2 * Math.PI * radius;
    let cumulative = 0;

    let svgSegments = '';
    entries.forEach(([cat, sec], i) => {
      const pct = (sec / total) * 100;
      const start = cumulative;
      cumulative += pct;
      const segLen = (pct / 100) * circumference;
      const offset = circumference - (start / 100) * circumference;
      const color = categoryColor(cat);
      svgSegments += `<circle data-idx="${i}" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="${segLen} ${circumference - segLen}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})" />`;
    });

    const legendHtml = entries.map(([cat, sec]) => {
      const pct = ((sec / total) * 100).toFixed(1);
      return `<div class="pie-legend-item">
        <span class="pie-legend-dot" style="background:${categoryColor(cat)}"></span>
        <span class="pie-legend-name">${utils.escapeHtml(cat)}</span>
        <span class="pie-legend-value">${formatSecShort(sec)}</span>
        <span class="pie-legend-pct">${pct}%</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="pie-chart-wrap">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          ${svgSegments}
        </svg>
        <div class="pie-chart-hole">${formatSecShort(summary.total_active_seconds)}</div>
      </div>
      <div class="pie-chart-legend">${legendHtml}</div>
    `;
  },

  renderTopApps(): void {
    const el = document.getElementById('drTopApps');
    if (!el) return;
    if (!summary || summary.top_apps.length === 0) {
      el.innerHTML = '<div class="report-pie-empty">暂无数据</div>';
      return;
    }
    const apps = summary.top_apps.slice(0, 10);
    const maxSec = apps[0]?.seconds || 1;
    el.innerHTML = apps.map((a, i) => `
      <div class="top-app-item">
        <span class="top-app-rank">${i + 1}</span>
        <span class="top-app-color" style="background:${categoryColor(a.category)}"></span>
        <span class="top-app-name">${utils.escapeHtml(a.name)}</span>
        <span class="top-app-category">${utils.escapeHtml(a.category)}</span>
        <div class="top-app-bar"><div class="top-app-bar-fill" style="width:${(a.seconds / maxSec) * 100}%;background:${categoryColor(a.category)}"></div></div>
        <span class="top-app-duration">${formatSecShort(a.seconds)}</span>
      </div>
    `).join('');
  },

  renderPomoList(): void {
    const el = document.getElementById('drPomoList');
    if (!el) return;
    const list = timeRecords.filter(r => !(r.source === 'import' && !r.start_time));
    if (list.length === 0) {
      el.innerHTML = '<div class="report-pie-empty">暂无番茄钟记录</div>';
      return;
    }
    el.innerHTML = list.map(r => `
      <div class="report-list-item">
        <span class="report-list-dot" style="background:var(--color-primary)"></span>
        <span class="report-list-type">${utils.escapeHtml(r.time_type)}</span>
        <span class="report-list-time">${r.start_time || '-'} ~ ${r.end_time || '-'}</span>
        <span class="report-list-duration">${utils.formatMinutes(r.total_minutes)}</span>
      </div>
    `).join('');
  },

  renderTodo(): void {
    const summaryEl = document.getElementById('drTodoSummary');
    const listEl = document.getElementById('drTodoList');
    const total = tasks.length;
    const done = tasks.filter(t => t.todo_status === 'completed' || t.status === 'done').length;
    const undone = total - done;
    if (summaryEl) {
      summaryEl.innerHTML = `
        <span class="todo-summary-item">完成 <strong style="color:var(--color-success)">${done}</strong></span>
        <span class="todo-summary-item">未完成 <strong style="color:var(--color-warning)">${undone}</strong></span>
        <span class="todo-summary-item">总计 <strong>${total}</strong></span>
      `;
    }
    if (listEl) {
      if (tasks.length === 0) {
        listEl.innerHTML = '<div class="report-pie-empty">当日无待办</div>';
        return;
      }
      listEl.innerHTML = tasks.map(t => {
        const isDone = t.todo_status === 'completed' || t.status === 'done';
        return `
          <div class="report-list-item ${isDone ? 'report-list-item--done' : ''}">
            <span class="report-list-dot" style="background:${isDone ? 'var(--color-success)' : 'var(--color-warning)'}"></span>
            <span class="report-list-type">${isDone ? '✓' : '○'}</span>
            <span class="report-list-title">${utils.escapeHtml(t.title)}</span>
            <span class="report-list-time">${t.priority > 0 ? 'P' + t.priority : ''}</span>
          </div>
        `;
      }).join('');
    }
  },

  renderCachedAi(): void {
    if (!cachedAi) return;
    const el = document.getElementById('drAiContent');
    if (!el) return;
    el.innerHTML = `<div class="ai-cached-hint">${icon('database', 'size="12"')} 来自缓存</div><div class="ai-summary-markdown">${renderMarkdown(cachedAi)}</div>`;
  },

  async generateAi(): Promise<void> {
    const contentEl = document.getElementById('drAiContent');
    if (contentEl) {
      contentEl.innerHTML = `<div class="ai-loading">${icon('loader', 'size="16"')} 正在生成 AI 总结...</div>`;
    }
    initIcons();
    try {
      const md = await aiApi.generate(currentDate);
      cachedAi = md;
      if (contentEl) {
        contentEl.innerHTML = `<div class="ai-cached-hint">${icon('sparkles', 'size="12"')} 刚刚生成</div><div class="ai-summary-markdown">${renderMarkdown(md)}</div>`;
      }
      initIcons();
      toast.success('AI 总结已生成');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (contentEl) {
        contentEl.innerHTML = `<div class="ai-error">${icon('alert-circle', 'size="16"')} 生成失败：${utils.escapeHtml(msg)}<br/><button class="btn btn--sm" id="drAiRetryBtn">${icon('refresh-cw', 'size="14"')} 重试</button></div>`;
      }
      initIcons();
      document.getElementById('drAiRetryBtn')?.addEventListener('click', () => dailyReportPage.generateAi());
    }
  },

  useTemplate(): void {
    const el = document.getElementById('drAiContent');
    if (!el) return;
    const totalMin = summary ? Math.round(summary.total_active_seconds / 60) : 0;
    const focusMin = timeRecords
      .filter(r => !(r.source === 'import' && !r.start_time))
      .reduce((s, r) => s + r.total_minutes, 0);
    const done = tasks.filter(t => t.todo_status === 'completed' || t.status === 'done').length;
    const total = tasks.length;
    const breakdown = summary?.category_breakdown || {};
    const topCats = Object.entries(breakdown).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const score = productivity?.score ?? 0;
    const lv = productivityLevel(score);

    const lines: string[] = [];
    lines.push(`## ${currentDate} 每日报告`);
    lines.push('');
    lines.push(`### 概览`);
    lines.push(`- 总活跃时长：**${utils.formatMinutes(totalMin)}**`);
    lines.push(`- 专注时长：**${utils.formatMinutes(focusMin)}**`);
    lines.push(`- 待办完成：**${done}/${total}**`);
    lines.push(`- 生产力评分：**${score} 分（${lv.label}）**`);
    lines.push('');
    if (topCats.length > 0) {
      lines.push(`### 主要活动分类`);
      for (const [cat, sec] of topCats) {
        lines.push(`- ${cat}：${formatSec(sec)}`);
      }
    }
    if (summary && summary.top_apps.length > 0) {
      lines.push('');
      lines.push(`### Top 应用`);
      for (const a of summary.top_apps.slice(0, 5)) {
        lines.push(`- ${a.name}（${a.category}）：${formatSec(a.seconds)}`);
      }
    }
    lines.push('');
    lines.push(`> 本报告由模板生成，可在设置中启用 AI 获取更深入的分析。`);

    const md = lines.join('\n');
    cachedAi = md;
    el.innerHTML = `<div class="ai-cached-hint">${icon('file-text', 'size="12"')} 模板生成</div><div class="ai-summary-markdown">${renderMarkdown(md)}</div>`;
    initIcons();
  },

  renderScoreTrend(): void {
    const el = document.getElementById('drScoreTrend');
    if (!el) return;
    if (!scoreHistory || scoreHistory.length < 2) {
      el.innerHTML = '<div class="empty-state"><p>暂无足够的历史数据</p></div>';
      return;
    }
    const records = scoreHistory.slice().reverse();
    const scores = records.map(r => r.score);
    const maxScore = 100;
    const barWidth = Math.max(20, Math.min(40, 600 / scores.length));
    const chartHeight = 120;

    const bars = scores.map((s, i) => {
      const h = Math.max(2, (s / maxScore) * chartHeight);
      const color = s >= 80 ? '#4ade80' : s >= 60 ? '#facc15' : s >= 40 ? '#fb923c' : '#f87171';
      return `<div class="trend-bar-wrapper" style="width:${barWidth}px">
        <div class="trend-bar" style="height:${h}px;background:${color}" title="${records[i].date}: ${s}分 (${records[i].level})"></div>
        <div class="trend-label">${records[i].date.slice(5)}</div>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="trend-chart">${bars}</div>`;
  },
};
