// Menu bar icon (Mac) and tray icon (Windows) with the control menu.
const { app, Tray, Menu } = require('electron');
const adapter = require('../adapters');
const actions = require('./actions');
const control = require('./control');
const settingsWindow = require('./settings-window');
const player = require('./player');
const { t } = require('./i18n');

let tray = null;

function refresh() {
  if (!tray) return;
  const s = actions.state();
  const items = [
    { label: t('tray.open'), click: control.show },
    { type: 'separator' },
    { label: t('tray.wallpaper'), type: 'checkbox', checked: s.wallpaperEnabled, click: i => actions.set('wallpaperEnabled', i.checked) },
    { label: t('tray.playPause'), enabled: s.wallpaperEnabled, click: () => player.control('toggle') },
    { label: t('tray.next'), enabled: s.wallpaperEnabled, click: () => player.control('next') },
    { type: 'separator' },
    { label: t('tray.settings'), click: settingsWindow.show }
  ];
  if (process.platform === 'win32') {
    items.push({ label: t('tray.mode'), submenu: [
      { label: t('tray.modeAuto'), type: 'radio', checked: s.winMode !== 'bottom', click: () => actions.set('winMode', 'auto') },
      { label: t('tray.modeBottom'), type: 'radio', checked: s.winMode === 'bottom', click: () => actions.set('winMode', 'bottom') }
    ] });
  }
  items.push(
    { label: t('tray.language'), submenu: [
      { label: t('tray.langAuto'), type: 'radio', checked: s.language !== 'en' && s.language !== 'ru', click: () => actions.set('language', 'auto') },
      { label: 'English', type: 'radio', checked: s.language === 'en', click: () => actions.set('language', 'en') },
      { label: 'Русский', type: 'radio', checked: s.language === 'ru', click: () => actions.set('language', 'ru') }
    ] },
    {
      label: s.loginItem.available ? t('tray.loginItem') : t('tray.loginItemDev'),
      type: 'checkbox',
      enabled: s.loginItem.available,
      checked: s.loginItem.enabled,
      click: i => actions.set('loginItem', i.checked)
    },
    { label: t('tray.openLog'), click: actions.openLog },
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
  actions.onChange(refresh);
  refresh();
}

module.exports = { create, refresh };
