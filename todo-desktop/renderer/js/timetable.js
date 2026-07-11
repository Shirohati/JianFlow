// TIMETABLE - 课程表周视图 (动态时间范围 + 跨午夜拆分)
(function () {
  const U = window.Utils;
  const API = window.todoAPI;

  let mondayStr = '';
  let timeTypes = [];

  window.Timetable = {
    init() {
      mondayStr = U.getMonday(window.App.currentDate);
      this.bindEvents();
    },
    bindEvents() {
      document.getElementById('btnTimetablePrev').addEventListener('click', () => { this.shiftWeek(-7); });
      document.getElementById('btnTimetableNext').addEventListener('click', () => { this.shiftWeek(7); });
      document.getElementById('btnTimetableToday').addEventListener('click', () => { mondayStr = U.getMonday(U.getTodayStr()); this.render(); });
    },
    shiftWeek(days) {
      const d = new Date(mondayStr + 'T00:00:00');
      d.setDate(d.getDate() + days);
      mondayStr = U.formatDate(d);
      this.render();
    },
    async render() {
      try { timeTypes = await API.getTimeTypes(); } catch (e) { timeTypes = []; }
      const sundayStr = U.getSunday(mondayStr);
      document.getElementById('timetableRange').textContent = mondayStr + ' ~ ' + sundayStr;

      let records = [];
      try { records = await API.getWeeklyTimetable(mondayStr, sundayStr); } catch (e) { records = []; }

      // 1. 扫描记录，确定动态时间范围
      let minHour = 7;
      let maxHour = 24;
      for (const rec of records) {
        if (!rec.start_time || !rec.end_time) continue;
        const [sh, sm] = rec.start_time.split(':').map(Number);
        const [eh, em] = rec.end_time.split(':').map(Number);
        let actualEnd = eh * 60 + em;
        let actualStart = sh * 60 + sm;
        if (actualEnd <= actualStart) actualEnd += 24 * 60;
        const startH = Math.floor(actualStart / 60);
        const endH = Math.ceil(actualEnd / 60);
        if (startH < minHour) minHour = Math.max(0, startH);
        if (endH > maxHour) maxHour = Math.min(24, endH);
      }
      if (minHour > 6) minHour = 7;
      if (maxHour < 8) maxHour = 24;

      const grid = document.getElementById('timetableGrid');
      grid.innerHTML = '';
      const WDAYS = ['周一','周二','周三','周四','周五','周六','周日'];
      const HEADER_H = 32;
      const LEFT_PAD = 50;

      // 2. 生成动态网格
      const totalHours = maxHour - minHour;
      const slots = Math.ceil(totalHours / 2);
      const rowHeight = Math.round((grid.clientHeight - HEADER_H) / slots);

      // 动态设置 grid 模板，填满容器高度
      grid.style.gridTemplateRows = HEADER_H + 'px repeat(' + slots + ', ' + rowHeight + 'px)';

      // Headers
      const corner = document.createElement('div');
      corner.className = 'tt-header'; corner.textContent = '时间'; grid.appendChild(corner);
      for (let d = 0; d < 7; d++) {
        const hdr = document.createElement('div'); hdr.className = 'tt-header';
        hdr.textContent = WDAYS[d]; grid.appendChild(hdr);
      }

      // Time rows
      const cells = [];
      for (let slot = 0; slot < slots; slot++) {
        const hour = minHour + slot * 2;
        const hLabel = document.createElement('div');
        hLabel.className = 'tt-hour';
        hLabel.textContent = String(hour).padStart(2,'0') + ':00';
        grid.appendChild(hLabel);
        const rowCells = [];
        for (let d = 0; d < 7; d++) {
          const cell = document.createElement('div');
          cell.className = 'tt-cell';
          grid.appendChild(cell);
          rowCells.push(cell);
        }
        cells.push(rowCells);
      }

      // 3. 渲染记录块
      const colW = (grid.clientWidth - LEFT_PAD) / 7;
      const offsetMin = minHour * 60;
      const HOUR_HEIGHT = rowHeight / 2;

      for (const rec of records) {
        if (!rec.start_time || !rec.end_time) continue;
        const [sh, sm] = rec.start_time.split(':').map(Number);
        const [eh, em] = rec.end_time.split(':').map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;

        // 过滤异常记录：实际时长>12小时视为异常
        let actualDuration = endMin <= startMin ? (24 * 60 - startMin + endMin) : (endMin - startMin);
        if (actualDuration > 720) continue;

        const dateObj = new Date(rec.date + 'T00:00:00');
        const monObj = new Date(mondayStr + 'T00:00:00');
        const dayIdx = Math.round((dateObj - monObj) / 86400000);

        const tt = timeTypes.find(t => t.name === rec.time_type);
        const color = tt ? tt.color : '#5b7fff';

        const renderBlock = (sMin, eMin, dIdx, isPause) => {
          if (dIdx < 0 || dIdx > 6) return;
          if (eMin <= sMin) return;
          const blockTop = HEADER_H + ((sMin - offsetMin) / 60) * HOUR_HEIGHT;
          const blockH = Math.max(2, ((eMin - sMin) / 60) * HOUR_HEIGHT);
          const blockLeft = LEFT_PAD + dIdx * colW;
          const el = document.createElement('div');
          if (isPause) {
            el.className = 'tt-pause-block';
          } else {
            el.className = 'tt-block';
            el.textContent = rec.time_type + ' ' + Math.round(rec.total_minutes) + 'm';
            el.title = rec.time_type + '\n' + rec.start_time + ' - ' + rec.end_time + '\n' + U.formatMinutes(rec.total_minutes||0) + '\n来源:' + rec.source;
          }
          el.style.cssText = `top:${blockTop}px;left:${blockLeft}px;width:${Math.max(colW-2,20)}px;height:${blockH}px;background:${isPause ? 'rgba(255,255,255,0.3)' : color}`;
          grid.appendChild(el);
        };

        if (endMin <= startMin) {
          // 跨午夜：拆分两段
          renderBlock(startMin, 24 * 60, dayIdx, false);
          renderBlock(0, endMin, dayIdx + 1, false);
          // 暂停也拆分
          let pauses = [];
          try { pauses = JSON.parse(rec.pauses || '[]'); } catch (e) {}
          for (const p of pauses) {
            if (!p.start || !p.end) continue;
            const [psh, psm] = p.start.split(':').map(Number);
            const [peh, pem] = p.end.split(':').map(Number);
            let pStart = psh * 60 + psm;
            let pEnd = peh * 60 + pem;
            if (pEnd <= pStart) {
              renderBlock(pStart, 24 * 60, dayIdx, true);
              renderBlock(0, pEnd, dayIdx + 1, true);
            } else {
              renderBlock(pStart, pEnd, dayIdx, true);
            }
          }
        } else {
          renderBlock(startMin, endMin, dayIdx, false);
          // 暂停
          let pauses = [];
          try { pauses = JSON.parse(rec.pauses || '[]'); } catch (e) {}
          for (const p of pauses) {
            if (!p.start || !p.end) continue;
            const [psh, psm] = p.start.split(':').map(Number);
            const [peh, pem] = p.end.split(':').map(Number);
            const pStart = psh * 60 + psm;
            const pEnd = peh * 60 + pem;
            if (pEnd > pStart) renderBlock(pStart, pEnd, dayIdx, true);
          }
        }
      }
    }
  };
})();
