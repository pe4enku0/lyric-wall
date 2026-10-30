/* Settings window: every change is sent right away; the wallpaper applies it and settings.json keeps it. */
(async () => {
  const api = window.lyricWall;
  const $ = id => document.getElementById(id);
  const { info, t } = await LW.initI18n();
  document.body.classList.add('plat-' + info.platform);

  let look = await api.getLook();

  /* ---------- themes: each card is drawn with the theme's own colours (themes.css) ---------- */
  const themesEl = $('themes');
  for (const id of LW.THEMES) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('role', 'radio'); btn.dataset.id = id;
    btn.innerHTML = `<span class="thp themed" data-theme="${id}"><span class="thg"><b>Aa</b><i></i></span></span><span class="thn"></span>`;
    btn.querySelector('.thn').textContent = t(`theme.${id}`);
    btn.addEventListener('click', () => set('theme', id));
    themesEl.appendChild(btn);
  }

  /* ---------- background swatches (the colour presets only with dusty glass) ---------- */
  const sw = $('sw');
  for (const b of LW.BACKGROUNDS) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('role', 'radio'); btn.dataset.id = b.id;
    // the theme's own background shows the current theme in its swatch
    btn.innerHTML = b.id === 'theme' ? '<i class="themed"></i>' : `<i style="background:${b.sw}"></i>`;
    btn.append(t(`bg.${b.id}`));
    btn.addEventListener('click', () => {
      // "Your picture" without a picture yet: open the file dialog first.
      if (b.id === 'photo' && !look.hasImage) { $('pick').click(); return; }
      set('bg', b.id);
    });
    sw.appendChild(btn);
  }

  function render() {
    for (const btn of themesEl.children) btn.setAttribute('aria-checked', String(btn.dataset.id === look.theme));
    const offered = LW.backgroundsFor(look.theme).map(b => b.id);
    for (const btn of sw.children) {
      btn.setAttribute('aria-checked', String(btn.dataset.id === look.bg));
      btn.hidden = !offered.includes(btn.dataset.id);
    }
    sw.querySelector('[data-id="theme"] i').dataset.theme = look.theme;
    const bg = LW.BACKGROUNDS.find(b => b.id === look.bg);
    $('imgset').setAttribute('aria-disabled', String(!(bg && bg.img)));
    $('blur').value = look.imgBlur; $('blurO').textContent = look.imgBlur;
    $('dimR').value = look.imgDim; $('dimO').textContent = look.imgDim + '%';
    $('spd').value = look.snowSpeed; $('spdO').textContent = (+look.snowSpeed).toFixed(1).replace('.0', '') + '×';
    $('cnt').value = look.snowCount; $('cntO').textContent = look.snowCount;
    $('battery').checked = !!look.pauseOnBattery;
    for (const b of $('fps').children) b.setAttribute('aria-pressed', String(+b.dataset.v === look.fps));
    for (const b of $('layout').children) b.setAttribute('aria-pressed', String(b.dataset.v === look.layout));
  }
  async function set(key, value) {
    look = await api.setLook(key, value);
    render();
    fit(); // the list of backgrounds may have changed
  }

  /* ---------- sliders ---------- */
  const slider = (id, key) => $(id).addEventListener('input', e => {
    look[key] = +e.target.value; render(); // instant feedback, then save
    set(key, +e.target.value);
  });
  slider('blur', 'imgBlur');
  slider('dimR', 'imgDim');
  slider('spd', 'snowSpeed');
  slider('cnt', 'snowCount');

  $('battery').addEventListener('change', e => set('pauseOnBattery', e.target.checked));
  $('fps').addEventListener('click', e => { const b = e.target.closest('button'); if (b) set('fps', +b.dataset.v); });
  $('layout').addEventListener('click', e => { const b = e.target.closest('button'); if (b) set('layout', b.dataset.v); });

  /* ---------- own picture ---------- */
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
      const res = await api.saveImage(c.toDataURL('image/jpeg', .88));
      if (res.error) { $('pickErr').hidden = false; fit(); return; }
      look = res; render();
    };
    im.onerror = () => { URL.revokeObjectURL(url); $('pickErr').hidden = false; fit(); };
    im.src = url;
  });

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
    const set = await api.webSetClientId($('webId').value);
    if (set.error) { webError(t('web.badId')); return; }
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

  // Make the window exactly as tall as its content.
  function fit() { api.fitWindow(Math.ceil(document.querySelector('main').getBoundingClientRect().height)); }
  if (document.fonts) await document.fonts.ready;
  fit();
})();
