// Wallpaper window: creating it, embedding it through the OS adapter, recovering it.
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const adapter = require('../adapters');
const settings = require('./settings');
const player = require('./player');
const lyrics = require('./lyrics');
const appearance = require('./appearance');
const power = require('./power');
const log = require('./log');

// npm run window: show the wallpaper in a normal window to look at the design while developing.
const windowed = process.argv.includes('--window');

let win = null;
let closingOnPurpose = false;
let restartTimer = null;
let unsubscribe = null;

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

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
    if (windowed) { win.show(); log.info('Wallpaper in a normal window (--window)'); return; }
    const mode = await adapter.attachWallpaper(win, screen.getPrimaryDisplay(), settings);
    log.info('Wallpaper on, mode:', mode);
  });

  // If the window disappears by itself (for example Windows Explorer restarted), create it again.
  win.on('closed', () => {
    win = null;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (closingOnPurpose) return;
    if (windowed) { app.quit(); return; }
    log.warn('Wallpaper window closed by itself, recreating in 3 seconds');
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => { if (settings.get('wallpaperEnabled')) create(); }, 3000);
  });

  win.webContents.on('render-process-gone', (_e, d) => log.error('Wallpaper UI crashed:', d.reason));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  listen(!power.state().paused);
  return win;
}

// Spotify is read only while the wallpaper is drawn (a paused wallpaper needs nothing).
function listen(on) {
  if (on && !unsubscribe) unsubscribe = player.subscribe(snap => { send('player:state', snap); lyrics.onSnapshot(snap); });
  if (!on && unsubscribe) { unsubscribe(); unsubscribe = null; }
}

power.onChange(st => {
  if (!win) return;
  send('render:state', st);
  listen(!st.paused);
});

function destroy() {
  clearTimeout(restartTimer);
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (!win) return;
  closingOnPurpose = true;
  adapter.detachWallpaper(win);
  win.destroy();
  win = null;
  log.info('Wallpaper off');
}

function onDisplayChange() {
  if (!win || windowed) return;
  const display = screen.getPrimaryDisplay();
  log.info('Screen changed, new bounds:', display.bounds, 'scale', display.scaleFactor);
  adapter.placeWallpaper(win, display);
  // The menu bar, Dock or taskbar may have moved: let the UI recalculate its margins.
  send('layout:changed');
}

lyrics.setSink(r => send('lyrics:state', r));
appearance.onChange(() => send('look:changed', appearance.get()));

function watchDisplays() {
  screen.on('display-metrics-changed', onDisplayChange);
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);
}

// Reload the UI, for example after the language changed.
function reload() {
  if (win && !win.isDestroyed()) win.webContents.reload();
}

module.exports = { create, destroy, watchDisplays, reload, isOn: () => !!win };
