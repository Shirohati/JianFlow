const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let data = null;
let dataPath = '';

function initDatabase() {
  dataPath = path.join(app.getPath('userData'), 'todo-data.json');
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    data = JSON.parse(raw);
  } catch (e) {
    data = {
      todos: [],
      dailyLogs: {},
      timeRecords: [],
      timeTypes: [
        { id: 'tt_study', name: '学习', color: '#5b7fff', sort_order: 1 },
        { id: 'tt_programming', name: '编程', color: '#4caf84', sort_order: 2 },
        { id: 'tt_english', name: '英语', color: '#e07b6e', sort_order: 3 },
        { id: 'tt_math', name: '数学', color: '#e0a83c', sort_order: 4 },
        { id: 'tt_reading', name: '阅读', color: '#9b7fd4', sort_order: 5 }
      ],
      categories: [
        { id: 'cat_default', name: '其他', color: '#8e8e8e', sort_order: 99 },
        { id: 'cat_study', name: '学习', color: '#5b7fff', sort_order: 1 },
        { id: 'cat_work', name: '工作', color: '#e07b6e', sort_order: 2 },
        { id: 'cat_reading', name: '阅读', color: '#4caf84', sort_order: 3 },
        { id: 'cat_exercise', name: '运动', color: '#e0a83c', sort_order: 4 }
      ],
      pomodoroPresets: [],
      goals: [
        { id: 'goal_daily', type: 'daily', target_minutes: 120, is_active: 1 },
        { id: 'goal_weekly', type: 'weekly', target_minutes: 600, is_active: 1 }
      ],
      countdowns: [],
      settings: {
        theme: 'warm',
        master_plan: '',
        master_reflection: '',
        quotes: '[]',
        quote_mode: 'random',
        quote_interval: '30',
        pomodoro_show_todos: 'true',
        pomodoro_show_plan: 'false',
        pomodoro_show_countdown: 'true',
        bg_home: '',
        bg_pomodoro: '',
        startup_minimized: 'false'
      }
    };
    saveData();
  }
  console.log('Database initialized at:', dataPath);
}

function saveData() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save data:', e.message);
  }
}

