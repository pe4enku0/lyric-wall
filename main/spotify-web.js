// Spotify Web API (optional): the next tracks in the queue ("Up next") and likes (★).
// Sign-in: Authorization Code with PKCE — no client secret, only the Client ID of the user's own app from
// developer.spotify.com (Development Mode: the app owner needs Premium, at most 5 users per app).
// Tokens are stored encrypted (safeStorage: macOS Keychain / Windows DPAPI) and never written to the log.
const { app, net, shell, safeStorage } = require('electron');
const { EventEmitter } = require('events');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const settings = require('./settings');
const log = require('./log');

const PORT = 43821;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = 'user-read-playback-state user-read-currently-playing user-library-read user-library-modify';
const TOKEN_FILE = path.join(app.getPath('userData'), 'spotify-token.bin');
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const QUEUE_EVERY_MS = 30 * 1000; // the queue may change without a track change

const events = new EventEmitter();
let token = null;      // { access, refresh, expires }
let userName = '';
let now = { uri: null, queue: [], liked: false }; // what the wallpaper shows
let lastTrackId = null;
let lastSnapshotAt = 0; // the wallpaper is showing music (it is not paused or off)
let localUri = null;    // macOS: the track URI straight from the Spotify app (the Web API may not know it yet)
let queueTimer = null;
let loginServer = null;
let likedOf = null;     // the track whose "liked" mark is known (asked once per track, not every 30 s)
let refreshTimer = null;
// "Too many requests" (HTTP 429): Spotify says how long to wait; until then that kind of request is not sent.
const blockedUntil = {};

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ---------- token storage ---------- */
function saveToken() {
  try {
    if (!token) { fs.rmSync(TOKEN_FILE, { force: true }); return; }
    if (!safeStorage.isEncryptionAvailable()) { log.warn('Spotify login: secure storage unavailable, the login is kept until quit only'); return; }
    fs.writeFileSync(TOKEN_FILE, safeStorage.encryptString(JSON.stringify(token)));
  } catch (e) {
    log.warn('Spotify login: could not save it:', e.message);
  }
}

function loadToken() {
  try {
    if (fs.existsSync(TOKEN_FILE) && safeStorage.isEncryptionAvailable()) token = JSON.parse(safeStorage.decryptString(fs.readFileSync(TOKEN_FILE)));
  } catch (e) {
    log.warn('Spotify login: saved login could not be read, sign in again');
    token = null;
  }
}

/* ---------- requests ---------- */
async function tokenRequest(params) {
  const res = await net.fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: settings.get('spotifyClientId'), ...params }).toString(),
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Spotify sign-in failed: ${data.error_description || data.error || res.status}`);
  token = {
    access: data.access_token,
    refresh: data.refresh_token || (token && token.refresh),
    expires: Date.now() + (data.expires_in || 3600) * 1000
  };
  saveToken();
}

async function api(method, pathAndQuery, retried) {
  if (!token) return null;
  const kind = `${method} ${pathAndQuery.split('?')[0]}`;
  if (Date.now() < (blockedUntil[kind] || 0)) throw Object.assign(new Error(`${kind} waits after "too many requests"`), { waiting: true });
  if (Date.now() > token.expires - 60000) await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh });
  const res = await net.fetch('https://api.spotify.com/v1' + pathAndQuery, {
    method,
    headers: { Authorization: `Bearer ${token.access}` },
    signal: AbortSignal.timeout(10000)
  });
  if (res.status === 401 && !retried) {
    await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh });
    return api(method, pathAndQuery, true);
  }
  if (res.status === 429) {
    const wait = Math.min(3600, Math.max(30, Number(res.headers.get('retry-after')) || 60));
    blockedUntil[kind] = Date.now() + wait * 1000;
    throw new Error(`Spotify said "too many requests" for ${kind}; waiting ${wait} s before asking again`);
  }
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) throw new Error(`Spotify answered HTTP ${res.status} for ${method} ${pathAndQuery.split('?')[0]}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ---------- sign in / out ---------- */
function state() {
  return { clientId: settings.get('spotifyClientId') || '', loggedIn: !!token, user: userName, redirectUri: REDIRECT_URI };
}

function setClientId(id) {
  id = String(id || '').trim();
  if (id && !/^[0-9a-f]{32}$/i.test(id)) return { ...state(), error: 'bad-client-id' };
  if (id !== settings.get('spotifyClientId')) { settings.set('spotifyClientId', id); logout(); }
  return state();
}

