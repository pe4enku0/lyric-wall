// "Now playing" in one format for both systems. The adapter sends snapshots:
// { state, playing, title, artist, album, art, position, duration, volume, shuffle, id, at }
//   state:    'playing' | 'paused' | 'stopped' | 'not-running' | 'not-installed' | 'no-permission' | 'error'
//   position, duration: seconds; at: time (ms) when position was read
//   volume:   0-100, or null when the system does not report it; shuffle: true/false/null
// Spotify is read only while someone listens (the wallpaper or the control window).
const { net } = require('electron');
const adapter = require('../adapters');
const log = require('./log');

let current = { state: 'starting' };
// Covers found elsewhere when the system gives none (Windows media controls sometimes have no cover).
const foundCovers = new Map(); // track id -> url ('' = looked, nothing found)

// The public iTunes catalog by artist and title; no account needed.
async function findCover(s) {
  const res = await net.fetch('https://itunes.apple.com/search?' + new URLSearchParams({ term: `${s.artist} ${s.title}`.slice(0, 200), entity: 'song', limit: '1' }), { signal: AbortSignal.timeout(8000) });
  const first = ((await res.json()).results || [])[0];
  return first && first.artworkUrl100 ? first.artworkUrl100.replace('100x100bb', '600x600bb') : '';
}

function coverFallback(snap) {
  if (foundCovers.has(snap.id)) { snap.art = foundCovers.get(snap.id) || snap.art; return; }
  if (foundCovers.size > 300) foundCovers.clear();
  foundCovers.set(snap.id, '');
  findCover(snap).then(url => {
    foundCovers.set(snap.id, url);
    log.info(`Cover: ${url ? 'found in the iTunes catalog' : 'not found'} for ${snap.artist} - ${snap.title}`);
    if (url && current.id === snap.id && !current.art) onUpdate({ ...current, art: url, at: current.at });
  }).catch(e => log.warn('Cover: iTunes search failed:', e.message));
}
let lastLogged = '';
const listeners = new Set();

function onUpdate(snap) {
  // Windows sends the cover only when the track changes; keep it for the following updates.
  if (snap.art === undefined && snap.id && snap.id === current.id) snap.art = current.art;
  if (snap.title && snap.id && !snap.art) coverFallback(snap);

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

// Request ids follow one command through the log: h = wallpaper click layer, w = wallpaper clicked directly
// (npm run window), t = tray menu.
let seq = 0;
const newId = prefix => `${prefix}${++seq}`;

// Volume: one command at a time; values that come while one runs are merged into the newest
// (dragging the bar sends up to 10 a second). Only the first and the last of one drag are logged.
let volBusy = false, volNext = null, volGesture = { id: null, count: 0 }, volLogTimer = null;
function setVolume(value, id) {
  if (volBusy) { volNext = { value, id }; return Promise.resolve(); }
  volBusy = true;
  clearTimeout(volLogTimer);
  const quiet = id === volGesture.id;
  if (!quiet) {
    volGesture = { id, count: 0 };
    log.info(`[${id}] Player command: volume ${value} (Spotify: ${current.state})`);
  }
  volGesture.count++;
  return adapter.control('volume', value, id, quiet).finally(() => {
    volBusy = false;
    if (volNext) { const n = volNext; volNext = null; setVolume(n.value, n.id); }
    // The drag is over when no new value comes for a moment.
    else if (volGesture.count > 1) {
      const n = volGesture.count;
      volLogTimer = setTimeout(() => log.info(`[${id}] Volume set to ${value} (${n} commands)`), 700);
    }
  });
}

// A track further down "Up next": "next" as many times as needed. This keeps the playlist and the queue
// (playing the track directly would make Spotify forget them), like a click on the queue in Spotify itself.
async function skip(n, id) {
  for (let i = 0; i < n; i++) {
    if (i) await new Promise(r => setTimeout(r, 250)); // Spotify needs a moment between switches
    await adapter.control('next', null, `${id}n${i + 1}`);
  }
}

// cmd: 'toggle' | 'next' | 'prev' | 'skip' (value: how many tracks) | 'seek' (value: seconds) | 'volume' (value: 0-100)
//      | 'mute' | 'shuffle' | 'open'
function control(cmd, value, rid) {
  const id = rid || newId('x');
  if (cmd === 'volume') return setVolume(Math.round(Math.max(0, Math.min(100, Number(value) || 0))), id);
  if (cmd === 'skip') {
    const n = Math.max(1, Math.min(10, Math.round(Number(value) || 1)));
    log.info(`[${id}] Player command: skip ${n} track(s) (Spotify: ${current.state})`);
    return skip(n, id);
  }
  log.info(`[${id}] Player command: ${cmd}${value == null ? '' : ' ' + value} (Spotify: ${current.state})`);
  return adapter.control(cmd, value, id);
}

module.exports = { subscribe, control, newId, get: () => current };
