// How much of the wallpaper other windows cover (main/power.js pauses it when almost nothing is visible).
// Pure geometry, no Electron: the area is sampled on a 64×36 grid, a cell counts as covered when its center
// is inside any window. Cheap (a few thousand comparisons) and overlapping windows are counted once.
// Rectangles are { x, y, width, height }, all in the same coordinates as the area.

const COLS = 64, ROWS = 36;
// The wallpaper counts as covered from this fraction on.
const THRESHOLD = 0.95;

// Fraction 0..1 of `area` that the rectangles cover together.
function coveredFraction(area, rects) {
  if (!area || !(area.width > 0) || !(area.height > 0)) return 0;
  const ax1 = area.x + area.width, ay1 = area.y + area.height;
  // Only the parts inside the area matter (windows on other screens, partly off-screen windows).
  const inside = [];
  for (const r of rects || []) {
    if (!r || !(r.width > 0) || !(r.height > 0)) continue;
    const x0 = Math.max(r.x, area.x), y0 = Math.max(r.y, area.y);
    const x1 = Math.min(r.x + r.width, ax1), y1 = Math.min(r.y + r.height, ay1);
    if (x1 > x0 && y1 > y0) inside.push([x0, y0, x1, y1]);
  }
  if (!inside.length) return 0;
  const cw = area.width / COLS, ch = area.height / ROWS;
  let covered = 0;
  for (let j = 0; j < ROWS; j++) {
    const y = area.y + (j + 0.5) * ch;
    const row = inside.filter(r => y >= r[1] && y < r[3]);
    if (!row.length) continue;
    for (let i = 0; i < COLS; i++) {
      const x = area.x + (i + 0.5) * cw;
      for (const r of row) if (x >= r[0] && x < r[2]) { covered++; break; }
    }
  }
  return covered / (COLS * ROWS);
}

module.exports = { coveredFraction, THRESHOLD };
