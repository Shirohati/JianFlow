import { store } from '../store';
import { statsApi, timeRecordApi, timeTypeApi } from '../api';
import { utils } from '../utils';
import { initIcons } from '../icons';
import type { TimeRecord, TimeType } from '../api';

function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}

function formatMin(m: number): string {
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min > 0 ? `${h}h${min}m` : `${h}h`;
}

function formatAxisLabel(m: number): string {
  if (m === 0) return '0';
  if (m < 60) return m + 'm';
  const h = m / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

let currentPeriod = 'day';
let periodAnchor = utils.getTodayStr();
let hourMonthAnchor = utils.getTodayStr();
let monthTrendAnchor = utils.getTodayStr();
let yearTrendAnchor = utils.getTodayStr();
let timetableAnchor = '';
let allRecords: TimeRecord[] = [];
let timeTypes: TimeType[] = [];

export const reportPage = {
  async init(): Promise<void> {
    const inner = document.querySelector('#page-report .page__inner');
    if (!inner) return;

    allRecords = await timeRecordApi.listAll();
    timeTypes = await timeTypeApi.list();
    store.set('timeRecords', allRecords);
    store.set('timeTypes', timeTypes);

    timetableAnchor = reportPage.getMonday(utils.getTodayStr());

    reportPage.render(inner);
    reportPage.bindEvents(inner);
    initIcons();
    reportPage.renderAll();
  },

  getMonday(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return utils.formatDate(d);
  },

  getSunday(mondayStr: string): string {
    const d = new Date(mondayStr + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return utils.formatDate(d);
  },

  render(container: Element): void {
    container.innerHTML = `
      <h2 class="page-title">${icon('bar-chart-3')} 统计报告</h2>

      <div class="report-grid">
        <div class="report-card report-card--span2">
          <div class="report-card__header">
            <span class="report-card__title">${icon('activity', 'size="14"')} 数据概览</span>
          </div>
          <div class="report-data-cards" id="reportDataCards"></div>
        </div>

        <div class="report-card">
          <div class="report-card__header">
            <span class="report-card__title">${icon('flame', 'size="14"')} 连续打卡</span>
          </div>
          <div id="reportStreak" class="report-streak"></div>
        </div>

        <div class="report-card report-card--span2">
          <div class="report-card__header">
            <span class="report-card__title">${icon('calendar-days', 'size="14"')} 每周课程表</span>
            <div class="report-period-nav">
              <button class="btn btn--ghost btn--sm" id="rptTTPrev">${icon('chevron-left', 'size="14"')}</button>
              <button class="btn btn--sm" id="rptTTToday">本周</button>
              <button class="btn btn--ghost btn--sm" id="rptTTNext">${icon('chevron-right', 'size="14"')}</button>
              <span id="rptTTRange" class="report-period-range"></span>
            </div>
          </div>
          <div class="report-timetable" id="reportTimetable"></div>
        </div>

        <div class="report-card report-card--span2">
          <div class="report-card__header">
            <span class="report-card__title">${icon('pie-chart', 'size="14"')} 时间类型分布</span>
            <div class="report-period-nav">
              <button class="btn btn--ghost btn--sm" id="rptPeriodPrev">${icon('chevron-left', 'size="14"')}</button>
              <button class="btn btn--sm rpt-period-btn" data-period="day">日</button>
              <button class="btn btn--sm rpt-period-btn" data-period="week">周</button>
              <button class="btn btn--sm rpt-period-btn" data-period="month">月</button>
              <button class="btn btn--sm rpt-period-btn" data-period="all">全部</button>
              <button class="btn btn--ghost btn--sm" id="rptPeriodNext">${icon('chevron-right', 'size="14"')}</button>
              <span id="rptPeriodRange" class="report-period-range"></span>
            </div>
          </div>
          <div class="report-pie-row">
            <div class="report-pie" id="reportPieChart"></div>
            <div class="report-pie-legend" id="reportPieLegend"></div>
            <div class="report-period-summary" id="reportPeriodSummary"></div>
          </div>
        </div>

        <div class="report-card report-card--span2">
          <div class="report-card__header">
            <span class="report-card__title">${icon('bar-chart', 'size="14"')} 月度专注时段分布</span>
            <div class="report-period-nav">
              <button class="btn btn--ghost btn--sm" id="rptHourPrev">${icon('chevron-left', 'size="14"')}</button>
              <span id="rptHourRange" class="report-period-range"></span>
              <button class="btn btn--ghost btn--sm" id="rptHourNext">${icon('chevron-right', 'size="14"')}</button>
            </div>
          </div>
          <div class="report-bar-chart" id="reportHourDist"></div>
        </div>

        <div class="report-card report-card--span2">
          <div class="report-card__header">
            <span class="report-card__title">${icon('trending-up', 'size="14"')} 月度时长趋势</span>
            <div class="report-period-nav">
              <button class="btn btn--ghost btn--sm" id="rptMonthPrev">${icon('chevron-left', 'size="14"')}</button>
              <span id="rptMonthRange" class="report-period-range"></span>
              <button class="btn btn--ghost btn--sm" id="rptMonthNext">${icon('chevron-right', 'size="14"')}</button>
            </div>
          </div>
          <div class="report-line-chart" id="reportMonthTrend"></div>
        </div>

        <div class="report-card report-card--span2">
          <div class="report-card__header">
            <span class="report-card__title">${icon('calendar', 'size="14"')} 年度时长趋势</span>
            <div class="report-period-nav">
              <button class="btn btn--ghost btn--sm" id="rptYearPrev">${icon('chevron-left', 'size="14"')}</button>
              <span id="rptYearRange" class="report-period-range"></span>
              <button class="btn btn--ghost btn--sm" id="rptYearNext">${icon('chevron-right', 'size="14"')}</button>
            </div>
          </div>
          <div class="report-line-chart" id="reportYearTrend"></div>
        </div>

        <div class="report-card report-card--span2">
          <div class="report-card__header">
            <span class="report-card__title">${icon('calculator', 'size="14"')} 平均学习时长</span>
            <div class="report-avg-btns">
              <button class="btn btn--sm rpt-avg-btn" data-range="week">本周</button>
              <button class="btn btn--sm rpt-avg-btn" data-range="month">本月</button>
              <button class="btn btn--sm rpt-avg-btn" data-range="7days">近7天</button>
              <button class="btn btn--sm rpt-avg-btn" data-range="30days">近30天</button>
              <input type="date" id="rptAvgStart" class="input input--sm" style="width:120px" />
              <span style="color:var(--text-lighter)">→</span>
              <input type="date" id="rptAvgEnd" class="input input--sm" style="width:120px" />
              <button class="btn btn--primary btn--sm" id="rptAvgCustom">自定义</button>
            </div>
          </div>
          <div id="reportAvgResult" class="report-avg-result"></div>
        </div>
      </div>
    `;
  },

  bindEvents(container: Element): void {
    container.querySelectorAll('.rpt-period-btn').forEach(b => {
      b.addEventListener('click', () => {
        container.querySelectorAll('.rpt-period-btn').forEach(x => x.classList.remove('btn--primary'));
        b.classList.add('btn--primary');
        currentPeriod = (b as HTMLElement).dataset.period!;
        reportPage.renderPeriod();
      });
    });
    document.getElementById('rptPeriodPrev')?.addEventListener('click', () => reportPage.shiftPeriod(-1));
    document.getElementById('rptPeriodNext')?.addEventListener('click', () => reportPage.shiftPeriod(1));
    document.getElementById('rptHourPrev')?.addEventListener('click', () => reportPage.shiftMonth(-1, 'hour'));
    document.getElementById('rptHourNext')?.addEventListener('click', () => reportPage.shiftMonth(1, 'hour'));
    document.getElementById('rptMonthPrev')?.addEventListener('click', () => reportPage.shiftMonth(-1, 'monthTrend'));
    document.getElementById('rptMonthNext')?.addEventListener('click', () => reportPage.shiftMonth(1, 'monthTrend'));
    document.getElementById('rptYearPrev')?.addEventListener('click', () => reportPage.shiftYear(-1));
    document.getElementById('rptYearNext')?.addEventListener('click', () => reportPage.shiftYear(1));
    document.getElementById('rptTTPrev')?.addEventListener('click', () => { const d = new Date(timetableAnchor + 'T00:00:00'); d.setDate(d.getDate() - 7); timetableAnchor = utils.formatDate(d); reportPage.renderTimetable(); });
    document.getElementById('rptTTNext')?.addEventListener('click', () => { const d = new Date(timetableAnchor + 'T00:00:00'); d.setDate(d.getDate() + 7); timetableAnchor = utils.formatDate(d); reportPage.renderTimetable(); });
    document.getElementById('rptTTToday')?.addEventListener('click', () => { timetableAnchor = reportPage.getMonday(utils.getTodayStr()); reportPage.renderTimetable(); });

    container.querySelectorAll('.rpt-avg-btn').forEach(b => {
      b.addEventListener('click', () => {
        container.querySelectorAll('.rpt-avg-btn').forEach(x => x.classList.remove('btn--primary'));
        b.classList.add('btn--primary');
        reportPage.calcAverage((b as HTMLElement).dataset.range!);
      });
    });
    document.getElementById('rptAvgCustom')?.addEventListener('click', () => reportPage.calcAverage('custom'));
  },

  renderAll(): void {
    reportPage.renderDataCards();
    reportPage.renderStreak();
    reportPage.renderTimetable();
    reportPage.renderPeriod();
    reportPage.renderHourDist();
    reportPage.renderMonthTrend();
    reportPage.renderYearTrend();
    reportPage.calcAverage('week');
  },

  renderDataCards(): void {
    const el = document.getElementById('reportDataCards');
    if (!el) return;
    const today = utils.getTodayStr();
    const totalMin = allRecords.reduce((s, r) => s + r.total_minutes, 0);
    const totalSessions = allRecords.length;
    const todayRecords = allRecords.filter(r => r.date === today && !(r.source === 'import' && !r.start_time));
    const todayMin = todayRecords.reduce((s, r) => s + r.total_minutes, 0);
    const todaySessions = todayRecords.length;

    el.innerHTML = `
      <div class="report-data-item report-data-item--animate" style="--delay:0">
        <span class="report-data-value">${formatMin(totalMin)}</span>
        <span class="report-data-label">总学习时长</span>
      </div>
      <div class="report-data-item report-data-item--animate" style="--delay:1">
        <span class="report-data-value">${totalSessions}</span>
        <span class="report-data-label">番茄钟次数</span>
      </div>
      <div class="report-data-item report-data-item--animate" style="--delay:2">
        <span class="report-data-value">${formatMin(todayMin)}</span>
        <span class="report-data-label">今日时长</span>
      </div>
      <div class="report-data-item report-data-item--animate" style="--delay:3">
        <span class="report-data-value">${todaySessions}</span>
        <span class="report-data-label">今日次数</span>
      </div>
    `;
  },

  async renderStreak(): Promise<void> {
    const el = document.getElementById('reportStreak');
    if (!el) return;
    const streak = await statsApi.getStreak();
    el.innerHTML = `
      <div class="report-streak-current">
        <span class="report-streak-num">${streak}</span>
        <span class="report-streak-label">天连续</span>
      </div>
    `;
  },

  renderTimetable(): void {
    const el = document.getElementById('reportTimetable');
    const rangeEl = document.getElementById('rptTTRange');
    if (!el) return;

    const sundayStr = reportPage.getSunday(timetableAnchor);
    if (rangeEl) rangeEl.textContent = `${timetableAnchor} ~ ${sundayStr}`;

    const weekRecords = allRecords.filter(r =>
      r.date >= timetableAnchor && r.date <= sundayStr &&
      !(r.source === 'import' && !r.start_time) &&
      r.start_time && r.end_time
    );

    let minHour = 7, maxHour = 24;
    for (const rec of weekRecords) {
      const [sh] = (rec.start_time ?? '0:0').split(':').map(Number);
      let [eh] = (rec.end_time ?? '0:0').split(':').map(Number);
      if (eh < sh) eh += 24;
      if (sh < minHour) minHour = Math.max(0, sh);
      if (eh > maxHour) maxHour = Math.min(24, eh);
    }
    if (minHour > 6) minHour = 7;
    if (maxHour < 8) maxHour = 24;

    const totalHours = maxHour - minHour;
    const slots = Math.ceil(totalHours / 2);
    const WDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    let html = '<div class="tt-grid" style="grid-template-columns:50px repeat(7,1fr);grid-template-rows:28px repeat(' + slots + ',1fr)">';

    html += '<div class="tt-header"></div>';
    for (let d = 0; d < 7; d++) {
      const date = new Date(timetableAnchor + 'T00:00:00');
      date.setDate(date.getDate() + d);
      const ds = utils.formatDate(date);
      const isToday = ds === utils.getTodayStr();
      html += `<div class="tt-header${isToday ? ' tt-header--today' : ''}">${WDAYS[d]}</div>`;
    }

    for (let slot = 0; slot < slots; slot++) {
      const hour = minHour + slot * 2;
      html += `<div class="tt-hour">${String(hour).padStart(2, '0')}</div>`;
      for (let d = 0; d < 7; d++) {
        html += '<div class="tt-cell"></div>';
      }
    }
    html += '</div>';

    html += '<div class="tt-blocks">';
    const offsetMin = minHour * 60;

    for (const rec of weekRecords) {
      const [sh, sm] = (rec.start_time ?? '0:0').split(':').map(Number);
      let [eh, em] = (rec.end_time ?? '0:0').split(':').map(Number);
      let startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin <= startMin) endMin += 24 * 60;
      if (endMin - startMin > 720) continue;

      const dateObj = new Date(rec.date + 'T00:00:00');
      const monObj = new Date(timetableAnchor + 'T00:00:00');
      const dayIdx = Math.round((dateObj.getTime() - monObj.getTime()) / 86400000);
      if (dayIdx < 0 || dayIdx > 6) continue;

      const tt = timeTypes.find(t => t.name === rec.time_type);
      const color = tt ? tt.color : '#5b7fff';
      const topPct = ((startMin - offsetMin) / (totalHours * 60)) * 100;
      const heightPct = ((endMin - startMin) / (totalHours * 60)) * 100;

      html += `<div class="tt-block" style="top:${topPct}%;left:calc(50px + ${dayIdx} * (100% - 50px) / 7);width:calc((100% - 50px) / 7 - 2px);height:${heightPct}%;background:${color}" title="${rec.time_type}\n${rec.start_time} - ${rec.end_time}\n${formatMin(rec.total_minutes)}">${rec.time_type} ${rec.total_minutes}m</div>`;
    }
    html += '</div>';

    el.innerHTML = html;
  },

  getPeriodRange(): { startDate: string; endDate: string } {
    const today = utils.getTodayStr();
    const nowD = new Date(today + 'T00:00:00');
    let startDate: string, endDate: string;

    if (currentPeriod === 'day') {
      startDate = periodAnchor;
      endDate = periodAnchor <= today ? periodAnchor : today;
    } else if (currentPeriod === 'week') {
      const ref = new Date(periodAnchor + 'T00:00:00');
      const day = ref.getDay();
      const mon = new Date(ref);
      mon.setDate(ref.getDate() - (day === 0 ? 6 : day - 1));
      startDate = utils.formatDate(mon);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      endDate = sun <= nowD ? utils.formatDate(sun) : today;
    } else if (currentPeriod === 'month') {
      const ref = new Date(periodAnchor + 'T00:00:00');
      const year = ref.getFullYear();
      const month = ref.getMonth();
      startDate = utils.formatDate(new Date(year, month, 1));
      const lastDay = new Date(year, month + 1, 0);
      endDate = lastDay <= nowD ? utils.formatDate(lastDay) : today;
    } else {
      const allStart = document.getElementById('rptAllStart') as HTMLInputElement;
      const allEnd = document.getElementById('rptAllEnd') as HTMLInputElement;
      startDate = allStart?.value || '2000-01-01';
      endDate = allEnd?.value || today;
    }
    return { startDate, endDate };
  },

  shiftPeriod(dir: number): void {
    if (currentPeriod === 'all') return;
    const d = new Date(periodAnchor + 'T00:00:00');
    if (currentPeriod === 'day') d.setDate(d.getDate() + dir);
    else if (currentPeriod === 'week') d.setDate(d.getDate() + dir * 7);
    else if (currentPeriod === 'month') d.setMonth(d.getMonth() + dir);
    periodAnchor = utils.formatDate(d);
    reportPage.renderPeriod();
  },

  shiftMonth(dir: number, type: string): void {
    if (type === 'hour') {
      const d = new Date(hourMonthAnchor + 'T00:00:00');
      d.setMonth(d.getMonth() + dir);
      hourMonthAnchor = utils.formatDate(d);
      reportPage.renderHourDist();
    } else {
      const d = new Date(monthTrendAnchor + 'T00:00:00');
      d.setMonth(d.getMonth() + dir);
      monthTrendAnchor = utils.formatDate(d);
      reportPage.renderMonthTrend();
    }
  },

  shiftYear(dir: number): void {
    const d = new Date(yearTrendAnchor + 'T00:00:00');
    d.setFullYear(d.getFullYear() + dir);
    yearTrendAnchor = utils.formatDate(d);
    reportPage.renderYearTrend();
  },

  renderPeriod(): void {
    const { startDate, endDate } = reportPage.getPeriodRange();
    const rangeEl = document.getElementById('rptPeriodRange');
    if (rangeEl) rangeEl.textContent = `${startDate} ~ ${endDate}`;

    const isAll = currentPeriod === 'all';
    const filtered = allRecords.filter(r => r.date >= startDate && r.date <= endDate);
    const typeMap: Record<string, { time_type: string; minutes: number; sessions: number }> = {};
    const dailyMap: Record<string, number> = {};
    let totalMin = 0;

    for (const r of filtered) {
      const isImport = r.source === 'import' && !r.start_time;
      if (!isAll && isImport) continue;
      if (!typeMap[r.time_type]) typeMap[r.time_type] = { time_type: r.time_type, minutes: 0, sessions: 0 };
      typeMap[r.time_type].minutes += r.total_minutes;
      typeMap[r.time_type].sessions++;
      totalMin += r.total_minutes;
      if (!isImport) dailyMap[r.date] = (dailyMap[r.date] || 0) + r.total_minutes;
    }

    const typeDistribution = Object.values(typeMap).sort((a, b) => b.minutes - a.minutes);
    const activeDays = Object.keys(dailyMap).length;
    const sD = new Date(startDate + 'T00:00:00');
    const eD = new Date(endDate + 'T00:00:00');
    const spanDays = Math.max(1, Math.round((eD.getTime() - sD.getTime()) / 86400000) + 1);
    const avgMin = Math.round(totalMin / spanDays);

    const summaryEl = document.getElementById('reportPeriodSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="report-summary-item"><span>周期总时长</span><strong>${formatMin(totalMin)}</strong></div>
        <div class="report-summary-item"><span>日均时长</span><strong>${formatMin(avgMin)}</strong></div>
        <div class="report-summary-item"><span>活跃天数</span><strong>${activeDays}</strong></div>
      `;
    }

    if (currentPeriod === 'all') {
      const rangeContainer = document.getElementById('rptPeriodRange');
      if (rangeContainer) {
        rangeContainer.innerHTML = `<input type="date" id="rptAllStart" class="input input--sm" value="2020-01-01" style="width:120px" /> ~ <input type="date" id="rptAllEnd" class="input input--sm" value="${utils.getTodayStr()}" style="width:120px" />`;
        document.getElementById('rptAllStart')?.addEventListener('change', () => reportPage.renderPeriod());
        document.getElementById('rptAllEnd')?.addEventListener('change', () => reportPage.renderPeriod());
      }
    } else {
      const rangeContainer = document.getElementById('rptPeriodRange');
      if (rangeContainer) rangeContainer.textContent = `${startDate} ~ ${endDate}`;
    }

    reportPage.renderPieChart(typeDistribution);
  },

  renderPieChart(dist: { time_type: string; minutes: number; sessions: number }[]): void {
    const pieEl = document.getElementById('reportPieChart');
    const legendEl = document.getElementById('reportPieLegend');
    if (!pieEl || !legendEl) return;

    if (dist.length === 0) {
      pieEl.innerHTML = '<div class="report-pie-empty">暂无数据</div>';
      legendEl.innerHTML = '';
      return;
    }

    const total = dist.reduce((s, d) => s + d.minutes, 0);
    let cumulative = 0;
    const segments = dist.map(d => {
      const pct = total > 0 ? (d.minutes / total) * 100 : 0;
      const start = cumulative;
      cumulative += pct;
      const tt = timeTypes.find(t => t.name === d.time_type);
      const color = tt ? tt.color : '#5b7fff';
      return { ...d, pct, start, color };
    });

    const size = 180;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 75;
    const strokeWidth = 30;
    const circumference = 2 * Math.PI * radius;

    let svgSegments = '';
    segments.forEach((s, i) => {
      const segLen = (s.pct / 100) * circumference;
      const offset = circumference - (s.start / 100) * circumference;
      svgSegments += `<circle class="report-pie-seg" data-idx="${i}" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}" stroke-dasharray="${segLen} ${circumference - segLen}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})" style="transition: stroke-width 0.2s, filter 0.2s, opacity 0.2s" />`;
    });

    pieEl.innerHTML = `
      <div class="report-pie-chart report-pie-chart--animate" style="position:relative">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">
          ${svgSegments}
        </svg>
        <div class="report-pie-hole">${formatMin(total)}</div>
        <div class="report-pie-tooltip" style="display:none;position:fixed;padding:6px 10px;border-radius:var(--radius-sm);background:var(--card-bg);box-shadow:var(--shadow-md);border:1px solid var(--border);font-size:var(--text-xs);color:var(--text);pointer-events:none;z-index:100;white-space:nowrap"></div>
      </div>
    `;

    const tooltip = pieEl.querySelector('.report-pie-tooltip') as HTMLElement;
    if (tooltip) {
      pieEl.querySelectorAll('.report-pie-seg').forEach(seg => {
        seg.addEventListener('mouseenter', (e) => {
          const idx = parseInt((seg as SVGElement).getAttribute('data-idx') || '0');
          const s = segments[idx];
          if (!s) return;
          (seg as SVGElement).setAttribute('stroke-width', String(strokeWidth + 6));
          (seg as SVGElement).style.filter = 'brightness(1.2) drop-shadow(0 0 6px ' + s.color + '80)';
          tooltip.innerHTML = `<strong style="color:${s.color}">${utils.escapeHtml(s.time_type)}</strong><br/>${formatMin(s.minutes)} · ${s.pct.toFixed(1)}%`;
          tooltip.style.display = 'block';
          const rect = (e.target as SVGElement).getBoundingClientRect();
          tooltip.style.left = rect.left + rect.width / 2 + 'px';
          tooltip.style.top = rect.top - 8 + 'px';
          tooltip.style.transform = 'translate(-50%, -100%)';
        });
        seg.addEventListener('mousemove', (e) => {
          const rect = (e.target as SVGElement).getBoundingClientRect();
          tooltip.style.left = rect.left + rect.width / 2 + 'px';
          tooltip.style.top = rect.top - 8 + 'px';
        });
        seg.addEventListener('mouseleave', () => {
          (seg as SVGElement).setAttribute('stroke-width', String(strokeWidth));
          (seg as SVGElement).style.filter = '';
          tooltip.style.display = 'none';
        });
      });
    }

    legendEl.innerHTML = segments.map((s, i) => `
      <div class="report-legend-item report-legend-item--animate" style="--delay:${i}">
        <span class="report-legend-dot" style="background:${s.color}"></span>
        <span class="report-legend-name">${utils.escapeHtml(s.time_type)}</span>
        <span class="report-legend-value">${formatMin(s.minutes)}</span>
        <span class="report-legend-pct">${s.pct.toFixed(1)}%</span>
      </div>
    `).join('');
  },

  renderHourDist(): void {
    const el = document.getElementById('reportHourDist');
    const rangeEl = document.getElementById('rptHourRange');
    if (!el) return;

    const ref = new Date(hourMonthAnchor + 'T00:00:00');
    const year = ref.getFullYear();
    const month = ref.getMonth();
    const startDate = utils.formatDate(new Date(year, month, 1));
    const endDate = utils.formatDate(new Date(year, month + 1, 0));
    const today = utils.getTodayStr();
    const realEnd = endDate <= today ? endDate : today;

    if (rangeEl) rangeEl.textContent = `${year}年${month + 1}月`;

    const hourData = new Array(24).fill(0);
    for (const r of allRecords) {
      if (r.date < startDate || r.date > realEnd) continue;
      if (r.source === 'import' && !r.start_time) continue;
      if (!r.start_time || !r.end_time) { hourData[0] += r.total_minutes; continue; }
      const [sh, sm] = r.start_time.split(':').map(Number);
      const [eh, em] = r.end_time.split(':').map(Number);
      let current = sh * 60 + sm;
      const end = eh * 60 + em;
      while (current < end) {
        const h = Math.floor(current / 60);
        if (h >= 0 && h < 24) hourData[h] += 1;
        current++;
      }
    }

    const maxVal = Math.max(...hourData, 1);
    el.innerHTML = `
      <div class="report-bar-container">
        ${hourData.map((v, i) => `
          <div class="report-bar-col report-bar-col--animate" style="--delay:${i}" data-hour="${i}" data-minutes="${v}">
            <div class="report-bar-fill" style="--target-height:${maxVal > 0 ? (v / maxVal) * 100 : 0}%"></div>
            <span class="report-bar-label">${i}</span>
          </div>
        `).join('')}
      </div>
      <div class="report-bar-tooltip" style="display:none;position:fixed;padding:6px 10px;border-radius:var(--radius-sm);background:var(--card-bg);box-shadow:var(--shadow-md);border:1px solid var(--border);font-size:var(--text-xs);color:var(--text);pointer-events:none;z-index:100;white-space:nowrap"></div>
    `;

    const tooltip = el.querySelector('.report-bar-tooltip') as HTMLElement;
    if (tooltip) {
      el.querySelectorAll('.report-bar-col').forEach(col => {
        col.addEventListener('mouseenter', (e) => {
          const hour = (col as HTMLElement).dataset.hour;
          const minutes = parseInt((col as HTMLElement).dataset.minutes || '0');
          tooltip.innerHTML = `<strong>${hour}时</strong><br/>${formatMin(minutes)}`;
          tooltip.style.display = 'block';
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          tooltip.style.left = rect.left + rect.width / 2 + 'px';
          tooltip.style.top = rect.top - 8 + 'px';
          tooltip.style.transform = 'translate(-50%, -100%)';
        });
        col.addEventListener('mousemove', (e) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          tooltip.style.left = rect.left + rect.width / 2 + 'px';
          tooltip.style.top = rect.top - 8 + 'px';
        });
        col.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });
      });
    }

    requestAnimationFrame(() => {
      el.querySelectorAll('.report-bar-fill').forEach(f => {
        (f as HTMLElement).style.height = (f as HTMLElement).style.getPropertyValue('--target-height');
      });
    });
  },

  renderInteractiveChart(containerId: string, data: number[], labels: string[], color: string, fillColor: string, _unitLabel: string): void {
    const el = document.getElementById(containerId);
    if (!el) return;

    const width = 600;
    const height = 200;
    const padding = 30;
    const maxVal = Math.max(...data, 1);
    const stepX = (width - padding * 2) / Math.max(1, data.length - 1);
    const points = data.map((v, i) => ({
      x: padding + i * stepX,
      y: height - padding - (v / maxVal) * (height - padding * 2),
      value: v,
      label: labels[i]
    }));

    if (points.length < 2) { el.innerHTML = '<div class="report-pie-empty">暂无数据</div>'; return; }

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
      const cpx2 = prev.x + (curr.x - prev.x) * 0.6;
      pathD += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    const fillD = pathD + ` L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    const gridLines = [0.25, 0.5, 0.75, 1].map(pct => {
      const y = height - padding - pct * (height - padding * 2);
      const val = Math.round(maxVal * pct);
      return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--border-light)" stroke-width="0.5" stroke-dasharray="4,4" />
              <text x="${padding - 4}" y="${y + 4}" text-anchor="end" fill="var(--text-lighter)" font-size="10">${formatAxisLabel(val)}</text>`;
    }).join('');

    el.innerHTML = `
      <div class="report-line-container" data-chart-id="${containerId}">
        <svg class="report-line-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          ${gridLines}
          <path d="${fillD}" fill="${fillColor}" stroke="none" class="chart-fill-animate" />
          <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" class="chart-line-animate" />
          ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}" stroke="var(--card)" stroke-width="2" class="chart-dot" />`).join('')}
          <line class="chart-crosshair" x1="0" y1="${padding}" x2="0" y2="${height - padding}" stroke="${color}" stroke-width="1" stroke-dasharray="3,3" opacity="0" />
          <rect x="${padding}" y="${padding}" width="${width - padding * 2}" height="${height - padding * 2}" fill="transparent" class="chart-hover-area" />
        </svg>
        <div class="chart-tooltip" style="display:none"></div>
        <div class="report-line-labels">
          ${labels.filter((_, i) => i % Math.ceil(labels.length / 12) === 0 || i === labels.length - 1).map(l => `<span>${l}</span>`).join('')}
        </div>
      </div>
    `;

    const svg = el.querySelector('svg');
    const crosshair = el.querySelector('.chart-crosshair') as SVGLineElement;
    const tooltip = el.querySelector('.chart-tooltip') as HTMLElement;
    const hoverArea = el.querySelector('.chart-hover-area') as SVGRectElement;

    if (svg && crosshair && tooltip && hoverArea) {
      hoverArea.addEventListener('mousemove', (e) => {
        const rect = svg.getBoundingClientRect();
        const svgX = ((e.clientX - rect.left) / rect.width) * width;
        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < points.length; i++) {
          const dist = Math.abs(points[i].x - svgX);
          if (dist < closestDist) { closestDist = dist; closestIdx = i; }
        }
        const p = points[closestIdx];
        crosshair.setAttribute('x1', String(p.x));
        crosshair.setAttribute('x2', String(p.x));
        crosshair.setAttribute('opacity', '0.6');

        const svgRect = svg.getBoundingClientRect();
        const scaleX = svgRect.width / width;
        const scaleY = svgRect.height / height;
        const tooltipX = p.x * scaleX;
        const tooltipY = p.y * scaleY;
        tooltip.style.display = 'block';
        tooltip.style.left = tooltipX + 'px';
        tooltip.style.top = Math.max(0, tooltipY - 40) + 'px';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.innerHTML = `<strong>${p.label}</strong><br/>${formatMin(p.value)}`;
      });

      hoverArea.addEventListener('mouseleave', () => {
        crosshair.setAttribute('opacity', '0');
        tooltip.style.display = 'none';
      });
    }
  },

  renderMonthTrend(): void {
    const rangeEl = document.getElementById('rptMonthRange');
    const ref = new Date(monthTrendAnchor + 'T00:00:00');
    const year = ref.getFullYear();
    const month = ref.getMonth();
    const startDate = utils.formatDate(new Date(year, month, 1));
    const endDate = utils.formatDate(new Date(year, month + 1, 0));
    const today = utils.getTodayStr();
    const realEnd = endDate <= today ? endDate : today;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (rangeEl) rangeEl.textContent = `${year}年${month + 1}月`;

    const dailyMap: Record<string, number> = {};
    for (const r of allRecords) {
      if (r.date < startDate || r.date > realEnd) continue;
      if (r.source === 'import' && !r.start_time) continue;
      dailyMap[r.date] = (dailyMap[r.date] || 0) + r.total_minutes;
    }

    const data: number[] = [];
    const labels: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      data.push(dailyMap[ds] || 0);
      labels.push(`${d}日`);
    }

    reportPage.renderInteractiveChart('reportMonthTrend', data, labels, '#5b7fff', 'rgba(91,127,255,0.08)', '分钟');
  },

  renderYearTrend(): void {
    const rangeEl = document.getElementById('rptYearRange');
    const ref = new Date(yearTrendAnchor + 'T00:00:00');
    const year = ref.getFullYear();

    if (rangeEl) rangeEl.textContent = `${year}年`;

    const monthlyData = new Array(12).fill(0);
    for (const r of allRecords) {
      if (!r.date.startsWith(String(year))) continue;
      if (r.source === 'import' && !r.start_time) continue;
      const m = parseInt(r.date.split('-')[1]) - 1;
      if (m >= 0 && m < 12) monthlyData[m] += r.total_minutes;
    }

    const labels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    reportPage.renderInteractiveChart('reportYearTrend', monthlyData, labels, '#e0a83c', 'rgba(224,168,60,0.08)', '分钟');
  },

  calcAverage(range: string): void {
    let startDate: string, endDate: string;
    const today = utils.getTodayStr();
    const d = new Date(today + 'T00:00:00');

    if (range === 'week') {
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      startDate = utils.formatDate(mon);
      endDate = today;
    } else if (range === 'month') {
      d.setDate(1);
      startDate = utils.formatDate(d);
      endDate = today;
    } else if (range === '7days') {
      d.setDate(d.getDate() - 6);
      startDate = utils.formatDate(d);
      endDate = today;
    } else if (range === '30days') {
      d.setDate(d.getDate() - 29);
      startDate = utils.formatDate(d);
      endDate = today;
    } else if (range === 'custom') {
      const startInput = document.getElementById('rptAvgStart') as HTMLInputElement;
      const endInput = document.getElementById('rptAvgEnd') as HTMLInputElement;
      startDate = startInput?.value || '';
      endDate = endInput?.value || '';
      if (!startDate || !endDate) return;
    } else {
      startDate = today;
      endDate = today;
    }

    const filtered = allRecords.filter(r =>
      r.date >= startDate && r.date <= endDate && !(r.source === 'import' && !r.start_time)
    );
    const total = filtered.reduce((s, r) => s + r.total_minutes, 0);
    const sD = new Date(startDate + 'T00:00:00');
    const eD = new Date(endDate + 'T00:00:00');
    const days = Math.max(1, Math.round((eD.getTime() - sD.getTime()) / 86400000) + 1);
    const avg = Math.round(total / days);

    const el = document.getElementById('reportAvgResult');
    if (el) {
      el.innerHTML = `
        <span class="report-avg-range">${startDate} ~ ${endDate}</span>
        <div class="report-avg-main">
          共 <strong>${days}</strong> 天 · 总时长 <strong>${formatMin(total)}</strong> · 日均
          <strong class="report-avg-highlight">${formatMin(avg)}</strong>
        </div>
      `;
    }
  },
};
