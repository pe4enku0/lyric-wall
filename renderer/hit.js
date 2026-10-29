/* Click layer: finds which wallpaper button is under the mouse and reports hovers and clicks.
   The main process lets this window take clicks only while the pointer is over a button. */
(() => {
  const api = window.lyricWall;
  let rects = [], over = null;
  api.onHitRects(items => { rects = items; });

  const at = (x, y) => rects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  function hover(id) {
    if (id === over) return;
    over = id;
    document.body.style.cursor = id ? 'pointer' : '';
    api.hitEvent({ type: 'hover', id });
  }

  addEventListener('mousemove', e => { const r = at(e.clientX, e.clientY); hover(r ? r.id : null); });
  addEventListener('mouseleave', () => hover(null));
  addEventListener('click', e => {
    const r = at(e.clientX, e.clientY);
    if (r) api.hitEvent({ type: 'click', id: r.id, fx: (e.clientX - r.x) / r.w });
  });
})();
