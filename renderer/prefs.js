/* Helpers shared by the settings window and the control window: the system look (Mac / Windows),
   the system accent colour, choices, switches and fitting the window to its content. */
LW.initPrefs = async () => {
  const { info, t } = await LW.initI18n();
  const plat = info.ui || (info.platform === 'darwin' ? 'mac' : 'win');
  LW.platform = plat;
  document.body.classList.add('plat-' + plat);
  if (info.accent) document.documentElement.style.setProperty('--sys-accent', info.accent);
  LW.fillIcons();

  // A choice of a few values: segmented buttons on the Mac, a drop-down list on Windows (as each system does it).
  // forceSelect: a drop-down on both. Returns { set(value) }.
  function choice(host, options, onChange, forceSelect) {
    host.innerHTML = '';
    if (plat === 'mac' && !forceSelect) {
      const seg = document.createElement('div');
      seg.className = 'seg';
      for (const [v, label] of options) {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.v = v; b.textContent = label;
        b.onclick = () => onChange(v);
        seg.appendChild(b);
      }
      host.appendChild(seg);
      return { set: value => { for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(value))); } };
    }
    const sel = host.tagName === 'SELECT' ? host : host.appendChild(document.createElement('select'));
    for (const [v, label] of options) sel.add(new Option(label, v));
    sel.onchange = () => onChange(sel.value);
    return { set: value => { sel.value = String(value); } };
  }

  // A switch (Windows shows "On" / "Off" next to it).
  function toggle(el, on) {
    el.setAttribute('aria-checked', String(!!on));
    const label = el.querySelector('b');
    if (label) label.textContent = t(on ? 'toggle.on' : 'toggle.off');
  }

  // Filled part of a slider (CSS variable --p).
  function paint(range) {
    const p = (range.value - range.min) / (range.max - range.min) * 100;
    range.style.setProperty('--p', p + '%');
  }

  // Make the window exactly as tall as its content.
  const fit = () => window.lyricWall.fitWindow(Math.ceil(document.querySelector('main').getBoundingClientRect().height));

  return { info, t, plat, choice, toggle, paint, fit };
};
