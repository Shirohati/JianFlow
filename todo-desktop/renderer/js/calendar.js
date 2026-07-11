// CALENDAR - 日历热力图
(function () {
  const U = window.Utils;
  const API = window.todoAPI;

  let calYear, calMonth;
  let allRecords = {};
  let allTypeRecords = {};

  window.Calendar = {
    init() {
      const parts = window.App.currentDate.split('-');
      calYear = parseInt(parts[0]);
      calMonth = parseInt(parts[1]);
      this.bindEvents();
    },

    bindEvents() {
      document.getElementById('calPrevMonth').addEventListener('click', () => { calMonth--; if (calMonth < 1) { calMonth = 12; calYear--; } this.render(); });
      document.getElementById('calNextMonth').addEventListener('click', () => { calMonth++; if (calMonth > 12) { calMonth = 1; calYear++; } this.render(); });
      document.getElementById('calTitle').addEventListener('click', () => {
        const parts = window.App.currentDate.split('-');
        calYear = parseInt(parts[0]);
        calMonth = parseInt(parts[1]);
        this.render();
      });
      document.getElementById('calDaysGrid').addEventListener('click', (e) => {
        const cell = e.target.closest('.cal-day-cell');
        if (cell && cell.dataset.date) window.App.setCurrentDate(cell.dataset.date);
      });

      API.onFocusAddTodo(() => {
        if (window.App.currentPage === 'calendar-page') this.render();
      });
    },

    async render() {
      this.updateTitle();
      try {
        const records = await API.getAllTimeRecords();
        allRecords = {};
        allTypeRecords = {};
        for (const r of records) {
          if (r.source === 'import' && !r.start_time) continue;
          if (!allRecords[r.date]) allRecords[r.date] = 0;
          allRecords[r.date] += r.total_minutes || 0;
          if (!allTypeRecords[r.date]) allTypeRecords[r.date] = {};
          if (!allTypeRecords[r.date][r.time_type]) allTypeRecords[r.date][r.time_type] = 0;
          allTypeRecords[r.date][r.time_type] += r.total_minutes || 0;
        }
      } catch (e) { allRecords = {}; allTypeRecords = {}; }

      const grid = document.getElementById('calDaysGrid');
      grid.innerHTML = '';

      const firstDay = new Date(calYear, calMonth - 1, 1);
      const lastDay = new Date(calYear, calMonth, 0);
      const daysInMonth = lastDay.getDate();
      let startDow = firstDay.getDay();
      if (startDow === 0) startDow = 7;
      const totalCells = Math.ceil((startDow - 1 + daysInMonth) / 7) * 7;

      const today = U.getTodayStr();
      const todayParts = today.split('-');
      const tY = parseInt(todayParts[0]), tM = parseInt(todayParts[1]), tD = parseInt(todayParts[2]);

      for (let i = 1; i <= totalCells; i++) {
        const dayNum = i - (startDow - 1);
        const cell = document.createElement('div');
        cell.className = 'cal-day-cell';
        cell.style.cssText = 'aspect-ratio:1;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:0.75rem;font-weight:500;cursor:pointer;transition:all .15s;position:relative;border:2px solid transparent;gap:1px;overflow:hidden';

        if (dayNum < 1 || dayNum > daysInMonth) {
          cell.style.opacity = '0.3';
          cell.style.cursor = 'default';
        } else {
          const dateStr = calYear + '-' + String(calMonth).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0');
          const mins = allRecords[dateStr] || 0;
          const lvl = U.getHeatLevel(mins);

          const dayNumEl = document.createElement('span');
          dayNumEl.textContent = dayNum;
          dayNumEl.style.cssText = 'line-height:1;font-size:0.72rem';
          cell.appendChild(dayNumEl);

          if (mins > 0) {
            const timeEl = document.createElement('span');
            timeEl.textContent = U.formatMinutesShort(mins);
            timeEl.style.cssText = 'font-size:0.58rem;font-weight:600;line-height:1;opacity:0.9';
            cell.appendChild(timeEl);
          }

          cell.dataset.date = dateStr;

          cell.style.background = 'var(--heat-' + lvl + ')';
          cell.style.color = lvl >= 4 ? '#fff' : 'var(--text)';

          if (calYear === tY && calMonth === tM && dayNum === tD) {
            cell.style.border = '2.5px solid #e0a83c';
            cell.style.fontWeight = '700';
          }
          if (dateStr === window.App.currentDate) {
            cell.style.border = '2.5px solid var(--primary)';
            cell.style.fontWeight = '700';
          }

          cell.addEventListener('mouseenter', (e) => {
            cell.style.transform = 'scale(1.12)';
            cell.style.zIndex = '2';
            cell.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            this.showTooltip(e, dateStr, mins);
          });
          cell.addEventListener('mouseleave', () => {
            cell.style.transform = '';
            cell.style.zIndex = '';
            cell.style.boxShadow = '';
            this.hideTooltip();
          });
        }
        grid.appendChild(cell);
      }

      this.updateStats();
    },

    showTooltip(event, dateStr, totalMins) {
      this.hideTooltip();
      const tip = document.createElement('div');
      tip.id = 'calTooltip';
      tip.style.cssText = 'position:fixed;background:#2a2a3a;color:#eee;padding:10px 14px;border-radius:8px;font-size:0.75rem;z-index:999;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.3);min-width:140px;max-width:200px';

      let html = '<div style="font-weight:600;margin-bottom:6px;color:#fff">' + dateStr + '</div>';
      html += '<div style="margin-bottom:4px">总计：<strong>' + U.formatMinutes(totalMins) + '</strong></div>';

      const types = allTypeRecords[dateStr];
      if (types && Object.keys(types).length > 0) {
        html += '<div style="border-top:1px solid #444;padding-top:4px;margin-top:4px">';
        for (const [type, mins] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
          html += '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0"><span>' + U.escapeHtml(type) + '</span><span>' + U.formatMinutesShort(mins) + '</span></div>';
        }
        html += '</div>';
      }

      tip.innerHTML = html;
      document.body.appendChild(tip);

      const rect = event.target.getBoundingClientRect();
      let left = rect.right + 8;
      let top = rect.top;
      if (left + 200 > window.innerWidth) left = rect.left - 208;
      if (top + 150 > window.innerHeight) top = window.innerHeight - 160;
      if (top < 0) top = 8;

      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    },

    hideTooltip() {
      const old = document.getElementById('calTooltip');
      if (old) old.remove();
    },

    updateTitle() {
      document.getElementById('calTitle').textContent = calYear + '年' + calMonth + '月';
    },

    updateStats() {
      let totalMin = 0, monthMin = 0, weekMin = 0;
      const monthPrefix = calYear + '-' + String(calMonth).padStart(2, '0') + '-';

      for (const [date, mins] of Object.entries(allRecords)) {
        totalMin += mins;
        if (date.startsWith(monthPrefix)) monthMin += mins;
      }

      const cur = new Date(window.App.currentDate + 'T00:00:00');
      const day = cur.getDay();
      const offset = day === 0 ? -6 : 1 - day;
      const mon = new Date(cur);
      mon.setDate(cur.getDate() + offset);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);

      for (let d = new Date(mon); d <= sun; d.setDate(d.getDate() + 1)) {
        weekMin += allRecords[U.formatDate(d)] || 0;
      }

      document.getElementById('calStatTotal').textContent = U.formatMinutesShort(totalMin);
      document.getElementById('calStatMonth').textContent = U.formatMinutesShort(monthMin);
      document.getElementById('calStatWeek').textContent = U.formatMinutesShort(weekMin);
    }
  };
})();
