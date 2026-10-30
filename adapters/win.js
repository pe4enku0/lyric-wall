// Windows-only code. This file is never loaded on macOS.
// The wallpaper window is embedded behind the desktop icons (the WorkerW trick used by
// Wallpaper Engine / Lively). Spotify is read through the win-media.ps1 helper.
const { screen, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const log = require('../main/log');

const GWL_STYLE = -16, GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000, WS_POPUP = 0x80000000;
const WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000, WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
const DWMWA_CLOAKED = 14, PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
const HWND_BOTTOM = 1, GW_HWNDLAST = 1, GW_HWNDNEXT = 2, GW_HWNDPREV = 3, GW_CHILD = 5, GA_PARENT = 1, GA_ROOT = 2;
const VK_LBUTTON = 0x01;
const SW_HIDE = 0, SW_SHOWNA = 8, LWA_ALPHA = 0x2, SMTO_NORMAL = 0;
const MONITOR_DEFAULTTONEAREST = 2;
// SHQueryUserNotificationState: busy (full-screen app) / Direct3D full screen / presentation mode
const QUNS_FULLSCREEN = [2, 3, 4];
const DESKTOP_CLASSES = ['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd'];

// Windows functions from user32.dll via koffi, loaded on first use.
let u = null;
function user32() {
  if (u) return u;
  const koffi = require('koffi');
  const lib = koffi.load('user32.dll');
  const shell = koffi.load('shell32.dll');
  const dwm = koffi.load('dwmapi.dll');
  const kernel = koffi.load('kernel32.dll');
  koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  koffi.struct('POINT', { x: 'int32', y: 'int32' });
  koffi.struct('MONITORINFO', { cbSize: 'uint32', rcMonitor: 'RECT', rcWork: 'RECT', dwFlags: 'uint32' });
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
    IsWindow: fn('int __stdcall IsWindow(intptr_t hwnd)'),
    GetForegroundWindow: fn('intptr_t __stdcall GetForegroundWindow()'),
    GetClassNameW: fn('int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint8_t *buf, int max)'),
    GetWindowThreadProcessId: fn('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
    MonitorFromWindow: fn('intptr_t __stdcall MonitorFromWindow(intptr_t hwnd, uint32_t flags)'),
    GetMonitorInfoW: fn('int __stdcall GetMonitorInfoW(intptr_t monitor, _Inout_ MONITORINFO *info)'),
    SHQueryUserNotificationState: shell.func('int __stdcall SHQueryUserNotificationState(_Out_ int *state)'),
    IsWindowVisible: fn('int __stdcall IsWindowVisible(intptr_t hwnd)'),
    GetCursorPos: fn('int __stdcall GetCursorPos(_Out_ POINT *point)'),
    WindowFromPoint: fn('intptr_t __stdcall WindowFromPoint(POINT point)'),
    GetAsyncKeyState: fn('int16_t __stdcall GetAsyncKeyState(int key)'),
    DwmGetWindowAttribute: dwm.func('int __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, _Out_ int32_t *value, uint32_t size)'),
    OpenProcess: kernel.func('intptr_t __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)'),
    QueryFullProcessImageNameW: kernel.func('int __stdcall QueryFullProcessImageNameW(intptr_t process, uint32_t flags, _Out_ uint8_t *name, _Inout_ uint32_t *size)'),
    CloseHandle: kernel.func('int __stdcall CloseHandle(intptr_t handle)')
  };
  return u;
}

const hex = h => '0x' + Number(h).toString(16);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hwndOf = win => Number(win.getNativeWindowHandle().readBigUInt64LE(0));

// Current embedding: the mode and the Explorer windows we are attached to.
let state = { mode: null, parent: 0, workerw: 0, hwnd: 0 };

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
  state = { mode: d.raised ? 'workerw-24h2' : 'workerw', parent, workerw: d.workerw, hwnd };
}