// Waits for Spotify to send the browser back to http://127.0.0.1:43821/callback with the code.
function waitForCode(expectedState) {
  return new Promise((resolve, reject) => {
    const done = (err, code) => { clearTimeout(timer); if (loginServer) loginServer.close(); loginServer = null; err ? reject(err) : resolve(code); };
    if (loginServer) loginServer.close();
    loginServer = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const ok = url.searchParams.get('state') === expectedState && url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Lyric Wall</title><body style="font:16px -apple-system,Segoe UI,sans-serif;background:#19171c;color:#e9e6ec;display:grid;place-items:center;height:90vh">
        <p>${ok ? 'Lyric Wall: готово, вкладку можно закрыть. / Done, you can close this tab.' : 'Lyric Wall: вход не выполнен. / Sign-in failed.'}</p>`);
      if (ok) done(null, url.searchParams.get('code'));
      else done(new Error(`Spotify sign-in was not completed (${url.searchParams.get('error') || 'wrong answer'})`));
    });
    loginServer.on('error', e => done(new Error(`Could not wait for Spotify on port ${PORT}: ${e.message}`)));
    loginServer.listen(PORT, '127.0.0.1');
    const timer = setTimeout(() => done(new Error('Spotify sign-in timed out')), LOGIN_TIMEOUT_MS);
  });
}

async function login() {
  const clientId = settings.get('spotifyClientId');
  if (!clientId) return { ...state(), error: 'no-client-id' };
  try {
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const expected = b64url(crypto.randomBytes(16));
    const codeP = waitForCode(expected);
    await shell.openExternal('https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state: expected
    }));
    const code = await codeP;
    await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
    await loadUser();
    log.info('Spotify Web API: signed in');
    events.emit('change');
    lastTrackId = null;
    refreshNow();
    return state();
  } catch (e) {
    log.warn('Spotify Web API:', e.message);
    return { ...state(), error: 'login-failed', message: e.message };
  }
}

function logout() {
  token = null;
  userName = '';
  saveToken();
  now = { uri: null, queue: [], liked: false };
  likedOf = null;
  events.emit('change');
  events.emit('now', now);
}

async function loadUser() {
  try { userName = ((await api('GET', '/me')) || {}).display_name || ''; } catch (_) { userName = ''; }
}

/* ---------- queue and likes for the current track ---------- */
const trackInfo = t => ({
  uri: t.uri,
  title: t.name,
  artist: (t.artists || (t.show ? [{ name: t.show.name }] : [])).map(a => a.name).join(', '),
  art: ((t.album && t.album.images) || t.images || []).slice(-1)[0]?.url || ''
});

// The queue and the "liked" mark are asked separately: one failing does not lose the other.
async function refreshNow() {
  if (!token) return;
  let q;
  try {
    q = await api('GET', '/me/player/queue');
  } catch (e) {
    if (!e.waiting) log.warn('Spotify Web API:', e.message);
    return;
  }
  const current = q && q.currently_playing;
  const uri = current ? current.uri : localUri;
  now = { ...now, uri, queue: ((q && q.queue) || []).slice(0, 5).map(trackInfo) };
  if (uri !== likedOf) {
    now.liked = false;
    try {
      if (uri) now.liked = !!((await api('GET', '/me/library/contains?uris=' + encodeURIComponent(uri))) || [])[0];
      likedOf = uri;
    } catch (e) {
      if (!e.waiting) log.warn('Spotify Web API:', e.message);
    }
  }
  events.emit('now', now);
}

// Called with every player snapshot: reload the queue when the track changes.
function onSnapshot(s) {
  lastSnapshotAt = Date.now();
  if (s && typeof s.id === 'string' && s.id.startsWith('spotify:track:')) localUri = s.id;
  if (!token || !s || !s.id || s.id === lastTrackId) return;
  lastTrackId = s.id;
  // The Web API learns about the new track a moment later. Several quick changes (skipping to a track in
  // "Up next") ask only once, after the last one.
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshNow, 1500);
}

async function setLiked(on) {
  if (!token) return now;
  // Right after signing in or a track change the Web API may not know the track yet: ask it now.
  if (!now.uri) await refreshNow();
  if (!now.uri) { log.warn('Spotify Web API: like: the current track is unknown'); return { ...now, error: 'no-track' }; }
  const uri = encodeURIComponent(now.uri);
  try {
    await api(on ? 'PUT' : 'DELETE', `/me/library?uris=${uri}`);
    now = { ...now, liked: on };
    log.info(`Spotify Web API: track ${on ? 'liked' : 'unliked'}`);
  } catch (e) {
    log.warn('Spotify Web API: like failed:', e.message);
    events.emit('now', now);
    return { ...now, error: 'failed' };
  }
  events.emit('now', now);
  return now;
}

function start() {
  loadToken();
  if (token) loadUser().then(() => events.emit('change'));
  // Only while the wallpaper shows music: no requests while it is paused (games) or off.
  queueTimer = setInterval(() => { if (token && Date.now() - lastSnapshotAt < 5000) refreshNow(); }, QUEUE_EVERY_MS);
}

function stop() {
  clearInterval(queueTimer);
  if (loginServer) loginServer.close();
}

module.exports = {
  REDIRECT_URI, start, stop, state, setClientId, login, logout, onSnapshot, setLiked,
  getNow: () => now,
  onChange: fn => events.on('change', fn),
  onNow: fn => events.on('now', fn)
};
