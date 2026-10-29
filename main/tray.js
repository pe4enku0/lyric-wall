// Menu bar icon (Mac) and tray icon (Windows) with the control menu.
const { app, Tray, Menu, shell, dialog } = require('electron');
const adapter = require('../adapters');
const wallpaper = require('./wallpaper');
const player = require('./player');
const settings = require('./settings');
const { t } = require('./i18n');
const log = require('./log');

let tray = null;

function setWallpaper(on) {
  settings.set('wallpaperEnabled', on);
  if (on) wallpaper.create(); else wallpaper.destroy();
  refresh();
}

function setWinMode(mode) {
  if (settings.get('winMode') === mode) return;
  settings.set('winMode', mode);
  log.info('Wallpaper mode changed to', mode);
  if (wallpaper.isOn()) { wallpaper.destroy(); wallpaper.create(); }
  refresh();
}

function setLanguage(lang) {
  settings.set('language', lang);
  log.info('Language changed to', lang);
  wallpaper.reload();
  refresh();
}

function setLoginItem(on) {
  app.setLoginItemSettings({ openAtLogin: on });
  const s = app.getLoginItemSettings();
  log.info('Start at login:', on ? 'turning on' : 'turning off', '-> now', s.openAtLogin, s.status || '');
  if (on && s.status === 'requires-approval') {
    dialog.showMessageBox({ message: t('dialog.loginApproval.title'), detail: t('dialog.loginApproval.detail') });
  }
  refresh();
}

function openSettings() {
  if (process.platform === 'darwin') app.focus({ steal: true });
  dialog.showMessageBox({ message: t('dialog.settings.title'), detail: t('dialog.settings.detail') });
}

function refresh() {
  if (!tray) return;
  const on = wallpaper.isOn();
  const mode = settings.get('winMode');
  const lang = settings.get('language');
  const items = [
    { label: t('tray.wallpaper'), type: 'checkbox', checked: on, click: i => setWallpaper(i.checked) },
    { label: t('tray.playPause'), enabled: on, click: () => player.control('toggle') },
    { label: t('tray.next'), enabled: on, click: () => player.control('next') },
    { type: 'separator' },
    { label: t('tray.settings'), click: openSettings }
  ];
  if (process.platform === 'win32') {
    items.push({ label: t('tray.mode'), submenu: [
      { label: t('tray.modeAuto'), type: 'radio', checked: mode !== 'bottom', click: () => setWinMode('auto') },
      { label: t('tray.modeBottom'), type: 'radio', checked: mode === 'bottom', click: () => setWinMode('bottom') }
    ] });
  }
  items.push(
    { label: t('tray.language'), submenu: [
      { label: t('tray.langAuto'), type: 'radio', checked: lang !== 'en' && lang !== 'ru', click: () => setLanguage('auto') },
      { label: 'English', type: 'radio', checked: lang === 'en', click: () => setLanguage('en') },
      { label: 'Русский', type: 'radio', checked: lang === 'ru', click: () => setLanguage('ru') }
    ] },
    {
      label: app.isPackaged ? t('tray.loginItem') : t('tray.loginItemDev'),
      type: 'checkbox',
      enabled: app.isPackaged,
      checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
      click: i => setLoginItem(i.checked)
    },
    { label: t('tray.openLog'), click: () => shell.openPath(log.file) },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() }
  );
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function create() {
  tray = new Tray(adapter.trayIcon);
  tray.setToolTip('Lyric Wall');
  // On Windows the menu opens only on right click by default; open it on left click too.
  if (process.platform === 'win32') tray.on('click', () => tray.popUpContextMenu());
  refresh();
}

module.exports = { create, refresh };