// Fallback: a normal window placed right above the desktop and below all other windows.
// Desktop icons are covered in this mode.
function bottom(win, hwnd, display) {
  const w = user32();
  win.setIgnoreMouseEvents(true);
  const ex = Number(w.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  w.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
  win.showInactive();
  state = { mode: 'bottom', parent: 0, workerw: 0, hwnd };
  placeBottom(hwnd, display);
}

// The top-level window that shows the desktop icons.
function desktopHost() {
  const w = user32();
  let desk = w.FindWindowW('Progman', null), cur = 0;
  while ((cur = w.FindWindowExW(0, cur, 'WorkerW', null))) {
    if (w.FindWindowExW(cur, 0, 'SHELLDLL_DefView', null)) { desk = cur; break; }
  }
  return desk;
}

// Puts hwnd right above the window `ref` in the z-order. SetWindowPos places a window right BELOW the
// one it is given, so the window currently right above `ref` is used.
function placeAbove(hwnd, ref, flags, bounds) {
  const w = user32();
  const above = ref ? Number(w.GetWindow(ref, GW_HWNDPREV)) : 0;
  const b = bounds || { x: 0, y: 0, width: 0, height: 0 };
  // Already right above it: keep the z-order, only move.
  if (above === hwnd) { w.SetWindowPos(hwnd, 0, b.x, b.y, b.width, b.height, flags | SWP_NOZORDER); return; }
  w.SetWindowPos(hwnd, above || HWND_BOTTOM, b.x, b.y, b.width, b.height, flags);
}

function placeBottom(hwnd, display) {
  placeAbove(hwnd, desktopHost(), SWP_NOACTIVATE, physBounds(display));
}

// Why the last check said "full screen": program and window class (for the log).
let fullscreenWhy = '';

function windowClass(w, hwnd) {
  const buf = Buffer.alloc(512);
  const len = w.GetClassNameW(hwnd, buf, 256);
  return buf.toString('utf16le', 0, len * 2);
}

function processName(w, pid) {
  const h = w.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!h) return `pid ${pid}`;
  try {
    const buf = Buffer.alloc(1040), size = [520];
    if (!w.QueryFullProcessImageNameW(h, 0, buf, size)) return `pid ${pid}`;
    return path.win32.basename(buf.toString('utf16le', 0, size[0] * 2));
  } finally {
    w.CloseHandle(h);
  }
}

// Is a game or another app covering the whole screen? Looks at the active window: overlays of other apps
// (NVIDIA, Discord, Steam…) also cover the screen but are see-through, so click-through, tool, non-activating
// and system-hidden (cloaked) windows do not count. Then asks Windows (the same check it uses to hold back
// notifications) and compares the window with its monitor.
function fullscreenAppActive() {
  const w = user32();
  const fg = w.GetForegroundWindow();
  if (!fg || !w.IsWindowVisible(fg)) return false;
  const pid = [0];
  w.GetWindowThreadProcessId(fg, pid);
  if (pid[0] === process.pid) return false;
  const cls = windowClass(w, fg);
  if (DESKTOP_CLASSES.includes(cls)) return false;
  const ex = Number(w.GetWindowLongPtrW(fg, GWL_EXSTYLE));
  if (ex & (WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE)) return false;
  const cloaked = [0];
  if (w.DwmGetWindowAttribute(fg, DWMWA_CLOAKED, cloaked, 4) === 0 && cloaked[0]) return false;

  let why = '';
  const quns = [0];
  if (w.SHQueryUserNotificationState(quns) === 0 && QUNS_FULLSCREEN.includes(quns[0])) why = `Windows reports full screen (${quns[0]})`;
  else {
    const r = {}, info = { cbSize: 40 };
    w.GetWindowRect(fg, r);
    if (w.GetMonitorInfoW(w.MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST), info)) {
      const m = info.rcMonitor;
      if (r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom) why = 'covers the whole monitor';
    }
  }
  if (!why) return false;
  fullscreenWhy = `${processName(w, pid[0])} (${cls}): ${why}`;
  return true;
}

let fullscreenWarned = false;

// ---------- Diagnostics for the log ----------

// "Class (program.exe)" of a window.
function describeWindow(w, hwnd) {
  if (!hwnd) return 'none';
  const pid = [0];
  w.GetWindowThreadProcessId(hwnd, pid);
  return `${windowClass(w, hwnd) || '?'} (${processName(w, pid[0])})`;
}

// Is `hwnd` above `ref` in the z-order? Walks down from hwnd (a few hundred windows at most).
function isAbove(w, hwnd, ref) {
  let cur = hwnd;
  for (let i = 0; i < 2000 && cur; i++) {
    cur = Number(w.GetWindow(cur, GW_HWNDNEXT));
    if (cur === Number(ref)) return true;
  }
  return false;
}

