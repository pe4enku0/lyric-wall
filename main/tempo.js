// Tempo (beats per minute) of the current track from the public Deezer catalog (https://api.deezer.com),
// so the sound card can jump to the beat without listening to the computer's sound.
// Only the artist and title are sent, no login. Results are cached in the app data folder.
// What the UI gets: { id, bpm } — bpm is 0 while loading or when the catalog does not know the tempo.
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { simplifyTitle, mainArtist } = require('./lyrics');
const log = require('./log');

const API = 'https://api.deezer.com';
const CACHE_FILE = path.join(app.getPath('userData'), 'tempo-cache.json');
const UNKNOWN_TTL = 7 * 24 * 3600 * 1000; // look again for a missing tempo after a week
const MAX_CACHE = 3000;

let current = { id: null, bpm: 0 };
let sink = null;
let cache = null; // { key: { bpm, at } }

async function get(pathname, params) {
  const url = `${API}${pathname}${params ? '?' + new URLSearchParams(params) : ''}`;
  const res = await net.fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Deezer answered HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Deezer: ${data.error.message || data.error.type}`);
  return data;
}

const plain = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Search results by the same artist with the same title, the closest length first.
async function lookup(s) {
  const artist = mainArtist(s.artist), title = simplifyTitle(s.title);
  const found = (await get('/search', { q: `${artist} ${title}`, limit: 10 })).data || [];
  const a = plain(artist), t = plain(title);
  const gap = x => (s.duration && x.duration ? Math.abs(x.duration - s.duration) : 0);
  const fitting = found
    .filter(x => plain(x.artist && x.artist.name).includes(a) || a.includes(plain(x.artist && x.artist.name)))
    .filter(x => plain(x.title).startsWith(t) || t.startsWith(plain(x.title_short || x.title)))
    .filter(x => gap(x) <= 10)
    .sort((x, y) => gap(x) - gap(y));
  // The tempo is only in the full track info; some versions of a song have none (0).
  for (const x of fitting.slice(0, 3)) {
    const bpm = Number((await get(`/track/${x.id}`)).bpm) || 0;
    if (bpm >= 40 && bpm <= 250) return Math.round(bpm * 10) / 10;
  }
  return 0;
}

/* ---------- disk cache ---------- */
const keyOf = s => [s.artist, s.title].join('\n').toLowerCase();

function readCache() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (_) { cache = {}; }
  return cache;
}

function remember(key, bpm) {
  const c = readCache();
  c[key] = { bpm, at: Date.now() };
  const keys = Object.keys(c);
  if (keys.length > MAX_CACHE) keys.sort((x, y) => c[x].at - c[y].at).slice(0, keys.length - MAX_CACHE).forEach(k => delete c[k]);
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(c)); } catch (e) { log.warn('Tempo: could not write the cache:', e.message); }
}

/* ---------- loading for the current track ---------- */
function publish(r) {
  current = r;
  if (sink) sink(r);
}

async function load(s) {
  const id = s.id, key = keyOf(s), name = `${s.artist} - ${s.title}`;
  const hit = readCache()[key];
  if (hit && (hit.bpm || Date.now() - hit.at < UNKNOWN_TTL)) { publish({ id, bpm: hit.bpm }); return; }
  publish({ id, bpm: 0 });
  try {
    const bpm = await lookup(s);
    remember(key, bpm);
    log.info(`Tempo: ${bpm ? bpm + ' BPM' : 'unknown'} for ${name}`);
    if (current.id === id) publish({ id, bpm });
  } catch (e) {
    log.warn(`Tempo: not loaded for ${name}:`, e.message); // tried again when the track plays next time
  }
}

// Called with every player snapshot; looks up the tempo when the track changes.
function onSnapshot(s) {
  const isTrack = (s.state === 'playing' || s.state === 'paused') && s.id && s.title;
  if (isTrack && s.id !== current.id) load(s);
}

module.exports = {
  onSnapshot,
  get: () => current,
  setSink: fn => { sink = fn; }
};
