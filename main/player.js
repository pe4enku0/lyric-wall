// "Now playing" in one format for both systems. The adapter sends snapshots:
// { state, playing, title, artist, album, art, position, duration, volume, shuffle, id, at }
//   state:    'playing' | 'paused' | 'stopped' | 'not-running' | 'not-installed' | 'no-permission' | 'error'
//   position, duration: seconds; at: time (ms) when position was read
//   volume:   0-100, or null when the system does not report it; shuffle: true/false/null
// Spotify is read only while someone listens (the wallpaper or the control window).
const adapter = require('../adapters');
const log = require('./log');

let current = { state: 'starting' };
let lastLogged = '';
const listeners = new Set();

function onUpdate(snap) {
  // Windows sends the cover only when the track changes; keep it for the following updates.
  if (snap.art === undefined && snap.id && snap.id === current.id) snap.art = current.art;

  const key = `${snap.state}|${snap.id || ''}`;
  if (key !== lastLogged) {
    lastLogged = key;
    if (snap.title) log.info(`Spotify: ${snap.state}: ${snap.artist} - ${snap.title} (${Math.round(snap.duration)} s)`);
    else log.info(`Spotify: ${snap.state}`, snap.message || '');
  }
  current = snap;
  for (const fn of listeners) fn(snap);
}

// Returns a function that stops listening.
function subscribe(fn) {
  listeners.add(fn);
  if (listeners.size === 1) adapter.startNowPlaying(onUpdate);
  return () => {
    if (!listeners.delete(fn)) return;
    if (listeners.size === 0) adapter.stopNowPlaying();
  };
}

// cmd: 'toggle' | 'next' | 'prev' | 'seek' (value: seconds) | 'volume' (value: 0-100) | 'mute' | 'shuffle' | 'open'
function control(cmd, value) {
  log.info('Player command:', cmd, value ?? '');
  return adapter.control(cmd, value);
}

module.exports = { subscribe, control, get: () => current };
