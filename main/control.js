// Control window: opens when the app icon is clicked. Shows what is playing and the main switches.
// Closing it keeps the wallpaper running in the background (tray / menu bar icon).
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const actions = require('./actions');
const player = require('./player');
const log = require('./log');

const ICON = path.join(__dirname, '..', 'assets', 'icon-win.png');
const isMac = process.platform === 'darwin';

let win = null;
let unsubscribe = null;

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function reveal() {
  if (win && !win.isVisible()) { win.center(); win.show(); win.focus(); }
}

function show() {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  nativeTheme.themeSource = 'dark';
  if (isMac && app.dock) {
    // While the window is open the app gets a Dock icon (and Cmd+Tab), like a normal app.
    app.dock.show();
    if (!app.isPackaged) app.dock.setIcon(path.join(__dirname, '..', 'assets', 'icon-mac.png'));
  }
  win = new BrowserWindow({
    width: 440,
    height: 640,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Lyric Wall',
    icon: ICON,
    backgroundColor: '#1d1b21',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (!isMac) win.setMenu(null);
  // The window is shown once the page reports its height (control:resize), or after 2 s at the latest.
  setTimeout(reveal, 2000);
  win.on('closed', () => {
    win = null;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (isMac && app.dock) app.dock.hide();
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'control.html'));
  unsubscribe = player.subscribe(snap => send('player:state', snap));
  log.info('Control window opened');
}

ipcMain.handle('control:state', () => actions.state());
ipcMain.handle('control:set', (_e, key, value) => actions.set(key, value));
ipcMain.on('control:resize', (e, height) => {
  if (!win || e.sender !== win.webContents) return;
  win.setContentSize(440, Math.max(300, Math.min(900, Math.round(height))));
  reveal();
});
ipcMain.on('control:openLog', () => actions.openLog());
ipcMain.on('control:quit', () => app.quit());

actions.onChange(key => {
  if (key === 'language' && win) win.webContents.reload();
  else send('control:changed', actions.state());
});

module.exports = { show };