// What the click layer looks like to Windows right now, and which window is under the cursor.
function describeHitLayer(win) {
  const w = user32(), hwnd = hwndOf(win), p = {};
  w.GetCursorPos(p);
  const under = Number(w.WindowFromPoint(p));
  const root = under ? Number(w.GetAncestor(under, GA_ROOT)) : 0;
  const ex = Number(w.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  return `visible ${!!w.IsWindowVisible(hwnd)}, lets clicks through ${!!(ex & WS_EX_TRANSPARENT)}, ` +
    `above desktop icons ${isAbove(w, hwnd, desktopHost())}, under the cursor: ${describeWindow(w, under)}` +
    (root === hwnd ? ' = the click layer' : root && root !== under ? `, inside ${describeWindow(w, root)}` : '');
}

// Is the wallpaper still embedded where we put it?
function describeWallpaper(win) {
  const w = user32(), hwnd = hwndOf(win);
  const parent = Number(w.GetAncestor(hwnd, GA_PARENT));
  const parentOk = !state.parent || (parent === Number(state.parent) && !!w.IsWindow(state.parent));
  const r = {};
  w.GetWindowRect(hwnd, r);
  return `mode ${state.mode}, parent ${parentOk ? 'ok' : `CHANGED (now ${hex(parent)} ${describeWindow(w, parent)}, was ${hex(state.parent)})`}, ` +
    `visible ${!!w.IsWindowVisible(hwnd)}, rect ${r.left},${r.top} ${r.right - r.left}x${r.bottom - r.top}`;
}

// ---------- Spotify through the PowerShell helper ----------

// PowerShell cannot read files inside app.asar, so the helper is unpacked next to it.
const HELPER = path.join(__dirname, 'win-media.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

let helper = null;
let onUpdate = null;
let retryTimer = null;
let running = false;
let lastOutput = 0;       // when the helper last printed anything
let silentSince = 0;      // set while the helper is quiet for too long (logged once)
let watchTimer = null;
const waiting = new Map(); // request id -> { cmd, sent, timer }: commands the helper has not answered yet

const SILENT_MS = 10000, ANSWER_MS = 5000;

// The helper prints every 1-2 s; a long silence means it is stuck waiting for Windows or Spotify.
function watchHelper() {
  if (!helper) return;
  const quiet = Date.now() - lastOutput;
  if (quiet > SILENT_MS && !silentSince) {
    silentSince = lastOutput;
    log.warn(`Spotify (win): helper silent for ${Math.round(quiet / 1000)} s, ${waiting.size} command(s) waiting`);
  }
}

function onAck(a) {
  const w = waiting.get(a.ack);
  waiting.delete(a.ack);
  if (w) { clearTimeout(w.timer); w.resolve(); }
  const total = w ? Date.now() - w.sent : null;
  const text = `[${a.ack}] Spotify (win): ${a.cmd} ${a.ok ? 'done' : 'FAILED'} in ${total ?? '?'} ms (helper ${a.ms} ms)${a.note ? ': ' + a.note : ''}`;
  if (!a.ok) log.warn(text); else if (!(w && w.quiet)) log.info(text);
}

function startHelper() {
  clearTimeout(retryTimer);
  let pending = '';
  const h = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER], { windowsHide: true });
  helper = h;
  h.stdout.setEncoding('utf8');
  lastOutput = Date.now();
  silentSince = 0;
  h.stdout.on('data', chunk => {
    lastOutput = Date.now();
    if (silentSince) {
      log.info(`Spotify (win): helper talks again after ${Math.round((lastOutput - silentSince) / 1000)} s of silence`);
      silentSince = 0;
    }
    pending += chunk;
    let i;
    while ((i = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, i).trim().replace(/^﻿/, '');
      pending = pending.slice(i + 1);
      if (!line) continue;
      try {
        const snap = JSON.parse(line);
        if (snap.ack) { onAck(snap); continue; }
        if (snap.log) { log.info('Spotify (win) helper:', snap.log); continue; }
        if (snap.position != null) snap.at = Date.now();
        onUpdate(snap);
      } catch (e) {
        log.warn('Spotify (win): bad helper output:', line.slice(0, 200));
      }
    }
  });
  h.stderr.setEncoding('utf8');
  h.stderr.on('data', d => log.warn('Spotify (win) helper:', d.trim().slice(0, 500)));
  h.on('error', e => log.error('Spotify (win): could not start PowerShell:', e.message));
  h.on('exit', code => {
    // A helper we stopped ourselves (or an old one) must not touch the current state.
    if (helper !== h) return;
    helper = null;
    if (waiting.size) log.warn(`Spotify (win): helper exited with ${waiting.size} command(s) unanswered: ${[...waiting.keys()].join(', ')}`);
    for (const w of waiting.values()) { clearTimeout(w.timer); w.resolve(); }
    waiting.clear();
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
  soundSettingsUrl: 'ms-settings:sound',

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

  // Click layer: above the desktop icons (and above the wallpaper in the fallback mode), below all windows.
  placeHitLayer(win) {
    try {
      const w = user32(), hwnd = hwndOf(win);
      const ex = Number(w.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
      w.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
      const ref = state.mode === 'bottom' && state.hwnd ? state.hwnd : desktopHost();
      placeAbove(hwnd, ref, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    } catch (e) {
      log.error('Click layer: could not place it above the desktop icons:', e.message);
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
    state = { mode: null, parent: 0, workerw: 0, hwnd: 0 };
  },

  fullscreenReason: () => fullscreenWhy,

  // Diagnostics: is the left mouse button down right now; text descriptions for the log.
  mouseDown() {
    try { return (user32().GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0; } catch (_) { return false; }
  },
  describeHitLayer(win) {
    try { return describeHitLayer(win); } catch (e) { return 'check failed: ' + e.message; }
  },
  describeWallpaper(win) {
    try { return describeWallpaper(win); } catch (e) { return 'check failed: ' + e.message; }
  },

  isFullscreenAppActive() {
    try {
      return fullscreenAppActive();
    } catch (e) {
      if (!fullscreenWarned) { fullscreenWarned = true; log.warn('Full-screen check failed:', e.message); }
      return false;
    }
  },

  startNowPlaying(cb) {
    onUpdate = cb;
    running = true;
    if (!helper) startHelper();
    if (!watchTimer) watchTimer = setInterval(watchHelper, 2000);
  },

  stopNowPlaying() {
    running = false;
    clearTimeout(retryTimer);
    clearInterval(watchTimer);
    watchTimer = null;
    if (helper) helper.kill();
    helper = null;
  },

  // rid: request id for the log, the helper answers with it; quiet: log only failures (a volume drag sends many).
  // The promise settles when the helper answers (or after 5 s without an answer).
  control(cmd, value, rid, quiet = false) {
    if (cmd === 'open') { shell.openExternal('spotify:'); return Promise.resolve(); }
    if (!['toggle', 'next', 'prev', 'seek', 'volume', 'mute', 'shuffle'].includes(cmd)) return Promise.resolve();
    const id = String(rid || 'x').replace(/\W/g, '') || 'x';
    if (!helper) { log.warn(`[${id}] Spotify (win): helper is not running, ${cmd} dropped`); return Promise.resolve(); }
    return new Promise(resolve => {
      const sent = Date.now();
      const timer = setTimeout(() => {
        log.warn(`[${id}] Spotify (win): no answer to ${cmd} in ${ANSWER_MS / 1000} s; helper last spoke ${Math.round((Date.now() - lastOutput) / 1000)} s ago, ${waiting.size} command(s) waiting`);
        resolve();
      }, ANSWER_MS);
      // The same id again (the next value of one drag): the earlier one is answered first, so it is done.
      if (waiting.has(id)) { clearTimeout(waiting.get(id).timer); waiting.get(id).resolve(); }
      waiting.set(id, { cmd, sent, timer, quiet, resolve });
      helper.stdin.write(value == null ? `${id} ${cmd}\n` : `${id} ${cmd} ${Number(value)}\n`);
      if (!quiet) log.info(`[${id}] Spotify (win): ${cmd} sent to helper${waiting.size > 1 ? ` (${waiting.size} waiting)` : ''}, helper last spoke ${Date.now() - lastOutput} ms ago`);
    });
  }
};
