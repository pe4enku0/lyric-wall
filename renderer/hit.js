/* Click layer: the main process watches the cursor and lets this window take clicks only over a button.
   Here a click is matched to the button under it and reported. */
(() => {
  const api = window.lyricWall;
  let rects = [];
  api.onHitRects(items => { rects = items; });
  api.onHitCursor(id => { document.body.style.cursor = id ? 'pointer' : ''; });

  const at = (x, y) => rects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  // For the log: the press reached this window (even if no click follows).
  addEventListener('mousedown', e => {
    const r = at(e.clientX, e.clientY);
    api.hitEvent({ type: 'down', id: r ? r.id : null });
  });
  addEventListener('click', e => {
    const r = at(e.clientX, e.clientY);
    if (r) api.hitEvent({ type: 'click', id: r.id, fx: (e.clientX - r.x) / r.w });
  });
})();
