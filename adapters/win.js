// Всё, что относится только к Windows. На Mac этот файл не загружается.
// Окно-обои встраивается за иконки рабочего стола (приём WorkerW, как у Wallpaper Engine / Lively).
// Шаг 4: Windows.Media.Control.
const { screen } = require('electron');
const path = require('path');
const log = require('../main/log');

const GWL_STYLE = -16, GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000, WS_POPUP = 0x80000000;
const WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000, WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
const SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
const HWND_BOTTOM = 1, GW_HWNDLAST = 1, GW_HWNDPREV = 3, GW_CHILD = 5, GA_PARENT = 1;
const SW_HIDE = 0, SW_SHOWNA = 8, LWA_ALPHA = 0x2, SMTO_NORMAL = 0;

// Функции Windows (user32.dll) через koffi. Загружаются при первом обращении.
let u = null;
function user32() {
  if (u) return u;
  const koffi = require('koffi');
  const lib = koffi.load('user32.dll');
  koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const fn = sig => lib.func(sig);
  u = {
    FindWindowW: fn('intptr_t __stdcall FindWindowW(str16 cls, str16 name)'),
    FindWindowExW: fn('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 cls, str16 name)'),
    SendMessageTimeoutW: fn('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wp, intptr_t lp, uint32_t flags, uint32_t timeout, uintptr_t *result)'),
    SetParent: fn('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
    GetAncestor: fn('intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32_t flags)'),
    GetWindow: fn('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)'),
    SetWindowPos: fn('int __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
    GetWindowLongPtrW: fn('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
    SetWindowLongPtrW: fn('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
    SetLayeredWindowAttributes: fn('int __stdcall SetLayeredWindowAttributes(intptr_t hwnd, uint32_t key, uint8_t alpha, uint32_t flags)'),
    GetWindowRect: fn('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ RECT *rect)'),
    ShowWindow: fn('int __stdcall ShowWindow(intptr_t hwnd, int cmd)'),
    IsWindow: fn('int __stdcall IsWindow(intptr_t hwnd)')
  };
  return u;
}

const hex = h => '0x' + Number(h).toString(16);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hwndOf = win => Number(win.getNativeWindowHandle().readBigUInt64LE(0));

// Текущее состояние встраивания: режим и окна Проводника, к которым прикреплены.
let state = { mode: null, parent: 0, workerw: 0 };

// Ищет окна рабочего стола. Progman — сам рабочий стол, SHELLDLL_DefView — слой с иконками,
// WorkerW — слой, в котором Windows рисует обои. Наше окно должно оказаться между ними.
function findDesktop() {
  const w = user32();
  const progman = w.FindWindowW('Progman', null);
  if (!progman) throw new Error('окно Progman не найдено (Проводник не запущен?)');
  // Windows 11 24H2 и новее: «поднятый» рабочий стол, все слои внутри Progman.
  const raised = (Number(w.GetWindowLongPtrW(progman, GWL_EXSTYLE)) & WS_EX_NOREDIRECTIONBITMAP) !== 0;
  // Сообщение 0x052C просит Проводник создать WorkerW за иконками (если его ещё нет).
  w.SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, SMTO_NORMAL, 1000, null);

  let host = 0;
  let defview = w.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
  if (defview) host = progman;
  else {
    let cur = 0;
    while ((cur = w.FindWindowExW(0, cur, 'WorkerW', null))) {
      defview = w.FindWindowExW(cur, 0, 'SHELLDLL_DefView', null);
      if (defview) { host = cur; break; }
    }
  }
  const workerw = raised
    ? w.FindWindowExW(progman, 0, 'WorkerW', null)
    : (host ? w.FindWindowExW(0, host, 'WorkerW', null) : 0);
  return { progman, raised, host, defview, workerw };
}

function physBounds(display) {
  return screen.dipToScreenRect(null, display.bounds);
}

// Ставит окно на место экрана внутри родителя (координаты родителя считаются от его угла).
function placeInParent(hwnd, parent, display) {
  const w = user32(), r = {}, b = physBounds(display);
  w.GetWindowRect(parent, r);
  w.SetWindowPos(hwnd, 0, b.x - r.left, b.y - r.top, b.width, b.height, SWP_NOZORDER | SWP_NOACTIVATE);
}

function embed(win, hwnd, d, display) {
  const w = user32();
  let parent;
  if (d.raised) {
    // Windows 11 24H2: своё дочернее окно Progman под иконками и над WorkerW с системными обоями.
    parent = d.progman;
    win.setIgnoreMouseEvents(true);
    w.SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
    const style = Number(w.GetWindowLongPtrW(hwnd, GWL_STYLE));
    w.SetWindowLongPtrW(hwnd, GWL_STYLE, (style | WS_CHILD) & ~WS_POPUP);
    w.SetParent(hwnd, parent);
    w.SetWindowPos(hwnd, d.defview, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    const last = w.GetWindow(w.GetWindow(d.progman, GW_CHILD), GW_HWNDLAST);
    if (Number(last) !== Number(d.workerw)) {
      log.info('Обои: поправляю порядок WorkerW');
      w.SetWindowPos(d.workerw, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
  } else {
    // Классический способ: окно становится дочерним для WorkerW за иконками.
    parent = d.workerw;
    w.ShowWindow(d.workerw, SW_SHOWNA);
    w.SetParent(hwnd, parent);
  }
  if (Number(w.GetAncestor(hwnd, GA_PARENT)) !== Number(parent)) throw new Error('SetParent не сработал');
  placeInParent(hwnd, parent, display);
  win.showInactive();
  state = { mode: d.raised ? 'workerw-24h2' : 'workerw', parent, workerw: d.workerw };
}

// Запасной режим: обычное окно, которое стоит прямо над рабочим столом и под всеми окнами.
// Иконки рабочего стола в этом режиме закрыты.
function bottom(win, hwnd, display) {
  const w = user32();
  win.setIgnoreMouseEvents(true);
  const ex = Number(w.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  w.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
  win.showInactive();
  state = { mode: 'bottom', parent: 0, workerw: 0 };
  placeBottom(hwnd, display);
}

function placeBottom(hwnd, display) {
  const w = user32(), b = physBounds(display);
  let desk = w.FindWindowW('Progman', null), cur = 0;
  while ((cur = w.FindWindowExW(0, cur, 'WorkerW', null))) {
    if (w.FindWindowExW(cur, 0, 'SHELLDLL_DefView', null)) { desk = cur; break; }
  }
  // SetWindowPos ставит окно сразу ПОД указанным; берём окно, которое лежит прямо над рабочим столом.
  const above = desk ? Number(w.GetWindow(desk, GW_HWNDPREV)) : 0;
  const after = above && above !== hwnd ? above : HWND_BOTTOM;
  w.SetWindowPos(hwnd, after, b.x, b.y, b.width, b.height, SWP_NOACTIVATE);
}

module.exports = {
  name: 'win',
  deviceLabel: () => 'Компьютер',
  trayIcon: path.join(__dirname, '..', 'assets', 'tray.ico'),

  init() {},

  wallpaperWindowOptions: display => ({
    ...display.bounds,
    thickFrame: false,
    minimizable: false,
    maximizable: false
  }),

  async attachWallpaper(win, display, settings) {
    let hwnd;
    try {
      user32();
      hwnd = hwndOf(win);
    } catch (e) {
      // Без koffi нельзя ни встроить окно, ни опустить его вниз. Не показываем, чтобы не закрыть экран.
      log.error('Обои: не загрузились функции Windows (koffi):', e.message);
      return 'none';
    }
    if (settings.get('winMode') !== 'bottom') {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const d = findDesktop();
          log.info(`Обои: попытка ${attempt}: Progman=${hex(d.progman)} 24H2=${d.raised} иконки=${hex(d.defview)} WorkerW=${hex(d.workerw)}`);
          if (d.defview && d.workerw) {
            embed(win, hwnd, d, display);
            log.info(`Обои: встроено за иконки (${state.mode}), родитель ${hex(state.parent)}`);
            return state.mode;
          }
        } catch (e) {
          log.error('Обои: ошибка встраивания:', e.message);
        }
        await sleep(700);
      }
      log.warn('Обои: встроить за иконки не вышло, включаю запасной режим «под всеми окнами»');
    }
    try {
      bottom(win, hwnd, display);
      log.info('Обои: режим «под всеми окнами»');
      return 'bottom';
    } catch (e) {
      log.error('Обои: запасной режим тоже не сработал:', e.message);
      return 'none';
    }
  },

  placeWallpaper(win, display) {
    try {
      const hwnd = hwndOf(win);
      if (state.mode === 'bottom') placeBottom(hwnd, display);
      else if (state.parent) placeInParent(hwnd, state.parent, display);
    } catch (e) {
      log.error('Обои: не удалось подвинуть окно под новый размер экрана:', e.message);
    }
  },

  detachWallpaper(win) {
    try {
      if (win && !win.isDestroyed()) win.hide();
      // Прячем WorkerW, чтобы Windows снова показала обычные обои, а не последний кадр нашего окна.
      if (state.mode === 'workerw' && state.workerw && user32().IsWindow(state.workerw)) {
        user32().ShowWindow(state.workerw, SW_HIDE);
        log.info('Обои: WorkerW спрятан, системные обои снова видны');
      }
    } catch (e) {
      log.error('Обои: ошибка при отключении:', e.message);
    }
    state = { mode: null, parent: 0, workerw: 0 };
  }
};
