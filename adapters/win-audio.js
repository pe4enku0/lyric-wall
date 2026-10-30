// Windows-only: the system sound for the Sound card, from the win-audio.ps1 helper (WASAPI loopback in
// the output device's own format). The helper sends a ready spectrum 50 times a second; it goes straight
// to the wallpaper, which turns it into the bars (renderer/app.js, Sound card). It also tells which device
// plays (the label of the sound output button).
const { spawn } = require('child_process');
const path = require('path');
const log = require('../main/log');

const HELPER = path.join(__dirname, 'win-audio.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const RETRY_MS = 5000, MAX_RETRIES = 5;

let helper = null;
let target = null;   // webContents of the wallpaper
let retries = 0;
let retryTimer = null;
let deviceName = ''; // the output device the sound helper listens to, short (for the wallpaper)

// "Speakers (Logitech PRO X Gaming Headset)" -> "Logitech PRO X Gaming Headset" (a generic word gives way to the
// device), "VG249QL3A (NVIDIA High Definition Audio)" -> "VG249QL3A" (the name is the device).
const GENERIC = /^(speakers|headphones|headset|earphones|динамики|наушники|гарнитура|колонки|lautsprecher|kopfhörer)$/i;
function shortName(name) {
  const m = String(name).match(/^(.*?)\s*\(((?:[^()]|\([^()]*\))*)\)\s*$/); // the last "(...)", "(R)" inside is fine
  if (!m) return name;
  return GENERIC.test(m[1].trim()) ? m[2].trim() : m[1].trim();
}

function stop() {
  clearTimeout(retryTimer);
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
      } else if (line.startsWith('N ')) {
        deviceName = shortName(Buffer.from(line.slice(2), 'base64').toString('utf8'));
        if (target && !target.isDestroyed()) target.send('audio:device', deviceName);
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
    if (!target || target.isDestroyed()) return;
    if (++retries > MAX_RETRIES) { log.warn('Sound card: the helper keeps stopping; the bars move in a calm wave'); return; }
    log.warn(`Sound card: the helper stopped (code ${code}), starting it again in ${RETRY_MS / 1000} s`);
    retryTimer = setTimeout(() => { if (target && !target.isDestroyed()) start(target); }, RETRY_MS);
  });
}

module.exports = { start, stop, shortName, device: () => deviceName };
