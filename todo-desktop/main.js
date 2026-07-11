const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, Notification, nativeImage, dialog } = require('electron');
const path = require('path');
const { initDatabase, getDatabase } = require('./src/database');

let mainWindow = null;
let pomoWindow = null;
let miniWindow = null;
let tray = null;
let isQuitting = false;

// ---- 番茄钟状态机（主进程是唯一权威计时源）----
const pomoState = {
  running: false,
  timeType: '学习',
  color: '#5b7fff',
  mode: 'countdown',
  totalSeconds: 0,
  targetSeconds: 0,
  startTime: null,
  pauses: [],
  currentPauseStart: null,
  windowMode: 'window',
  intervalId: null
};

function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function pauseSecs() {
  let t = 0;
  for (const p of pomoState.pauses) {
    if (!p.end) continue;
    const [sh,sm] = p.start.split(':').map(Number);
    const [eh,em] = p.end.split(':').map(Number);
    t += (eh*60+em) - (sh*60+sm);
  }
  return t;
}

function currentPauseSecs() {
  if (!pomoState.currentPauseStart) return 0;
  const [sh,sm] = pomoState.currentPauseStart.split(':').map(Number);
  const now = new Date();
  const nm = now.getHours()*60 + now.getMinutes();
  return nm - (sh*60+sm);
}

function broadcastState() {
  const s = buildPomoPayload();
  if (mainWindow) mainWindow.webContents.send('pomodoro:sync', s);
  if (pomoWindow && !pomoWindow.isDestroyed()) pomoWindow.webContents.send('pomodoro:sync', s);
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('pomodoro:sync', s);
}

function buildPomoPayload() {
  return {
    running: pomoState.running,
    timeType: pomoState.timeType,
    color: pomoState.color,
    mode: pomoState.mode,
    totalSeconds: pomoState.totalSeconds,
    targetSeconds: pomoState.targetSeconds,
    startTime: pomoState.startTime,
    windowMode: pomoState.windowMode,
    paused: !!pomoState.currentPauseStart
  };
}

function startPomoInterval() {
  if (pomoState.intervalId) return;
  pomoState.intervalId = setInterval(() => {
    if (pomoState.mode === 'countdown') {
      pomoState.totalSeconds--;
      if (pomoState.totalSeconds <= 0) {
        stopPomodoro(true);
        return;
      }
    } else {
      pomoState.totalSeconds++;
    }
    broadcastState();
  }, 1000);
}

function stopPomoInterval() {
  if (pomoState.intervalId) { clearInterval(pomoState.intervalId); pomoState.intervalId = null; }
}

async function stopPomodoro(completed) {
  stopPomoInterval();
  const endTime = nowTime();
  if (pomoState.running && pomoState.currentPauseStart) {
    pomoState.pauses.push({ start: pomoState.currentPauseStart, end: endTime });
    pomoState.currentPauseStart = null;
  }
  let elapsed = pomoState.mode === 'countdown' ? pomoState.targetSeconds - pomoState.totalSeconds : pomoState.totalSeconds;
  const effective = Math.max(0, elapsed - pauseSecs());
  const effectiveMin = Math.round(effective / 60);

  if (effectiveMin > 0) {
    const db = getDatabase();
    const id = 'tr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2,7);
    await db.addTimeRecord({
      id, date: new Date().toISOString().split('T')[0],
      time_type: pomoState.timeType,
      start_time: pomoState.startTime,
      end_time: endTime,
      total_minutes: effectiveMin,
      pauses: JSON.stringify(pomoState.pauses),
      source: 'pomodoro', note: ''
    });
  }

  if (completed && pomoState.mode === 'countdown') {
    const n = new Notification({ title: '番茄钟完成', body: pomoState.timeType + ' ' + Math.ceil(pomoState.targetSeconds/60) + '分钟已完成！', icon: path.join(__dirname, 'assets', 'icon.png') });
    n.show();
  }

  pomoState.running = false;
  pomoState.pauses = [];
  pomoState.currentPauseStart = null;

  if (pomoWindow && !pomoWindow.isDestroyed()) pomoWindow.close();
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();

  broadcastState();
  if (mainWindow) mainWindow.webContents.send('pomodoro:stopped');
}

