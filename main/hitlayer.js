// Click layer: makes the wallpaper's buttons clickable. The wallpaper itself never gets clicks (it lies under
// the desktop icons), so something invisible over the buttons, below all normal windows, takes them:
// - macOS: a small native helper (mac-helper/ClickLayer.swift) with non-activating panels, so a click does
//   not activate the app (that would bring back the windows macOS moved aside to show the desktop);
// - Windows (and macOS without the helper): an invisible Electron window that catches the mouse only while
//   the pointer is over a button. Where the pointer is comes from polling the cursor (20 times a second):
//   a window that lets clicks through gets no mouse events at all.
// Hovers and clicks are passed on to the wallpaper, which does the actual work.
// Every click gets a request id (h1, h2…) that follows it through the log down to Spotify.
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const adapter = require('../adapters');
const log = require('./log');

const POLL_MS = 50;

let wallpaper = null;  // webContents of the wallpaper (reports button positions, gets the events)
let rects = [];        // buttons, in wallpaper window coordinates
let native = null;     // macOS helper: { setRects, destroy }
let win = null;        // Electron click layer
let catching = false;  // the Electron layer currently takes mouse clicks
let origin = { x: 0, y: 0 }; // top-left corner of the Electron layer on the screen
let pollTimer = null;
let hovered = null;
let clicks = 0;
// Diagnostics (Windows): a mouse press over a button that never reached the click layer is logged.
let mouseWasDown = false;
let layerDownAt = 0;   // last mouse press the Electron layer received
const MISSED_MS = 700;

function toWallpaper(ev) {
  if (wallpaper && !wallpaper.isDestroyed()) wallpaper.send('hit:event', ev);
}

function onClick(ev) {
  const rid = `h${++clicks}`;
  log.info(`[${rid}] Click layer: click on "${ev.id}"${ev.fx != null ? ` at ${Math.round(ev.fx * 100)}%` : ''}`);
  if (!wallpaper || wallpaper.isDestroyed()) log.warn(`[${rid}] Click layer: no wallpaper to pass the click to`);
  toWallpaper({ type: 'click', id: ev.id, fx: ev.fx, rid });
  // A click may bring the Electron layer in front of other windows: put it back.
  if (win) adapter.placeHitLayer(win);
}

function layout() {
  if (!rects.length) return;
  const d = screen.getPrimaryDisplay().bounds;
  if (native) {
    native.setRects(rects.map(r => ({ id: r.id, x: d.x + r.x, y: d.y + r.y, w: r.w, h: r.h })));
    return;
  }
  if (!win) return;
  const pad = 4;
  const x0 = Math.floor(Math.min(...rects.map(r => r.x)) - pad), y0 = Math.floor(Math.min(...rects.map(r => r.y)) - pad);
  const x1 = Math.ceil(Math.max(...rects.map(r => r.x + r.w)) + pad), y1 = Math.ceil(Math.max(...rects.map(r => r.y + r.h)) + pad);
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
  const d = screen.getPrimaryDisplay().bounds;
  const x = p.x - d.x, y = p.y - d.y;
  const r = rects.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  return r ? r.id : null;
}

// The mouse went down over a button: did the click layer get it? If not, log what Windows had under the cursor.
function watchPress() {
  const down = adapter.mouseDown();
  if (down && !mouseWasDown) {
    const at = Date.now(), id = hovered;
    setTimeout(() => {
      if (!win || layerDownAt >= at - 100) return;
      log.warn(`Click layer: mouse pressed over "${id}", but the layer got nothing. Layer: catching ${catching}, ${adapter.describeHitLayer(win)}`);
    }, MISSED_MS);
  }
  mouseWasDown = down;
}

// Hover highlight on the wallpaper; for the Electron layer also when to take clicks.
function poll() {
  if (!rects.length) return;
  const id = buttonAt(screen.getCursorScreenPoint());
  if (win && hovered && adapter.mouseDown) watchPress();
  else mouseWasDown = false;
  if (id === hovered) return;
  hovered = id;
  if (win) {
    setCatching(!!id);
    win.webContents.send('hit:cursor', id);
  }
  toWallpaper({ type: 'hover', id });
}

function createElectronLayer() {
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
  win.on('closed', () => { win = null; catching = false; });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'hit.html'));
}

function create(wallpaperContents) {
  wallpaper = wallpaperContents;
  if (win || native) return;
  hovered = null;
  if (adapter.createNativeHitLayer) native = adapter.createNativeHitLayer(onClick);
  if (native) {
    log.info('Click layer for the wallpaper buttons is on (native helper)');
    layout();
  } else {
    createElectronLayer();
  }
  pollTimer = setInterval(poll, POLL_MS);
}

function destroy() {
  if (win || native) log.info('Click layer off');
  clearInterval(pollTimer);
  pollTimer = null;
  if (native) native.destroy();
  native = null;
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

// From the Electron click layer: { type: 'click', id, fx } or { type: 'down', id } (the press reached the layer).
ipcMain.on('hit:event', (e, ev) => {
  if (!win || e.sender !== win.webContents || !ev) return;
  if (ev.type === 'down') { layerDownAt = Date.now(); if (!ev.id) log.info('Click layer: mouse press outside the buttons'); return; }
  if (ev.type === 'click') onClick(ev);
});

module.exports = { create, destroy };
