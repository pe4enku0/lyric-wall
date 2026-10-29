/* Интерфейс обоев. Логика взята из mockup.html; демо-данные лежат в demo.js. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const T = window.DEMO_TRACKS;

  /* Настройки фона и снега. Пока значения по умолчанию из макета; окно настроек появится на шаге 6. */
  const S = { bg: 'dusk', blur: 0, dim: 30, speed: reduce ? 0 : 1, count: 90, userImg: null };

  /* Макет нарисован под 1280×800. Масштабируем так, чтобы высота была ~800 «макетных» точек,
     а ширина растягивалась под экран (16:9, 16:10 и т.д.). */
  let W = 1280, H = 800;
  const sc = $('snow'), sx = sc.getContext('2d');
  function fit() {
    const k = Math.min(innerWidth / 1280, innerHeight / 800);
    W = Math.round(innerWidth / k); H = Math.round(innerHeight / k);
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    stage.style.transform = `scale(${k})`;
    sc.width = W; sc.height = H;
    for (const f of flakes) { if (f.x > W) f.x = Math.random() * W; if (f.y > H) f.y = Math.random() * H; }
  }

  window.lyricWall.info().then(i => { $('device').textContent = i.deviceLabel; });

  /* film grain */
  (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
  })();

  /* ---------- background presets ---------- */
  function dusk() {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1000;
    const g = c.getContext('2d');
    let sd = 11; const r = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    const sky = g.createLinearGradient(0, 0, 0, 1000);
    sky.addColorStop(0, '#7d8494'); sky.addColorStop(.35, '#a59ea4'); sky.addColorStop(.62, '#d3ad98'); sky.addColorStop(.78, '#e9b588'); sky.addColorStop(.86, '#c99178'); sky.addColorStop(1, '#3a2f33');
    g.fillStyle = sky; g.fillRect(0, 0, 1600, 1000);
    const sun = g.createRadialGradient(1050, 800, 0, 1050, 800, 520);
    sun.addColorStop(0, 'rgba(255,214,170,.75)'); sun.addColorStop(1, 'rgba(255,214,170,0)');
    g.fillStyle = sun; g.fillRect(0, 0, 1600, 1000);
    g.filter = 'blur(22px)';
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${150 + r() * 60},${140 + r() * 50},${150 + r() * 40},${.18 + r() * .25})`; g.beginPath(); g.ellipse(r() * 1600, 120 + r() * 520, 120 + r() * 260, 18 + r() * 40, 0, 0, Math.PI * 2); g.fill(); }
    g.filter = 'none';
    g.fillStyle = '#231d22';
    g.beginPath(); g.moveTo(0, 1000); g.lineTo(0, 900);
    for (let x = 0; x <= 1600; x += 40) g.lineTo(x, 890 + Math.sin(x / 90) * 10 - (r() > .8 ? 30 + r() * 40 : 0));
    g.lineTo(1600, 1000); g.fill();
    const poles = [140, 520, 930, 1360];
    g.strokeStyle = '#1e191e'; g.lineCap = 'round';
    poles.forEach((x, i) => {
      const top = 430 + i * 25; g.lineWidth = 9; g.beginPath(); g.moveTo(x, 1000); g.lineTo(x, top); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(x - 60, top + 30); g.lineTo(x + 60, top + 30); g.moveTo(x - 44, top + 70); g.lineTo(x + 44, top + 70); g.stroke();
    });
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(30,25,30,.85)';
    [[-60, 30], [60, 30], [-44, 70], [44, 70]].forEach(([dx, dy]) => {
      g.beginPath(); g.moveTo(0, 470 + dy);
      poles.forEach((x, i) => { const y = 430 + i * 25 + dy; const px = i ? poles[i - 1] + dx : -100; const py = i ? 430 + (i - 1) * 25 + dy : 470 + dy; g.moveTo(px, py); g.quadraticCurveTo((px + x + dx) / 2, Math.max(py, y) + 55, x + dx, y); });
      g.quadraticCurveTo(1500, 520 + dy + 55, 1700, 500 + dy); g.stroke();
    });
    return c.toDataURL('image/jpeg', .88);
  }
  const DUSK = dusk();

  const BG = [
    { id: 'dusk', name: 'Картинка: сумерки', img: 'dusk', hue: 330, sat: 1 },
    { id: 'photo', name: 'Своя картинка', img: 'photo', hue: 225, sat: 1 },
    { id: 'cover', name: 'Обложка трека', img: 'cover', hue: null, sat: 1 },
    { id: 'auto', name: 'Из обложки', hue: null, sat: 1 },
    { id: 'lilac', name: 'Сирень', hue: 225, sat: 1 },
    { id: 'graphite', name: 'Графит', hue: 225, sat: .12 },
    { id: 'night', name: 'Ночь', hue: 95, sat: 1.4 },
    { id: 'pine', name: 'Хвоя', hue: 30, sat: 1.2 },
    { id: 'sunset', name: 'Закат', hue: 265, sat: 1.5 }
  ];
  function applyBg() {
    const b = BG.find(x => x.id === S.bg) || BG[0];
    stage.style.setProperty('--hue', b.hue == null ? T[ti].hue : b.hue);
    stage.style.setProperty('--sat', b.sat);
    const el = $('bgimg'), dm = $('dim');
    let src = null;
    if (b.img === 'dusk') src = DUSK;
    else if (b.img === 'photo') src = S.userImg || DUSK;
    else if (b.img === 'cover') src = T[ti].img;
    const bl = b.img === 'cover' ? Math.max(30, S.blur) : S.blur;
    const dv = b.img === 'cover' ? Math.max(45, S.dim) : S.dim;
    el.style.filter = bl ? `blur(${bl}px)` : 'none';
    dm.style.opacity = src ? dv / 100 : 0;
    if (!src) { el.style.opacity = 0; el.dataset.src = ''; return; }
    if (el.dataset.src === src) { el.style.opacity = 1; return; }
    el.dataset.src = src;
    if (el.style.opacity === '1') {
      el.style.opacity = 0;
      setTimeout(() => { if (el.dataset.src === src) { el.style.backgroundImage = `url(${src})`; el.style.opacity = 1; } }, 450);
    } else { el.style.backgroundImage = `url(${src})`; requestAnimationFrame(() => { el.style.opacity = 1; }); }
  }

  const LINE = 2900;
  let ti = 0, li = 0, lineT = 0, playing = true, pos = T[0].start, last = performance.now();
  let front = $('artA'), back = $('artB');
  const fmt = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const hms = s => { s = Math.floor(s); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':'); };

  function renderLines() {
    const ul = $('lines'); ul.innerHTML = '';
    T[ti].lines.forEach(t => { const el = document.createElement('li'); el.textContent = t; ul.appendChild(el); });
  }
  function focusLine(instant) {
    const ul = $('lines'), items = ul.children;
    for (let i = 0; i < items.length; i++) {
      const d = i - li, a = Math.abs(d), el = items[i];
      el.classList.toggle('on', d === 0);
      el.style.filter = d === 0 ? 'none' : d < 0 ? `blur(${1.6 + a * 1.2}px)` : `blur(${Math.min(2.4 + a * 1.6, 8)}px)`;
      el.style.opacity = d === 0 ? 1 : d < 0 ? Math.max(.2, .62 - a * .15) : Math.max(.22, .7 - a * .14);
      el.style.transform = d === 0 ? 'scale(1)' : 'scale(.97)';
    }
    const target = items[li]; if (!target) return;
    if (instant) ul.style.transition = 'none';
    ul.style.transform = `translateY(${118 - target.offsetTop}px)`;
    if (instant) { ul.offsetHeight; ul.style.transition = ''; }
  }
  function renderQueue() {
    const q = $('queue'); q.innerHTML = '';
    for (let k = 1; k <= 3; k++) {
      const t = T[(ti + k) % T.length], row = document.createElement('div');
      row.className = 'qi';
      row.innerHTML = `<img alt="" src="${t.img}"><div style="min-width:0"><div class="t"></div><div class="a"></div></div><span class="c${k === 1 ? ' on' : ''}">${k === 1 ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="#3d3a42"><path d="M7 4v16l13-8Z"/></svg>' : ''}</span>`;
      row.querySelector('.t').textContent = t.title; row.querySelector('.a').textContent = t.artist;
      q.appendChild(row);
    }
  }

  function setTrack(i, first) {
    ti = i; const t = T[ti];
    applyBg();
    $('title').textContent = t.title; $('artist').textContent = t.artist;
    $('explicit').hidden = !t.explicit;
    $('capL').textContent = t.artist.replace(',', ' ·').toUpperCase();
    $('vol').textContent = t.vol; $('volBar').style.width = t.vol + '%';
    $('mode').textContent = 'Перемешивание: ' + (t.shuffle ? 'вкл' : 'выкл');
    renderQueue();
    if (first) front.src = t.img;
    else { back.src = t.img; back.classList.remove('out'); front.classList.add('out'); [front, back] = [back, front]; }
    pos = t.start; li = 0; lineT = 0;
    const ul = $('lines');
    if (first) { renderLines(); focusLine(true); }
    else { ul.style.opacity = 0; setTimeout(() => { renderLines(); focusLine(true); ul.style.opacity = 1; }, 650); }
  }

  /* ---------- snow ---------- */
  const mk = () => ({ x: Math.random() * W, y: Math.random() * H, r: .5 + Math.random() * 1.6,
    v: 5 + Math.random() * 14, w: Math.random() * 6.3, a: .12 + Math.random() * .5 });
  let flakes = [];
  function setCount(n) { while (flakes.length < n) flakes.push(mk()); flakes.length = n; }
  function drawSnow(dt) {
    const speed = S.speed;
    sx.clearRect(0, 0, W, H);
    for (const f of flakes) {
      if (playing && speed > 0) { f.y += f.v * dt * speed; f.w += dt * .5 * Math.max(.4, speed); f.x += Math.sin(f.w) * 6 * dt * Math.max(.4, speed); }
      if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
      sx.globalAlpha = f.a; sx.fillStyle = '#f1eef4';
      sx.beginPath(); sx.arc(f.x, f.y, f.r, 0, Math.PI * 2); sx.fill();
    }
    sx.globalAlpha = 1;
  }

  /* ---------- visualizer ---------- */
  const vc = $('viz'), vx = vc.getContext('2d'), N = 26, lv = new Array(N).fill(.2);
  function drawViz(time) {
    const VW = vc.width, VH = vc.height, bw = VW / N;
    vx.clearRect(0, 0, VW, VH);
    const beat = Math.pow(Math.max(0, Math.sin(time / 1000 * Math.PI * 2.1)), 8);
    for (let i = 0; i < N; i++) {
      const base = .22 + .18 * Math.sin(i * .55 + time / 700) + .14 * Math.sin(i * 1.3 - time / 430);
      const tgt = playing ? Math.min(1, Math.max(.05, base + beat * (1 - i / N) * .65 + Math.random() * .08)) : .04;
      lv[i] += (tgt - lv[i]) * .18;
      const h = lv[i] * VH, x = i * bw + 2;
      const gr = vx.createLinearGradient(0, VH - h, 0, VH);
      gr.addColorStop(0, 'rgba(255,92,112,.95)'); gr.addColorStop(1, 'rgba(255,92,112,.15)');
      vx.fillStyle = gr; vx.shadowColor = 'rgba(255,80,100,.6)'; vx.shadowBlur = 8;
      vx.beginPath();
      vx.roundRect ? vx.roundRect(x, VH - h, bw - 6, h, 3) : vx.rect(x, VH - h, bw - 6, h);
      vx.fill();
    }
    vx.shadowBlur = 0;
  }

  /* ---------- main loop ---------- */
  function loop(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (playing) {
      pos += dt; lineT += dt * 1000;
      if (lineT >= LINE) {
        lineT = 0; li++;
        if (li >= T[ti].lines.length) setTrack((ti + 1) % T.length); else focusLine();
      }
    }
    const t = T[ti], p = Math.min(1, pos / t.dur);
    $('fill').style.width = (p * 100) + '%'; $('knob').style.left = (p * 100) + '%';
    $('cur').textContent = fmt(pos); $('rem').textContent = '-' + fmt(t.dur - pos);
    $('capR').textContent = hms(pos);
    drawSnow(dt); drawViz(now);
    requestAnimationFrame(loop);
  }

  /* ---------- controls ---------- */
  const pp = $('pp');
  pp.addEventListener('click', () => {
    playing = !playing;
    pp.innerHTML = playing ? '<rect x="1" y="1" width="5.5" height="22" rx="1.6"/><rect x="11.5" y="1" width="5.5" height="22" rx="1.6"/>' : '<path d="M2 1 17 12 2 23Z"/>';
  });
  $('bNext').addEventListener('click', () => setTrack((ti + 1) % T.length));
  $('bPrev').addEventListener('click', () => setTrack((ti + T.length - 1) % T.length));

  /* ---------- start ---------- */
  addEventListener('resize', fit); fit();
  setCount(S.count);
  setTrack(0, true);
  if (document.fonts) document.fonts.ready.then(() => focusLine(true));
  requestAnimationFrame(loop);
})();
