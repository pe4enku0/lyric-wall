// Shared look and behaviour of the app's normal windows (control window, settings window).
const { BrowserWindow, ipcMain, nativeTheme, screen } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';
const ICON = path.join(__dirname, '..', 'assets', 'icon-win.png');
const open = new Map(); // window -> its fixed width

// Shown once, when it opens. Later fits (the control window refits every 2 s) must not show it again:
// a minimized window counts as not visible and would pop up by itself.
const revealed = new WeakSet();
function reveal(win) {
  if (win.isDestroyed() || revealed.has(win)) return;
  revealed.add(win);
  win.center(); win.show(); win.focus();
}

function focus(win) {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// The window is shown once its page reports its height (window:fit), or after 2 s at the latest.
// The title bar is drawn by the page (the same Mac look on both systems): macOS keeps its traffic
// lights, Windows 11 its own minimize / maximize (disabled) / close buttons on the right, in the bar's colour.
// On Windows an open window has a taskbar button, so a minimized window can be found again.
function createAppWindow(file, width) {
  nativeTheme.themeSource = 'dark';
  const win = new BrowserWindow({
    width,
    height: 600,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Lyric Wall',
    icon: ICON,
    backgroundColor: '#1E1E20',
    skipTaskbar: isMac, // macOS: the app lives in the menu bar only, also while a window is open
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 20, y: 19 } } : { titleBarOverlay: { color: '#1E1E20', symbolColor: '#F2F1F4', height: 52 } }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (!isMac) win.setMenu(null);
  open.set(win, width);
  setTimeout(() => reveal(win), 2000);
  win.on('closed', () => open.delete(win));
  win.loadFile(path.join(__dirname, '..', 'renderer', file));
  return win;
}

// Make a window exactly as tall as its content (it differs per language and system).
ipcMain.on('window:fit', (e, height) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || !open.has(win)) return;
  // Not taller than the screen; the page scrolls if its content is longer.
  const max = screen.getPrimaryDisplay().workAreaSize.height - 60;
  win.setContentSize(open.get(win), Math.max(300, Math.min(max, Math.round(height))));
  reveal(win);
});

module.exports = { createAppWindow, focus };
