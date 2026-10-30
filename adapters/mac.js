// macOS-only code: desktop-level wallpaper window and Spotify via AppleScript.
const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const log = require('../main/log');

const SEP = '\x1f';

// One long-running osascript process: it prints the Spotify state as one line twice a second while
// music plays and every second otherwise. After a button press one more state is asked for right away
// (SNAPSHOT_ONCE), so a new track shows at once.
// Fields are separated by character 31 so titles with tabs or commas are safe.
// "is running" is checked first so the script never launches Spotify by itself.
const SNAPSHOT = `
on snapshot()
  if application "Spotify" is not running then return "not-running"
  tell application "Spotify"
    set ps to player state as string
    if ps is "stopped" then return "stopped"
    set t to current track
    set i1 to id of t
    set nm to name of t
    set ar to artist of t
    set al to album of t
    set au to ""
    try
      set au to artwork url of t
    end try
    set du to duration of t
    -- Every field is asked separately: while Spotify switches tracks they may mix two tracks.
    -- The same track at the end as at the start, or the answer is thrown away (asked again shortly).
    if (id of t) is not i1 or (name of t) is not nm then return "switching"
    set d to character id 31
    return ps & d & nm & d & ar & d & al & d & au & d & du & d & (player position) & d & (sound volume) & d & (shuffling) & d & i1
  end tell
end snapshot
`;
const SNAPSHOT_ONCE = SNAPSHOT + 'return snapshot()';
const LOOP_SCRIPT = SNAPSHOT + `
repeat
  try
    set s to snapshot()
    log s
    if s is "switching" then
      delay 0.15
    else if s starts with "playing" then
      delay 0.5
    else
      delay 1
    end if
  on error msg number num
    log "error" & (character id 31) & num & (character id 31) & msg
    delay 5
  end try
end repeat
`;

const VERBS = { toggle: 'playpause', next: 'next track', prev: 'previous track', shuffle: 'set shuffling to not shuffling' };
let lastVolume = null;  // from the last snapshot
let savedVolume = 50;   // volume before "mute"

// Window settings Electron has no options for are set on the NSWindow directly (Objective-C runtime via koffi).
let objc = null;
function objcApi() {
  if (objc) return objc;
  const koffi = require('koffi');
  const lib = koffi.load('/usr/lib/libobjc.A.dylib');
  objc = {
    sel: lib.func('uintptr_t sel_registerName(const char *name)'),
    sendId: lib.func('uintptr_t objc_msgSend(uintptr_t self, uintptr_t op)'),
    sendLong: lib.func('void objc_msgSend(uintptr_t self, uintptr_t op, long value)'),
    sendObj: lib.func('void objc_msgSend(uintptr_t self, uintptr_t op, uintptr_t arg)')
  };
  return objc;
}
// Native click helper (mac-helper/ClickLayer.swift): inside the app in the packaged app, built by npm in development.
const CLICK_HELPER = app.isPackaged
  ? path.join(process.resourcesPath, 'lyric-wall-clicks')
  : path.join(__dirname, '..', 'native', 'mac', 'lyric-wall-clicks');

// NSWindowCollectionBehavior: on all Spaces, stays in place when macOS shows the desktop, not in Cmd+` cycling
const CAN_JOIN_ALL_SPACES = 1 << 0, STATIONARY = 1 << 4, IGNORES_CYCLE = 1 << 6;

let proc = null;
let onUpdate = null;
let retryTimer = null;
let running = false;

function parseLine(line) {
  if (line === 'switching') return null; // Spotify was switching tracks: wait for the next answer
  if (line === 'not-running') return { state: 'not-running' };
  if (line === 'stopped') return { state: 'stopped' };
  const f = line.split(SEP);
  if (f[0] === 'error') {
    const code = Number(f[1]);
    if (code === -1743) return { state: 'no-permission', message: f[2] };
    if (code === -600) return { state: 'not-running' };
    return { state: 'error', message: `${f[1]} ${f[2]}` };
  }
  if (f.length < 10) return null;
  const [ps, title, artist, album, art, durMs, pos, vol, shuffle, id] = f;
  return {
    state: ps === 'playing' ? 'playing' : 'paused',
    playing: ps === 'playing',
    title, artist, album,
    art: art || '',
    duration: Number(durMs) / 1000,
    // AppleScript formats decimals with the system locale, e.g. "126,36".
    position: parseFloat(pos.replace(',', '.')) || 0,
    volume: Number(vol),
    shuffle: shuffle === 'true',
    id,
    at: Date.now()
  };
}

// One extra state, outside the loop.
function snapshotNow() {
  if (!running || !onUpdate) return;
  execFile('osascript', ['-e', SNAPSHOT_ONCE], { timeout: 3000 }, (err, out) => {
    const snap = !err && running && parseLine(String(out).trim());
    if (snap) { if (snap.volume != null) lastVolume = snap.volume; onUpdate(snap); }
  });
}

function startLoop() {
  clearTimeout(retryTimer);
  let pending = '';
  let errors = '';
  const p = spawn('osascript', ['-'], { stdio: ['pipe', 'ignore', 'pipe'] });
  proc = p;
  p.stdin.end(LOOP_SCRIPT);
  // osascript "log" writes to stderr.
  p.stderr.setEncoding('utf8');
  p.stderr.on('data', chunk => {
    pending += chunk;
    let i;
    while ((i = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, i).trim();
      pending = pending.slice(i + 1);
      const snap = line && parseLine(line);
      if (snap && snap.volume != null) lastVolume = snap.volume;
      if (snap) onUpdate(snap);
      else if (line && line !== 'switching') errors = (errors + '\n' + line).slice(-500);
    }
  });
  p.on('error', e => log.error('Spotify (mac): could not start osascript:', e.message));
  p.on('exit', code => {
    // A process we stopped ourselves (or an old one) must not touch the current state.
    if (proc !== p) return;
    proc = null;
    if (!running) return;
    // -2741 / -1728: the script cannot be compiled because Spotify (and its dictionary) is not installed.
    if (/-2741|-1728|-2753/.test(errors)) {
      onUpdate({ state: 'not-installed' });
      retryTimer = setTimeout(startLoop, 60000);
    } else {
      log.warn('Spotify (mac): osascript exited with code', code, errors.trim());
      retryTimer = setTimeout(startLoop, 5000);
    }
  });
}

