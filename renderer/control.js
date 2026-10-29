/* Control window: what is playing, playback buttons and the main switches (shared with the tray menu). */
(async () => {
  const api = window.lyricWall;
  const $ = id => document.getElementById(id);
  const { info, t } = await LW.initI18n();
  document.body.classList.add('plat-' + info.platform);
  $('grain').style.backgroundImage = `url(${LW.grain()})`;
  $('hint').textContent = t(info.platform === 'darwin' ? 'control.hint.mac' : 'control.hint.win');

  /* ---------- now playing ---------- */
  const PAUSE_ICON = '<svg width="18" height="24" viewBox="0 0 18 24"><rect x="1" y="1" width="5.5" height="22" rx="1.6"/><rect x="11.5" y="1" width="5.5" height="22" rx="1.6"/></svg>';
  const PLAY_ICON = '<svg width="18" height="24" viewBox="0 0 18 24"><path d="M2 1 17 12 2 23Z"/></svg>';
  const clock = LW.createClock();
  let track = { id: null, duration: 0 };

  function setCover(src) {
    const img = $('cover');
    if (!src) { img.removeAttribute('src'); return; }
    if (img.getAttribute('src') !== src) img.src = src;
  }
  $('cover').onerror = () => setCover('');

  function tick() {
    const d = track.duration, pos = d ? Math.min(d, clock.now()) : 0, p = d ? pos / d * 100 : 0;
    $('fill').style.width = p + '%'; $('knob').style.left = p + '%';
    $('cur').textContent = LW.fmt(pos); $('dur').textContent = LW.fmt(d);
  }

  function onPlayer(s) {
    const isTrack = !!(s && (s.state === 'playing' || s.state === 'paused') && s.id);
    if (isTrack) {
      const changed = s.id !== track.id;
      if (changed) { $('title').textContent = s.title || ''; $('artist').textContent = s.artist || ''; }
      track = { id: s.id, duration: s.duration || 0 };
      setCover(s.art);
      clock.update(s, changed);
    } else {
      const state = s && s.state ? s.state : 'error';
      track = { id: state, duration: 0 };
      $('title').textContent = t(`state.${state}.title`);
      $('artist').textContent = t(`state.${state}.detail`);
      setCover('');
      clock.set(0, false);
    }
    $('pp').innerHTML = clock.playing ? PAUSE_ICON : PLAY_ICON;
    $('ctrl').classList.toggle('off', !isTrack);
    tick();
  }

  $('bPrev').onclick = () => api.control('prev');
  $('bNext').onclick = () => api.control('next');
  $('pp').onclick = () => { clock.toggle(); $('pp').innerHTML = clock.playing ? PAUSE_ICON : PLAY_ICON; api.control('toggle'); };
  setInterval(tick, 250);
  api.onPlayer(onPlayer);
  onPlayer(await api.getPlayer());

  /* ---------- switches ---------- */
  function seg(id, value) {
    for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset.v === value));
  }
  function render(st) {
    $('ver').textContent = 'v' + st.version;
    $('optWall').setAttribute('aria-checked', String(st.wallpaperEnabled));
    seg('optLang', st.language === 'en' || st.language === 'ru' ? st.language : 'auto');
    $('rowMode').hidden = st.platform !== 'win32';
    seg('optMode', st.winMode === 'bottom' ? 'bottom' : 'auto');
    $('optLogin').setAttribute('aria-checked', String(st.loginItem.enabled));
    $('optLogin').disabled = !st.loginItem.available;
    $('loginHint').hidden = st.loginItem.available;
  }
  const set = (key, value) => api.controlSet(key, value).then(render);
  const isOn = el => el.getAttribute('aria-checked') === 'true';

  $('optWall').onclick = e => set('wallpaperEnabled', !isOn(e.currentTarget));
  $('optLogin').onclick = e => set('loginItem', !isOn(e.currentTarget));
  $('optLang').onclick = e => { const b = e.target.closest('button'); if (b) set('language', b.dataset.v); };
  $('optMode').onclick = e => { const b = e.target.closest('button'); if (b) set('winMode', b.dataset.v); };
  $('bLog').onclick = () => api.openLog();
  $('bQuit').onclick = () => api.quit();

  api.onControlChanged(render);
  render(await api.controlState());

  // Make the window exactly as tall as its content (it differs per language and system).
  const fit = () => api.controlResize(Math.ceil(document.querySelector('main').getBoundingClientRect().height));
  if (document.fonts) await document.fonts.ready;
  fit();
})();
