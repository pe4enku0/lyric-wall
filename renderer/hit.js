/* Click layer: the main process watches the cursor and lets this window take the mouse only over a button
   (and during a drag that started on one). Mouse events are matched to the button and reported:
   press / drag / release / click with fx (0 = left edge, 1 = right edge of the button), wheel with dy
   (> 0 = wheel away from you, 1 = one wheel notch). */
(() => {
  const api = window.lyricWall;
  let rects = [];
  api.onHitRects(items => { rects = items; });
  api.onHitCursor(id => { document.body.style.cursor = id ? 'pointer' : ''; });

  const at = (x, y) => rects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  const fx = (r, e) => (e.clientX - r.x) / r.w;

  // The button the mouse went down on; moves are sent at most 30 times a second.
  let down = null, dragTimer = 0, lastMove = null;
  addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const r = at(e.clientX, e.clientY);
    // id null: the press reached this window outside the buttons (logged by the main process).
    api.hitEvent({ type: 'press', id: r ? r.id : null, fx: r ? fx(r, e) : 0 });
    if (!r) return;
    down = r;
    document.documentElement.setPointerCapture(e.pointerId); // keep getting moves outside the window
  });
  addEventListener('pointermove', e => {
    if (!down) return;
    lastMove = e;
    if (dragTimer) return;
    dragTimer = setTimeout(() => {
      dragTimer = 0;
      if (down && lastMove) api.hitEvent({ type: 'drag', id: down.id, fx: fx(down, lastMove) });
    }, 33);
  });
  const release = e => {
    if (!down) return;
    clearTimeout(dragTimer); dragTimer = 0;
    api.hitEvent({ type: 'release', id: down.id, fx: fx(down, e) });
    down = null;
  };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  addEventListener('click', e => {
    const r = at(e.clientX, e.clientY);
    if (r) api.hitEvent({ type: 'click', id: r.id, fx: fx(r, e) });
  });
  addEventListener('wheel', e => {
    const r = at(e.clientX, e.clientY);
    if (!r || !e.deltaY) return;
    // Pixels (100 per notch on Windows) or lines (3 per notch).
    api.hitEvent({ type: 'wheel', id: r.id, dy: -e.deltaY / (e.deltaMode === 1 ? 3 : 100) });
  }, { passive: true });
})();
