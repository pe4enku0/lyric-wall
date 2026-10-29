// "Now playing" in one format for both systems. The adapter sends snapshots:
// { state, playing, title, artist, album, art, position, duration, volume, shuffle, id, at }
//   state:    'playing' | 'paused' | 'stopped' | 'not-running' | 'not-installed' | 'no-permission' | 'error'
//   position, duration: seconds; at: time (ms) when position was read
//   volume:   0-100, or null when the system does not report it; shuffle: true/false/null
const adapter = require('../adapters');
const log = require('./log');

let current = { state: 'starting' };
let lastLogged = '';
let sink = null;
let active = false;

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
  if (sink) sink(snap);
}

function start(onSnapshot) {
  sink = onSnapshot;
  if (active) return;
  active = true;
  adapter.startNowPlaying(onUpdate);
}

function stop() {
  if (!active) return;
  active = false;
  adapter.stopNowPlaying();
}

function control(cmd) {
  log.info('Player command:', cmd);
  return adapter.control(cmd);
}

module.exports = { start, stop, control, get: () => current };
