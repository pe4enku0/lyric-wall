// Настройки приложения: settings.json в папке данных. Сохраняются между перезапусками.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('./log');

const file = path.join(app.getPath('userData'), 'settings.json');

const defaults = {
  wallpaperEnabled: true,
  winMode: 'auto' // Windows: 'auto' — за иконками, 'bottom' — запасной режим «под всеми окнами»
};

let data = { ...defaults };
try {
  data = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
} catch (e) {
  if (e.code !== 'ENOENT') log.warn('Не удалось прочитать настройки, беру стандартные:', e.message);
}

function get(key) { return data[key]; }

function set(key, value) {
  data[key] = value;
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    log.error('Не удалось сохранить настройки:', e.message);
  }
}

module.exports = { get, set };
