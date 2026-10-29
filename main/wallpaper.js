// Окно-обои: создание, встраивание через адаптер системы, восстановление.
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const adapter = require('../adapters');
const settings = require('./settings');
const log = require('./log');

// npm run window — обои в обычном окне, чтобы смотреть на дизайн во время разработки.
const windowed = process.argv.includes('--window');

let win = null;
let closingOnPurpose = false;
let restartTimer = null;

function create() {
  if (win) return win;
  const display = screen.getPrimaryDisplay();
  closingOnPurpose = false;
  const shape = windowed ? { width: 1280, height: 800 } : {
    frame: false,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    ...adapter.wallpaperWindowOptions(display)
  };
  win = new BrowserWindow({
    ...shape,
    show: false,
    backgroundColor: '#19171c',
    title: 'Lyric Wall',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', async () => {
    if (windowed) { win.show(); log.info('Обои в обычном окне (--window)'); return; }
    const mode = await adapter.attachWallpaper(win, screen.getPrimaryDisplay(), settings);
    log.info('Обои включены, режим:', mode);
  });

  // Если окно пропало само (например, перезапустился Проводник Windows), создаём заново.
  win.on('closed', () => {
    win = null;
    if (closingOnPurpose) return;
    if (windowed) { app.quit(); return; }
    log.warn('Окно-обои закрылось само, пересоздаю через 3 секунды');
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => { if (settings.get('wallpaperEnabled')) create(); }, 3000);
  });

  win.webContents.on('render-process-gone', (_e, d) => log.error('Интерфейс обоев упал:', d.reason));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

function destroy() {
  clearTimeout(restartTimer);
  if (!win) return;
  closingOnPurpose = true;
  adapter.detachWallpaper(win);
  win.destroy();
  win = null;
  log.info('Обои выключены');
}

function onDisplayChange() {
  if (!win || windowed) return;
  const display = screen.getPrimaryDisplay();
  log.info('Экран изменился, новые размеры:', display.bounds, 'масштаб', display.scaleFactor);
  adapter.placeWallpaper(win, display);
}

function watchDisplays() {
  screen.on('display-metrics-changed', onDisplayChange);
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);
}

// Команды интерфейсу: пауза, следующий трек и т.д.
function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

module.exports = { create, destroy, watchDisplays, send, isOn: () => !!win };