module.exports = {
  name: 'mac',
  deviceKey: 'device.mac',
  trayIcon: path.join(__dirname, '..', 'assets', 'trayTemplate.png'),
  soundSettingsUrl: 'x-apple.systempreferences:com.apple.Sound-Settings.extension',

  init() {
    // No Dock icon: the app lives in the menu bar only.
    if (app.dock) app.dock.hide();
  },

  // type: 'desktop' puts the window at desktop level: below all windows and below Finder icons.
  wallpaperWindowOptions: display => ({
    type: 'desktop',
    ...display.bounds,
    enableLargerThanScreen: true,
    roundedCorners: false
  }),

  attachWallpaper(win, display) {
    win.setVisibleOnAllWorkspaces(true);
    win.setIgnoreMouseEvents(true);
    win.setBounds(display.bounds);
    win.showInactive();
    log.info('Wallpaper: desktop-level window on screen', display.bounds);
    return 'desktop';
  },

  placeWallpaper(win, display) {
    win.setBounds(display.bounds);
  },

  detachWallpaper() {},

  // Click layer through the native helper. Returns null when the helper is missing (the Electron layer is used).
  createNativeHitLayer(onEvent) {
    if (!fs.existsSync(CLICK_HELPER)) {
      log.warn('Click helper not found, using the simpler click layer:', path.basename(CLICK_HELPER));
      return null;
    }
    let stopped = false, pending = '';
    const p = spawn(CLICK_HELPER, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', chunk => {
      pending += chunk;
      let i;
      while ((i = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, i).trim();
        pending = pending.slice(i + 1);
        try { if (line) onEvent(JSON.parse(line)); } catch (_) { log.warn('Click helper: bad output:', line.slice(0, 200)); }
      }
    });
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', d => log.warn('Click helper:', d.trim().slice(0, 300)));
    p.on('error', e => log.error('Click helper could not start:', e.message));
    p.on('exit', code => { if (!stopped) log.warn('Click helper exited with code', code); });
    p.stdin.on('error', () => {});
    return {
      setRects: rects => { if (!stopped && p.stdin.writable) p.stdin.write(JSON.stringify(rects) + '\n'); },
      destroy: () => { stopped = true; p.stdin.end(); setTimeout(() => p.kill(), 500); }
    };
  },

  // Fallback click layer (Electron window). macOS gives clicks only to windows at the normal level or higher (anything lower counts as
  // the desktop and the click goes to Finder), so the layer is a normal window kept behind all other windows,
  // like a desktop widget: windows cover it; on the free desktop it takes the clicks on the wallpaper buttons.
  placeHitLayer(win) {
    try {
      const o = objcApi();
      const nsWindow = o.sendId(win.getNativeWindowHandle().readBigUInt64LE(0), o.sel('window'));
      o.sendLong(nsWindow, o.sel('setCollectionBehavior:'), CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE);
      // Showing or clicking the window brings it forward a moment later, so it is sent back again shortly after.
      const back = () => { if (!win.isDestroyed()) o.sendObj(nsWindow, o.sel('orderBack:'), 0); };
      back();
      setTimeout(back, 300);
    } catch (e) {
      log.error('Click layer: could not place it behind the windows:', e.message);
    }
  },

  startNowPlaying(cb) {
    onUpdate = cb;
    running = true;
    if (!proc) startLoop();
  },

  stopNowPlaying() {
    running = false;
    clearTimeout(retryTimer);
    if (proc) proc.kill();
    proc = null;
  },

  // rid: request id for the log; quiet: log only failures (a volume drag sends many commands).
  control(cmd, value, rid = 'x', quiet = false) {
    let verb = VERBS[cmd];
    if (cmd === 'seek') verb = `set player position to ${Math.max(0, Number(value) || 0).toFixed(2)}`;
    if (cmd === 'volume') verb = `set sound volume to ${Math.round(Math.max(0, Math.min(100, Number(value) || 0)))}`;
    if (cmd === 'mute') {
      if (lastVolume > 0) { savedVolume = lastVolume; verb = 'set sound volume to 0'; } else verb = `set sound volume to ${savedVolume}`;
    }
    // Opening Spotify is the only command that may start it.
    const script = cmd === 'open' ? 'tell application "Spotify" to activate'
      : verb ? `if application "Spotify" is running then tell application "Spotify" to ${verb}` : null;
    if (!script) return Promise.resolve();
    const sent = Date.now();
    return new Promise(resolve => {
      execFile('osascript', ['-e', script], { timeout: 5000 }, err => {
        if (err) log.error(`[${rid}] Spotify (mac): ${cmd} failed in ${Date.now() - sent} ms:`, err.message.trim());
        else if (!quiet) log.info(`[${rid}] Spotify (mac): ${cmd} done in ${Date.now() - sent} ms`);
        // Show the result at once instead of waiting for the loop (Spotify needs a moment to switch tracks).
        if (!err && ['toggle', 'next', 'prev', 'seek', 'shuffle'].includes(cmd)) { setTimeout(snapshotNow, 120); setTimeout(snapshotNow, 500); }
        resolve();
      });
    });
  }
};