// ---- 窗口 ----
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 800, minHeight: 600,
    title: '学习待办',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    show: false, backgroundColor: '#faf8f3'
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => { if (!isQuitting) { event.preventDefault(); mainWindow.hide(); } });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createPomoWindow() {
  if (pomoWindow && !pomoWindow.isDestroyed()) { pomoWindow.focus(); return; }
  pomoWindow = new BrowserWindow({
    width: 500, height: 480, minWidth: 360, minHeight: 360,
    title: '番茄钟 - ' + pomoState.timeType,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    show: false, backgroundColor: '#1a1a2e',
    frame: false
  });
  pomoWindow.loadFile(path.join(__dirname, 'renderer', 'pomodoro-window.html'));
  pomoWindow.once('ready-to-show', () => {
    pomoWindow.show();
    pomoWindow.webContents.send('pomodoro:sync', buildPomoPayload());
    // Push wallpaper
    const db = getDatabase();
    const bg = db.getSetting('bg_pomodoro');
    if (bg) pomoWindow.webContents.send('pomodoro:wallpaper', bg);
  });
  pomoWindow.on('closed', () => { pomoWindow = null; pomoState.windowMode = 'window'; broadcastState(); });
}

function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) { miniWindow.focus(); return; }
  miniWindow = new BrowserWindow({
    width: 220, height: 150, minWidth: 160, minHeight: 100,
    title: '番茄钟 - ' + pomoState.timeType,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    alwaysOnTop: true, frame: false, resizable: true,
    backgroundColor: '#1a1a2e', skipTaskbar: false
  });
  miniWindow.loadFile(path.join(__dirname, 'renderer', 'pomodoro-mini.html'));
  miniWindow.once('ready-to-show', () => { miniWindow.show(); miniWindow.webContents.send('pomodoro:sync', buildPomoPayload()); });
  miniWindow.on('closed', () => { miniWindow = null; });
}

function closePomoWindow() { if (pomoWindow && !pomoWindow.isDestroyed()) pomoWindow.close(); }
function closeMiniWindow() { if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close(); }

// ---- Tray ----
function createTray() {
  const fs = require('fs');
  try {
    const buf = fs.readFileSync(path.join(__dirname, 'assets', 'icon.png'));
    const icon = nativeImage.createFromBuffer(buf).resize({width:16,height:16});
    tray = new Tray(icon);
  } catch(e) { tray = new Tray(nativeImage.createEmpty()); }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { if(mainWindow){mainWindow.show();mainWindow.focus();} } },
    { label: '退出', click: () => { isQuitting=true; app.quit(); } }
  ]));
  tray.setToolTip('学习待办');
  tray.on('double-click', () => { if(mainWindow){mainWindow.show();mainWindow.focus();} });
}

function registerShortcuts() {
  globalShortcut.register('Alt+Space', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('focus-add-todo'); }
  });
}

