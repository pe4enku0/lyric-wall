// Всё, что относится только к macOS.
// Шаг 4: Spotify через AppleScript (osascript).
const { app } = require('electron');
const path = require('path');
const log = require('../main/log');

module.exports = {
  name: 'mac',
  deviceLabel: () => 'MacBook',
  trayIcon: path.join(__dirname, '..', 'assets', 'trayTemplate.png'),

  init() {
    // Не показываем иконку в Dock: приложение живёт только в строке меню.
    if (app.dock) app.dock.hide();
  },

  // type: 'desktop' кладёт окно на уровень рабочего стола: под всеми окнами и под иконками Finder.
  wallpaperWindowOptions: display => ({
    type: 'desktop',
    ...display.bounds,
    enableLargerThanScreen: true,
    roundedCorners: false
  }),

  attachWallpaper(win, display) {
    win.setVisibleOnAllWorkspaces(true);
    win.setIgnoreMouseEvents(true);
    win.setBounds(display.bounds);
    win.showInactive();
    log.info('Обои: окно на уровне рабочего стола, экран', display.bounds);
    return 'desktop';
  },

  placeWallpaper(win, display) {
    win.setBounds(display.bounds);
  },

  detachWallpaper() {}
};
