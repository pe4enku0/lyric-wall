/* Settings window: every change is sent right away; the wallpaper applies it and settings.json keeps it. */
(async () => {
  const api = window.lyricWall;
  const $ = id => document.getElementById(id);
  const { info, t } = await LW.initI18n();
  document.body.classList.add('plat-' + info.platform);

  let look = await api.getLook();

  /* ---------- background swatches ---------- */
  const sw = $('sw');
  for (const b of LW.BACKGROUNDS) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('role', 'radio'); btn.dataset.id = b.id;
    btn.innerHTML = `<i style="background:${b.sw}"></i>`;
    btn.append(t(`bg.${b.id}`));
    btn.addEventListener('click', () => {
      // "Your picture" without a picture yet: open the file dialog first.
      if (b.id === 'photo' && !look.hasImage) { $('pick').click(); return; }
      set('bg', b.id);
    });
    sw.appendChild(btn);
  }

  function render() {
    for (const btn of sw.children) btn.setAttribute('aria-checked', String(btn.dataset.id === look.bg));
    const bg = LW.BACKGROUNDS.find(b => b.id === look.bg);
    $('imgset').setAttribute('aria-disabled', String(!(bg && bg.img)));
    $('blur').value = look.imgBlur; $('blurO').textContent = look.imgBlur;
    $('dimR').value = look.imgDim; $('dimO').textContent = look.imgDim + '%';
    $('spd').value = look.snowSpeed; $('spdO').textContent = (+look.snowSpeed).toFixed(1).replace('.0', '') + '×';
    $('cnt').value = look.snowCount; $('cntO').textContent = look.snowCount;
  }
  async function set(key, value) {
    look = await api.setLook(key, value);
    render();
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

  render();

  // Make the window exactly as tall as its content.
  const fit = () => api.fitWindow(Math.ceil(document.querySelector('main').getBoundingClientRect().height));
  if (document.fonts) await document.fonts.ready;
  fit();
})();