// ---- IPC ----
function initIPC() {
  const db = getDatabase();

  // ---- Todos ----
  ipcMain.handle('db:getTodos', (_,d) => db.getTodos(d));
  ipcMain.handle('db:getAllTodos', () => db.getAllTodos());
  ipcMain.handle('db:addTodo', (_,t) => db.addTodo(t));
  ipcMain.handle('db:updateTodo', (_,id,u) => db.updateTodo(id,u));
  ipcMain.handle('db:deleteTodo', (_,id) => db.deleteTodo(id));
  ipcMain.handle('db:clearCompletedTodos', (_,d) => db.clearCompletedTodos(d));
  ipcMain.handle('db:batchAddTodos', (_,t) => db.batchAddTodos(t));
  ipcMain.handle('db:getUncompletedForDate', (_,d) => db.getUncompletedForDate(d));
  ipcMain.handle('db:generateRecurringTasks', (_,d) => db.generateRecurringTasks(d));
  ipcMain.handle('db:getRecurringDailyTasks', () => db.getRecurringDailyTasks());

  // ---- Categories ----
  ipcMain.handle('db:getCategories', () => db.getCategories());
  ipcMain.handle('db:addCategory', (_,n,c) => db.addCategory(n,c));
  ipcMain.handle('db:deleteCategory', (_,id) => db.deleteCategory(id));

  // ---- Daily logs ----
  ipcMain.handle('db:getDailyLog', (_,d) => db.getDailyLog(d));
  ipcMain.handle('db:setDailyLog', (_,d,c) => db.setDailyLog(d,c));

  // ---- Time types ----
  ipcMain.handle('db:getTimeTypes', () => db.getTimeTypes());
  ipcMain.handle('db:addTimeType', (_,n,c) => db.addTimeType(n,c));
  ipcMain.handle('db:updateTimeType', (_,id,u) => db.updateTimeType(id,u));
  ipcMain.handle('db:deleteTimeType', (_,id) => db.deleteTimeType(id));

  // ---- Time records ----
  ipcMain.handle('db:addTimeRecord', (_,r) => db.addTimeRecord(r));
  ipcMain.handle('db:getTimeRecords', (_,d) => db.getTimeRecords(d));
  ipcMain.handle('db:getTimeRecordsRange', (_,s,e) => db.getTimeRecordsRange(s,e));
  ipcMain.handle('db:getAllTimeRecords', () => db.getAllTimeRecords());
  ipcMain.handle('db:updateTimeRecord', (_,id,u) => db.updateTimeRecord(id,u));
  ipcMain.handle('db:deleteTimeRecord', (_,id) => db.deleteTimeRecord(id));
  ipcMain.handle('db:getImportBatches', () => db.getImportBatches());
  ipcMain.handle('db:deleteByBatchId', (_,bid) => db.deleteByBatchId(bid));

  // ---- Presets ----
  ipcMain.handle('db:getPresets', () => db.getPresets());
  ipcMain.handle('db:addPreset', (_,p) => db.addPreset(p));
  ipcMain.handle('db:updatePreset', (_,id,u) => db.updatePreset(id,u));
  ipcMain.handle('db:deletePreset', (_,id) => db.deletePreset(id));

  // ---- Goals ----
  ipcMain.handle('db:getGoal', (_,t) => db.getGoal(t));
  ipcMain.handle('db:setGoal', (_,t,m) => db.setGoal(t,m));
  ipcMain.handle('db:getAllGoals', () => db.getAllGoals());

  // ---- Countdowns ----
  ipcMain.handle('db:getCountdowns', () => db.getCountdowns());
  ipcMain.handle('db:addCountdown', (_,t,d,c) => db.addCountdown(t,d,c));
  ipcMain.handle('db:updateCountdown', (_,id,u) => db.updateCountdown(id,u));
  ipcMain.handle('db:deleteCountdown', (_,id) => db.deleteCountdown(id));

  // ---- Settings ----
  ipcMain.handle('db:getSetting', (_,k) => db.getSetting(k));
  ipcMain.handle('db:setSetting', (_,k,v) => db.setSetting(k,v));
  ipcMain.handle('db:getAllSettings', () => db.getAllSettings());

  // ---- Stats ----
  ipcMain.handle('db:getStudyStats', (_,r) => db.getStudyStats(r));
  ipcMain.handle('db:getAverageStats', (_,s,e,r) => db.getAverageStats(s,e,r));
  ipcMain.handle('db:getStreak', () => db.getStreak());
  ipcMain.handle('db:getWeeklyTimetable', (_,m,s) => db.getWeeklyTimetable(m,s));
  ipcMain.handle('db:exportAllData', () => db.exportAllData());

  // ---- Window ----
  ipcMain.handle('window:setFullScreen', (_,f) => {
    const win = pomoWindow || mainWindow;
    if (win) win.setFullScreen(f);
  });
  ipcMain.handle('window:setKiosk', (_,f) => {
    const win = pomoWindow || mainWindow;
    if (win) win.setKiosk(f);
  });
  ipcMain.handle('window:setMiniOpacity', (_,v) => { if (miniWindow) miniWindow.setOpacity(v/100); });
  ipcMain.handle('window:focusMain', () => { if(mainWindow){mainWindow.show();mainWindow.focus();} });
  ipcMain.handle('window:minimizePomo', () => { if(pomoWindow) pomoWindow.minimize(); });

  // ---- Pomodoro ----
  ipcMain.handle('pomodoro:start', (_,opts) => {
    pomoState.running = true;
    pomoState.timeType = opts.timeType || '学习';
    pomoState.color = opts.color || '#5b7fff';
    pomoState.mode = opts.mode || 'countdown';
    pomoState.targetSeconds = opts.durationMinutes * 60;
    pomoState.totalSeconds = pomoState.mode === 'countdown' ? pomoState.targetSeconds : 0;
    pomoState.startTime = nowTime();
    pomoState.pauses = [];
    pomoState.currentPauseStart = null;
    pomoState.windowMode = 'window';
    createPomoWindow();
    startPomoInterval();
    return true;
  });

  ipcMain.handle('pomodoro:pause', () => {
    if (!pomoState.running) return;
    if (pomoState.currentPauseStart) {
      pomoState.pauses.push({ start: pomoState.currentPauseStart, end: nowTime() });
      pomoState.currentPauseStart = null;
      startPomoInterval();
    } else {
      pomoState.currentPauseStart = nowTime();
      stopPomoInterval();
    }
    broadcastState();
    return true;
  });

  ipcMain.handle('pomodoro:stop', async () => {
    await stopPomodoro(false);
    return true;
  });

  ipcMain.handle('pomodoro:getState', () => buildPomoPayload());

  ipcMain.handle('pomodoro:switchMode', async (_, mode) => {
    pomoState.windowMode = mode;
    if (mode === 'mini') {
      if (pomoWindow && !pomoWindow.isDestroyed()) pomoWindow.close();
      createMiniWindow();
    } else if (mode === 'window') {
      if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
      createPomoWindow();
    }
    broadcastState();
    return true;
  });

  // Wallpaper push
  ipcMain.handle('pomodoro:pushWallpaper', (_, path) => {
    if (pomoWindow && !pomoWindow.isDestroyed()) pomoWindow.webContents.send('pomodoro:wallpaper', path);
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('pomodoro:wallpaper', path);
    return true;
  });

  // ---- File dialog ----
  ipcMain.handle('dialog:openImage', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties:['openFile'], filters:[{name:'图片',extensions:['jpg','jpeg','png','bmp','gif','webp']}] });
    return r.canceled || r.filePaths.length===0 ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:openAudio', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties:['openFile','multiSelections'], filters:[{name:'音频',extensions:['mp3','wav','ogg','flac','aac','m4a']}] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('dialog:saveFile', async (_, name, content) => {
    const r = await dialog.showSaveDialog(mainWindow, { defaultPath:name, filters:[{name:'CSV',extensions:['csv']},{name:'JSON',extensions:['json']}] });
    if (r.canceled || !r.filePath) return false;
    require('fs').writeFileSync(r.filePath, content, 'utf-8');
    return true;
  });

  // ---- Notification ----
  ipcMain.handle('notification:show', (_, title, body) => {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body, icon: path.join(__dirname,'assets','icon.png') });
      n.show();
      n.on('click', () => { if(mainWindow){mainWindow.show();mainWindow.focus();} });
    }
  });
}

app.whenReady().then(() => {
  initDatabase();
  createMainWindow();
  createTray();
  registerShortcuts();
  initIPC();
  app.on('activate', () => { if(BrowserWindow.getAllWindows().length===0) createMainWindow(); else if(mainWindow) mainWindow.show(); });
});

app.on('before-quit', () => { isQuitting=true; closePomoWindow(); closeMiniWindow(); stopPomoInterval(); globalShortcut.unregisterAll(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
