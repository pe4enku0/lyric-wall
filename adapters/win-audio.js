// Windows-only: the system sound for the Sound card, from the win-audio.ps1 helper (WASAPI loopback in
// the output device's own format). The helper sends a ready spectrum 50 times a second; it goes straight
// to the wallpaper, which turns it into the bars (renderer/app.js, Sound card). It also lists the output
// devices and switches the default one (the menu of the sound output button).
const { spawn } = require('child_process');
const path = require('path');
const log = require('../main/log');

const HELPER = path.join(__dirname, 'win-audio.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const RETRY_MS = 5000, MAX_RETRIES = 5;

let helper = null;
let target = null;   // webContents of the wallpaper
let retries = 0;
let retryTimer = null;
let requests = 0;
const waiting = new Map(); // request id -> { resolve, reject, timer }: commands the helper has not answered

// A command for the helper ("list", "set <device id>"); resolves with its JSON answer.
function request(command) {
  if (!helper) return Promise.reject(new Error('the sound helper is not running'));
  const id = ++requests;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('the sound helper did not answer')); }, 3000);
    waiting.set(id, { resolve, reject, timer });
    helper.stdin.write(`${id} ${command}\n`);
  });
}

function onAnswer(id, base64) {
  const w = waiting.get(Number(id));
  if (!w) return;
  waiting.delete(Number(id));
  clearTimeout(w.timer);
  const a = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  if (a.ok) w.resolve(a); else w.reject(new Error(a.error || 'failed'));
}

// The output devices: [{ id, name, default }].
const listOutputs = () => request('list').then(a => a.devices);

function setOutput(id) {
  if (!/^[\w{}.\-#]+$/.test(String(id))) return Promise.reject(new Error('bad device id'));
  return request('set ' + id).then(() => {});
}

function failWaiting() {
  for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error('the sound helper stopped')); }
  waiting.clear();
}

function stop() {
  clearTimeout(retryTimer);
  failWaiting();
  const h = helper;
  helper = null;
  if (h) h.kill();
}

function start(contents) {
  stop();
  if (target !== contents) {
    target = contents;
    retries = 0;
    // The wallpaper is gone (turned off, reloaded): nobody listens any more.
    contents.once('destroyed', () => { if (target === contents) { target = null; stop(); } });
  }
  let pending = '', binHz = 0;
  const h = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER], { windowsHide: true });
  helper = h;
  h.stdout.setEncoding('ascii');
  h.stdout.on('data', chunk => {
    pending += chunk;
    let i;
    while ((i = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, i).trim();
      pending = pending.slice(i + 1);
      if (line.startsWith('S ')) {
        if (binHz && target && !target.isDestroyed()) target.send('audio:spectrum', Buffer.from(line.slice(2), 'base64'), binHz);
      } else if (line.startsWith('F ')) {
        const [rate, fft, channels, bits] = line.slice(2).split(' ').map(Number);
        binHz = rate / fft;
        retries = 0;
        log.info(`Sound card: listening to the system sound (${rate} Hz, ${channels} channel(s), ${bits} bit)`);
      } else if (line.startsWith('R ')) {
        const [, id, base64] = line.split(' ');
        try { onAnswer(id, base64); } catch (e) { log.warn('Sound card: bad helper answer:', e.message); }
      } else if (line.startsWith('E ')) {
        log.warn('Sound card:', line.slice(2));
      } else if (line) {
        log.warn('Sound card: bad helper output:', line.slice(0, 200));
      }
    }
  });
  h.stderr.setEncoding('utf8');
  h.stderr.on('data', d => log.warn('Sound card helper:', d.trim().slice(0, 500)));
  h.on('error', e => log.error('Sound card: could not start PowerShell:', e.message));
  h.on('exit', code => {
    if (helper !== h) return; // stopped by us
    helper = null;
    failWaiting();
    if (!target || target.isDestroyed()) return;
    if (++retries > MAX_RETRIES) { log.warn('Sound card: the helper keeps stopping; the bars move in a calm wave'); return; }
    log.warn(`Sound card: the helper stopped (code ${code}), starting it again in ${RETRY_MS / 1000} s`);
    retryTimer = setTimeout(() => { if (target && !target.isDestroyed()) start(target); }, RETRY_MS);
  });
}

module.exports = { start, stop, listOutputs, setOutput };
