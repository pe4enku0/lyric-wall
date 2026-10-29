// Click layer: an invisible window above the desktop icons and below all normal windows that makes the
// wallpaper's buttons clickable. The wallpaper itself never gets clicks (it lies under the icons).
// The layer catches the mouse only while the pointer is over a button; everywhere else clicks go to the
// desktop as usual. Where the pointer is comes from polling the cursor position (20 times a second) — mouse
// events cannot be used for that, because a window that lets clicks through gets no mouse events at all.
// Hovers and clicks are passed on to the wallpaper, which does the actual work.
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const adapter = require('../adapters');
const log = require('./log');

let win = null;        // the click layer
let wallpaper = null;  // webContents of the wallpaper (reports button positions, gets the events)
let rects = [];        // buttons, in wallpaper window coordinates
let catching = false;  // the layer currently takes mouse clicks
let origin = { x: 0, y: 0 }; // top-left corner of the layer on the screen
let pollTimer = null;
let hovered = null;
const POLL_MS = 50;

function layout() {
  if (!win || !rects.length) return;
  const pad = 4;
  const x0 = Math.floor(Math.min(...rects.map(r => r.x)) - pad), y0 = Math.floor(Math.min(...rects.map(r => r.y)) - pad);
  const x1 = Math.ceil(Math.max(...rects.map(r => r.x + r.w)) + pad), y1 = Math.ceil(Math.max(...rects.map(r => r.y + r.h)) + pad);
  const d = screen.getPrimaryDisplay().bounds;
  origin = { x: d.x + x0, y: d.y + y0 };
  win.setBounds({ x: origin.x, y: origin.y, width: x1 - x0, height: y1 - y0 });
  win.webContents.send('hit:rects', rects.map(r => ({ ...r, x: r.x - x0, y: r.y - y0 })));
  adapter.placeHitLayer(win);
}

function setCatching(on) {
  if (!win || on === catching) return;
  catching = on;
  win.setIgnoreMouseEvents(!on);
}

// Which button is under the cursor (null = none).
function buttonAt(p) {
  const x = p.x - origin.x, y = p.y - origin.y;
  const r = rects.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  return r ? r.id : null;
}

function poll() {
  if (!win || !rects.length) return;
  const id = buttonAt(screen.getCursorScreenPoint());
  if (id === hovered) return;
  hovered = id;
  setCatching(!!id);
  win.webContents.send('hit:cursor', id);
  if (wallpaper && !wallpaper.isDestroyed()) wallpaper.send('hit:event', { type: 'hover', id });
}

function create(wallpaperContents) {
  wallpaper = wallpaperContents;
  if (win) return;
  win = new BrowserWindow({
    width: 10, height: 10,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    acceptFirstMouse: true,
    enableLargerThanScreen: true,
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  catching = true;
  setCatching(false);
  win.once('ready-to-show', () => {
    win.showInactive();
    layout();
    log.info('Click layer for the wallpaper buttons is on');
  });
  win.on('closed', () => { win = null; catching = false; hovered = null; clearInterval(pollTimer); pollTimer = null; });
  pollTimer = setInterval(poll, POLL_MS);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'hit.html'));
}

function destroy() {
  clearInterval(pollTimer);
  pollTimer = null;
  if (win) win.destroy();
  win = null;
  catching = false;
  hovered = null;
}

// From the wallpaper: where the buttons are.
ipcMain.on('hit:rects', (e, items) => {
  if (!wallpaper || e.sender !== wallpaper) return;
  rects = Array.isArray(items) ? items : [];
  layout();
});

// From the click layer: { type: 'click', id, fx }.
ipcMain.on('hit:event', (e, ev) => {
  if (!win || e.sender !== win.webContents || !ev || ev.type !== 'click') return;
  log.info('Wallpaper button pressed:', ev.id);
  if (wallpaper && !wallpaper.isDestroyed()) wallpaper.send('hit:event', ev);
});

module.exports = { create, destroy };
