// Options of the settings window: arrangement, theme, background, picture blur/dim, snow, pausing on battery;
// plus showing the lyrics (the lyrics button on the wallpaper).
// Applied right away and kept in settings.json.
const { app } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');
const log = require('./log');

// The own picture is copied here (already resized to at most 2560 px by the settings window).
const IMAGE = path.join(app.getPath('userData'), 'background.jpg');
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const THEMES = ['default', 'dusty', 'pastel', 'sakura', 'rain', 'neon', 'amoled', 'vinyl', 'matcha', 'chrome'];
// 'color' = a plain colour (bgColor), the default look only. 'theme' = the theme's own background.
// The colour presets belong to the dusty-glass theme only.
const BACKGROUNDS = ['color', 'theme', 'dusk', 'photo', 'cover', 'auto', 'lilac', 'graphite', 'night', 'pine', 'sunset'];
const DUSTY_ONLY = ['dusk', 'auto', 'lilac', 'graphite', 'night', 'pine', 'sunset'];
const DEFAULT_ONLY = ['color'];
const allowedBg = (theme, bg) => (theme === 'default' ? ['color', 'photo', 'cover'].includes(bg)
  : theme === 'dusty' ? bg !== 'theme' && !DEFAULT_ONLY.includes(bg) : !DUSTY_ONLY.includes(bg) && !DEFAULT_ONLY.includes(bg));
const LIMITS = { imgBlur: [0, 40], imgDim: [0, 80], snowSpeed: [0, 3], snowCount: [0, 300] };

const events = new EventEmitter();

const hasImage = () => fs.existsSync(IMAGE);

function get() {
  return {
    theme: settings.get('theme'),
    layout: settings.get('layout'),
    bg: settings.get('bg'),
    bgColor: settings.get('bgColor'),
    snowOn: settings.get('snowOn'),
    imgBlur: settings.get('imgBlur'),
    imgDim: settings.get('imgDim'),
    snowSpeed: settings.get('snowSpeed'),
    snowCount: settings.get('snowCount'),
    hasImage: hasImage(),
    imageVersion: settings.get('imageVersion'),
    imageName: settings.get('imageName'),
    pauseOnBattery: settings.get('pauseOnBattery'),
    showLyrics: settings.get('showLyrics'),
    fps: settings.get('fps')
  };
}

function set(key, value) {
  if (key === 'theme') {
    if (!THEMES.includes(value)) return get();
    // A theme sets the whole look: switch to its own background, but keep a picture or the cover.
    if (!allowedBg(value, settings.get('bg'))) settings.set('bg', value === 'default' ? 'color' : value === 'dusty' ? 'dusk' : 'theme');
  } else if (key === 'bg') {
    if (!BACKGROUNDS.includes(value) || (value === 'photo' && !hasImage())) return get();
    if (!allowedBg(settings.get('theme'), value)) return get();
  } else if (key === 'layout') {
    if (!['a', 'b'].includes(value)) return get();
  } else if (key === 'bgColor') {
    if (!/^#[0-9a-f]{6}$/i.test(String(value))) return get();
  } else if (['pauseOnBattery', 'showLyrics', 'snowOn'].includes(key)) {
    value = !!value;
  } else if (key === 'fps') {
    if (![15, 20, 30, 45, 60].includes(Number(value))) return get();
    value = Number(value);
  } else if (LIMITS[key]) {
    const [lo, hi] = LIMITS[key];
    value = Math.min(hi, Math.max(lo, Number(value) || 0));
  } else {
    return get();
  }
  settings.set(key, value);
  events.emit('change');
  return get();
}

// dataUrl: "data:image/jpeg;base64,..." prepared by the settings window; name: the original file name.
function saveImage(dataUrl, name) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) return { ...get(), error: 'bad-image' };
  const bytes = Buffer.from(m[1], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return { ...get(), error: 'bad-image' };
  try {
    fs.writeFileSync(IMAGE, bytes);
  } catch (e) {
    log.error('Background: could not save the picture:', e.message);
    return { ...get(), error: 'bad-image' };
  }
  log.info(`Background: own picture saved (${Math.round(bytes.length / 1024)} KB)`);
  settings.set('imageVersion', Date.now());
  settings.set('imageName', path.basename(String(name || '')).slice(0, 120));
  settings.set('bg', 'photo');
  events.emit('change');
  return get();
}

function imageDataUrl() {
  try {
    return 'data:image/jpeg;base64,' + fs.readFileSync(IMAGE).toString('base64');
  } catch (_) {
    return null;
  }
}

module.exports = { get, set, saveImage, imageDataUrl, onChange: fn => events.on('change', fn) };
