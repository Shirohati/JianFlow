const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todoAPI', {
  // ---- Todos ----
  getTodos:(d)=>ipcRenderer.invoke('db:getTodos',d),
  getAllTodos:()=>ipcRenderer.invoke('db:getAllTodos'),
  addTodo:(t)=>ipcRenderer.invoke('db:addTodo',t),
  updateTodo:(id,u)=>ipcRenderer.invoke('db:updateTodo',id,u),
  deleteTodo:(id)=>ipcRenderer.invoke('db:deleteTodo',id),
  clearCompletedTodos:(d)=>ipcRenderer.invoke('db:clearCompletedTodos',d),
  batchAddTodos:(t)=>ipcRenderer.invoke('db:batchAddTodos',t),
  getUncompletedForDate:(d)=>ipcRenderer.invoke('db:getUncompletedForDate',d),
  generateRecurringTasks:(d)=>ipcRenderer.invoke('db:generateRecurringTasks',d),
  getRecurringDailyTasks:()=>ipcRenderer.invoke('db:getRecurringDailyTasks'),

  // ---- Categories ----
  getCategories:()=>ipcRenderer.invoke('db:getCategories'),
  addCategory:(n,c)=>ipcRenderer.invoke('db:addCategory',n,c),
  deleteCategory:(id)=>ipcRenderer.invoke('db:deleteCategory',id),

  // ---- Daily logs ----
  getDailyLog:(d)=>ipcRenderer.invoke('db:getDailyLog',d),
  setDailyLog:(d,c)=>ipcRenderer.invoke('db:setDailyLog',d,c),

  // ---- Time types ----
  getTimeTypes:()=>ipcRenderer.invoke('db:getTimeTypes'),
  addTimeType:(n,c)=>ipcRenderer.invoke('db:addTimeType',n,c),
  updateTimeType:(id,u)=>ipcRenderer.invoke('db:updateTimeType',id,u),
  deleteTimeType:(id)=>ipcRenderer.invoke('db:deleteTimeType',id),

  // ---- Time records ----
  addTimeRecord:(r)=>ipcRenderer.invoke('db:addTimeRecord',r),
  getTimeRecords:(d)=>ipcRenderer.invoke('db:getTimeRecords',d),
  getTimeRecordsRange:(s,e)=>ipcRenderer.invoke('db:getTimeRecordsRange',s,e),
  getAllTimeRecords:()=>ipcRenderer.invoke('db:getAllTimeRecords'),
  updateTimeRecord:(id,u)=>ipcRenderer.invoke('db:updateTimeRecord',id,u),
  deleteTimeRecord:(id)=>ipcRenderer.invoke('db:deleteTimeRecord',id),
  getImportBatches:()=>ipcRenderer.invoke('db:getImportBatches'),
  deleteByBatchId:(bid)=>ipcRenderer.invoke('db:deleteByBatchId',bid),

  // ---- Presets ----
  getPresets:()=>ipcRenderer.invoke('db:getPresets'),
  addPreset:(p)=>ipcRenderer.invoke('db:addPreset',p),
  updatePreset:(id,u)=>ipcRenderer.invoke('db:updatePreset',id,u),
  deletePreset:(id)=>ipcRenderer.invoke('db:deletePreset',id),

  // ---- Goals ----
  getGoal:(t)=>ipcRenderer.invoke('db:getGoal',t),
  setGoal:(t,m)=>ipcRenderer.invoke('db:setGoal',t,m),
  getAllGoals:()=>ipcRenderer.invoke('db:getAllGoals'),

  // ---- Countdowns ----
  getCountdowns:()=>ipcRenderer.invoke('db:getCountdowns'),
  addCountdown:(t,d,c)=>ipcRenderer.invoke('db:addCountdown',t,d,c),
  updateCountdown:(id,u)=>ipcRenderer.invoke('db:updateCountdown',id,u),
  deleteCountdown:(id)=>ipcRenderer.invoke('db:deleteCountdown',id),

  // ---- Settings ----
  getSetting:(k)=>ipcRenderer.invoke('db:getSetting',k),
  setSetting:(k,v)=>ipcRenderer.invoke('db:setSetting',k,v),
  getAllSettings:()=>ipcRenderer.invoke('db:getAllSettings'),

  // ---- Stats ----
  getStudyStats:(r)=>ipcRenderer.invoke('db:getStudyStats',r),
  getAverageStats:(s,e,r)=>ipcRenderer.invoke('db:getAverageStats',s,e,r),
  getStreak:()=>ipcRenderer.invoke('db:getStreak'),
  getWeeklyTimetable:(m,s)=>ipcRenderer.invoke('db:getWeeklyTimetable',m,s),
  exportAllData:()=>ipcRenderer.invoke('db:exportAllData'),

  // ---- Window ----
  setFullScreen:(f)=>ipcRenderer.invoke('window:setFullScreen',f),
  setKiosk:(f)=>ipcRenderer.invoke('window:setKiosk',f),
  setMiniOpacity:(v)=>ipcRenderer.invoke('window:setMiniOpacity',v),
  focusMain:()=>ipcRenderer.invoke('window:focusMain'),
  minimizePomo:()=>ipcRenderer.invoke('window:minimizePomo'),

  // ---- Pomodoro ----
  startPomodoro:(opts)=>ipcRenderer.invoke('pomodoro:start',opts),
  pomodoroPause:()=>ipcRenderer.invoke('pomodoro:pause'),
  pomodoroStop:()=>ipcRenderer.invoke('pomodoro:stop'),
  getPomoState:()=>ipcRenderer.invoke('pomodoro:getState'),
  switchPomoMode:(m)=>ipcRenderer.invoke('pomodoro:switchMode',m),
  pushPomoWallpaper:(p)=>ipcRenderer.invoke('pomodoro:pushWallpaper',p),

  // ---- File dialogs ----
  openImageDialog:()=>ipcRenderer.invoke('dialog:openImage'),
  openAudioDialog:()=>ipcRenderer.invoke('dialog:openAudio'),
  saveFileDialog:(n,c)=>ipcRenderer.invoke('dialog:saveFile',n,c),

  // ---- Notification ----
  showNotification:(t,b)=>ipcRenderer.invoke('notification:show',t,b),

  // ---- Events ----
  onFocusAddTodo: (cb) => { const h=()=>cb(); ipcRenderer.on('focus-add-todo',h); return ()=>ipcRenderer.removeListener('focus-add-todo',h); },
  onPomodoroSync: (cb) => { const h=(_,d)=>cb(d); ipcRenderer.on('pomodoro:sync',h); return ()=>ipcRenderer.removeListener('pomodoro:sync',h); },
  onPomodoroStopped: (cb) => { const h=()=>cb(); ipcRenderer.on('pomodoro:stopped',h); return ()=>ipcRenderer.removeListener('pomodoro:stopped',h); },
  onPomodoroWallpaper: (cb) => { const h=(_,p)=>cb(p); ipcRenderer.on('pomodoro:wallpaper',h); return ()=>ipcRenderer.removeListener('pomodoro:wallpaper',h); }
});
