/* Icons of the wallpaper in two styles: macOS (filled, like SF Symbols) and Windows 11 (outlined, like Fluent:
   1.5 px lines with round ends). Every icon is drawn on a 24×24 grid in currentColor, so CSS sets the colour.
   LW.icon(name, size) gives the SVG for the current platform (LW.platform, set by app.js). */
(() => {
  const MAC = {
    note: '<path fill="currentColor" d="M9 18a3 3 0 1 1-2-2.8V4.6a1 1 0 0 1 .8-1l10-1.9A1 1 0 0 1 19 2.7V15a3 3 0 1 1-2-2.8V6.3l-8 1.5Z"/>',
    noteOutline: '<path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M9 18a3 3 0 1 1-2-2.8V4.6l12-2.3V15a3 3 0 1 1-2-2.8V6.6L9 8"/>',
    star: '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m12 3.2 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9L3.5 9.4l5.9-.8Z"/>',
    starOn: '<path fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m12 3.2 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9L3.5 9.4l5.9-.8Z"/>',
    play: '<path fill="currentColor" d="M7 5.2v13.6a1.2 1.2 0 0 0 1.8 1l11.3-6.8a1.2 1.2 0 0 0 0-2L8.8 4.2A1.2 1.2 0 0 0 7 5.2Z"/>',
    pause: '<rect fill="currentColor" x="6" y="4.5" width="4.2" height="15" rx="1.3"/><rect fill="currentColor" x="13.8" y="4.5" width="4.2" height="15" rx="1.3"/>',
    next: '<path fill="currentColor" d="M2.5 7v10a1 1 0 0 0 1.6.8l7.4-5a1 1 0 0 0 0-1.6l-7.4-5A1 1 0 0 0 2.5 7Zm10 0v10a1 1 0 0 0 1.6.8l7.4-5a1 1 0 0 0 0-1.6l-7.4-5a1 1 0 0 0-1.6.8Z"/>',
    prev: '<path fill="currentColor" d="M21.5 7v10a1 1 0 0 1-1.6.8l-7.4-5a1 1 0 0 1 0-1.6l7.4-5a1 1 0 0 1 1.6.8Zm-10 0v10a1 1 0 0 1-1.6.8l-7.4-5a1 1 0 0 1 0-1.6l7.4-5a1 1 0 0 1 1.6.8Z"/>',
    more: '<circle fill="currentColor" cx="5" cy="12" r="2"/><circle fill="currentColor" cx="12" cy="12" r="2"/><circle fill="currentColor" cx="19" cy="12" r="2"/>',
    volume: '<path fill="currentColor" d="M3 9.2v5.6c0 .6.4 1 1 1h3l4.4 3.7c.6.5 1.6.1 1.6-.8V5.3c0-.9-1-1.3-1.6-.8L7 8.2H4c-.6 0-1 .4-1 1Z"/>' +
      '<path class="w" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M16 8.5a5 5 0 0 1 0 7M18.8 6a8.5 8.5 0 0 1 0 12"/>' +
      '<path class="x" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="m16.5 9.5 5 5m0-5-5 5"/>',
    lyrics: '<path fill="currentColor" d="M4.5 3h15A2.5 2.5 0 0 1 22 5.5v10a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.5c-.6.5-1.4 0-1.4-.7V18A2.5 2.5 0 0 1 2 15.5v-10A2.5 2.5 0 0 1 4.5 3Z"/>' +
      '<path fill="none" stroke="var(--lyb-ink, #000)" stroke-width="1.8" stroke-linecap="round" d="M7 8.5h10M7 12.5h6"/>',
    lyricsOff: '<path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M4.5 3.5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-4.5 3.4V17.5h-1a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z"/>' +
      '<path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M7 8.5h10M7 12.5h6M3 2l18 20"/>',
    device: '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M6.5 17H4.5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-2"/>' +
      '<path fill="currentColor" d="M11.2 13.4a1 1 0 0 1 1.6 0l4.2 5.4a1 1 0 0 1-.8 1.6H7.8a1 1 0 0 1-.8-1.6Z"/>',
    caret: '',
    chevron: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/>',
    bars: '<rect fill="currentColor" x="2.5" y="9" width="3.5" height="10" rx="1.4"/><rect fill="currentColor" x="10.2" y="4" width="3.5" height="15" rx="1.4"/><rect fill="currentColor" x="18" y="12" width="3.5" height="7" rx="1.4"/>',
    queue: '<rect fill="currentColor" x="3" y="5" width="18" height="2.4" rx="1.2"/><rect fill="currentColor" x="3" y="10.8" width="18" height="2.4" rx="1.2"/><rect fill="currentColor" x="3" y="16.6" width="11" height="2.4" rx="1.2"/>',
    shuffle: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21m0 0-2.5-2.5M21 17l-2.5 2.5M3 17h3.5c1.3 0 2.2-.4 3-1.2M21 7h-3.5c-1.3 0-2.2.4-3 1.2M21 7l-2.5-2.5M21 7l-2.5 2.5"/>'
  };

  // Fluent-like outlines: one stroke style for everything.
  const S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  const WIN = {
    note: `<path ${S} d="M9 18a3 3 0 1 1-2-2.8V4.6l12-2.3V15a3 3 0 1 1-2-2.8V6.6L9 8"/>`,
    noteOutline: `<path ${S} d="M9 18a3 3 0 1 1-2-2.8V4.6l12-2.3V15a3 3 0 1 1-2-2.8V6.6L9 8"/>`,
    star: `<path ${S} d="m12 3.2 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9L3.5 9.4l5.9-.8Z"/>`,
    starOn: '<path fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="m12 3.2 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9L3.5 9.4l5.9-.8Z"/>',
    play: `<path ${S} d="M7.5 5.4v13.2a1 1 0 0 0 1.5.9l10.6-6.6a1 1 0 0 0 0-1.8L9 4.5a1 1 0 0 0-1.5.9Z"/>`,
    pause: `<rect ${S} x="6.5" y="4.5" width="3.5" height="15" rx="1"/><rect ${S} x="14" y="4.5" width="3.5" height="15" rx="1"/>`,
    next: `<path ${S} d="M5 5.6v12.8a.8.8 0 0 0 1.3.6l8.9-6.4a.8.8 0 0 0 0-1.2L6.3 5A.8.8 0 0 0 5 5.6ZM19 5v14"/>`,
    prev: `<path ${S} d="M19 5.6v12.8a.8.8 0 0 1-1.3.6l-8.9-6.4a.8.8 0 0 1 0-1.2L17.7 5a.8.8 0 0 1 1.3.6ZM5 5v14"/>`,
    more: '<circle fill="currentColor" cx="5.5" cy="12" r="1.4"/><circle fill="currentColor" cx="12" cy="12" r="1.4"/><circle fill="currentColor" cx="18.5" cy="12" r="1.4"/>',
    volume: `<path ${S} d="M3.5 9.5v5c0 .6.4 1 1 1h2.8l4.4 3.7c.5.4 1.3.1 1.3-.6V5.4c0-.7-.8-1-1.3-.6L7.3 8.5H4.5c-.6 0-1 .4-1 1Z"/>` +
      `<path class="w" ${S} d="M16 9a4.5 4.5 0 0 1 0 6M18.6 6.5a8 8 0 0 1 0 11"/><path class="x" ${S} d="m16.5 9.5 5 5m0-5-5 5"/>`,
    lyrics: `<path ${S} d="M4.5 3.5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-4.5 3.4V17.5h-1a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z"/><path ${S} d="M7 8.5h10M7 12.5h6"/>`,
    lyricsOff: `<path ${S} d="M4.5 3.5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-4.5 3.4V17.5h-1a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z"/><path ${S} d="M7 8.5h10M7 12.5h6M3 2l18 20"/>`,
    device: `<path ${S} d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z"/><circle ${S} cx="12" cy="14" r="3"/><circle fill="currentColor" cx="12" cy="7.5" r="1"/>`,
    caret: `<path ${S} d="m7 10 5 5 5-5"/>`,
    bars: `<path ${S} d="M4 19V10M9.3 19V5M14.7 19v-7M20 19V8"/>`,
    queue: `<path ${S} d="M3.5 6h17M3.5 12h17M3.5 18h10"/>`,
    shuffle: `<path ${S} d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21m0 0-2.5-2.5M21 17l-2.5 2.5M3 17h3.5c1.3 0 2.2-.4 3-1.2M21 7h-3.5c-1.3 0-2.2.4-3 1.2M21 7l-2.5-2.5M21 7l-2.5 2.5"/>`,
    // Settings rows (Windows shows an icon on every option card).
    layout: `<rect ${S} x="3" y="4" width="18" height="16" rx="2"/><path ${S} d="M10 4v16M10 12h11"/>`,
    image: `<rect ${S} x="3" y="4" width="18" height="16" rx="2"/><circle ${S} cx="9" cy="9.5" r="1.8"/><path ${S} d="m3.5 17 5-5 4 4 2.5-2.5 5.5 5.5"/>`,
    blur: `<circle ${S} cx="12" cy="12" r="8.5"/><path ${S} d="M12 3.5v17M12 7.5h6.5M12 11.5h8.5M12 15.5h7.5"/>`,
    sun: `<circle ${S} cx="12" cy="12" r="4"/><path ${S} d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>`,
    snow: `<path ${S} d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2"/>`,
    speed: `<path ${S} d="M4.5 18a8.5 8.5 0 1 1 15 0M12 13.5l4-4"/><circle ${S} cx="12" cy="14" r="1.2"/>`,
    amount: `<circle ${S} cx="6" cy="7" r="1.5"/><circle ${S} cx="13" cy="5" r="1.5"/><circle ${S} cx="18" cy="11" r="1.5"/><circle ${S} cx="9" cy="13" r="1.5"/><circle ${S} cx="15" cy="18" r="1.5"/><circle ${S} cx="6" cy="19" r="1.5"/>`,
    palette: `<path ${S} d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.1-.9-1.5-.9-2.5s.8-1.8 1.8-1.8h2.1A4.2 4.2 0 0 0 21 10.8C21 6.5 17 3 12 3Z"/><circle fill="currentColor" cx="7.5" cy="11" r="1.1"/><circle fill="currentColor" cx="10" cy="7" r="1.1"/><circle fill="currentColor" cx="15" cy="7.5" r="1.1"/>`,
    person: `<circle ${S} cx="12" cy="8" r="4"/><path ${S} d="M4.5 20.5c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5"/>`,
    leaf: `<path ${S} d="M5 19c0-8 5-13.5 15-14-.3 9.5-5.5 15-13 15M5 19l7-7"/>`,
    battery: `<rect ${S} x="2.5" y="7" width="17" height="10" rx="2"/><path ${S} d="M21.5 10.5v3M6 10.5v3"/>`,
    monitor: `<rect ${S} x="2.5" y="4" width="19" height="13" rx="2"/><path ${S} d="M8.5 20.5h7M12 17v3.5"/>`,
    globe: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z"/>`,
    power: `<path ${S} d="M12 3v8M7 5.8a8 8 0 1 0 10 0"/>`,
    chevron: `<path ${S} d="m9 6 6 6-6 6"/>`
  };

  // Windows shows the Mac icons too; only the sound output is a speaker instead of AirPlay.
  // (The Fluent set keeps the icons of the settings rows.)
  const SPEAKER = '<path fill="currentColor" fill-rule="evenodd" d="M7.5 2.5h9a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2ZM12 5a1.7 1.7 0 1 0 0 3.4A1.7 1.7 0 0 0 12 5Zm0 5.6a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Zm0 2.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2Z"/>';
  const SETS = { mac: MAC, win: { ...WIN, ...MAC, device: SPEAKER } };
  window.LW = window.LW || {};
  LW.platform = 'mac';
  LW.icon = (name, size = 24) => {
    const body = (SETS[LW.platform] || MAC)[name];
    return body ? `<svg class="ic ic-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>` : '';
  };
  // Fills every element with data-icon="name" (data-size: the size in px).
  LW.fillIcons = (root = document) => {
    root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = LW.icon(el.dataset.icon, +el.dataset.size || 24); });
  };
})();
