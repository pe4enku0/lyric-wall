// Click layer: makes the wallpaper's buttons clickable. The wallpaper itself never gets clicks (it lies under
// the desktop icons), so something invisible over the buttons, below all normal windows, takes them:
// - macOS: a small native helper (mac-helper/ClickLayer.swift) with non-activating panels, so a click does
//   not activate the app (that would bring back the windows macOS moved aside to show the desktop);
// - Windows (and macOS without the helper): an invisible Electron window that catches the mouse only while
//   the pointer is over a button. Where the pointer is comes from polling the cursor (20 times a second):
//   a window that lets clicks through gets no mouse events at all.
// Hovers, clicks, drags (progress and volume bars) and the mouse wheel are passed on to the wallpaper,
// which does the actual work. Events: { type: 'press' | 'drag' | 'release' | 'click', id, fx } and
// { type: 'wheel', id, dy } (see renderer/hit.js). Every press and every scroll gets a request id (h1, h2…)
// that follows it through the log down to Spotify.
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
let rid = null;        // request id of the current press / scroll
let dragging = false;  // the mouse went down on a button and is not up yet: keep taking the mouse
let dragMoved = false;
let lastWheel = 0;
// Diagnostics (Windows): a mouse press over a button that never reached the click layer is logged.
let mouseWasDown = false;
let layerDownAt = 0;   // last mouse press the Electron layer received
const MISSED_MS = 700;

function toWallpaper(ev) {
  if (wallpaper && !wallpaper.isDestroyed()) wallpaper.send('hit:event', ev);
}

const pct = fx => `${Math.round(fx * 100)}%`;

// An event from either click layer.
function onEvent(ev) {
  if (!ev || typeof ev.id !== 'string') return;
  const fx = Number(ev.fx) || 0;
  switch (ev.type) {
    case 'press':
      rid = `h${++clicks}`;
      dragging = true; dragMoved = false;
      break;
    case 'drag':
      dragMoved = true;
      break;
    case 'release':
      dragging = false;
      if (dragMoved) log.info(`[${rid}] Click layer: dragged "${ev.id}" to ${pct(fx)}`);
      break;
    case 'click':
      log.info(`[${rid}] Click layer: click on "${ev.id}" at ${pct(fx)}`);
      if (!wallpaper || wallpaper.isDestroyed()) log.warn(`[${rid}] Click layer: no wallpaper to pass the click to`);
      // A click may bring the Electron layer in front of other windows: put it back.
      if (win) adapter.placeHitLayer(win);
      break;
    case 'wheel':
      // Scrolls less than a second apart are one gesture with one id.
      if (Date.now() - lastWheel > 1000) { rid = `h${++clicks}`; log.info(`[${rid}] Click layer: mouse wheel on "${ev.id}"`); }
      lastWheel = Date.now();
      toWallpaper({ type: 'wheel', id: ev.id, dy: Number(ev.dy) || 0, rid });
      return;
    default:
      return;
  }
  toWallpaper({ type: ev.type, id: ev.id, fx, rid });
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

// Hover highlight on the wallpaper; for the Electron layer also when to take the mouse.
function poll() {
  if (!rects.length) return;
  // During a drag the layer keeps the mouse wherever it goes (the release may be lost if the
  // button came up outside every window, so the mouse button itself is checked where possible).
  if (dragging && win) {
    if (!adapter.mouseDown || adapter.mouseDown()) return;
    dragging = false;
  }
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
  if (adapter.createNativeHitLayer) native = adapter.createNativeHitLayer(onEvent);
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
  dragging = false;
}

// From the wallpaper: where the buttons are.
ipcMain.on('hit:rects', (e, items) => {
  if (!wallpaper || e.sender !== wallpaper) return;
  rects = Array.isArray(items) ? items : [];
  layout();
});

// From the Electron click layer (renderer/hit.js). A press with no id reached the layer outside the buttons.
ipcMain.on('hit:event', (e, ev) => {
  if (!win || e.sender !== win.webContents || !ev) return;
  if (ev.type === 'press') {
    layerDownAt = Date.now();
    if (!ev.id) { log.info('Click layer: mouse press outside the buttons'); return; }
  }
  onEvent(ev);
});

module.exports = { create, destroy };
