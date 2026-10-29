// Иконка в строке меню (Mac) и в трее (Windows) с меню управления.
const { app, Tray, Menu, shell, dialog } = require('electron');
const adapter = require('../adapters');
const wallpaper = require('./wallpaper');
const settings = require('./settings');
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
  log.info('Режим обоев изменён на', mode);
  if (wallpaper.isOn()) { wallpaper.destroy(); wallpaper.create(); }
  refresh();
}

function setLoginItem(on) {
  app.setLoginItemSettings({ openAtLogin: on });
  const s = app.getLoginItemSettings();
  log.info('Запуск при входе:', on ? 'включаю' : 'выключаю', '→ сейчас', s.openAtLogin, s.status || '');
  if (on && s.status === 'requires-approval') {
    dialog.showMessageBox({
      message: 'Нужно разрешение macOS',
      detail: 'Открой Системные настройки → Основные → Объекты входа и включи Lyric Wall.'
    });
  }
  refresh();
}

function openSettings() {
  if (process.platform === 'darwin') app.focus({ steal: true });
  dialog.showMessageBox({ message: 'Настройки', detail: 'Окно настроек появится на шаге 6.' });
}

function refresh() {
  if (!tray) return;
  const on = wallpaper.isOn();
  const mode = settings.get('winMode');
  const items = [
    { label: 'Обои', type: 'checkbox', checked: on, click: i => setWallpaper(i.checked) },
    { label: 'Пауза / продолжить', enabled: on, click: () => wallpaper.send('player:command', 'toggle') },
    { label: 'Следующий трек', enabled: on, click: () => wallpaper.send('player:command', 'next') },
    { type: 'separator' },
    { label: 'Настройки…', click: openSettings }
  ];
  if (process.platform === 'win32') {
    items.push({ label: 'Режим обоев', submenu: [
      { label: 'За иконками (как Wallpaper Engine)', type: 'radio', checked: mode !== 'bottom', click: () => setWinMode('auto') },
      { label: 'Под всеми окнами (запасной)', type: 'radio', checked: mode === 'bottom', click: () => setWinMode('bottom') }
    ] });
  }
  items.push(
    {
      label: app.isPackaged ? 'Запускать при входе' : 'Запускать при входе (в установленной версии)',
      type: 'checkbox',
      enabled: app.isPackaged,
      checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
      click: i => setLoginItem(i.checked)
    },
    { label: 'Открыть лог', click: () => shell.openPath(log.file) },
    { type: 'separator' },
    { label: 'Выйти', click: () => app.quit() }
  );
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function create() {
  tray = new Tray(adapter.trayIcon);
  tray.setToolTip('Lyric Wall');
  // На Windows меню по умолчанию открывается только правой кнопкой; открываем и по левой.
  if (process.platform === 'win32') tray.on('click', () => tray.popUpContextMenu());
  refresh();
}

module.exports = { create, refresh };
