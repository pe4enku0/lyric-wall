/* Control window: what is playing, playback buttons and the main switches (shared with the tray menu). */
(async () => {
  const api = window.lyricWall;
  const $ = id => document.getElementById(id);
  const { info, t, choice, toggle, fit } = await LW.initPrefs();
  $('hint').textContent = t(info.platform === 'darwin' ? 'control.hint.mac' : 'control.hint.win');

  /* ---------- now playing ---------- */
  const clock = LW.createClock();
  let track = { id: null, duration: 0 };
  const setPP = () => { $('pp').innerHTML = LW.icon(clock.playing ? 'pause' : 'play'); };

  function setCover(src) {
    const img = $('cover');
    if (!src) { img.removeAttribute('src'); return; }
    if (img.getAttribute('src') !== src) img.src = src;
  }
  $('cover').onerror = () => setCover('');

  function tick() {
    const d = track.duration, pos = d ? Math.min(d, clock.now()) : 0;
    $('fill').style.transform = `scaleX(${d ? pos / d : 0})`;
    $('cur').textContent = d ? LW.fmt(pos) : '–:––'; $('dur').textContent = d ? LW.fmt(d) : '–:––';
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
    setPP();
    $('ctrl').classList.toggle('idle', !isTrack);
    tick();
  }

  $('bPrev').onclick = () => api.control('prev');
  $('bNext').onclick = () => api.control('next');
  $('pp').onclick = () => { clock.toggle(); setPP(); api.control('toggle'); };
  setInterval(tick, 250);
  api.onPlayer(onPlayer);
  onPlayer(await api.getPlayer());

  /* ---------- switches ---------- */
  let wallOn = true;
  const set = (key, value) => api.controlSet(key, value).then(render);
  const lang = choice($('optLang'), [['auto', t('control.langAuto')], ['en', 'English'], ['ru', 'Русский']], v => set('language', v));
  const mode = choice($('optMode'), [['auto', t('control.modeAuto')], ['bottom', t('control.modeBottom')]], v => set('winMode', v));
  let state = null;
  function render(st) {
    state = st;
    wallOn = st.wallpaperEnabled;
    $('ver').textContent = 'v' + st.version;
    toggle($('optWall'), st.wallpaperEnabled);
    lang.set(st.language === 'en' || st.language === 'ru' ? st.language : 'auto');
    $('rowMode').hidden = st.platform !== 'win32';
    mode.set(st.winMode === 'bottom' ? 'bottom' : 'auto');
    toggle($('optLogin'), st.loginItem.enabled);
    $('optLogin').disabled = !st.loginItem.available;
    $('loginHint').hidden = st.loginItem.available;
    fit();
  }

  $('optWall').onclick = () => set('wallpaperEnabled', !state.wallpaperEnabled);
  $('optLogin').onclick = () => set('loginItem', !state.loginItem.enabled);
  $('bLook').onclick = () => api.openSettings('the control window');
  $('bLog').onclick = () => api.openLog();
  $('bQuit').onclick = () => api.quit();

  api.onControlChanged(render);
  render(await api.controlState());
  $('wallState').textContent = t(wallOn ? 'control.status.running' : 'control.status.off');

  /* ---------- wallpaper state and CPU use ---------- */
  api.onStatus(st => {
    const s = !wallOn ? t('control.status.off')
      : st.paused ? `${t('control.status.paused')}: ${st.reasons.map(r => t('pause.' + r)).join(', ')}`
      : t('control.status.running');
    $('wallState').textContent = `${s} · ${t('control.cpu')} ${st.cpu.toFixed(1)}%`;
    fit(); // the text may take two lines
  });

  if (document.fonts) await document.fonts.ready;
  fit();
})();
