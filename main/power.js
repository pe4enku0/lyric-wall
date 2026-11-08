// Decides when the wallpaper must stop drawing completely: the screen is locked, the computer sleeps,
// a game or another full-screen app is open (Windows), other windows cover (almost) all of it,
// or, if chosen in the settings, it runs on battery.
const { powerMonitor } = require('electron');
const { EventEmitter } = require('events');
const adapter = require('../adapters');
const settings = require('./settings');
const log = require('./log');

const POLL_MS = 2000;
// Covered by windows: Windows is asked this often (macOS: its helper reports changes by itself).
const COVER_POLL_MS = 750;
// It must stay covered this long before the wallpaper pauses, so switching windows or a window passing by
// does not pause it. Uncovered, it comes back at once.
const COVER_HOLD_MS = 1500;
const reasons = new Set(); // 'locked' | 'sleep' | 'fullscreen' | 'covered' | 'battery'
const events = new EventEmitter();

let coverWatching = false;
let coverTimer = null;
let holdTimer = null;

function state() {
  return { paused: reasons.size > 0, reasons: [...reasons] };
}

function update(reason, on) {
  if (!!on === reasons.has(reason)) return;
  if (on) reasons.add(reason); else reasons.delete(reason);
  log.info(`Render ${reasons.size ? 'paused' : 'running'} (${on ? '+' : '-'}${reason})`);
  events.emit('change', state());
}

function checkBattery() {
  update('battery', settings.get('pauseOnBattery') && powerMonitor.isOnBatteryPower());
}

// From the adapter: do other windows cover the wallpaper (true / false / null = cannot tell)?
function onCovered(covered) {
  if (!covered) {
    clearTimeout(holdTimer);
    holdTimer = null;
    update('covered', false);
    return;
  }
  if (reasons.has('covered') || holdTimer) return;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    if (adapter.coverageReason) log.info('Wallpaper covered:', adapter.coverageReason());
    update('covered', true);
  }, COVER_HOLD_MS);
}

// "Pause when covered by windows" in the settings: start or stop watching the windows.
function checkCovered() {
  const on = !!settings.get('pauseWhenCovered');
  if (on === coverWatching) return;
  coverWatching = on;
  if (on) {
    if (adapter.watchCoverage) adapter.watchCoverage(onCovered);
    else if (adapter.isWallpaperCovered) coverTimer = setInterval(() => onCovered(adapter.isWallpaperCovered()), COVER_POLL_MS);
  } else {
    clearInterval(coverTimer);
    coverTimer = null;
    if (adapter.stopCoverage) adapter.stopCoverage();
    onCovered(false);
  }
}

// After a change in the settings window.
function checkSettings() {
  checkBattery();
  checkCovered();
}

// Locked screen and full-screen apps are also checked every 2 s, in case an event is missed.
function poll() {
  update('locked', powerMonitor.getSystemIdleState(1) === 'locked');
  if (adapter.isFullscreenAppActive) {
    const full = adapter.isFullscreenAppActive();
    if (full && !reasons.has('fullscreen') && adapter.fullscreenReason) log.info('Full-screen window:', adapter.fullscreenReason());
    update('fullscreen', full);
  }
}

function start() {
  powerMonitor.on('lock-screen', () => update('locked', true));
  powerMonitor.on('unlock-screen', () => update('locked', false));
  powerMonitor.on('suspend', () => update('sleep', true));
  powerMonitor.on('resume', () => { update('sleep', false); poll(); });
  powerMonitor.on('on-battery', checkBattery);
  powerMonitor.on('on-ac', checkBattery);
  checkSettings();
  poll();
  setInterval(poll, POLL_MS);
}

module.exports = { start, state, checkSettings, onChange: fn => events.on('change', fn) };
