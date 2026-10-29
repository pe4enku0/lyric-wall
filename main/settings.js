// App settings: settings.json in the app data folder, kept between restarts.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('./log');

const file = path.join(app.getPath('userData'), 'settings.json');

const defaults = {
  wallpaperEnabled: true,
  language: 'auto', // 'auto' | 'en' | 'ru'
  winMode: 'auto' // Windows: 'auto' = behind desktop icons, 'bottom' = fallback below all windows
};

let data = { ...defaults };
try {
  data = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
} catch (e) {
  if (e.code !== 'ENOENT') log.warn('Could not read settings, using defaults:', e.message);
}

function get(key) { return data[key]; }

function set(key, value) {
  data[key] = value;
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    log.error('Could not save settings:', e.message);
  }
}

module.exports = { get, set };
