// App settings: settings.json in the app data folder, kept between restarts.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('./log');

const file = path.join(app.getPath('userData'), 'settings.json');

const defaults = {
  wallpaperEnabled: true,
  language: 'auto', // 'auto' | 'en' | 'ru'
  winMode: 'auto', // Windows: 'auto' = behind desktop icons, 'bottom' = fallback below all windows
  // Look of the wallpaper (the settings window, see main/appearance.js)
  theme: 'dusty',
  bg: 'dusk',
  imgBlur: 0,
  imgDim: 30,
  snowSpeed: 1,
  snowCount: 90,
  imageVersion: 0, // changes every time a new own picture is chosen
  pauseOnBattery: false, // stop the wallpaper while running on battery (main/power.js)
  showLyrics: true,
  fps: 30, // wallpaper frames per second: 30, 20 or 15
  welcomeShown: false, // the first-start notification was shown
  // Sound card bars follow the computer's sound. macOS asks for the screen recording permission, so off there.
  audioReactive: process.platform === 'win32',
  spotifyClientId: '' // Client ID of the user's app on developer.spotify.com (main/spotify-web.js)
};

let data = { ...defaults };
try {
  data = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
} catch (e) {
  if (e.code !== 'ENOENT') log.warn('Could not read settings, using defaults:', e.message);
}

let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    log.error('Could not save settings:', e.message);
  }
}

function get(key) { return data[key]; }

// Saved a moment later, so dragging a slider does not write the file on every step.
function set(key, value) {
  data[key] = value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

app.on('will-quit', () => { if (saveTimer) save(); });

module.exports = { get, set };
