// STATS - 饼状图 + 平均时长 + 打卡 + 新图表
(function () {
  const U = window.Utils;
  const API = window.todoAPI;

  let timeTypes = [];
  let currentPeriod = 'day';
  let periodAnchor = U.getTodayStr();
  let hourMonthAnchor = U.getTodayStr();
  let monthTrendAnchor = U.getTodayStr();
  let yearTrendAnchor = U.getTodayStr();

  window.Stats = {
    init() {
      this.bindEvents();
    },

    bindEvents() {
      document.querySelectorAll('.avg-btn').forEach(b => {
        b.addEventListener('click', () => {
          document.querySelectorAll('.avg-btn').forEach(x => x.classList.remove('btn-primary'));
          b.classList.add('btn-primary');
          this.calcAverage(b.dataset.range);
        });
      });
      document.getElementById('btnAvgCustom').addEventListener('click', () => this.calcAverage('custom'));

      document.querySelectorAll('.period-btn').forEach(b => {
        b.addEventListener('click', () => {
          document.querySelectorAll('.period-btn').forEach(x => x.classList.remove('btn-primary'));
          b.classList.add('btn-primary');
          currentPeriod = b.dataset.period;
          if (currentPeriod === 'all') {
            periodAnchor = U.getTodayStr();
          }
          this.renderPeriod();
        });
      });
      document.getElementById('btnPeriodPrev').addEventListener('click', () => this.shiftPeriod(-1));
      document.getElementById('btnPeriodNext').addEventListener('click', () => this.shiftPeriod(1));

      document.getElementById('btnHourPrev').addEventListener('click', () => { this.shiftMonth(-1, 'hour'); });
      document.getElementById('btnHourNext').addEventListener('click', () => { this.shiftMonth(1, 'hour'); });
      document.getElementById('btnMonthTrendPrev').addEventListener('click', () => { this.shiftMonth(-1, 'monthTrend'); });
      document.getElementById('btnMonthTrendNext').addEventListener('click', () => { this.shiftMonth(1, 'monthTrend'); });
      document.getElementById('btnYearTrendPrev').addEventListener('click', () => { this.shiftYear(-1); });
      document.getElementById('btnYearTrendNext').addEventListener('click', () => { this.shiftYear(1); });
    },

    shiftPeriod(dir) {
      if (currentPeriod === 'all') return;
      const d = new Date(periodAnchor + 'T00:00:00');
      if (currentPeriod === 'day') {
        d.setDate(d.getDate() + dir);
      } else if (currentPeriod === 'week') {
        d.setDate(d.getDate() + dir * 7);
      } else if (currentPeriod === 'month') {
        d.setMonth(d.getMonth() + dir);
      }
      periodAnchor = U.formatDate(d);
      this.renderPeriod();
    },

    shiftMonth(dir, type) {
      const d = new Date((type === 'hour' ? hourMonthAnchor : monthTrendAnchor) + 'T00:00:00');
      d.setMonth(d.getMonth() + dir);
      const newDate = U.formatDate(d);
      if (type === 'hour') { hourMonthAnchor = newDate; this.renderHourDist(); }
      else { monthTrendAnchor = newDate; this.renderMonthTrend(); }
    },

    shiftYear(dir) {
      const d = new Date(yearTrendAnchor + 'T00:00:00');
      d.setFullYear(d.getFullYear() + dir);
      yearTrendAnchor = U.formatDate(d);
      this.renderYearTrend();
    },

    getPeriodRange() {
      const today = U.getTodayStr();
      const nowD = new Date(today + 'T00:00:00');
      let startDate, endDate;

      if (currentPeriod === 'day') {
        startDate = periodAnchor;
        endDate = periodAnchor <= today ? periodAnchor : today;
      } else if (currentPeriod === 'week') {
        const ref = new Date(periodAnchor + 'T00:00:00');
        const day = ref.getDay();
        const mon = new Date(ref);
        mon.setDate(ref.getDate() - (day === 0 ? 6 : day - 1));
        startDate = U.formatDate(mon);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        endDate = sun <= nowD ? U.formatDate(sun) : today;
      } else if (currentPeriod === 'month') {
        const ref = new Date(periodAnchor + 'T00:00:00');
        const year = ref.getFullYear();
        const month = ref.getMonth();
        startDate = U.formatDate(new Date(year, month, 1));
        const lastDay = new Date(year, month + 1, 0);
        endDate = lastDay <= nowD ? U.formatDate(lastDay) : today;
      } else {
        startDate = '2000-01-01';
        endDate = today;
      }
      return { startDate, endDate };
    },

    async renderPeriod() {
      const { startDate, endDate } = this.getPeriodRange();
      document.getElementById('periodRange').textContent = startDate + ' ~ ' + endDate;

      try {
        const records = await API.getAllTimeRecords();
        const filtered = records.filter(r => r.date >= startDate && r.date <= endDate);
        const typeMap = {};
        const dailyMap = {};
        let totalMin = 0;
        const isAll = currentPeriod === 'all';

        for (const r of filtered) {
          const isImport = r.source === 'import' && !r.start_time;
          if (!isAll && isImport) continue;

          if (!typeMap[r.time_type]) typeMap[r.time_type] = { time_type: r.time_type, minutes: 0, sessions: 0 };
          typeMap[r.time_type].minutes += r.total_minutes || 0;
          typeMap[r.time_type].sessions++;
          totalMin += r.total_minutes || 0;

          if (!isImport) {
            if (!dailyMap[r.date]) dailyMap[r.date] = 0;
            dailyMap[r.date] += r.total_minutes || 0;
          }
        }

        const typeDistribution = Object.values(typeMap).sort((a, b) => b.minutes - a.minutes);
        const activeDays = Object.keys(dailyMap).length;

        const { startDate: s, endDate: e } = this.getPeriodRange();
        const sD = new Date(s + 'T00:00:00');
        const eD = new Date(e + 'T00:00:00');
        const spanDays = Math.round((eD - sD) / 86400000) + 1;
        const avgMin = spanDays > 0 ? Math.round(totalMin / spanDays) : 0;

        document.getElementById('periodTotal').textContent = U.formatMinutes(totalMin);
        document.getElementById('periodAvg').textContent = U.formatMinutes(avgMin);
        document.getElementById('periodDays').textContent = activeDays;

        this.renderPieChart(typeDistribution);
      } catch (e) {}
    },

    async render() {
      await this.loadData();
      this.renderPeriod();
      this.renderDataCards();
      this.renderStreak();
      this.calcAverage('week');
      this.renderHourDist();
      this.renderMonthTrend();
      this.renderYearTrend();
    },

    async loadData() {
      try { timeTypes = await API.getTimeTypes(); } catch (e) { timeTypes = []; }
    },

    async renderPieChart(dist) {
      if (!dist) {
        try {
          const stats = await API.getStudyStats('all');
          dist = stats.typeDistribution || [];
        } catch (e) { dist = []; }
      }

      if (dist.length === 0) {
        const canvas = document.getElementById('pieChart');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '13px sans-serif';
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-lighter').trim();
        ctx.textAlign = 'center';
        ctx.fillText('暂无数据', canvas.width / 2, canvas.height / 2);
        return;
      }

      const labels = dist.map(d => d.time_type);
      const values = dist.map(d => d.minutes);
      const colors = dist.map(d => {
        const tt = timeTypes.find(t => t.name === d.time_type);
        return tt ? tt.color : '#5b7fff';
      });

      const canvas = document.getElementById('pieChart');
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();

      new Chart(canvas, {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 10,
                font: { size: 11 },
                generateLabels: function (chart) {
                  const data = chart.data;
                  return data.labels.map((label, i) => ({
                    text: label + ' (' + U.formatMinutesShort(data.datasets[0].data[i]) + ')',
                    fillStyle: data.datasets[0].backgroundColor[i],
                    index: i
                  }));
                }
              }
            }
          }
        }
      });
    },

    async renderHourDist() {
      const ref = new Date(hourMonthAnchor + 'T00:00:00');
      const year = ref.getFullYear();
      const month = ref.getMonth();
      const startDate = U.formatDate(new Date(year, month, 1));
      const endDate = U.formatDate(new Date(year, month + 1, 0));
      const today = U.getTodayStr();
      const realEnd = endDate <= today ? endDate : today;

      document.getElementById('hourMonthRange').textContent = year + '年' + (month + 1) + '月';

      try {
        const records = await API.getAllTimeRecords();
        const hourData = new Array(24).fill(0);

        for (const r of records) {
          if (r.date < startDate || r.date > realEnd) continue;
          if (r.source === 'import' && !r.start_time) continue;
          if (!r.start_time || !r.end_time) {
            hourData[0] += r.total_minutes || 0;
            continue;
          }
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
        const yMax = Math.ceil(maxVal / 30) * 30;
        const yStep = yMax <= 60 ? 10 : yMax <= 180 ? 30 : yMax <= 360 ? 60 : Math.ceil(yMax / 6) ;

        const labels = Array.from({ length: 24 }, (_, i) => i + 'h');
        const canvas = document.getElementById('hourDistChart');
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();

        new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              data: hourData,
              backgroundColor: 'rgba(91,127,255,0.6)',
              borderColor: 'rgba(91,127,255,1)',
              borderWidth: 1,
              borderRadius: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => U.formatMinutes(ctx.parsed.y)
                }
              }
            },
            scales: {
              x: {
                ticks: { font: { size: 10 }, maxRotation: 0 },
                grid: { display: false }
              },
              y: {
                beginAtZero: true,
                max: yMax,
                ticks: {
                  stepSize: yStep,
                  font: { size: 10 },
                  callback: v => v + 'm'
                }
              }
            }
          }
        });
      } catch (e) {}
    },

    async renderMonthTrend() {
      const ref = new Date(monthTrendAnchor + 'T00:00:00');
      const year = ref.getFullYear();
      const month = ref.getMonth();
      const startDate = U.formatDate(new Date(year, month, 1));
      const endDate = U.formatDate(new Date(year, month + 1, 0));
      const today = U.getTodayStr();
      const realEnd = endDate <= today ? endDate : today;
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      document.getElementById('monthTrendRange').textContent = year + '年' + (month + 1) + '月';

      try {
        const records = await API.getAllTimeRecords();
        const dailyMap = {};
        for (const r of records) {
          if (r.date < startDate || r.date > realEnd) continue;
          if (r.source === 'import' && !r.start_time) continue;
          if (!dailyMap[r.date]) dailyMap[r.date] = 0;
          dailyMap[r.date] += r.total_minutes || 0;
        }

        const labels = [];
        const data = [];
        for (let d = 1; d <= daysInMonth; d++) {
          const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
          labels.push(d + '日');
          data.push(dailyMap[ds] || 0);
        }

        const maxVal = Math.max(...data, 1);
        const yMax = Math.ceil(maxVal / 60) * 60;
        const yStep = yMax <= 120 ? 30 : yMax <= 300 ? 60 : yMax <= 600 ? 120 : Math.ceil(yMax / 5 / 60) * 60;

        const canvas = document.getElementById('monthTrendChart');
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();

        new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              data,
              borderColor: '#5b7fff',
              backgroundColor: 'rgba(91,127,255,0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointHoverRadius: 5,
              pointBackgroundColor: '#5b7fff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                  label: ctx => U.formatMinutes(ctx.parsed.y)
                }
              }
            },
            scales: {
              x: {
                ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 15 },
                grid: { display: false }
              },
              y: {
                beginAtZero: true,
                max: yMax,
                ticks: {
                  stepSize: yStep,
                  font: { size: 10 },
                  callback: v => U.formatMinutesShort(v)
                }
              }
            }
          }
        });
      } catch (e) {}
    },

    async renderYearTrend() {
      const ref = new Date(yearTrendAnchor + 'T00:00:00');
      const year = ref.getFullYear();

      document.getElementById('yearTrendRange').textContent = year + '年';

      try {
        const records = await API.getAllTimeRecords();
        const monthlyData = new Array(12).fill(0);

        for (const r of records) {
          if (!r.date.startsWith(String(year))) continue;
          if (r.source === 'import' && !r.start_time) continue;
          const m = parseInt(r.date.split('-')[1]) - 1;
          if (m >= 0 && m < 12) monthlyData[m] += r.total_minutes || 0;
        }

        const maxVal = Math.max(...monthlyData, 1);
        const yMax = Math.ceil(maxVal / 300) * 300;
        const yStep = yMax <= 600 ? 120 : yMax <= 1800 ? 300 : Math.ceil(yMax / 6 / 300) * 300;

        const labels = Array.from({ length: 12 }, (_, i) => (i + 1) + '月');
        const canvas = document.getElementById('yearTrendChart');
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();

        new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              data: monthlyData,
              borderColor: '#e0a83c',
              backgroundColor: 'rgba(224,168,60,0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: '#e0a83c'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                  label: ctx => U.formatMinutes(ctx.parsed.y)
                }
              }
            },
            scales: {
              x: {
                ticks: { font: { size: 11 } },
                grid: { display: false }
              },
              y: {
                beginAtZero: true,
                max: yMax,
                ticks: {
                  stepSize: yStep,
                  font: { size: 10 },
                  callback: v => U.formatMinutesShort(v)
                }
              }
            }
          }
        });
      } catch (e) {}
    },

    async renderDataCards() {
      try {
        const stats = await API.getStudyStats('all');
        document.getElementById('statsDataCards').innerHTML = `
          <div>📚 总学习时长: <strong>${U.formatMinutes(stats.totalMinutes)}</strong></div>
          <div>🍅 番茄钟次数: <strong>${stats.totalSessions}</strong></div>
          <div>📆 今日时长: <strong>${U.formatMinutes(stats.todayMinutes)}</strong></div>
          <div>✅ 今日番茄次数: <strong>${stats.todaySessions}</strong></div>`;
      } catch (e) {}
    },

    async renderStreak() {
      try {
        const s = await API.getStreak();
        document.getElementById('streakDisplay').innerHTML = `
          当前连续 <strong style="color:var(--primary);font-size:1.3rem">${s.streak}</strong> 天 &nbsp;|&nbsp;
          最长连续 <strong style="color:var(--warning)">${s.longestStreak}</strong> 天`;
      } catch (e) {}
    },

    async calcAverage(range) {
      let startDate, endDate;
      const today = U.getTodayStr();
      const d = new Date(today + 'T00:00:00');

      if (range === 'week') {
        const mon = new Date(d);
        const day = d.getDay();
        mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        startDate = U.formatDate(mon);
        endDate = today;
      } else if (range === 'month') {
        d.setDate(1);
        startDate = U.formatDate(d);
        endDate = today;
      } else if (range === '7days') {
        d.setDate(d.getDate() - 6);
        startDate = U.formatDate(d);
        endDate = today;
      } else if (range === '30days') {
        d.setDate(d.getDate() - 29);
        startDate = U.formatDate(d);
        endDate = today;
      } else if (range === 'custom') {
        startDate = document.getElementById('avgStart').value;
        endDate = document.getElementById('avgEnd').value;
        if (!startDate || !endDate) { U.showToast('请选择日期范围'); return; }
      }

      try {
        const result = await API.getAverageStats(startDate, endDate, range);
        document.getElementById('avgResult').innerHTML =
          `<span style="font-size:0.9rem;color:var(--text-light)">${startDate} ~ ${endDate}</span><br>
           共 <strong>${result.days}</strong> 天 · 总时长 <strong>${U.formatMinutes(result.totalMinutes)}</strong> · 日均 <strong style="color:var(--primary);font-size:1.4rem">${U.formatMinutes(result.avgMinutes)}</strong>`;
      } catch (e) {}
    }
  };
})();
