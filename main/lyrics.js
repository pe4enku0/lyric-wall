// Song lyrics from LRCLIB (https://lrclib.net), cached on disk in the app data folder.
// What the UI gets: { id, status, lines?, plain? }
//   id:     the Spotify track id the lyrics belong to
//   status: 'loading' | 'synced' | 'plain' | 'instrumental' | 'not-found' | 'offline' | 'busy' | 'error'
//   lines:  [{ t: seconds, text }] for synced lyrics; plain: [text] for plain lyrics
const { app, net } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const log = require('./log');

const API = 'https://lrclib.net/api';
// LRCLIB asks clients to say who they are.
const CLIENT = `Lyric Wall v${app.getVersion()} (https://github.com/pe4enku0/lyric-wall)`;
const CACHE_DIR = path.join(app.getPath('userData'), 'lyrics-cache');
const NOT_FOUND_TTL = 7 * 24 * 3600 * 1000; // look again for missing lyrics after a week
const RETRY_MS = 60 * 1000; // after a network error or a busy server
const OFFLINE = /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION|ERR_ADDRESS_UNREACHABLE|ERR_TIMED_OUT|ERR_PROXY/;

let current = { id: null, status: 'none' };
let sink = null;
let retryTimer = null;

const toSeconds = (m, s) => Number(m) * 60 + Number(s);

// "[01:23.45] words" -> { t: 83.45, text: 'words' }. A line may have several time stamps.
// Word time tags of enhanced LRC ("<01:23.45>") are removed.
function parseLrc(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]|<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    for (const m of stamps) lines.push({ t: toSeconds(m[1], m[2]), text: words });
  }
  return lines.sort((a, b) => a.t - b.t);
}

// "Song - Remastered 2011" / "Song (feat. X)" -> "Song"
function simplifyTitle(title) {
  return title
    .replace(/\s+-\s+.*\b(remaster(ed)?|version|live|mono|stereo|edit|mix|radio|acoustic|demo)\b.*$/i, '')
    .replace(/\s*[([](feat|ft|with)\.?\s[^)\]]*[)\]]/gi, '')
    .trim() || title;
}

// "Artist A, Artist B" -> "Artist A"
function mainArtist(artist) {
  return artist.split(/,\s|\s&\s|\sfeat\.?\s|\sx\s/i)[0].trim() || artist;
}

async function request(pathname, params) {
  const url = `${API}${pathname}?${new URLSearchParams(params)}`;
  const res = await net.fetch(url, {
    headers: { 'Lrclib-Client': CLIENT, 'User-Agent': CLIENT },
    signal: AbortSignal.timeout(10000)
  });
  if (res.status === 404) return null;
  if (res.status === 503 || res.status === 429) {
    throw Object.assign(new Error(`LRCLIB is busy (HTTP ${res.status})`), { busy: true });
  }
  if (!res.ok) throw new Error(`LRCLIB answered HTTP ${res.status}`);
  return res.json();
}

// Search, asking once more if the server is busy.
async function search(params) {
  try {
    return await request('/search', params);
  } catch (e) {
    if (!e.busy) throw e;
    await new Promise(r => setTimeout(r, 1500));
    return request('/search', params);
  }
}

// A search result with a fitting duration, synced lyrics first.
function pick(list, duration) {
  const kind = x => (x.syncedLyrics ? 0 : x.plainLyrics ? 1 : x.instrumental ? 2 : 3);
  const gap = x => (duration && x.duration ? Math.abs(x.duration - duration) : 30);
  const fitting = (list || []).filter(x => gap(x) <= 8 || !x.duration || !duration);
  fitting.sort((a, b) => kind(a) - kind(b) || gap(a) - gap(b));
  return fitting[0] || null;
}

async function lookup(s) {
  const duration = Math.round(s.duration || 0);
  const exact = { artist_name: s.artist, track_name: s.title, album_name: s.album || '', duration };
  let busy = false, failure = null;
  // A failed request does not stop the others; the error counts only if nothing is found.
  const soft = p => p.catch(e => { if (e.busy) busy = true; else failure = failure || e; return null; });
  // 1. Fast, at the same time: a search by title and artist (without "Remastered", "feat." etc.)
  //    and LRCLIB's own database (exact match, ±2 s). A fitting synced search result is used right away.
  const cachedP = duration > 0 ? soft(request('/get-cached', exact)) : Promise.resolve(null);
  const found = pick(await soft(search({ track_name: simplifyTitle(s.title), artist_name: mainArtist(s.artist) })), duration);
  if (found && found.syncedLyrics) return found;
  const cached = await cachedP;
  if (cached && (cached.syncedLyrics || cached.instrumental)) return cached;
  // 2. Slower: LRCLIB also asks other sources for this exact track.
  if (duration > 0) {
    const full = await soft(request('/get', exact));
    if (full && (full.syncedLyrics || full.instrumental || !(cached || found))) return full;
  }
  if (cached || found) return cached || found;
  if (failure) throw failure;
  if (busy) throw Object.assign(new Error('LRCLIB is busy'), { busy: true });
  return null;
}

function toResult(rec) {
  if (!rec) return { status: 'not-found' };
  if (rec.syncedLyrics) {
    const lines = parseLrc(rec.syncedLyrics);
    if (lines.length) return { status: 'synced', lines };
  }
  if (rec.plainLyrics) return { status: 'plain', plain: rec.plainLyrics.split(/\r?\n/).map(l => l.trim()) };
  if (rec.instrumental) return { status: 'instrumental' };
  return { status: 'not-found' };
}

/* ---------- disk cache ---------- */
function cacheFile(s) {
  const key = [s.artist, s.title, s.album, Math.round(s.duration || 0)].join('\n').toLowerCase();
  return path.join(CACHE_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.json');
}

function readCache(file) {
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (c.result.status === 'not-found' && Date.now() - c.savedAt > NOT_FOUND_TTL) return null;
    return c.result;
  } catch (_) {
    return null;
  }
}

function writeCache(file, result) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ savedAt: Date.now(), result }));
  } catch (e) {
    log.warn('Lyrics: could not write the cache:', e.message);
  }
}

/* ---------- loading for the current track ---------- */
function publish(r) {
  current = r;
  if (sink) sink(r);
}

async function load(s) {
  clearTimeout(retryTimer);
  const id = s.id, file = cacheFile(s), name = `${s.artist} - ${s.title}`;
  const cached = readCache(file);
  if (cached) {
    log.info(`Lyrics: ${cached.status} (cache) for ${name}`);
    publish({ id, ...cached });
    return;
  }
  publish({ id, status: 'loading' });
  try {
    const result = toResult(await lookup(s));
    writeCache(file, result);
    log.info(`Lyrics: ${result.status} for ${name}`);
    if (current.id === id) publish({ id, ...result });
  } catch (e) {
    const status = e.busy ? 'busy' : OFFLINE.test(e.message) || e.name === 'TimeoutError' ? 'offline' : 'error';
    log.warn(`Lyrics: ${status} for ${name}:`, e.message);
    if (current.id !== id) return;
    publish({ id, status });
    retryTimer = setTimeout(() => { if (current.id === id) load(s); }, RETRY_MS);
  }
}

// Called with every player snapshot; loads lyrics when the track changes.
function onSnapshot(s) {
  const isTrack = (s.state === 'playing' || s.state === 'paused') && s.id && s.title;
  if (isTrack && s.id !== current.id) load(s);
}

module.exports = {
  onSnapshot,
  get: () => current,
  setSink: fn => { sink = fn; }
};
