/* Helpers shared by the wallpaper and the control window. */
window.LW = {
  // Loads the UI language and fills every element that has data-i18n="key".
  async initI18n() {
    const info = await window.lyricWall.info();
    const t = key => (key in info.strings ? info.strings[key] : key);
    document.documentElement.lang = info.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    return { info, t };
  },

  fmt(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  },

  // Film grain texture as a data URL.
  grain() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    return c.toDataURL();
  },

  // Smooth playback position between player updates: the last known position plus the time since then.
  // Small differences are corrected gently so the progress bar and the text never jump back and forth.
  createClock() {
    let base = 0, at = Date.now(), playing = false;
    return {
      get playing() { return playing; },
      now() { return Math.max(0, base + (playing ? (Date.now() - at) / 1000 : 0)); },
      set(pos, on) { base = pos; at = Date.now(); playing = on; },
      toggle() { this.set(this.now(), !playing); },
      // jump: new track; also jumps on pause/play and on a seek (difference over 1.5 s).
      update(snap, jump) {
        const target = (snap.position || 0) + (snap.playing ? (Date.now() - (snap.at || Date.now())) / 1000 : 0);
        const cur = this.now();
        const hard = jump || !snap.playing || !playing || Math.abs(target - cur) > 1.5;
        this.set(hard ? target : cur + (target - cur) * 0.25, !!snap.playing);
      }
    };
  }
};
