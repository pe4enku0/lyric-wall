// macOS-only code: desktop-level wallpaper window and Spotify via AppleScript.
const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const log = require('../main/log');

const SEP = '\x1f';

// One long-running osascript process: it prints the Spotify state as one line every second while
// music plays and every 2 seconds otherwise.
// Fields are separated by character 31 so titles with tabs or commas are safe.
// "is running" is checked first so the script never launches Spotify by itself.
const LOOP_SCRIPT = `
on snapshot()
  if application "Spotify" is not running then return "not-running"
  tell application "Spotify"
    set ps to player state as string
    if ps is "stopped" then return "stopped"
    set t to current track
    set au to ""
    try
      set au to artwork url of t
    end try
    set d to character id 31
    return ps & d & (name of t) & d & (artist of t) & d & (album of t) & d & au & d & (duration of t) & d & (player position) & d & (sound volume) & d & (shuffling) & d & (id of t)
  end tell
end snapshot

repeat
  try
    set s to snapshot()
    log s
    if s starts with "playing" then
      delay 1
    else
      delay 2
    end if
  on error msg number num
    log "error" & (character id 31) & num & (character id 31) & msg
    delay 5
  end try
end repeat
`;

const VERBS = { toggle: 'playpause', next: 'next track', prev: 'previous track' };

let proc = null;
let onUpdate = null;
let retryTimer = null;
let running = false;

function parseLine(line) {
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
      if (snap) onUpdate(snap);
      else if (line) errors = (errors + '\n' + line).slice(-500);
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

  control(cmd) {
    const verb = VERBS[cmd];
    if (!verb) return Promise.resolve();
    const script = `if application "Spotify" is running then tell application "Spotify" to ${verb}`;
    return new Promise(resolve => {
      execFile('osascript', ['-e', script], { timeout: 5000 }, err => {
        if (err) log.error('Spotify (mac): command', cmd, 'failed:', err.message.trim());
        resolve();
      });
    });
  }
};
