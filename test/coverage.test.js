// npm test: the geometry behind pausing the wallpaper when windows cover it (main/coverage.js).
const test = require('node:test');
const assert = require('node:assert');
const { coveredFraction, THRESHOLD } = require('../main/coverage');

// A 1920×1080 screen with a 48 px taskbar at the bottom: the work area.
const work = { x: 0, y: 0, width: 1920, height: 1032 };
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 0.02, `${value} is not close to ${expected}`);

test('no windows: nothing is covered', () => {
  assert.strictEqual(coveredFraction(work, []), 0);
  assert.strictEqual(coveredFraction(work, undefined), 0);
});

test('a window exactly on the work area covers all of it', () => {
  assert.strictEqual(coveredFraction(work, [{ ...work }]), 1);
});

test('a maximized window (a bit bigger than the work area) covers all of it', () => {
  assert.strictEqual(coveredFraction(work, [{ x: -8, y: -8, width: 1936, height: 1048 }]), 1);
});

test('two windows snapped side by side cover all of it', () => {
  const left = { x: 0, y: 0, width: 960, height: 1032 }, right = { x: 960, y: 0, width: 960, height: 1032 };
  assert.strictEqual(coveredFraction(work, [left, right]), 1);
});

test('overlapping windows are counted once', () => {
  const a = { x: 0, y: 0, width: 1200, height: 1032 }, b = { x: 600, y: 0, width: 600, height: 1032 };
  near(coveredFraction(work, [a, b]), 1200 / 1920);
});

test('a window partly off-screen counts only for its visible part', () => {
  near(coveredFraction(work, [{ x: -500, y: 0, width: 1000, height: 1032 }]), 500 / 1920);
  // Moved away to show the desktop: nothing left on the screen.
  assert.strictEqual(coveredFraction(work, [{ x: -1900, y: -1020, width: 1900, height: 1000 }]), 0);
});

test('a window on another monitor counts only where it overlaps the work area', () => {
  assert.strictEqual(coveredFraction(work, [{ x: 1920, y: 0, width: 2560, height: 1440 }]), 0);
  near(coveredFraction(work, [{ x: 1440, y: 0, width: 1920, height: 1032 }]), 480 / 1920);
});

test('the work area does not have to start at 0,0', () => {
  // macOS: a 1440×900 screen with the menu bar (25 pt) and the Dock (70 pt) at the bottom.
  const mac = { x: 0, y: 25, width: 1440, height: 805 };
  assert.strictEqual(coveredFraction(mac, [{ x: 0, y: 25, width: 1440, height: 805 }]), 1);
  // A second screen on the left of the main one (negative coordinates).
  const left = { x: -1920, y: 0, width: 1920, height: 1040 };
  assert.strictEqual(coveredFraction(left, [{ x: -1920, y: 0, width: 1920, height: 1040 }]), 1);
});

test('94% of the width is not covered, 96% is', () => {
  const at = f => coveredFraction(work, [{ x: 0, y: 0, width: 1920 * f, height: 1032 }]);
  assert.ok(at(0.94) < THRESHOLD, `94% gave ${at(0.94)}`);
  assert.ok(at(0.96) >= THRESHOLD, `96% gave ${at(0.96)}`);
});

test('zero-size windows and empty areas give 0', () => {
  assert.strictEqual(coveredFraction(work, [{ x: 0, y: 0, width: 0, height: 1032 }]), 0);
  assert.strictEqual(coveredFraction({ x: 0, y: 0, width: 0, height: 0 }, [{ ...work }]), 0);
});
