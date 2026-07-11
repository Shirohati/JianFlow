import { timeRecordApi, taskApi } from '../api';
import { store } from '../store';
import { utils } from '../utils';
import { initIcons } from '../icons';
import { router } from '../router';

function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}

function formatMin(m: number): string {
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min > 0 ? `${h}h${min}m` : `${h}h`;
}

export const calendarPage = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(),

  async init(): Promise<void> {
    const inner = document.querySelector('#page-calendar .page__inner');
    if (!inner) return;

    calendarPage.render(inner);
    calendarPage.bindEvents(inner);
    await calendarPage.loadCalendar();
    initIcons();
  },

  render(container: Element): void {
    const now = new Date();
    container.innerHTML = `
      <h2 class="page-title">${icon('calendar-days')} 学习日历</h2>

      <div class="card" style="padding:var(--space-4)">
        <div class="cal-header">
          <button class="btn btn--icon cal-prev-btn" title="上个月">${icon('chevron-left')}</button>
          <span class="cal-month-label" id="calMonthLabel">${now.getFullYear()}年${now.getMonth() + 1}月</span>
          <button class="btn btn--icon cal-next-btn" title="下个月">${icon('chevron-right')}</button>
          <div style="flex:1"></div>
          <button class="btn btn--sm cal-today-btn">${icon('calendar-check', 'size="14"')} 今天</button>
        </div>
        <div class="cal-weekdays">
          <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
        </div>
        <div class="cal-grid" id="calGrid"></div>
      </div>

      <div id="calDayDetail"></div>
    `;
  },

  bindEvents(container: Element): void {
    container.querySelector('.cal-prev-btn')?.addEventListener('click', () => {
      calendarPage.changeMonth(-1);
    });
    container.querySelector('.cal-next-btn')?.addEventListener('click', () => {
      calendarPage.changeMonth(1);
    });
    container.querySelector('.cal-today-btn')?.addEventListener('click', () => {
      calendarPage.currentYear = new Date().getFullYear();
      calendarPage.currentMonth = new Date().getMonth();
      calendarPage.loadCalendar();
    });
  },

  changeMonth(delta: number): void {
    calendarPage.currentMonth += delta;
    if (calendarPage.currentMonth < 0) {
      calendarPage.currentMonth = 11;
      calendarPage.currentYear--;
    } else if (calendarPage.currentMonth > 11) {
      calendarPage.currentMonth = 0;
      calendarPage.currentYear++;
    }
    calendarPage.loadCalendar();
  },

  async loadCalendar(): Promise<void> {
    const label = document.getElementById('calMonthLabel');
    if (label) {
      label.textContent = `${calendarPage.currentYear}年${calendarPage.currentMonth + 1}月`;
    }

    const grid = document.getElementById('calGrid');
    if (!grid) return;

    const year = calendarPage.currentYear;
    const month = calendarPage.currentMonth;

    const firstDay = new Date(year, month, 1);
    let startWeekday = firstDay.getDay();
    if (startWeekday === 0) startWeekday = 7;
    startWeekday -= 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const records = await timeRecordApi.listRange(startStr, endStr);

    const dailyMinutes: Record<string, number> = {};
    records.forEach(r => {
      dailyMinutes[r.date] = (dailyMinutes[r.date] || 0) + r.total_minutes;
    });

    let html = '';
    for (let i = 0; i < startWeekday; i++) {
      html += '<div class="cal-cell cal-cell--empty"></div>';
    }

    const today = utils.getTodayStr();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const minutes = dailyMinutes[dateStr] || 0;
      const level = utils.getHeatLevel(minutes);
      const isToday = dateStr === today;

      html += `<div class="cal-cell ${isToday ? 'cal-cell--today' : ''}" data-date="${dateStr}">
        <span class="cal-cell-day">${d}</span>
        ${minutes > 0 ? `<span class="cal-cell-minutes">${formatMin(minutes)}</span>` : ''}
        ${level > 0 ? `<div class="cal-cell-heat cal-cell-heat--${level}"></div>` : ''}
      </div>`;
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.cal-cell:not(.cal-cell--empty)').forEach(cell => {
      cell.addEventListener('click', () => {
        const date = (cell as HTMLElement).dataset.date;
        if (date) {
          calendarPage.showDayDetail(date, dailyMinutes[date] || 0);
        }
      });
    });

    initIcons();
  },

  async showDayDetail(dateStr: string, minutes: number): Promise<void> {
    const detail = document.getElementById('calDayDetail');
    if (!detail) return;

    const tasks = await taskApi.list({ todo_date: dateStr, status: 'active' });
    const completed = tasks.filter(t => t.todo_status === 'completed').length;
    const pending = tasks.filter(t => t.todo_status !== 'completed').length;

    detail.innerHTML = `
      <div class="card" style="padding:var(--space-4)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)">
          <span style="font-size:var(--text-base);font-weight:var(--weight-semibold);color:var(--text)">${utils.formatDateDisplay(dateStr)}</span>
          <button class="btn btn--sm" id="calGoToDay">${icon('external-link', 'size="14"')} 查看当日</button>
        </div>
        <div style="display:flex;gap:var(--space-4)">
          <div style="text-align:center">
            <div style="font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--color-primary);font-variant-numeric:tabular-nums">${minutes}</div>
            <div style="font-size:var(--text-2xs);color:var(--text-lighter)">分钟</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--color-success);font-variant-numeric:tabular-nums">${completed}</div>
            <div style="font-size:var(--text-2xs);color:var(--text-lighter)">已完成</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--color-warning);font-variant-numeric:tabular-nums">${pending}</div>
            <div style="font-size:var(--text-2xs);color:var(--text-lighter)">待完成</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('calGoToDay')?.addEventListener('click', () => {
      store.set('currentDate', dateStr);
      router.navigate('home');
    });

    initIcons();
  },
};
