/* Wallpaper UI. The data comes from the main process; the look is in style.css and themes.css.
   One set of parts in two arrangements (stage data-layout="a" | "b") and two platform looks (data-platform). */
(async () => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  // Write to the page only when the value really changes: every write makes the glass repaint.
  const put = (obj, key, value) => { if (obj[key] !== value) obj[key] = value; };
  const stage = $('stage');
  const api = window.lyricWall;

  /* ---------- language and platform ---------- */
  const { info, t } = await LW.initI18n();
  const plat = info.ui || (info.platform === 'darwin' ? 'mac' : 'win');
  LW.platform = plat;
  stage.dataset.platform = plat;
  LW.fillIcons(stage);
  $('device').textContent = info.deviceLabel;
  const DASH = '–:––';

  // Look from the settings window (main/appearance.js); the own picture is loaded separately.
  let S = { theme: 'default', bg: 'color', bgColor: '#0C0B10', layout: 'a', imgBlur: 0, imgDim: 30, snowOn: true, snowSpeed: reduce ? 0 : 1, snowCount: 90,
    imageVersion: 0, showLyrics: true, fps: 60 };
  let userImg = null;

  /* ---------- size and safe area ----------
     Everything is laid out in screen points for a MacBook Air 13" (1470×956) or a 1080p PC (1920×1080).
     Bigger screens get more room (the columns stretch); smaller ones shrink the whole wallpaper. */
  const REF = plat === 'mac' ? [1470, 956] : [1920, 1080];
  let W = REF[0], H = REF[1], k = 1;
  const sc = $('snow'), sx = sc.getContext('2d');
  // Parts of the screen covered by the menu bar and Dock (Mac) or the taskbar (Windows), in screen points.
  function insets() {
    const s = window.screen, x = window.screenX, y = window.screenY;
    return {
      top: Math.max(0, s.availTop - y),
      bottom: Math.max(0, y + innerHeight - (s.availTop + s.availHeight)),
      left: Math.max(0, s.availLeft - x),
      right: Math.max(0, x + innerWidth - (s.availLeft + s.availWidth))
    };
  }
  function fit() {
    k = Math.min(1, innerWidth / REF[0], innerHeight / REF[1]);
    W = Math.round(innerWidth / k); H = Math.round(innerHeight / k);
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    stage.style.transform = k === 1 ? '' : `scale(${k})`;
    // Mac: below the menu bar and the notch, above the Dock. Windows: above the taskbar.
    const ins = insets(), ui = $('ui').style, mac = plat === 'mac';
    const side = mac ? 48 : 64;
    ui.top = Math.round(mac ? Math.max(69, ins.top / k + 32) : Math.max(48, ins.top / k + 24)) + 'px';
    ui.bottom = Math.round(mac ? Math.max(32, ins.bottom / k + 16) : Math.max(72, ins.bottom / k + 24)) + 'px';
    ui.left = Math.round(Math.max(side, ins.left / k + 24)) + 'px';
    ui.right = Math.round(Math.max(side, ins.right / k + 24)) + 'px';
    sc.width = W; sc.height = H;
    for (const f of flakes) { if (f.x > W) f.x = Math.random() * W; if (f.y > H) f.y = Math.random() * H; }
  }
  // Rectangle of an element in stage points (the stage may be scaled).
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left / k, y: r.top / k, w: r.width / k, h: r.height / k }; };

  $('grain').style.backgroundImage = `url(${LW.grain()})`;

  /* Cover shown for a track without a cover. */
  const NO_COVER = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 600;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 600, 600);
    gr.addColorStop(0, '#2a2830'); gr.addColorStop(1, '#121116');
    g.fillStyle = gr; g.fillRect(0, 0, 600, 600);
    return c.toDataURL('image/jpeg', .9);
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
  let DUSK = null;

  /* ---------- current track ---------- */
  let track = { id: null, idle: true, tone: null, accent: null, cover: NO_COVER, duration: 0, volume: null };
  let volHold = 0;       // until then our own volume wins over what Spotify reports (it reports with a delay)
  let preMute = null;    // volume before the speaker muted it
  let seekPreview = null; // 0..1 while the progress bar is dragged
  let playing = false;
  const clock = LW.createClock();

  /* Colours of the cover:
     - accent: a bright, saturated colour (not the most common one), made lighter until it reads well on the dark
       background (contrast 4.5:1 with #0C0B10); null for a grey cover;
     - tone: the average hue of the colourful pixels, for the old "From cover" backgrounds. */
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
  };
  const BG_LUM = lum([12, 11, 16]);
  function hsl2rgb(h, s, l) {
    const a = s * Math.min(l, 1 - l), f = n => { const q = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(q - 3, 9 - q, 1)); };
    return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
  }
  function readableAccent([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0, l = (max + min) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (d) h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    h = (h + 360) % 360; s = Math.max(s, .55);
    let rgb = hsl2rgb(h, s, l);
    while ((lum(rgb) + .05) / (BG_LUM + .05) < 4.5 && l < .92) { l += .02; rgb = hsl2rgb(h, s, l); }
    return rgb;
  }
  function coverColours(src) {
    return new Promise(resolve => {
      if (!src || src === NO_COVER) { resolve(null); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 32;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, 32, 32);
          const d = g.getImageData(0, 0, 32, 32).data, n = d.length / 4;
          let x = 0, y = 0, w = 0, sat = 0;
          const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i] / 255, gr = d[i + 1] / 255, b = d[i + 2] / 255;
            const max = Math.max(r, gr, b), min = Math.min(r, gr, b), ch = max - min;
            if (!ch) continue;
            const hr = (max === r ? (gr - b) / ch : max === gr ? (b - r) / ch + 2 : (r - gr) / ch + 4) * Math.PI / 3;
            x += Math.cos(hr) * ch; y += Math.sin(hr) * ch; w += ch; // colourful pixels count more
            sat += ch / (1 - Math.abs(max + min - 1));
            // Vivid pixels vote for their hue: saturation counts twice, very dark ones not at all.
            const sv = ch / max;
            if (sv < .28 || max < .25) continue;
            const bin = bins[Math.floor(((hr * 180 / Math.PI + 360) % 360) / 15)], wt = sv * sv * max;
            bin.w += wt; bin.r += d[i] * wt; bin.g += d[i + 1] * wt; bin.b += d[i + 2] * wt;
          }
          const tone = w / n < .04 ? { hue: null, sat: 0 } : { hue: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360, sat: sat / n };
          const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
          const accent = best.w > n * .012 ? readableAccent([best.r / best.w, best.g / best.w, best.b / best.w]) : null;
          resolve({ tone, accent });
        } catch (_) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  function updateColours() {
    const id = track.id;
    coverColours(track.cover).then(res => {
      if (track.id !== id) return;
      track.tone = res && res.tone; track.accent = res && res.accent;
      applyBg(); applyAccent();
    });
  }
  // The default look takes the accent from the cover; the other themes have their own colour.
  function applyAccent() {
    if (S.theme === 'default' && !track.idle && track.accent) stage.style.setProperty('--accent', `rgb(${track.accent.join(' ')})`);
    else if (S.theme === 'default' && !track.idle) stage.style.setProperty('--accent', 'var(--accent-idle)');
    else stage.style.removeProperty('--accent');
    accentUntil = performance.now() + 700; // the visualizer follows the colour while it changes
    wake();
  }

  // Tint of the gradient behind the glass of the old themes. The main glow uses hue + 120.
  function tint(b) {
    if (b.hue != null) return [b.hue, b.sat];
    const tone = track.tone;
    if (tone && tone.hue != null) return [tone.hue - 120, Math.min(1.6, .5 + tone.sat * 1.4)];
    if (tone) return [225, .12]; // grey cover: graphite
    return [225, 1];
  }

  function applyBg() {
    const b = LW.BACKGROUNDS.find(x => x.id === S.bg) || LW.BACKGROUNDS[0];
    const [hue, sat] = tint(b);
    stage.style.setProperty('--hue', hue);
    stage.style.setProperty('--sat', sat);
    if (/^#[0-9a-f]{6}$/i.test(S.bgColor || '')) stage.style.setProperty('--bg', S.bgColor);
    const el = $('bgimg'), dm = $('dim');
    let src = null;
    if (b.img === 'dusk') src = DUSK || (DUSK = dusk());
    else if (b.img === 'photo') src = userImg || null;
    else if (b.img === 'cover' && !track.idle) src = track.cover;
    const bl = b.img === 'cover' ? Math.max(30, S.imgBlur) : S.imgBlur;
    const dv = b.img === 'cover' ? Math.max(45, S.imgDim) : S.imgDim;
    el.style.filter = bl ? `blur(${bl}px)` : 'none';
    dm.style.opacity = src ? dv / 100 : 0;
    if (!src) { el.style.opacity = 0; el.dataset.src = ''; return; }
    if (el.dataset.src === src) { el.style.opacity = 1; return; }
    el.dataset.src = src;
    if (el.style.opacity === '1') {
      el.style.opacity = 0;
      setTimeout(() => { if (el.dataset.src === src) { el.style.backgroundImage = `url("${src}")`; el.style.opacity = 1; } }, 450);
    } else { el.style.backgroundImage = `url("${src}")`; requestAnimationFrame(() => { el.style.opacity = 1; }); }
  }

  const fmt = LW.fmt;

  /* ---------- clock and date ---------- */
  const timeFmt = new Intl.DateTimeFormat(info.lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dateFmt = new Intl.DateTimeFormat(info.lang, { weekday: 'long', month: 'long', day: 'numeric' });
  function tick() {
    const d = new Date(), date = dateFmt.format(d);
    put($('time'), 'textContent', timeFmt.format(d));
    put($('date'), 'textContent', date.charAt(0).toUpperCase() + date.slice(1));
    setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  }

  /* ---------- state of the wallpaper: playing | paused | idle, plus "no lyrics" and "empty queue" ---------- */
  function applyState() {
    const st = track.idle ? 'idle' : playing ? 'playing' : 'paused';
    if (stage.dataset.state !== st) { stage.dataset.state = st; wake(); }
    put($('status'), 'textContent', t(st === 'idle' ? 'ui.notPlaying' : st === 'paused' ? 'ui.paused' : S.layout === 'b' ? 'ui.nowPlaying' : 'ui.nowPlayingOn'));
    put($('live'), 'textContent', t(st === 'idle' ? 'ui.silent' : st === 'paused' ? 'ui.paused' : 'ui.live'));
    const noLyrics = !track.idle && ['not-found', 'instrumental'].includes(lyr.status);
    $('lyb').classList.toggle('on', S.showLyrics && !noLyrics);
    $('lyb').classList.toggle('na', noLyrics);
    applyQuiet();
  }

  /* ---------- lyrics (main/lyrics.js loads them from LRCLIB) ----------
     Every line is placed here: the current one in the vertical middle at full size, its neighbours smaller,
     fainter and blurred (±1, ±2, ±3), the rest hidden. A new line moves them all in 400 ms (style.css). */
  const LEAD = 0.35; // switch to a line a moment before it is sung
  const SCALE = [1, .57, .5, .47], FADE = [1, .42, .29, .18], BLUR = [0, 1.6, 3, 4];
  let lyr = { id: null, status: 'none' }; // what is shown now
  let latestLyrics = { id: null };        // last result from the main process (may arrive before the track)
  let synced = [];                        // [{ t, text }] for synced lyrics
  let li = 0;                             // current line
  let heights = [];                       // full-size height of every line
  let fadeTimer = null;
  let lastScroll = null;

  function renderLines(lines) {
    const ul = $('lines'); ul.innerHTML = ''; heights = [];
    lines.forEach(text => {
      const el = document.createElement('li');
      if (text) el.textContent = text; else el.className = 'gap';
      ul.appendChild(el);
    });
  }
  function focusLine(instant) {
    const ul = $('lines'), items = ul.children;
    if (lyr.status === 'plain' || !items.length) return;
    if ($('vp').hidden) { heights = []; return; }
    if (heights.length !== items.length) heights = [...items].map(el => el.offsetHeight);
    const mid = $('vp').clientHeight / 2, gap = 18;
    const size = i => SCALE[Math.min(Math.abs(i - li), 3)];
    // Centres of the lines, from the current one up and down.
    const ys = [];
    ys[li] = mid;
    for (let i = li - 1; i >= 0; i--) ys[i] = ys[i + 1] - heights[i + 1] * size(i + 1) / 2 - gap - heights[i] * size(i) / 2;
    for (let i = li + 1; i < items.length; i++) ys[i] = ys[i - 1] + heights[i - 1] * size(i - 1) / 2 + gap + heights[i] * size(i) / 2;
    for (let i = 0; i < items.length; i++) {
      const a = Math.abs(i - li), el = items[i];
      if (instant) el.style.transition = 'none';
      el.classList.toggle('on', a === 0);
      el.style.transform = `translateY(${(ys[i] - heights[i] / 2).toFixed(1)}px) scale(${size(i)})`;
      el.style.opacity = a <= 3 ? FADE[a] : 0;
      el.style.filter = a === 0 ? '' : `blur(${BLUR[Math.min(a, 3)]}px)`;
      el.style.visibility = a > 5 ? 'hidden' : ''; // far lines are out of view anyway
    }
    if (instant) { ul.offsetHeight; for (const el of items) el.style.transition = ''; }
  }
  // Index of the line being sung at position pos (binary search).
  function lineAt(pos) {
    let lo = 0, hi = synced.length - 1, ans = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (synced[mid].t <= pos + LEAD) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }
  // Nothing playing, or no synced lyrics for this track: big outlined words instead of the lines.
  function applyQuiet() {
    const noLyrics = !track.idle && ['not-found', 'instrumental'].includes(lyr.status);
    const quiet = track.idle || noLyrics;
    $('quiet').hidden = !quiet;
    $('vp').hidden = quiet;
    if (!quiet) return;
    put($('quietTitle'), 'textContent', track.idle ? t('ui.quiet') : $('title').textContent);
    put($('quietNote'), 'textContent', track.idle ? t('ui.quietNote') : lyr.status === 'instrumental' ? t('lyrics.instrumental') : t('ui.noSynced'));
  }

  function showLyrics(r) {
    lyr = r;
    lastScroll = null;
    const ul = $('lines');
    ul.className = r.status === 'synced' ? '' : r.status === 'plain' ? 'plain' : 'msg';
    ul.style.transform = '';
    if (r.status === 'synced') {
      // A "♪" line for the intro and for instrumental breaks (empty lines in the LRC file).
      synced = r.lines.map(l => ({ t: l.t, text: l.text || '♪' }));
      if (!synced.length || synced[0].t > 2) synced.unshift({ t: 0, text: '♪' });
      renderLines(synced.map(l => l.text));
      li = lineAt(clock.now());
    } else if (r.status === 'plain') {
      synced = [];
      renderLines(r.plain);
      ul.style.transform = 'translateY(40px)';
    } else {
      synced = []; li = 0;
      const msg = ['none', 'not-found', 'instrumental'].includes(r.status) ? [] : [t(`lyrics.${r.status}`)];
      renderLines(msg);
    }
    applyState(); // shows the lines or the outlined words before the lines are measured
    focusLine(true);
    wake();
  }
  // New lyrics fade out the old ones first.
  function setLyrics(r) {
    if (!r || r.id !== track.id) return;
    // The same message again (another try while LRCLIB is busy): nothing to redraw.
    if (r.id === lyr.id && r.status === lyr.status && !r.lines && !r.plain) return;
    const ul = $('lines');
    clearTimeout(fadeTimer);
    if (!lyr.id) { showLyrics(r); return; }
    ul.style.opacity = 0;
    fadeTimer = setTimeout(() => { showLyrics(r); ul.style.opacity = 1; }, 250);
  }
  function onLyrics(r) {
    latestLyrics = r;
    setLyrics(r);
  }
  // Called every frame with the current position.
  function updateLyrics(pos, d) {
    if (lyr.status === 'synced' && synced.length) {
      const i = lineAt(pos);
      if (i !== li) { li = i; focusLine(false); }
    } else if (lyr.status === 'plain' && d) {
      // Plain lyrics have no timing: scroll them evenly through the song.
      const ul = $('lines'), vp = $('vp');
      const travel = Math.max(0, ul.scrollHeight - vp.clientHeight * .6);
      const y = Math.round(40 - travel * Math.min(1, pos / d));
      if (y !== lastScroll) { lastScroll = y; ul.style.transform = `translateY(${y}px)`; }
    }
  }

  /* ---------- "Up next" and likes (Spotify Web API, after signing in in the settings) ---------- */
  let web = { loggedIn: false, uri: null, queue: [], liked: false };
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  function renderStar() {
    const el = $('like');
    const mark = `${LW.platform}-${web.liked ? 'on' : 'off'}`;
    if (el.dataset.mark !== mark) { el.dataset.mark = mark; el.innerHTML = LW.icon(web.liked ? 'starOn' : 'star'); }
    el.classList.toggle('on', web.liked);
  }
  // An empty queue (or no sign-in) still fills the card: dashed squares and a short hint.
  function emptyNote(title, long, short, act) {
    const el = document.createElement('div');
    el.className = 'qe' + (act ? ' link' : '');
    if (act) el.dataset.act = act;
    el.innerHTML = '<span class="sq"><i></i><i></i><i></i></span><b></b><span class="long"></span><span class="short"></span>';
    el.querySelector('b').textContent = title;
    el.querySelector('.long').textContent = long;
    el.querySelector('.short').textContent = short;
    return el;
  }
  function renderQueue() {
    const q = $('queue'); q.innerHTML = '';
    const list = web.loggedIn && !track.idle ? web.queue : [];
    stage.dataset.queue = list.length ? 'ok' : 'empty';
    if (!web.loggedIn) q.appendChild(emptyNote(t('ui.queueLoginTitle'), t('ui.queueLogin'), t('ui.queueLoginShort'), 'login'));
    else if (!list.length) q.appendChild(emptyNote(t('ui.queueEmpty'), t('ui.queueEmptyHint'), t('ui.queueEmptyShort')));
    else {
      (S.layout === 'b' ? list.slice(0, 1) : list).forEach((it, k) => {
        const row = document.createElement('div');
        row.className = 'qi';
        row.dataset.act = `q${k}`; // a click plays this track (see act)
        row.innerHTML = '<img alt=""><div style="min-width:0"><div class="t"></div><div class="a"></div></div>';
        // no cover: an empty square instead of a broken image
        row.querySelector('img').src = it.art || BLANK;
        row.querySelector('.t').textContent = it.title; row.querySelector('.a').textContent = it.artist;
        q.appendChild(row);
      });
      // Only whole rows: the ones that do not fit are hidden.
      const room = q.clientHeight;
      for (const row of q.children) if (row.offsetTop - q.offsetTop + row.offsetHeight > room + 1) row.hidden = true;
    }
    const more = S.layout === 'b' && list.length > 1 ? t('ui.more').replace('{n}', list.length - 1) : '';
    put($('qn'), 'textContent', more);
    renderStar();
    reportHits();
    wake();
  }
  function onWeb(n) {
    for (const [key, v] of Object.entries(n || {})) if (v !== undefined) web[key] = v; // only what came
    renderQueue();
  }

  /* ---------- cover with crossfade ---------- */
  let front = $('artA'), back = $('artB');
  function setCover(src) {
    src = src || NO_COVER;
    if (front.dataset.src === src) return;
    const img = back;
    img.onload = () => {
      img.classList.remove('out'); front.classList.add('out');
      [front, back] = [img, front];
    };
    img.onerror = () => { if (src !== NO_COVER) setCover(NO_COVER); };
    img.dataset.src = src;
    img.src = src;
  }

  /* ---------- applying player updates ---------- */
  // The volume bar slides to the new value (CSS).
  function showVolume(v) {
    if (v === track.volume) return;
    track.volume = v;
    $('volBox').classList.toggle('na', v == null);
    $('volBox').classList.toggle('muted', v === 0);
    placeVolume();
    wake();
  }
  // Also after the bar changed its width (another arrangement).
  function placeVolume() {
    const v = track.volume;
    if (v == null) return;
    put($('volBar').style, 'transform', `scaleX(${v / 100})`);
    put($('volKnob').style, 'transform', `translateX(${($('volBar').parentElement.clientWidth * v / 100).toFixed(1)}px)`);
  }
  function setPlaying(on) {
    if (on && !playing) heardAt = performance.now(); // give the sound a moment after Play
    playing = on;
    const pp = $('pp'), icon = `${LW.platform}-${on ? 'pause' : 'play'}`;
    if (pp.dataset.icon !== icon) { pp.dataset.icon = icon; pp.innerHTML = LW.icon(on ? 'pause' : 'play'); }
    applyState();
  }

  function showMessage(state) {
    if (track.id === state) return;
    track = { id: state, idle: true, tone: null, accent: null, cover: NO_COVER, duration: 0, volume: track.volume };
    clock.set(0, false);
    $('title').textContent = t(`state.${state}.title`);
    $('artist').textContent = t(`state.${state}.detail`) || t('state.stopped.detail');
    showVolume(null);
    put($('mode'), 'hidden', true);
    showLyrics({ id: null, status: 'none' });
    renderQueue();
    setPlaying(false);
    reportHits();
    setCover(NO_COVER); applyBg(); applyAccent();
  }

  function showTrack(s) {
    const changed = s.id !== track.id;
    if (changed) {
      const wasIdle = track.idle;
      track = { id: s.id, idle: false, tone: null, accent: null, cover: s.art || NO_COVER, duration: s.duration || 0, volume: track.volume };
      $('title').textContent = s.title || '';
      $('artist').textContent = s.artist || '';
      setLyrics(latestLyrics.id === s.id ? latestLyrics : { id: s.id, status: 'loading' });
      if (web.liked) { web.liked = false; renderStar(); }
      applyBg(); updateColours();
      if (wasIdle) { applyAccent(); renderQueue(); }
    } else if (s.art && s.art !== track.cover) {
      track.cover = s.art; applyBg(); updateColours();
    }
    track.duration = s.duration || track.duration;
    setCover(track.cover);

    // Right after the volume was changed here, keep our value until Spotify / Windows report the new one.
    if (Date.now() > volHold) showVolume(s.volume == null ? null : Math.round(s.volume));
    const modeHidden = s.shuffle == null;
    if ($('mode').hidden !== modeHidden) { $('mode').hidden = modeHidden; reportHits(); }
    $('mode').classList.toggle('on', !!s.shuffle);

    clock.update(s, changed);
    setPlaying(clock.playing);
  }

  let lastSig = '';
  function onPlayer(s) {
    if (s && (s.state === 'playing' || s.state === 'paused') && s.id) showTrack(s);
    else showMessage(s && s.state ? s.state : 'error');
    // While paused the same update comes every second: draw only if something changed.
    const sig = s ? [s.state, s.id, s.playing, Math.round(s.position || 0), s.volume, s.shuffle, s.art].join('|') : '';
    if (playing || sig !== lastSig) wake();
    lastSig = sig;
  }

  /* ---------- particles: snow, butterflies, petals, rain… (the theme chooses, themes.css) ---------- */
  // speed: how fast it falls; sway: side movement; size: in points.
  const KINDS = {
    snow:        { speed: 1,   sway: 6,  size: [.6, 1.4] },  // dots 1.2–2.8 px; every 5th one 3–5.5 px and soft
    butterflies: { speed: .5,  sway: 18, size: [6, 11] },    // a third are butterflies, the rest sparkles
    petals:      { speed: .9,  sway: 14, size: [5, 9] },
    rain:        { speed: 22,  sway: 0,  size: [14, 28] },
    stars:       { speed: .25, sway: 3,  size: [1.5, 3.5] },
    dust:        { speed: -.3, sway: 8,  size: [.8, 2.6] }, // floats up slowly
    leaves:      { speed: .8,  sway: 16, size: [5, 8] },
    glitter:     { speed: .4,  sway: 4,  size: [1.5, 3.5] },
    none:        { speed: 0,   sway: 0,  size: [0, 0] }
  };
  let pKind = 'snow', pColors = ['#fff'];
  const rnd = (a, b) => a + Math.random() * (b - a);
  let made = 0;
  const mk = () => {
    const kind = KINDS[pKind] || KINDS.snow;
    const big = pKind === 'snow' && made++ % 5 === 0;
    return {
      x: Math.random() * W, y: Math.random() * H, s: big ? rnd(1.5, 2.75) : rnd(kind.size[0], kind.size[1]), big,
      v: 5 + Math.random() * 14, w: Math.random() * 6.3, a: .12 + Math.random() * .5,
      rot: Math.random() * 6.3, spin: rnd(-1.2, 1.2),
      c: pColors[Math.floor(Math.random() * pColors.length)],
      fly: pKind === 'butterflies' && Math.random() < .35 // a butterfly, not a sparkle
    };
  };
  let flakes = [];
  function setCount(n) { while (flakes.length < n) flakes.push(mk()); flakes.length = n; }
  // Read the theme's particles (after the theme changed).
  function readTheme() {
    const cs = getComputedStyle(stage);
    const kind = cs.getPropertyValue('--particles').trim() || 'snow';
    pColors = ['--p1', '--p2', '--p3'].map(v => cs.getPropertyValue(v).trim()).filter(Boolean);
    if (kind !== pKind || !flakes.length) { pKind = kind; made = 0; flakes = flakes.map(mk); }
  }
  // A soft white dot for the big snowflakes (blurred once, then only copied).
  const SOFT = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    g.filter = 'blur(1.2px)'; g.fillStyle = '#fff';
    g.beginPath(); g.arc(16, 16, 11, 0, Math.PI * 2); g.fill();
    return c;
  })();

  function star4(x, y, r) {
    sx.beginPath(); sx.moveTo(x, y - r);
    sx.quadraticCurveTo(x, y, x + r, y); sx.quadraticCurveTo(x, y, x, y + r);
    sx.quadraticCurveTo(x, y, x - r, y); sx.quadraticCurveTo(x, y, x, y - r);
    sx.fill();
  }
  function wing(x, y, rx, ry, rot) { sx.beginPath(); sx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); sx.fill(); }
  function drawOne(f) {
    const s = f.s;
    sx.fillStyle = f.c; sx.strokeStyle = f.c;
    switch (pKind) {
      case 'snow':
        sx.globalAlpha = f.a;
        if (f.big) { const d = s * 2 * 32 / 22; sx.drawImage(SOFT, f.x - d / 2, f.y - d / 2, d, d); break; }
        sx.beginPath(); sx.arc(f.x, f.y, s, 0, Math.PI * 2); sx.fill();
        break;
      case 'dust': sx.globalAlpha = f.a * .7; sx.beginPath(); sx.arc(f.x, f.y, s, 0, Math.PI * 2); sx.fill(); break;
      case 'rain':
        sx.globalAlpha = .25 + f.a * .5; sx.lineWidth = 1;
        sx.beginPath(); sx.moveTo(f.x, f.y); sx.lineTo(f.x - s * .18, f.y + s); sx.stroke();
        break;
      case 'stars': case 'glitter':
        sx.globalAlpha = (.35 + .65 * Math.abs(Math.sin(f.w * 2.2))) * Math.min(1, f.a + .35);
        star4(f.x, f.y, s);
        break;
      case 'butterflies':
        if (!f.fly) { sx.globalAlpha = (.3 + .7 * Math.abs(Math.sin(f.w * 2.2))) * .8; star4(f.x, f.y, s * .35); break; }
        sx.globalAlpha = .55 + f.a * .6;
        sx.save(); sx.translate(f.x, f.y); sx.rotate(Math.sin(f.w) * .4);
        sx.scale(.3 + .7 * Math.abs(Math.sin(f.w * 5)), 1); // wings flap
        wing(-s * .55, -s * .25, s * .6, s * .45, -.5); wing(s * .55, -s * .25, s * .6, s * .45, .5);
        wing(-s * .4, s * .35, s * .38, s * .3, .4); wing(s * .4, s * .35, s * .38, s * .3, -.4);
        sx.restore();
        break;
      case 'petals':
        sx.globalAlpha = .55 + f.a * .6;
        sx.save(); sx.translate(f.x, f.y); sx.rotate(f.rot);
        wing(0, 0, s, s * .55, 0);
        sx.restore();
        break;
      case 'leaves':
        sx.globalAlpha = .55 + f.a * .6;
        sx.save(); sx.translate(f.x, f.y); sx.rotate(f.rot);
        sx.beginPath(); sx.moveTo(-s, 0); sx.quadraticCurveTo(0, -s * .6, s, 0); sx.quadraticCurveTo(0, s * .6, -s, 0); sx.fill();
        sx.restore();
        break;
    }
  }
  function drawParticles(dt) {
    const speed = S.snowSpeed, kind = KINDS[pKind] || KINDS.snow;
    sx.clearRect(0, 0, W, H);
    if (pKind === 'none') return;
    const m = Math.max(.4, speed);
    for (const f of flakes) {
      if (playing && speed > 0) {
        f.y += f.v * dt * speed * kind.speed;
        f.w += dt * .5 * m;
        f.x += Math.sin(f.w) * kind.sway * dt * m;
        f.rot += f.spin * dt * m;
      }
      if (f.y > H + 30) { f.y = -30; f.x = Math.random() * W; }
      if (f.y < -30) { f.y = H + 30; f.x = Math.random() * W; }
      drawOne(f);
    }
    sx.globalAlpha = 1;
  }

  /* ---------- Sound card: a spectrum of the computer's sound ----------
     main/audio.js hands the wallpaper the system sound (nothing is recorded or sent); an analyser splits it
     into bands: bass on the left, treble on the right. Without the sound (no permission, an error) the bars
     move in a calm wave. Paused or nothing playing: a flat, faint line. */
  const vc = $('viz'), vx = vc.getContext('2d'), lv = new Array(48).fill(.05);
  let vizAlpha = 1, accentUntil = 0, accentRgb = '163,157,173';
  // The canvas gets as many pixels as the screen has there (twice as many on a Retina screen), so the bars stay sharp.
  let vizK = 1;
  function sizeViz() {
    vizK = (window.devicePixelRatio || 1) * k;
    const w = Math.round(vc.clientWidth * vizK), h = Math.round(vc.clientHeight * vizK);
    if (w && h && (vc.width !== w || vc.height !== h)) { vc.width = w; vc.height = h; }
  }

  let actx = null, analyser = null, spectrum = null, audioTries = 0;
  // Called by the main process "as a click" (getDisplayMedia needs one), see main/audio.js.
  window.lwStartAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      stream.getVideoTracks().forEach(tr => tr.stop()); // only the sound is used
      const tr = stream.getAudioTracks()[0];
      if (!tr) throw new Error('the system gave no sound');
      actx = new AudioContext();
      analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = .5;
      analyser.minDecibels = -80; analyser.maxDecibels = -22;
      actx.createMediaStreamSource(new MediaStream([tr])).connect(analyser); // not to the speakers: no echo
      spectrum = new Uint8Array(analyser.frequencyBinCount);
      // The sound device changed or went away: listen again in a few seconds.
      tr.onended = () => {
        api.log('warn', 'Sound card: the system sound stopped');
        analyser = null; actx.close().catch(() => {}); actx = null;
        if (++audioTries < 5) setTimeout(() => api.startAudio(), 5000);
      };
      audioTries = 0;
      heardAt = performance.now();
      api.log('info', `Sound card: listening to the system sound (${actx.sampleRate} Hz)`);
      wake();
    } catch (e) {
      analyser = null;
      api.log('warn', `Sound card: no system sound (${e.name}: ${e.message}); the bars move in a calm wave`);
    }
  };
  // The analyser keeps running (on macOS the system sound did not come back after pausing it); it costs little.
  // If Spotify plays with its volume up and nothing is heard for 5 s, the sound got lost: listen again
  // (at most every 20 s, and up to 3 times in a row).
  let heardAt = 0, relistenAt = 0, relistens = 0;
  function checkHeard(levels, now) {
    if (levels.some(v => v > .02)) { heardAt = now; relistens = 0; return; }
    if (!(track.volume > 0) || now - heardAt < 5000 || now - relistenAt < 20000 || relistens >= 3) return;
    relistenAt = now; relistens++;
    api.log('warn', 'Sound card: no sound for 5 s while Spotify plays, listening again');
    analyser = null; if (actx) actx.close().catch(() => {}); actx = null;
    api.startAudio();
  }

  // n bands from 40 Hz to 14 kHz, evenly spread over the octaves (as we hear them).
  function bands(n) {
    analyser.getByteFrequencyData(spectrum);
    const hz = actx.sampleRate / analyser.fftSize, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const f0 = 40 * Math.pow(350, i / n), f1 = 40 * Math.pow(350, (i + 1) / n);
      const a = Math.max(1, Math.floor(f0 / hz)), b = Math.max(a + 1, Math.ceil(f1 / hz));
      let sum = 0;
      for (let j = a; j < b && j < spectrum.length; j++) sum += spectrum[j];
      // Treble is quieter than bass: lift it a little so the right side moves too.
      const v = sum / (b - a) / 255 * (1 + .5 * i / (n - 1));
      out[i] = Math.min(1, Math.pow(v, 1.6));
    }
    return out;
  }

  function heightsFor(n) {
    if (!playing) return () => .05;
    if (analyser) {
      const b = bands(n);
      checkHeard(b, performance.now());
      return i => .04 + .96 * b[i];
    }
    // No sound to listen to: a calm wave, bass a bit taller.
    const tm = performance.now() / 1000;
    return i => .14 + .1 * (1 - .4 * i / (n - 1)) * (1 + Math.sin(tm * 2.2 + i * .55));
  }

  function drawViz(now, dt) {
    const VW = vc.width, VH = vc.height;
    if (!VW || !VH) return false;
    // The accent colour, also while it changes (CSS animates it over 600 ms).
    if (now < accentUntil || !accentRgb) {
      const m = getComputedStyle(stage).getPropertyValue('--accent').match(/[\d.]+/g);
      if (m && m.length >= 3) accentRgb = m.slice(0, 3).join(',');
    }
    const n = Math.max(10, Math.min(48, Math.round(VW / vizK / 10))), step = VW / n, bw = step * .6, target = heightsFor(n);
    const alpha = playing ? 1 : .35;
    vizAlpha += (alpha - vizAlpha) * .2;
    if (Math.abs(alpha - vizAlpha) < .01) vizAlpha = alpha;
    vx.clearRect(0, 0, VW, VH);
    vx.globalAlpha = vizAlpha;
    vx.fillStyle = `rgb(${accentRgb})`;
    let moving = vizAlpha !== alpha || now < accentUntil;
    for (let i = 0; i < n; i++) {
      const tgt = Math.min(1, target(i));
      // Follow the target (the same speed at any frame rate): up within a frame or two, down smoothly.
      lv[i] += (tgt - lv[i]) * (1 - Math.exp(-dt * (tgt > lv[i] ? 45 : 9)));
      const h = Math.max(3 * vizK, lv[i] * VH), x = i * step + (step - bw) / 2;
      vx.beginPath();
      vx.roundRect(x, VH - h, bw, h, Math.min(2 * vizK, bw / 2));
      vx.fill();
      if (Math.abs(tgt - lv[i]) > .003) moving = true;
    }
    vx.globalAlpha = 1;
    return moving;
  }

  /* ---------- main loop ----------
     Up to 60 frames per second (45, 30, 20 or 15, chosen in the settings). When nothing moves (music paused, visualizer settled) it sleeps until
     something changes, and while the wallpaper is paused (locked screen, game, battery) it stops completely. */
  let last = performance.now(), lastFrame = 0, raf = 0, frameTimer = 0, frozen = false, lastPct = -1;
  const shown = {};
  const setText = (id, v) => { if (shown[id] !== v) { shown[id] = v; $(id).textContent = v; } };
  function wake() {
    if (raf || frameTimer || frozen) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  // Frames follow the screen refresh, and screen refreshes that come too early for the chosen rate are skipped.
  // (Waiting with a timer and then for the next refresh gave uneven gaps between frames: choppy movement.)
  // At low rates a timer sleeps through most of the gap first, so the browser is not woken on every refresh.
  function scheduleFrame() {
    if (frozen || frameTimer || raf) return;
    const wait = 1000 / (S.fps || 60) - (performance.now() - lastFrame);
    if (wait > 20) frameTimer = setTimeout(() => { frameTimer = 0; if (!frozen) raf = requestAnimationFrame(loop); }, wait - 12);
    else raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    raf = 0;
    if (frozen) return;
    // Too early for the chosen rate (a 120 Hz screen at 60 frames per second): wait for the next refresh.
    // 3 ms of slack, so a refresh that comes a little early is not skipped.
    if (lastFrame && now - lastFrame < 1000 / (S.fps || 60) - 3) { raf = requestAnimationFrame(loop); return; }
    lastFrame = now;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const d = track.duration, pos = d ? (seekPreview != null ? seekPreview * d : Math.min(d, clock.now())) : 0;
    const pct = d ? Math.round(pos / d * 1000) / 1000 : 0;
    if (pct !== lastPct) {
      lastPct = pct;
      $('fill').style.transform = `scaleX(${pct})`;
      $('knob').style.transform = `translateX(${(pct * $('fill').parentElement.clientWidth).toFixed(1)}px)`;
    }
    // Mac shows the time left (−1:56), Windows the length of the track (4:10).
    setText('cur', d ? fmt(pos) : DASH);
    setText('rem', !d ? DASH : plat === 'mac' ? '−' + fmt(d - pos) : fmt(d));
    updateLyrics(pos, d);
    drawParticles(dt);
    const vizMoving = drawViz(now, dt);
    if (playing || vizMoving) scheduleFrame();
  }
  function setFrozen(st) {
    frozen = !!st.paused;
    heardAt = performance.now();
    document.body.classList.toggle('frozen', frozen);
    if (!frozen) wake();
  }

  /* ---------- arrangement A ↔ B ----------
     Shared parts fly to their new place (FLIP: remember where they were, switch the arrangement, then play the
     difference back as a transform); the lyrics and the two cards fade out where they were and fade in at the new
     place. Calm and soft: 700 ms, no overshoot. With "reduce motion" on: a plain 250 ms fade. */
  const EASE = 'cubic-bezier(.45, 0, .25, 1)', FLY_MS = 700;
  let ghosts = [];
  function placeGlow() {
    const b = box(S.layout === 'b' ? $('player') : $('cover'));
    const glow = $('glow');
    glow.style.transform = `translate(${(b.x + b.w / 2).toFixed(0)}px, ${(b.y + b.h / 2).toFixed(0)}px)`;
    if (!glow.classList.contains('ready')) requestAnimationFrame(() => glow.classList.add('ready')); // glide only after the first placing
  }
  // Everything that depends on the arrangement, after it changed.
  function relayout() {
    sizeViz();
    heights = [];
    focusLine(true);
    applyState();
    renderQueue();
    placeGlow();
    placeVolume();
  }
  // A still copy of a part at its old place, to fade out while the real one moves.
  function ghost(el) {
    const b = box(el), g = el.cloneNode(true);
    g.querySelectorAll('[data-act]').forEach(x => x.removeAttribute('data-act'));
    g.querySelectorAll('[data-fly]').forEach(x => x.removeAttribute('data-fly'));
    const from = el.querySelectorAll('canvas'), to = g.querySelectorAll('canvas');
    from.forEach((c, i) => { to[i].width = c.width; to[i].height = c.height; to[i].getContext('2d').drawImage(c, 0, 0); });
    Object.assign(g.style, { position: 'absolute', left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', margin: 0, pointerEvents: 'none' });
    g.removeAttribute('id');
    stage.appendChild(g);
    return g;
  }
  function applyLayout(name, animate) {
    if (name !== 'a' && name !== 'b') name = 'a';
    if (stage.dataset.layout === name) return;
    // A switch during a switch: finish the old one at once.
    stage.getAnimations({ subtree: true }).forEach(a => { if (a.id === 'lw') a.finish(); });
    ghosts.forEach(g => g.remove()); ghosts = [];
    if (!animate || frozen) { stage.dataset.layout = name; S.layout = name; relayout(); reportHits(); return; }
    if (reduce) {
      stage.dataset.layout = name; S.layout = name; relayout();
      $('ui').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease', id: 'lw' });
      reportHits();
      return;
    }
    const fly = [...stage.querySelectorAll('[data-fly]')];
    const fades = [...stage.querySelectorAll('[data-fade]')];
    const before = fly.map(el => ({ b: box(el), r: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 }));
    ghosts = fades.map(ghost);
    stage.dataset.layout = name; S.layout = name;
    relayout();
    fly.forEach((el, i) => {
      const a = before[i].b, b = box(el);
      if (!a.w || !b.w) return;
      const r1 = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r0 = before[i].r;
      if (el.classList.contains('pbg')) {
        // The player's glass changes its real size (a stretched glass would bend its corners).
        const p = box(el.parentElement);
        el.animate([
          { left: a.x - p.x + 'px', top: a.y - p.y + 'px', width: a.w + 'px', height: a.h + 'px', right: 'auto', bottom: 'auto', borderRadius: r0 + 'px' },
          { left: b.x - p.x + 'px', top: b.y - p.y + 'px', width: b.w + 'px', height: b.h + 'px', right: 'auto', bottom: 'auto', borderRadius: r1 + 'px' }
        ], { duration: FLY_MS, easing: EASE, id: 'lw' });
        return;
      }
      // Everything else keeps its shape: one scale, centre to centre.
      const s = Math.min(a.w / b.w, a.h / b.h);
      const dx = a.x + a.w / 2 - (b.x + b.w / 2), dy = a.y + a.h / 2 - (b.y + b.h / 2);
      const from = { transformOrigin: '50% 50%', transform: `translate(${dx}px, ${dy}px) scale(${s})` };
      const to = { transformOrigin: '50% 50%', transform: 'none' };
      if (r0 || r1) { from.borderRadius = r0 / s + 'px'; to.borderRadius = r1 + 'px'; }
      el.animate([from, to], { duration: FLY_MS, easing: EASE, id: 'lw' });
    });
    // Lyrics, Sound and Up next: out at the old place (260 ms), in at the new one (440 ms after 360 ms).
    ghosts.forEach(g => {
      g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 260, easing: 'ease-in', fill: 'forwards', id: 'lw' })
        .finished.then(() => g.remove(), () => g.remove());
    });
    fades.forEach(el => {
      // The lyrics block keeps its own opacity (paused, hidden), so its inside fades instead.
      const parts = el.id === 'lyr' ? [$('vp'), $('quiet')] : [el];
      parts.forEach(p => p.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 440, delay: 360, easing: EASE, fill: 'backwards', id: 'lw' }));
    });
    setTimeout(() => { ghosts = ghosts.filter(g => g.isConnected); reportHits(); }, FLY_MS + 120);
  }

  /* ---------- buttons ----------
     Every element with data-act is a button. On the desktop the wallpaper itself gets no clicks (they go to
     the desktop icons), so an invisible click layer above the icons (main/hitlayer.js) reports them here.
     In "npm run window" the elements are clicked directly. fx: where in the element (0..1, left to right). */
  let toastTimer = null;
  function toast(text) {
    const el = $('toast');
    el.textContent = text; el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 300); }, 2600);
  }
  const actEl = id => document.querySelector(`[data-act="${id}"]`);
  function press(id) {
    const el = actEl(id); if (!el) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 160);
  }
  function hover(id) {
    document.querySelectorAll('[data-act].hover').forEach(el => el.classList.remove('hover'));
    if (id && actEl(id)) actEl(id).classList.add('hover');
  }
  // Volume to Spotify at most 10 times a second; the last value always goes out.
  let volSentAt = 0, volTimer = 0;
  function sendVolume(v, rid) {
    volHold = Date.now() + 2500;
    clearTimeout(volTimer);
    const send = () => { volTimer = 0; volSentAt = Date.now(); api.control('volume', v, rid); };
    const wait = 100 - (Date.now() - volSentAt);
    if (wait <= 0) send(); else volTimer = setTimeout(send, wait);
  }
  function userVolume(v, rid) {
    if (track.volume == null) return;
    v = Math.round(Math.max(0, Math.min(100, v)));
    if (v === track.volume) return;
    showVolume(v);
    sendVolume(v, rid);
  }

  // Bars that can be dragged: the value follows the mouse; the track position is sent when the mouse is let go.
  const SLIDERS = ['progress', 'volume'];
  let slide = null; // { id, rid }
  function slideTo(fx, final) {
    const f = Math.max(0, Math.min(1, fx));
    if (slide.id === 'volume') { userVolume(f * 100, slide.rid); return; }
    if (!track.id || !track.duration) return;
    seekPreview = f;
    if (final) {
      const to = f * track.duration;
      seekPreview = null;
      clock.set(to, clock.playing); api.control('seek', to, slide.rid);
    }
    wake();
  }

  // The mouse wheel over the volume bar or the speaker: 5% per notch.
  let wheelAcc = 0;
  function wheel(dy, rid) {
    if (track.volume == null) return;
    wheelAcc += dy;
    const steps = Math.trunc(wheelAcc);
    if (!steps) return;
    wheelAcc -= steps;
    userVolume(Math.round(track.volume / 5) * 5 + steps * 5, rid);
  }

  function act(id, rid) {
    // Nothing playing: only Play (and the links) work.
    if (track.idle && ['like', 'prev', 'next', 'more', 'progress'].includes(id)) return;
    press(id);
    const control = (cmd, value) => api.control(cmd, value, rid);
    // A track in "Up next": skip to it (the first one is simply the next track).
    if (/^q\d$/.test(id)) { control('skip', Number(id.slice(1)) + 1); return; }
    switch (id) {
      case 'prev': case 'next': control(id); break;
      case 'pp': clock.toggle(); setPlaying(clock.playing); control('toggle'); wake(); break;
      case 'mute':
        if (track.volume == null) break;
        if (track.volume > 0) { preMute = track.volume; showVolume(0); } else showVolume(preMute || 50);
        volHold = Date.now() + 2500; control('mute');
        break;
      case 'shuffle': control('shuffle'); break;
      case 'cover': control('open'); break;
      case 'lyrics': api.setLook('showLyrics', !S.showLyrics); break;
      case 'device': api.openSoundSettings(); break;
      case 'more': api.openControl(); break;
      case 'like': {
        if (!web.loggedIn) { toast(t('ui.likeLogin')); break; }
        const want = !web.liked;
        web.liked = want; renderStar(); // right away; corrected if Spotify says no
        api.webLike(want).then(res => {
          if (res.error) toast(t(res.error === 'no-track' ? 'ui.likeNoTrack' : 'ui.likeFailed'));
          onWeb({ uri: res.uri, liked: res.liked, queue: res.queue });
        });
        break;
      }
      case 'login': api.openSettings('the "Sign in" link on the wallpaper'); break;
    }
  }

  /* Mouse events, from the click layer (main/hitlayer.js) or, in "npm run window", from this page:
     { type: 'hover' | 'press' | 'drag' | 'release' | 'click', id, fx, rid } and { type: 'wheel', id, dy, rid }.
     fx: where in the element (0 = left edge, 1 = right edge); dy > 0: wheel away from you, 1 = one notch.
     rid: request id, so one press can be followed through the log. */
  function input(e) {
    const rid = e.rid;
    switch (e.type) {
      case 'hover': hover(e.id); break;
      case 'press':
        if (!SLIDERS.includes(e.id)) break;
        slide = { id: e.id, rid };
        actEl(e.id).classList.add('drag');
        slideTo(e.fx, false);
        break;
      case 'drag': if (slide && slide.id === e.id) slideTo(e.fx, false); break;
      case 'release':
        if (!slide || slide.id !== e.id) break;
        slideTo(e.fx, true);
        actEl(e.id).classList.remove('drag');
        slide = null;
        break;
      case 'click': if (!SLIDERS.includes(e.id)) act(e.id, rid); break;
      case 'wheel': if (['volume', 'mute'].includes(e.id)) wheel(e.dy, rid); break;
    }
  }
  api.onHit(input);

  // "npm run window": the page gets the mouse itself.
  let ownClicks = 0, ownRid = null, ownDrag = null;
  const fxOf = (el, e) => { const r = el.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-act]');
    ownRid = `w${++ownClicks}`;
    if (!el || e.button || !SLIDERS.includes(el.dataset.act)) return;
    el.setPointerCapture(e.pointerId);
    ownDrag = el;
    input({ type: 'press', id: el.dataset.act, fx: fxOf(el, e), rid: ownRid });
  });
  document.addEventListener('pointermove', e => { if (ownDrag) input({ type: 'drag', id: ownDrag.dataset.act, fx: fxOf(ownDrag, e), rid: ownRid }); });
  document.addEventListener('pointerup', e => {
    if (!ownDrag) return;
    input({ type: 'release', id: ownDrag.dataset.act, fx: fxOf(ownDrag, e), rid: ownRid });
    ownDrag = null;
  });
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el) input({ type: 'click', id: el.dataset.act, fx: fxOf(el, e), rid: ownRid || `w${++ownClicks}` });
  });
  document.addEventListener('wheel', e => {
    const el = e.target.closest('[data-act]');
    if (el && e.deltaY) input({ type: 'wheel', id: el.dataset.act, dy: -e.deltaY / (e.deltaMode === 1 ? 3 : 100), rid: `w${++ownClicks}` });
  }, { passive: true });
  // Tell the click layer where the buttons are (in this window's coordinates).
  let hitsTimer = null;
  function reportHits() {
    clearTimeout(hitsTimer);
    hitsTimer = setTimeout(() => {
      // Thin elements (the 4–5 px progress and volume bars) get a 24 px tall target.
      const MIN = 24;
      const grow = (start, len) => (len < MIN ? [start - (MIN - len) / 2, MIN] : [start, len]);
      const items = [...document.querySelectorAll('[data-act]')].map(el => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const [x, w] = grow(r.left, r.width), [y, h] = grow(r.top, r.height);
        return { id: el.dataset.act, x, y, w, h };
      }).filter(Boolean);
      api.reportHits(items);
    }, 120);
  }

  /* ---------- start ---------- */
  const refit = () => { fit(); relayout(); wake(); reportHits(); };
  addEventListener('resize', refit); api.onLayoutChanged(refit); fit(); sizeViz();
  api.onRender(setFrozen);
  setFrozen(await api.getRender());
  // Apply the look; fetch the own picture only when it is new.
  let lookApplied = false;
  function applyLook(look) {
    const newImage = look.imageVersion !== S.imageVersion || (look.bg === 'photo' && !userImg);
    const layout = look.layout || 'a';
    S = { ...look, layout: S.layout };
    stage.dataset.theme = S.theme || 'default';
    readTheme();
    setCount(S.snowOn === false ? 0 : S.snowCount);
    applyBg(); applyAccent();
    $('lyr').classList.toggle('off', !S.showLyrics);
    applyLayout(layout, lookApplied);
    applyState();
    lookApplied = true;
    wake();
    if (newImage && look.hasImage) api.getImage().then(url => { userImg = url; applyBg(); });
  }
  api.onLook(applyLook);
  applyLook(await api.getLook());
  tick();
  showMessage('starting');
  api.onPlayer(onPlayer);
  onPlayer(await api.getPlayer());
  api.onLyrics(onLyrics);
  api.startAudio();
  api.onWebNow(onWeb);
  api.onWebState(st => onWeb({ loggedIn: st.loggedIn }));
  onWeb(await api.getWebNow());
  onLyrics(await api.getLyrics());
  if (document.fonts) document.fonts.ready.then(() => { relayout(); reportHits(); });
  reportHits();
  wake();
})();
