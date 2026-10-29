// Windows-only code. This file is never loaded on macOS.
// The wallpaper window is embedded behind the desktop icons (the WorkerW trick used by
// Wallpaper Engine / Lively). Spotify is read through the win-media.ps1 helper.
const { screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const log = require('../main/log');

const GWL_STYLE = -16, GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000, WS_POPUP = 0x80000000;
const WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000, WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
const SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
const HWND_BOTTOM = 1, GW_HWNDLAST = 1, GW_HWNDPREV = 3, GW_CHILD = 5, GA_PARENT = 1;
const SW_HIDE = 0, SW_SHOWNA = 8, LWA_ALPHA = 0x2, SMTO_NORMAL = 0;

// Windows functions from user32.dll via koffi, loaded on first use.
let u = null;
function user32() {
  if (u) return u;
  const koffi = require('koffi');
  const lib = koffi.load('user32.dll');
  koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const fn = sig => lib.func(sig);
  u = {
    FindWindowW: fn('intptr_t __stdcall FindWindowW(str16 cls, str16 name)'),
    FindWindowExW: fn('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 cls, str16 name)'),
    SendMessageTimeoutW: fn('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wp, intptr_t lp, uint32_t flags, uint32_t timeout, uintptr_t *result)'),
    SetParent: fn('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
    GetAncestor: fn('intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32_t flags)'),
    GetWindow: fn('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)'),
    SetWindowPos: fn('int __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
    GetWindowLongPtrW: fn('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
    SetWindowLongPtrW: fn('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
    SetLayeredWindowAttributes: fn('int __stdcall SetLayeredWindowAttributes(intptr_t hwnd, uint32_t key, uint8_t alpha, uint32_t flags)'),
    GetWindowRect: fn('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ RECT *rect)'),
    ShowWindow: fn('int __stdcall ShowWindow(intptr_t hwnd, int cmd)'),
    IsWindow: fn('int __stdcall IsWindow(intptr_t hwnd)')
  };
  return u;
}

const hex = h => '0x' + Number(h).toString(16);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hwndOf = win => Number(win.getNativeWindowHandle().readBigUInt64LE(0));

// Current embedding: the mode and the Explorer windows we are attached to.
let state = { mode: null, parent: 0, workerw: 0 };

// Finds the desktop windows. Progman is the desktop itself, SHELLDLL_DefView holds the icons,
// WorkerW is where Windows draws the wallpaper. Our window goes between the icons and WorkerW.
function findDesktop() {
  const w = user32();
  const progman = w.FindWindowW('Progman', null);
  if (!progman) throw new Error('Progman window not found (is Explorer running?)');
  // Windows 11 24H2+: "raised desktop", all layers live inside Progman.
  const raised = (Number(w.GetWindowLongPtrW(progman, GWL_EXSTYLE)) & WS_EX_NOREDIRECTIONBITMAP) !== 0;
  // Message 0x052C asks Explorer to create a WorkerW behind the icons (if it is not there yet).
  w.SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, SMTO_NORMAL, 1000, null);

  let host = 0;
  let defview = w.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
  if (defview) host = progman;
  else {
    let cur = 0;
    while ((cur = w.FindWindowExW(0, cur, 'WorkerW', null))) {
      defview = w.FindWindowExW(cur, 0, 'SHELLDLL_DefView', null);
      if (defview) { host = cur; break; }
    }
  }
  const workerw = raised
    ? w.FindWindowExW(progman, 0, 'WorkerW', null)
    : (host ? w.FindWindowExW(0, host, 'WorkerW', null) : 0);
  return { progman, raised, host, defview, workerw };
}

function physBounds(display) {
  return screen.dipToScreenRect(null, display.bounds);
}

// Moves the window over its screen inside the parent (child coordinates start at the parent's corner).
function placeInParent(hwnd, parent, display) {
  const w = user32(), r = {}, b = physBounds(display);
  w.GetWindowRect(parent, r);
  w.SetWindowPos(hwnd, 0, b.x - r.left, b.y - r.top, b.width, b.height, SWP_NOZORDER | SWP_NOACTIVATE);
}

function embed(win, hwnd, d, display) {
  const w = user32();
  let parent;
  if (d.raised) {
    // Windows 11 24H2: our own child of Progman, below the icons and above the system WorkerW.
    parent = d.progman;
    win.setIgnoreMouseEvents(true);
    w.SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
    const style = Number(w.GetWindowLongPtrW(hwnd, GWL_STYLE));
    w.SetWindowLongPtrW(hwnd, GWL_STYLE, (style | WS_CHILD) & ~WS_POPUP);
    w.SetParent(hwnd, parent);
    w.SetWindowPos(hwnd, d.defview, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    const last = w.GetWindow(w.GetWindow(d.progman, GW_CHILD), GW_HWNDLAST);
    if (Number(last) !== Number(d.workerw)) {
      log.info('Wallpaper: fixing WorkerW z-order');
      w.SetWindowPos(d.workerw, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
  } else {
    // Classic way: the window becomes a child of the WorkerW behind the icons.
    parent = d.workerw;
    w.ShowWindow(d.workerw, SW_SHOWNA);
    w.SetParent(hwnd, parent);
  }
  if (Number(w.GetAncestor(hwnd, GA_PARENT)) !== Number(parent)) throw new Error('SetParent did not work');
  placeInParent(hwnd, parent, display);
  win.showInactive();
  state = { mode: d.raised ? 'workerw-24h2' : 'workerw', parent, workerw: d.workerw };
}

// Fallback: a normal window placed right above the desktop and below all other windows.
// Desktop icons are covered in this mode.
function bottom(win, hwnd, display) {
  const w = user32();
  win.setIgnoreMouseEvents(true);
  const ex = Number(w.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  w.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
  win.showInactive();
  state = { mode: 'bottom', parent: 0, workerw: 0 };
  placeBottom(hwnd, display);
}

function placeBottom(hwnd, display) {
  const w = user32(), b = physBounds(display);
  let desk = w.FindWindowW('Progman', null), cur = 0;
  while ((cur = w.FindWindowExW(0, cur, 'WorkerW', null))) {
    if (w.FindWindowExW(cur, 0, 'SHELLDLL_DefView', null)) { desk = cur; break; }
  }
  // SetWindowPos puts the window right BELOW the given one, so use the window right above the desktop.
  const above = desk ? Number(w.GetWindow(desk, GW_HWNDPREV)) : 0;
  const after = above && above !== hwnd ? above : HWND_BOTTOM;
  w.SetWindowPos(hwnd, after, b.x, b.y, b.width, b.height, SWP_NOACTIVATE);
}

// ---------- Spotify through the PowerShell helper ----------

// PowerShell cannot read files inside app.asar, so the helper is unpacked next to it.
const HELPER = path.join(__dirname, 'win-media.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

let helper = null;
let onUpdate = null;
let retryTimer = null;
let running = false;

function startHelper() {
  clearTimeout(retryTimer);
  let pending = '';
  helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER], { windowsHide: true });
  helper.stdout.setEncoding('utf8');
  helper.stdout.on('data', chunk => {
    pending += chunk;
    let i;
    while ((i = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, i).trim().replace(/^﻿/, '');
      pending = pending.slice(i + 1);
      if (!line) continue;
      try {
        const snap = JSON.parse(line);
        if (snap.position != null) snap.at = Date.now();
        onUpdate(snap);
      } catch (e) {
        log.warn('Spotify (win): bad helper output:', line.slice(0, 200));
      }
    }
  });
  helper.stderr.setEncoding('utf8');
  helper.stderr.on('data', d => log.warn('Spotify (win) helper:', d.trim().slice(0, 500)));
  helper.on('error', e => log.error('Spotify (win): could not start PowerShell:', e.message));
  helper.on('exit', code => {
    helper = null;
    if (!running) return;
    log.warn('Spotify (win): helper exited with code', code, '- restarting in 10 s');
    retryTimer = setTimeout(startHelper, 10000);
  });
  log.info('Spotify (win): helper started');
}

module.exports = {
  name: 'win',
  deviceKey: 'device.win',
  trayIcon: path.join(__dirname, '..', 'assets', 'tray.ico'),

  init() {},

  wallpaperWindowOptions: display => ({
    ...display.bounds,
    thickFrame: false,
    minimizable: false,
    maximizable: false
  }),

  async attachWallpaper(win, display, settings) {
    let hwnd;
    try {
      user32();
      hwnd = hwndOf(win);
    } catch (e) {
      // Without koffi we can neither embed nor lower the window, so keep it hidden instead of covering the screen.
      log.error('Wallpaper: could not load Windows functions (koffi):', e.message);
      return 'none';
    }
    if (settings.get('winMode') !== 'bottom') {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const d = findDesktop();
          log.info(`Wallpaper: attempt ${attempt}: Progman=${hex(d.progman)} 24H2=${d.raised} icons=${hex(d.defview)} WorkerW=${hex(d.workerw)}`);
          if (d.defview && d.workerw) {
            embed(win, hwnd, d, display);
            log.info(`Wallpaper: embedded behind icons (${state.mode}), parent ${hex(state.parent)}`);
            return state.mode;
          }
        } catch (e) {
          log.error('Wallpaper: embedding error:', e.message);
        }
        await sleep(700);
      }
      log.warn('Wallpaper: could not embed behind icons, using the "below all windows" fallback');
    }
    try {
      bottom(win, hwnd, display);
      log.info('Wallpaper: "below all windows" mode');
      return 'bottom';
    } catch (e) {
      log.error('Wallpaper: fallback mode failed too:', e.message);
      return 'none';
    }
  },

  placeWallpaper(win, display) {
    try {
      const hwnd = hwndOf(win);
      if (state.mode === 'bottom') placeBottom(hwnd, display);
      else if (state.parent) placeInParent(hwnd, state.parent, display);
    } catch (e) {
      log.error('Wallpaper: could not move the window to the new screen size:', e.message);
    }
  },

  detachWallpaper(win) {
    try {
      if (win && !win.isDestroyed()) win.hide();
      // Hide WorkerW so Windows shows the normal wallpaper again instead of our last frame.
      if (state.mode === 'workerw' && state.workerw && user32().IsWindow(state.workerw)) {
        user32().ShowWindow(state.workerw, SW_HIDE);
        log.info('Wallpaper: WorkerW hidden, system wallpaper visible again');
      }
    } catch (e) {
      log.error('Wallpaper: error while turning off:', e.message);
    }
    state = { mode: null, parent: 0, workerw: 0 };
  },

  startNowPlaying(cb) {
    onUpdate = cb;
    running = true;
    if (!helper) startHelper();
  },

  stopNowPlaying() {
    running = false;
    clearTimeout(retryTimer);
    if (helper) helper.kill();
    helper = null;
  },

  control(cmd) {
    if (helper && ['toggle', 'next', 'prev'].includes(cmd)) helper.stdin.write(cmd + '\n');
    return Promise.resolve();
  }
};
