/* Helpers shared by the wallpaper, the control window and the settings window. */
window.LW = {
  // Background presets from mockup.html. hue/sat tint the gradient behind the glass
  // (null = taken from the track cover); img: which picture is shown; sw: the swatch in the settings.
  BACKGROUNDS: [
    { id: 'color', hue: 225, sat: 1, sw: '' }, // a plain colour (look.bgColor), the default theme only
    { id: 'theme', hue: 225, sat: 1, sw: '' }, // the theme's own background (swatch drawn from the theme)
    { id: 'dusk', img: 'dusk', hue: 330, sat: 1, sw: 'linear-gradient(180deg, #8a8a98, #e3b08a 70%, #2a2226)' },
    { id: 'photo', img: 'photo', hue: 225, sat: 1, sw: 'linear-gradient(135deg, #6d7a8f, #b79a8c)' },
    { id: 'cover', img: 'cover', hue: null, sat: 1, sw: 'radial-gradient(circle at 35% 35%, #ddd, #555 60%, #222)' },
    { id: 'auto', hue: null, sat: 1, sw: 'conic-gradient(#8a5a7a, #4f6a9a, #6a8a6a, #9a7a4a, #8a5a7a)' },
    { id: 'lilac', hue: 225, sat: 1, sw: 'linear-gradient(160deg, #4a4550, #5a2a38)' },
    { id: 'graphite', hue: 225, sat: .12, sw: 'linear-gradient(160deg, #46454a, #262529)' },
    { id: 'night', hue: 95, sat: 1.4, sw: 'linear-gradient(160deg, #3c4450, #1f2f52)' },
    { id: 'pine', hue: 30, sat: 1.2, sw: 'linear-gradient(160deg, #3f4844, #1f4a36)' },
    { id: 'sunset', hue: 265, sat: 1.5, sw: 'linear-gradient(160deg, #4d4545, #6a3420)' }
  ],
  THEMES: ['default', 'dusty', 'pastel', 'sakura', 'rain', 'neon', 'amoled', 'vinyl', 'matcha', 'chrome'],
  // Swatches of the "Color" background.
  COLORS: [['ink', '#0C0B10'], ['midnight', '#0E1622'], ['plum', '#1A0F1F'], ['pine', '#0F1A16'], ['umber', '#1C1712'], ['graphite', '#202024']],
  // Backgrounds offered with a theme (the same rules as main/appearance.js).
  backgroundsFor(theme) {
    const dustyOnly = ['dusk', 'auto', 'lilac', 'graphite', 'night', 'pine', 'sunset'];
    if (theme === 'default') return LW.BACKGROUNDS.filter(b => ['color', 'photo', 'cover'].includes(b.id));
    return LW.BACKGROUNDS.filter(b => b.id !== 'color' && (theme === 'dusty' ? b.id !== 'theme' : !dustyOnly.includes(b.id)));
  },

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
