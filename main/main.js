// Главный процесс: окна, трей, системные вещи.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const adapter = require('../adapters');

// Только одна копия приложения: повторный запуск просто показывает уже открытое окно.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Lyric Wall',
    backgroundColor: '#19171c',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  adapter: adapter.name,
  deviceLabel: adapter.deviceLabel()
}));

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  console.log(`Lyric Wall ${app.getVersion()} запущен, адаптер: ${adapter.name}`);
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
