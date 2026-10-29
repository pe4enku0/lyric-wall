// Actions shared by the tray menu and the control window, so both always show the same state.
const { app, shell, dialog } = require('electron');
const { EventEmitter } = require('events');
const wallpaper = require('./wallpaper');
const settings = require('./settings');
const { t } = require('./i18n');
const log = require('./log');

const events = new EventEmitter();
// Windows passes these arguments when it starts the app at login, so we know not to open a window.
const LOGIN_ARGS = ['--autostart'];

function loginItemEnabled() {
  return app.isPackaged && app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin;
}

function state() {
  return {
    version: app.getVersion(),
    platform: process.platform,
    wallpaperEnabled: wallpaper.isOn(),
    language: settings.get('language'),
    winMode: settings.get('winMode'),
    loginItem: { available: app.isPackaged, enabled: loginItemEnabled() }
  };
}

function set(key, value) {
  switch (key) {
    case 'wallpaperEnabled':
      settings.set(key, !!value);
      if (value) wallpaper.create(); else wallpaper.destroy();
      break;
    case 'language':
      if (!['auto', 'en', 'ru'].includes(value)) return state();
      settings.set(key, value);
      log.info('Language changed to', value);
      wallpaper.reload();
      break;
    case 'winMode':
      if (!['auto', 'bottom'].includes(value) || settings.get(key) === value) return state();
      settings.set(key, value);
      log.info('Wallpaper mode changed to', value);
      if (wallpaper.isOn()) { wallpaper.destroy(); wallpaper.create(); }
      break;
    case 'loginItem': {
      if (!app.isPackaged) return state();
      app.setLoginItemSettings({ openAtLogin: !!value, args: LOGIN_ARGS });
      const s = app.getLoginItemSettings({ args: LOGIN_ARGS });
      log.info('Start at login:', value ? 'turning on' : 'turning off', '-> now', s.openAtLogin, s.status || '');
      if (value && s.status === 'requires-approval') {
        dialog.showMessageBox({ message: t('dialog.loginApproval.title'), detail: t('dialog.loginApproval.detail') });
      }
      break;
    }
    default:
      return state();
  }
  events.emit('change', key);
  return state();
}

function openLog() {
  shell.openPath(log.file);
}

module.exports = { state, set, openLog, onChange: fn => events.on('change', fn), LOGIN_ARGS };