function now() {
  return new Date().toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function generateId(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
}

function getDatabase() {
  return {
    // ===================== TODOS =====================
    getTodos(date) {
      const todos = (data.todos || []).filter(t => t.date === date);
      todos.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (b.priority !== a.priority) return (b.priority || 0) - (a.priority || 0);
        if (a.sort_order !== b.sort_order) return (a.sort_order || 0) - (b.sort_order || 0);
        return (a.created_at || '') < (b.created_at || '') ? -1 : 1;
      });
      return todos.map(t => {
        const cat = (data.categories || []).find(c => c.id === t.category_id);
        return { ...t, category_name: cat ? cat.name : '', category_color: cat ? cat.color : '' };
      });
    },

    getAllTodos() {
      return (data.todos || []).map(t => {
        const cat = (data.categories || []).find(c => c.id === t.category_id);
        return { ...t, category_name: cat ? cat.name : '', category_color: cat ? cat.color : '' };
      }).sort((a, b) => b.date.localeCompare(a.date));
    },

    addTodo(todo) {
      todo.created_at = now();
      data.todos.push(todo);
      saveData();
      return todo;
    },

    updateTodo(id, updates) {
      const idx = data.todos.findIndex(t => t.id === id);
      if (idx < 0) return null;
      const allowed = ['text', 'completed', 'note', 'category_id', 'priority', 'sort_order', 'recurrence', 'completed_at'];
      for (const [key, value] of Object.entries(updates)) {
        if (allowed.includes(key)) data.todos[idx][key] = value;
      }
      saveData();
      return true;
    },

    deleteTodo(id) {
      data.todos = data.todos.filter(t => t.id !== id);
      saveData();
      return true;
    },

    clearCompletedTodos(date) {
      const before = data.todos.length;
      data.todos = data.todos.filter(t => !(t.date === date && t.completed));
      saveData();
      return before - data.todos.length;
    },

    batchAddTodos(todos) {
      for (const t of todos) {
        if (!data.todos.find(existing => existing.id === t.id)) {
          t.created_at = now();
          data.todos.push(t);
        }
      }
      saveData();
      return todos.length;
    },

    getUncompletedForDate(date) {
      return (data.todos || []).filter(t => t.date === date && !t.completed);
    },

    getRecurringTasks() {
      const all = (data.todos || []).filter(t => t.recurrence && t.recurrence !== '' && !t.parent_id);
      const textMap = {};
      for (const t of all) {
        if (!textMap[t.text] || (t.created_at && t.created_at < textMap[t.text].created_at)) {
          textMap[t.text] = t;
        }
      }
      return Object.values(textMap);
    },

    getRecurringDailyTasks() {
      return (data.todos || []).filter(t => t.recurrence === 'daily' && !t.parent_id);
    },

    generateRecurringTasks(targetDate) {
      const recurring = this.getRecurringTasks();
      const allTodos = data.todos || [];
      const targetD = new Date(targetDate + 'T00:00:00');
      let created = 0;

      for (const task of recurring) {
        const hasParent = allTodos.some(t => t.parent_id === task.id && t.date === targetDate);
        const hasSameText = allTodos.some(t => t.date === targetDate && t.text === task.text && !t.parent_id);
        if (hasParent || hasSameText) continue;

        const originDate = new Date(task.date + 'T00:00:00');
        const diffDays = Math.round((targetD - originDate) / 86400000);

        if (diffDays <= 0) continue;

        let shouldCreate = false;

        if (task.recurrence === 'daily') {
          shouldCreate = true;
        } else if (task.recurrence === 'weekly') {
          shouldCreate = diffDays % 7 === 0;
        } else if (task.recurrence === 'monthly') {
          shouldCreate = originDate.getDate() === targetD.getDate();
        }

        if (shouldCreate) {
          const newTodo = {
            id: generateId('td'),
            date: targetDate,
            text: task.text,
            completed: false,
            note: '',
            category_id: task.category_id,
            priority: task.priority,
            sort_order: 0,
            recurrence: task.recurrence,
            parent_id: task.id
          };
          data.todos.push(newTodo);
          created++;
        }
      }

      if (created > 0) saveData();
      return created;
    },

    // ===================== CATEGORIES =====================
    getCategories() {
      return [...(data.categories || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },

    addCategory(name, color) {
      const id = 'cat_' + Date.now().toString(36);
      data.categories.push({ id, name, color: color || '#5b7fff', sort_order: 0 });
      saveData();
      return { id, name, color };
    },

    deleteCategory(id) {
      data.todos.forEach(t => { if (t.category_id === id) t.category_id = ''; });
      data.categories = data.categories.filter(c => c.id !== id && c.id !== 'cat_default' ? true : c.id === 'cat_default');
      saveData();
      return true;
    },

    // ===================== DAILY LOGS =====================
    getDailyLog(date) {
      return (data.dailyLogs && data.dailyLogs[date]) || '';
    },

    setDailyLog(date, content) {
      if (!content || content.trim() === '') {
        delete data.dailyLogs[date];
      } else {
        data.dailyLogs[date] = content;
      }
      saveData();
      return true;
    },

    // ===================== TIME TYPES =====================
    getTimeTypes() {
      return [...(data.timeTypes || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },

    addTimeType(name, color) {
      const id = 'tt_' + Date.now().toString(36);
      data.timeTypes.push({ id, name, color: color || '#5b7fff', sort_order: 0 });
      saveData();
      return { id, name, color };
    },

    updateTimeType(id, updates) {
      const tt = data.timeTypes.find(t => t.id === id);
      if (!tt) return null;
      const oldName = tt.name;
      if (updates.name !== undefined) tt.name = updates.name;
      if (updates.color !== undefined) tt.color = updates.color;
      if (updates.sort_order !== undefined) tt.sort_order = updates.sort_order;
      // Update references
      if (updates.name && oldName !== updates.name) {
        data.timeRecords.forEach(r => { if (r.time_type === oldName) r.time_type = updates.name; });
        data.pomodoroPresets.forEach(p => { if (p.time_type === oldName) p.time_type = updates.name; });
      }
      saveData();
      return true;
    },

    deleteTimeType(id) {
      const tt = data.timeTypes.find(t => t.id === id);
      if (!tt) return true;
      data.timeRecords.forEach(r => { if (r.time_type === tt.name) r.time_type = '其他'; });
      data.pomodoroPresets.forEach(p => { if (p.time_type === tt.name) p.time_type = '其他'; });
      data.timeTypes = data.timeTypes.filter(t => t.id !== id);
      saveData();
      return true;
    },

    // ===================== TIME RECORDS =====================
    addTimeRecord(record) {
      record.created_at = now();
      data.timeRecords.push(record);
      saveData();
      return record;
    },

    getImportBatches() {
      const batchMap = {};
      (data.timeRecords || []).filter(r => r.source === 'import').forEach(r => {
        const bid = r.import_batch_id;
        if (!bid) return;
        if (!batchMap[bid]) {
          batchMap[bid] = { batch_id: bid, date: r.date, time_type: r.time_type, total_minutes: 0, count: 0, has_start_time: !!r.start_time };
        }
        batchMap[bid].total_minutes += r.total_minutes || 0;
        batchMap[bid].count++;
      });
      return Object.values(batchMap).sort((a, b) => b.batch_id.localeCompare(a.batch_id));
    },

    deleteByBatchId(batchId) {
      const before = data.timeRecords.length;
      data.timeRecords = data.timeRecords.filter(r => r.import_batch_id !== batchId);
      saveData();
      return before - data.timeRecords.length;
    },

    getTimeRecords(date) {
      return (data.timeRecords || []).filter(r => r.date === date && !(r.source === 'import' && !r.start_time)).sort((a, b) => (a.start_time || '') < (b.start_time || '') ? -1 : 1);
    },

    getTimeRecordsRange(startDate, endDate) {
      return (data.timeRecords || []).filter(r => r.date >= startDate && r.date <= endDate).sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '') < (b.start_time || '') ? -1 : 1);
    },

    getAllTimeRecords() {
      return [...(data.timeRecords || [])].sort((a, b) => b.date.localeCompare(a.date));
    },

    updateTimeRecord(id, updates) {
      const idx = data.timeRecords.findIndex(r => r.id === id);
      if (idx < 0) return null;
      const allowed = ['time_type', 'start_time', 'end_time', 'total_minutes', 'pauses', 'note'];
      for (const [key, value] of Object.entries(updates)) {
        if (allowed.includes(key)) data.timeRecords[idx][key] = value;
      }
      saveData();
      return true;
    },

    deleteTimeRecord(id) {
      data.timeRecords = data.timeRecords.filter(r => r.id !== id);
      saveData();
      return true;
    },

    // ===================== POMODORO PRESETS =====================
    getPresets() {
      return [...(data.pomodoroPresets || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },

    addPreset(preset) {
      const id = 'pp_' + Date.now().toString(36);
      const p = { id, time_type: preset.time_type, duration_minutes: preset.duration_minutes, mode: preset.mode || 'countdown', color: preset.color || '#5b7fff', sort_order: preset.sort_order || 0 };
      data.pomodoroPresets.push(p);
      saveData();
      return p;
    },

    updatePreset(id, updates) {
      const p = data.pomodoroPresets.find(pr => pr.id === id);
      if (!p) return null;
      for (const [key, value] of Object.entries(updates)) {
        if (['time_type', 'duration_minutes', 'mode', 'color', 'sort_order'].includes(key)) p[key] = value;
      }
      saveData();
      return true;
    },

    deletePreset(id) {
      data.pomodoroPresets = data.pomodoroPresets.filter(p => p.id !== id);
      saveData();
      return true;
    },

    // ===================== GOALS =====================
    getGoal(type) {
      return (data.goals || []).find(g => g.type === type) || { type, target_minutes: type === 'daily' ? 120 : 600, is_active: 1 };
    },

    setGoal(type, targetMinutes) {
      const g = data.goals.find(g => g.type === type);
      if (g) {
        g.target_minutes = targetMinutes;
      } else {
        data.goals.push({ id: 'goal_' + type, type, target_minutes: targetMinutes, is_active: 1 });
      }
      saveData();
      return true;
    },

    getAllGoals() {
      return [...(data.goals || [])];
    },

    // ===================== COUNTDOWNS =====================
    getCountdowns() {
      return [...(data.countdowns || [])].sort((a, b) => a.target_date.localeCompare(b.target_date));
    },

    addCountdown(title, targetDate, color) {
      const id = 'cd_' + Date.now().toString(36);
      const cd = { id, title, target_date: targetDate, color: color || '#5b7fff', created_at: now() };
      data.countdowns.push(cd);
      saveData();
      return cd;
    },

    updateCountdown(id, updates) {
      const cd = data.countdowns.find(c => c.id === id);
      if (!cd) return null;
      for (const [key, value] of Object.entries(updates)) {
        if (['title', 'target_date', 'color'].includes(key)) cd[key] = value;
      }
      saveData();
      return true;
    },

    deleteCountdown(id) {
      data.countdowns = data.countdowns.filter(c => c.id !== id);
      saveData();
      return true;
    },

    // ===================== SETTINGS =====================
    getSetting(key) {
      return (data.settings && data.settings[key]) || null;
    },

    setSetting(key, value) {
      if (!data.settings) data.settings = {};
      data.settings[key] = String(value);
      saveData();
      return true;
    },

    getAllSettings() {
      return data.settings || {};
    },

    // ===================== STATS & AGGREGATION =====================
    getStudyStats(range) {
      const records = data.timeRecords || [];
      const nowD = new Date();
      let dateFilter = '2000-01-01';

      if (range === 'week') { const d = new Date(nowD); d.setDate(nowD.getDate() - 7); dateFilter = d.toISOString().split('T')[0]; }
      else if (range === 'month') { const d = new Date(nowD); d.setMonth(nowD.getMonth() - 1); dateFilter = d.toISOString().split('T')[0]; }
      else if (range === 'year') { const d = new Date(nowD); d.setFullYear(nowD.getFullYear() - 1); dateFilter = d.toISOString().split('T')[0]; }

      const filtered = records.filter(r => r.date >= dateFilter);
      const effectiveForDate = (r) => !(r.source === 'import' && !r.start_time);

      const dailyMap = {};
      const typeMap = {};
      for (const r of filtered) {
        if (!typeMap[r.time_type]) typeMap[r.time_type] = { time_type: r.time_type, minutes: 0, sessions: 0 };
        typeMap[r.time_type].minutes += r.total_minutes || 0;
        typeMap[r.time_type].sessions++;

        if (!effectiveForDate(r)) continue;
        if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, minutes: 0, sessions: 0 };
        dailyMap[r.date].minutes += r.total_minutes || 0;
        dailyMap[r.date].sessions++;
      }

      const dailyMinutes = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
      const typeDistribution = Object.values(typeMap).sort((a, b) => b.minutes - a.minutes);

      const totalMinutes = records.reduce((s, r) => s + (r.total_minutes || 0), 0);
      const totalSessions = records.length;
      const today = nowD.toISOString().split('T')[0];
      const todayR = records.filter(r => r.date === today && effectiveForDate(r));
      const todayMinutes = todayR.reduce((s, r) => s + (r.total_minutes || 0), 0);
      const todaySessions = todayR.length;

      return { dailyMinutes, typeDistribution, totalMinutes, totalSessions, todayMinutes, todaySessions };
    },

    getAverageStats(startDate, endDate, rangeType) {
      const records = (data.timeRecords || []).filter(r => r.date >= startDate && r.date <= endDate && !(r.source === 'import' && !r.start_time));
      const total = records.reduce((s, r) => s + (r.total_minutes || 0), 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const endD = endDate <= todayStr ? new Date(endDate + 'T00:00:00') : today;

      let totalDays;
      if (rangeType === 'week') {
        const startD = new Date(startDate + 'T00:00:00');
        totalDays = Math.round((endD - startD) / 86400000) + 1;
        if (totalDays < 1) totalDays = 1;
      } else if (rangeType === 'month') {
        const startD = new Date(startDate + 'T00:00:00');
        totalDays = Math.round((endD - startD) / 86400000) + 1;
        if (totalDays < 1) totalDays = 1;
      } else if (rangeType === '7days') {
        totalDays = 7;
      } else if (rangeType === '30days') {
        totalDays = 30;
      } else {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        totalDays = Math.round((end - start) / 86400000) + 1;
      }

      const avg = Math.round(total / totalDays);
      return { days: totalDays, totalMinutes: total, avgMinutes: avg };
    },

    getStreak() {
      const dates = [...new Set((data.timeRecords || []).filter(r => r.total_minutes > 0).map(r => r.date))].sort().reverse();

      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < dates.length; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const checkStr = checkDate.toISOString().split('T')[0];

        if (i === 0 && dates[0] !== checkStr) {
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          if (dates[0] === yesterdayStr) { streak++; continue; }
          break;
        }
        if (dates[i] === checkStr) streak++;
        else break;
      }

      let longest = 0, cur = 1;
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]);
        const curr = new Date(dates[i]);
        const diff = (prev - curr) / 86400000;
        if (diff === 1) cur++;
        else { if (cur > longest) longest = cur; cur = 1; }
      }
      if (cur > longest) longest = cur;
      if (dates.length === 1) longest = 1;

      return { streak, longestStreak: longest };
    },

    getWeeklyTimetable(mondayStr, sundayStr) {
      return (data.timeRecords || []).filter(r => r.date >= mondayStr && r.date <= sundayStr && r.start_time && r.end_time)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '') < (b.start_time || '') ? -1 : 1);
    },

    // ===================== EXPORT =====================
    exportAllData() {
      return JSON.stringify({
        todos: data.todos,
        dailyLogs: data.dailyLogs,
        timeRecords: data.timeRecords,
        timeTypes: data.timeTypes,
        categories: data.categories,
        presets: data.pomodoroPresets,
        goals: data.goals,
        countdowns: data.countdowns,
        settings: data.settings,
        exportedAt: new Date().toISOString()
      }, null, 2);
    },

    close() {}
  };
}

module.exports = { initDatabase, getDatabase };
