// Decides when the wallpaper must stop drawing completely: the screen is locked, the computer sleeps,
// a game or another full-screen app is open (Windows), or, if chosen in the settings, it runs on battery.
const { powerMonitor } = require('electron');
const { EventEmitter } = require('events');
const adapter = require('../adapters');
const settings = require('./settings');
const log = require('./log');

const POLL_MS = 2000;
const reasons = new Set(); // 'locked' | 'sleep' | 'fullscreen' | 'battery'
const events = new EventEmitter();

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
  checkBattery();
  poll();
  setInterval(poll, POLL_MS);
}

module.exports = { start, state, checkBattery, onChange: fn => events.on('change', fn) };
