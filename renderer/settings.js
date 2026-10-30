/* Settings window: every change is sent right away; the wallpaper applies it and settings.json keeps it. */
(async () => {
  const api = window.lyricWall;
  const $ = id => document.getElementById(id);
  const { t, plat, choice, toggle, paint, fit } = await LW.initPrefs();

  let look = await api.getLook();

  /* ---------- choices ---------- */
  const layoutC = choice($('layout'), [['a', t('look.layoutA')], ['b', t('look.layoutB')]], v => set('layout', v));
  const styleC = choice($('bgStyle'), [['color', t('bgStyle.color')], ['picture', t('bgStyle.picture')], ['cover', t('bgStyle.cover')]], pickStyle);
  const fpsC = choice($('fps'), ['60', '45', '30', '20', '15'].map(v => [v, v]), v => set('fps', +v));

  /* ---------- themes: a small copy of the wallpaper in each theme's colours ---------- */
  for (const id of LW.THEMES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tcard'; b.dataset.id = id; b.setAttribute('role', 'radio');
    b.innerHTML = `<span class="mini themed" data-theme="${id}" data-platform="${plat}"><i class="m-dots"></i>` +
      '<i class="m-player"><i class="m-cover"></i><i class="m-t"></i><i class="m-a"></i><i class="m-pp"></i></i>' +
      '<b class="m-clock">09:41</b><i class="m-line m-near"></i><i class="m-line m-on"></i><i class="m-line m-near"></i><i class="m-line m-far"></i></span><span class="tname"></span>';
    b.querySelector('.tname').textContent = t(`theme.${id}`);
    b.onclick = () => set('theme', id);
    $('themes').appendChild(b);
  }
  $('pickText').textContent = t('pic.choose');

  /* ---------- background ----------
     Style "Color": the default look has six colours and an own one; dusty glass has its tinted presets;
     the other themes bring their own background. "Picture": the own picture. "Cover": the blurred track cover. */
  const styleOf = bg => (bg === 'photo' ? 'picture' : bg === 'cover' ? 'cover' : 'color');
  const DUSTY = ['auto', 'lilac', 'graphite', 'night', 'pine', 'sunset'];
  function pickStyle(v) {
    if (v === 'picture') {
      // No picture yet: choose one first (the style switches once it is saved).
      if (!look.hasImage) { styleC.set(styleOf(look.bg)); $('pick').click(); return; }
      set('bg', 'photo');
    } else if (v === 'cover') set('bg', 'cover');
    else set('bg', look.theme === 'default' ? 'color' : look.theme === 'dusty' ? 'auto' : 'theme');
  }

  let swatchesFor = null;
  function swatch(id, label, background, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.id = id; b.title = label; b.setAttribute('aria-label', label);
    b.style.background = background;
    b.onclick = onClick;
    return b;
  }
  function buildSwatches() {
    if (swatchesFor === look.theme) return;
    swatchesFor = look.theme;
    const box = $('swatches'); box.innerHTML = '';
    if (look.theme === 'default') {
      for (const [id, hex] of LW.COLORS) box.appendChild(swatch(hex, t(`color.${id}`), hex, () => setColor(hex)));
      const custom = swatch('custom', t('color.custom'), '', () => $('customColor').click());
      custom.classList.add('custom');
      box.appendChild(custom);
    } else if (look.theme === 'dusty') {
      for (const id of DUSTY) box.appendChild(swatch(id, t(`bg.${id}`), LW.BACKGROUNDS.find(b => b.id === id).sw, () => set('bg', id)));
    }
  }
  async function setColor(hex) {
    look = await api.setLook('bgColor', hex);
    if (look.bg !== 'color') look = await api.setLook('bg', 'color');
    render();
  }
  $('customColor').addEventListener('input', e => setColor(e.target.value.toUpperCase()));

  /* ---------- own picture ---------- */
  let thumbFor = null;
  function showPicture() {
    $('picName').textContent = look.hasImage ? (look.imageName || t('bgStyle.picture')) : t('pic.none');
    if (!look.hasImage) { $('thumb').style.backgroundImage = ''; thumbFor = null; return; }
    if (thumbFor === look.imageVersion) return;
    thumbFor = look.imageVersion;
    api.getImage().then(url => { if (url) $('thumb').style.backgroundImage = `url("${url}")`; });
  }
  // Resize to at most 2560 px and turn into JPEG here; the main process copies it into the app data folder.
  $('pick').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    $('pickErr').hidden = true;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = async () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, 2560 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const res = await api.saveImage(c.toDataURL('image/jpeg', .88), f.name);
      if (res.error) { $('pickErr').hidden = false; fit(); return; }
      look = res; render();
    };
    im.onerror = () => { URL.revokeObjectURL(url); $('pickErr').hidden = false; fit(); };
    im.src = url;
  });

  /* ---------- everything on screen ---------- */
  function render() {
    layoutC.set(look.layout);
    for (const b of $('themes').children) b.setAttribute('aria-checked', String(b.dataset.id === look.theme));
    // The default look shows the background colour chosen above.
    $('themes').querySelector('[data-theme="default"]').style.setProperty('--bg', look.bgColor || '#0C0B10');
    fpsC.set(look.fps);
    const style = styleOf(look.bg);
    styleC.set(style);
    buildSwatches();
    const own = look.theme === 'default' || look.theme === 'dusty';
    $('rowColor').hidden = style !== 'color' || !own;
    $('rowThemeBg').hidden = style !== 'color' || own;
    $('rowPic').hidden = style !== 'picture';
    $('rowBlur').hidden = $('rowDim').hidden = style === 'color';
    const presets = LW.COLORS.map(c => c[1].toUpperCase()), color = (look.bgColor || '').toUpperCase();
    for (const b of $('swatches').children) {
      const on = look.theme === 'default'
        ? look.bg === 'color' && (b.dataset.id === 'custom' ? !presets.includes(color) : b.dataset.id.toUpperCase() === color)
        : look.bg === b.dataset.id;
      b.setAttribute('aria-checked', String(on));
      if (b.dataset.id === 'custom') {
        const set = !presets.includes(color);
        b.classList.toggle('set', set);
        b.style.background = set ? color : '';
        $('customColor').value = set ? color.toLowerCase() : '#0c0b10';
      }
    }
    showPicture();
    $('blur').value = look.imgBlur; $('dimR').value = look.imgDim;
    toggle($('snowOn'), look.snowOn !== false);
    document.querySelectorAll('.snowdep').forEach(r => r.classList.toggle('off', look.snowOn === false));
    $('spd').value = look.snowSpeed; $('cnt').value = look.snowCount;
    ['blur', 'dimR', 'spd', 'cnt'].forEach(id => paint($(id)));
    toggle($('battery'), look.pauseOnBattery);
    fit();
  }
  async function set(key, value) {
    look = await api.setLook(key, value);
    render();
  }

  /* ---------- sliders and switches ---------- */
  const slider = (id, key) => $(id).addEventListener('input', e => {
    paint(e.target); // instant feedback, then save
    set(key, +e.target.value);
  });
  slider('blur', 'imgBlur');
  slider('dimR', 'imgDim');
  slider('spd', 'snowSpeed');
  slider('cnt', 'snowCount');
  $('snowOn').onclick = () => set('snowOn', look.snowOn === false);
  $('battery').onclick = () => set('pauseOnBattery', !look.pauseOnBattery);

  /* ---------- Spotify sign-in ---------- */
  function renderWeb(st) {
    $('webRedirect').textContent = st.redirectUri;
    $('webOut').hidden = st.loggedIn;
    $('webIn').hidden = !st.loggedIn;
    if (document.activeElement !== $('webId')) $('webId').value = st.clientId;
    $('webUser').textContent = st.user ? `${t('web.signedInAs')} ${st.user}` : t('web.signedIn');
    fit();
  }
  function webError(text) {
    $('webErr').textContent = text; $('webErr').hidden = !text;
    fit();
  }
  $('webDash').onclick = () => api.openSpotifyDashboard();
  $('webLogin').onclick = async () => {
    webError('');
    const res0 = await api.webSetClientId($('webId').value);
    if (res0.error) { webError(t('web.badId')); return; }
    $('webLogin').disabled = true; $('webLogin').textContent = t('web.waiting');
    const res = await api.webLogin();
    $('webLogin').disabled = false; $('webLogin').textContent = t('web.login');
    if (res.error) webError(res.error === 'no-client-id' ? t('web.badId') : `${t('web.failed')} ${res.message || ''}`);
    renderWeb(res);
  };
  $('webLogout').onclick = async () => renderWeb(await api.webLogout());
  api.onWebChanged(renderWeb);
  renderWeb(await api.webState());

  render();
  if (document.fonts) await document.fonts.ready;
  fit();
})();
