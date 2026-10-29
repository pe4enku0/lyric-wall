/* Wallpaper UI. The look and animations come from mockup.html; the data comes from the main process. */
(async () => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  // Write to the page only when the value really changes: every write makes the glass repaint.
  const put = (obj, key, value) => { if (obj[key] !== value) obj[key] = value; };
  const stage = $('stage');
  const api = window.lyricWall;

  /* ---------- language ---------- */
  const { info, t } = await LW.initI18n();
  $('device').textContent = info.deviceLabel;

  // Look from the settings window (main/appearance.js); the own picture is loaded separately.
  let S = { bg: 'dusk', imgBlur: 0, imgDim: 30, snowSpeed: reduce ? 0 : 1, snowCount: 90, imageVersion: 0, showLyrics: true, audioReactive: false, fps: 30 };
  let userImg = null;

  /* The mockup is drawn for 1280×800. Scale so the height is ~800 mockup points
     and the width stretches to the screen (16:9, 16:10 and so on). */
  let W = 1280, H = 800;
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
    const k = Math.min(innerWidth / 1280, innerHeight / 800);
    W = Math.round(innerWidth / k); H = Math.round(innerHeight / k);
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    stage.style.transform = `scale(${k})`;
    // Keep the content clear of the menu bar, Dock and taskbar (the background still fills the whole screen).
    const ins = insets(), cols = $('cols').style;
    cols.top = Math.max(74, ins.top / k + 34) + 'px';
    cols.bottom = Math.max(56, ins.bottom / k + 28) + 'px';
    cols.left = Math.max(64, ins.left / k + 40) + 'px';
    cols.right = Math.max(56, ins.right / k + 40) + 'px';
    sc.width = W; sc.height = H;
    for (const f of flakes) { if (f.x > W) f.x = Math.random() * W; if (f.y > H) f.y = Math.random() * H; }
  }

  $('grain').style.backgroundImage = `url(${LW.grain()})`;

  /* Cover shown when there is no track (or no cover). */
  const NO_COVER = (() => {
    const c = document.createElement('canvas'); c.width = 960; c.height = 472;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 960, 472);
    gr.addColorStop(0, '#2a2a2e'); gr.addColorStop(1, '#0c0c0e');
    g.fillStyle = gr; g.fillRect(0, 0, 960, 472);
    const m = g.createRadialGradient(330, 200, 10, 330, 200, 300);
    m.addColorStop(0, 'rgba(240,240,245,.35)'); m.addColorStop(1, 'rgba(200,200,210,0)');
    g.fillStyle = m; g.fillRect(0, 0, 960, 472);
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
  const DUSK = dusk();

  /* ---------- current track ---------- */
  let track = { id: null, tone: null, cover: NO_COVER, duration: 0, volume: null };
  let volHold = 0;
  let playing = false;
  const clock = LW.createClock();

  // Colour of the cover for "From cover": the average hue of its colourful pixels (null = a grey cover).
  function coverTone(src) {
    return new Promise(resolve => {
      if (!src || src === NO_COVER) { resolve(null); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 24;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, 24, 24);
          const d = g.getImageData(0, 0, 24, 24).data, n = d.length / 4;
          let x = 0, y = 0, w = 0, sat = 0;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i] / 255, gr = d[i + 1] / 255, b = d[i + 2] / 255;
            const max = Math.max(r, gr, b), min = Math.min(r, gr, b), ch = max - min;
            if (!ch) continue;
            const h = (max === r ? (gr - b) / ch : max === gr ? (b - r) / ch + 2 : (r - gr) / ch + 4) * Math.PI / 3;
            x += Math.cos(h) * ch; y += Math.sin(h) * ch; w += ch; // colourful pixels count more
            sat += ch / (1 - Math.abs(max + min - 1));
          }
          resolve(w / n < .04 ? { hue: null, sat: 0 } : { hue: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360, sat: sat / n });
        } catch (_) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  function updateTone() {
    const id = track.id;
    coverTone(track.cover).then(tone => { if (track.id === id) { track.tone = tone; applyBg(); } });
  }

  // Tint of the gradient behind the glass. The main glow uses hue + 120 (as in the mockup).
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
    const el = $('bgimg'), dm = $('dim');
    let src = null;
    if (b.img === 'dusk') src = DUSK;
    else if (b.img === 'photo') src = userImg || DUSK;
    else if (b.img === 'cover') src = track.cover;
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
  const hms = s => { s = Math.floor(s); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':'); };

  /* ---------- lyrics (main/lyrics.js loads them from LRCLIB) ---------- */
  const LEAD = 0.35; // switch to a line a moment before it is sung
  let lyr = { id: null, status: 'none' }; // what is shown now
  let latestLyrics = { id: null };        // last result from the main process (may arrive before the track)
  let synced = [];                        // [{ t, text }] for synced lyrics
  let li = 0;                             // current line
  let fadeTimer = null;
  let lastScroll = null;

  function renderLines(lines) {
    const ul = $('lines'); ul.innerHTML = '';
    lines.forEach(text => {
      const el = document.createElement('li');
      if (text) el.textContent = text; else el.className = 'gap';
      ul.appendChild(el);
    });
  }
  function focusLine(instant) {
    const ul = $('lines'), items = ul.children;
    if (lyr.status === 'plain') return;
    for (let i = 0; i < items.length; i++) {
      const d = i - li, a = Math.abs(d), el = items[i];
      el.classList.toggle('on', d === 0);
      el.style.filter = d === 0 ? 'none' : d < 0 ? `blur(${1.6 + a * 1.2}px)` : `blur(${Math.min(2.4 + a * 1.6, 8)}px)`;
      el.style.opacity = d === 0 ? 1 : d < 0 ? Math.max(.2, .62 - a * .15) : Math.max(.22, .7 - a * .14);
      el.style.transform = d === 0 ? 'scale(1)' : 'scale(.97)';
      el.style.visibility = a > 7 ? 'hidden' : ''; // far lines are out of view anyway
    }
    const target = items[li]; if (!target) return;
    if (instant) ul.style.transition = 'none';
    ul.style.transform = `translateY(${118 - target.offsetTop}px)`;
    if (instant) { ul.offsetHeight; ul.style.transition = ''; }
  }
  // Index of the line being sung at position pos (binary search).
  function lineAt(pos) {
    let lo = 0, hi = synced.length - 1, ans = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (synced[mid].t <= pos + LEAD) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }

  function showLyrics(r) {
    lyr = r;
    lastScroll = null;
    $('live').hidden = r.status !== 'synced';
    const ul = $('lines');
    ul.className = r.status === 'synced' ? '' : r.status === 'plain' ? 'plain' : 'msg';
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
      renderLines(r.status === 'none' ? [] : [t(`lyrics.${r.status}`)]);
    }
    focusLine(true);
    wake();
  }
  // New lyrics fade out the old ones first.
  function setLyrics(r) {
    if (!r || r.id !== track.id) return;
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
      const ul = $('lines'), vp = ul.parentElement;
      const travel = Math.max(0, ul.scrollHeight - vp.clientHeight * .6);
      const y = Math.round(40 - travel * Math.min(1, pos / d));
      if (y !== lastScroll) { lastScroll = y; ul.style.transform = `translateY(${y}px)`; }
    }
  }

  /* ---------- "Up next" and likes (Spotify Web API, after signing in in the settings) ---------- */
  let web = { loggedIn: false, uri: null, queue: [], liked: false };
  const STAR = fill => `<svg width="15" height="15" viewBox="0 0 24 24" fill="${fill}" stroke="#fff" stroke-width="2"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/></svg>`;
  const PLAY_SMALL = '<svg width="11" height="11" viewBox="0 0 24 24" fill="#3d3a42"><path d="M7 4v16l13-8Z"/></svg>';
  const tracksWord = n => t(n === 1 ? 'ui.tracks.one' : n < 5 ? 'ui.tracks.few' : 'ui.tracks.many');
  function renderStar() {
    const el = $('like');
    const mark = web.liked ? 'on' : 'off';
    if (el.dataset.mark !== mark) { el.dataset.mark = mark; el.innerHTML = STAR(web.liked ? '#fff' : 'none'); }
  }
  function renderQueue() {
    const q = $('queue'); q.innerHTML = '';
    if (web.loggedIn && web.queue.length) {
      web.queue.forEach((it, k) => {
        const row = document.createElement('div');
        row.className = 'qi';
        row.innerHTML = `<img alt=""><div style="min-width:0"><div class="t"></div><div class="a"></div></div><span class="c${k === 0 ? ' on' : ''}">${k === 0 ? PLAY_SMALL : ''}</span>`;
        // no cover: an empty circle instead of a broken image
        row.querySelector('img').src = it.art || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
        row.querySelector('.t').textContent = it.title; row.querySelector('.a').textContent = it.artist;
        q.appendChild(row);
      });
      $('qn').textContent = `${web.queue.length} ${tracksWord(web.queue.length)}`;
    } else {
      const note = document.createElement('div');
      note.className = 'qe';
      note.textContent = t(web.loggedIn ? 'ui.queueEmpty' : 'ui.queueLogin');
      if (!web.loggedIn) { note.dataset.act = 'login'; note.classList.add('link'); }
      q.appendChild(note);
      $('qn').textContent = '';
    }
    renderStar();
    reportHits();
    wake();
  }
  function onWeb(n) {
    for (const [k, v] of Object.entries(n || {})) if (v !== undefined) web[k] = v; // only what came
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
  const PAUSE_ICON = '<rect x="1" y="1" width="5.5" height="22" rx="1.6"/><rect x="11.5" y="1" width="5.5" height="22" rx="1.6"/>';
  const PLAY_ICON = '<path d="M2 1 17 12 2 23Z"/>';
  function showVolume(v) {
    if (v === track.volume) return;
    track.volume = v;
    if (v == null) { put($('vol'), 'textContent', '—'); put($('volBox').style, 'visibility', 'hidden'); return; }
    put($('vol'), 'textContent', String(v));
    put($('volBar').style, 'width', v + '%');
    put($('volBox').style, 'visibility', '');
    wake();
  }
  function setPlaying(on) {
    if (playing !== on) setTimeout(syncAudio);
    playing = on;
    const pp = $('pp'), icon = on ? 'pause' : 'play';
    if (pp.dataset.icon !== icon) { pp.dataset.icon = icon; pp.innerHTML = on ? PAUSE_ICON : PLAY_ICON; }
  }

  function showMessage(state) {
    if (track.id === state) return;
    track = { id: state, tone: null, cover: NO_COVER, duration: 0, volume: null };
    clock.set(0, false); setPlaying(false);
    $('title').textContent = t(`state.${state}.title`);
    $('artist').textContent = t(`state.${state}.detail`);
    $('capL').textContent = 'SPOTIFY';
    put($('vol'), 'textContent', '—'); put($('volBox').style, 'visibility', 'hidden');
    put($('mode'), 'hidden', true);
    track.volume = null;
    showLyrics({ id: null, status: 'none' });
    reportHits();
    setCover(NO_COVER); applyBg();
  }

  function showTrack(s) {
    const changed = s.id !== track.id;
    if (changed) {
      track = { id: s.id, tone: null, cover: s.art || NO_COVER, duration: s.duration || 0, volume: track.volume };
      $('title').textContent = s.title || '';
      $('artist').textContent = s.artist || '';
      $('capL').textContent = [s.artist, s.album].filter(Boolean).join(' · ').toUpperCase();
      setLyrics(latestLyrics.id === s.id ? latestLyrics : { id: s.id, status: 'loading' });
      if (web.liked) { web.liked = false; renderStar(); }
      applyBg(); updateTone();
    } else if (s.art && s.art !== track.cover) {
      track.cover = s.art; applyBg(); updateTone();
    }
    track.duration = s.duration || track.duration;
    setCover(track.cover);

    // Right after the volume was changed here, keep our value until Spotify / Windows report the new one.
    if (Date.now() > volHold) showVolume(s.volume == null ? null : Math.round(s.volume));
    const modeHidden = s.shuffle == null;
    if ($('mode').hidden !== modeHidden) { $('mode').hidden = modeHidden; reportHits(); }
    if (s.shuffle != null) put($('mode'), 'textContent', t(s.shuffle ? 'ui.shuffleOn' : 'ui.shuffleOff'));

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

  /* ---------- snow ---------- */
  const mk = () => ({ x: Math.random() * W, y: Math.random() * H, r: .5 + Math.random() * 1.6,
    v: 5 + Math.random() * 14, w: Math.random() * 6.3, a: .12 + Math.random() * .5 });
  let flakes = [];
  function setCount(n) { while (flakes.length < n) flakes.push(mk()); flakes.length = n; }
  function drawSnow(dt) {
    const speed = S.snowSpeed;
    sx.clearRect(0, 0, W, H);
    for (const f of flakes) {
      if (playing && speed > 0) { f.y += f.v * dt * speed; f.w += dt * .5 * Math.max(.4, speed); f.x += Math.sin(f.w) * 6 * dt * Math.max(.4, speed); }
      if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
      sx.globalAlpha = f.a; sx.fillStyle = '#f1eef4';
      sx.beginPath(); sx.arc(f.x, f.y, f.r, 0, Math.PI * 2); sx.fill();
    }
    sx.globalAlpha = 1;
  }

  /* ---------- sound card: volume scale, plus the real sound when the system lets us listen ---------- */
  const vc = $('viz'), vx = vc.getContext('2d'), N = 26, lv = new Array(N).fill(.2);
  // Bars grow from left to right like a volume scale; the bars up to the current volume are lit.
  const ramp = i => .2 + .8 * i / (N - 1);
  let audio = null;          // { stream, ctx, analyser, data } while listening to the computer's sound
  let audioStarting = false, audioFailed = false, audioStopTimer = null;
  const footBase = t(info.platform === 'darwin' ? 'ui.volSpotify' : 'ui.volSystem');
  const setFoot = () => put($('foot'), 'textContent', audio ? `${footBase} · ${t('ui.withSound')}` : footBase);

  async function startAudio() {
    if (audio || audioStarting || audioFailed) return;
    audioStarting = true;
    try {
      // The main process answers with the computer's sound ("loopback"); the screen picture is not needed.
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      stream.getVideoTracks().forEach(tr => tr.stop());
      if (!stream.getAudioTracks().length) throw new Error('no sound track');
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128; analyser.smoothingTimeConstant = .6;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audio = { stream, ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
      api.log('info', 'Sound card: listening to the computer sound');
      setFoot();
    } catch (e) {
      audioFailed = true; // do not ask again until the option is turned off and on
      api.log('warn', 'Sound card: cannot listen to the computer sound, showing the volume only: ' + e.message);
    }
    audioStarting = false;
    if (audio && !(S.audioReactive && !frozen)) stopAudio();
  }
  function stopAudio() {
    if (!audio) return;
    audio.stream.getTracks().forEach(tr => tr.stop());
    audio.ctx.close();
    audio = null;
    setFoot();
  }
  // Listen only while music plays (stop 15 s after a pause), never while the wallpaper is paused.
  function syncAudio() {
    const want = S.audioReactive && !frozen;
    if (!want) { clearTimeout(audioStopTimer); audioStopTimer = null; stopAudio(); return; }
    if (playing) { clearTimeout(audioStopTimer); audioStopTimer = null; startAudio(); }
    else if (audio && !audioStopTimer) audioStopTimer = setTimeout(() => { audioStopTimer = null; if (!playing) stopAudio(); }, 15000);
  }

  function drawViz() {
    const VW = vc.width, VH = vc.height, bw = VW / N;
    const lit = track.volume == null ? N : Math.round(track.volume / 100 * N);
    const live = audio && playing;
    if (live) audio.analyser.getByteFrequencyData(audio.data);
    vx.clearRect(0, 0, VW, VH);
    let moving = false;
    for (let i = 0; i < N; i++) {
      let tgt = ramp(i);
      if (live) {
        // bass on the left, treble on the right
        const bin = Math.min(audio.data.length - 1, Math.floor(1 + Math.pow(i / N, 1.7) * audio.data.length * .7));
        tgt = Math.min(1, Math.max(.06, ramp(i) * .25 + audio.data[bin] / 255 * .85));
      }
      lv[i] += (tgt - lv[i]) * .3;
      const h = lv[i] * VH, x = i * bw + 2;
      vx.beginPath();
      vx.roundRect ? vx.roundRect(x, VH - h, bw - 6, h, 3) : vx.rect(x, VH - h, bw - 6, h);
      if (i < lit) {
        const gr = vx.createLinearGradient(0, VH - h, 0, VH);
        gr.addColorStop(0, 'rgba(255,92,112,.95)'); gr.addColorStop(1, 'rgba(255,92,112,.15)');
        vx.fillStyle = gr; vx.shadowColor = 'rgba(255,80,100,.6)'; vx.shadowBlur = 8;
      } else {
        vx.fillStyle = 'rgba(255,255,255,.13)'; vx.shadowBlur = 0;
      }
      vx.fill();
      if (Math.abs(tgt - lv[i]) > .003) moving = true;
    }
    vx.shadowBlur = 0;
    return moving || live;
  }

  /* ---------- main loop ----------
     At most 30 frames per second (or 20 / 15, chosen in the settings). When nothing moves (music paused, visualizer settled) it sleeps until
     something changes, and while the wallpaper is paused (locked screen, game, battery) it stops completely. */
  let last = performance.now(), lastFrame = 0, raf = 0, frameTimer = 0, frozen = false, lastPct = -1;
  const shown = {};
  const setText = (id, v) => { if (shown[id] !== v) { shown[id] = v; $(id).textContent = v; } };
  function wake() {
    if (raf || frameTimer || frozen) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  // The next frame is asked for with a timer: asking on every screen refresh would wake the browser and
  // the GPU at the display rate (120 Hz on a MacBook) even when most of those frames are skipped.
  function scheduleFrame() {
    if (frozen || frameTimer) return;
    frameTimer = setTimeout(() => { frameTimer = 0; if (!frozen) raf = requestAnimationFrame(loop); },
      Math.max(0, 1000 / (S.fps || 30) - (performance.now() - lastFrame)));
  }
  function loop(now) {
    raf = 0;
    if (frozen) return;
    lastFrame = now;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const d = track.duration, pos = d ? Math.min(d, clock.now()) : 0;
    const pct = d ? Math.round(pos / d * 1000) / 10 : 0;
    if (pct !== lastPct) { lastPct = pct; $('fill').style.width = pct + '%'; $('knob').style.left = pct + '%'; }
    setText('cur', fmt(pos)); setText('rem', '-' + fmt(d - pos)); setText('capR', hms(pos));
    updateLyrics(pos, d);
    drawSnow(dt);
    const vizMoving = drawViz();
    if (playing || vizMoving) scheduleFrame();
  }
  function setFrozen(st) {
    frozen = !!st.paused;
    document.body.classList.toggle('frozen', frozen);
    syncAudio();
    if (!frozen) wake();
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
  function act(id, fx) {
    press(id);
    const isTrack = !!(track.id && track.duration);
    switch (id) {
      case 'prev': case 'next': api.control(id); break;
      case 'pp': clock.toggle(); setPlaying(clock.playing); api.control('toggle'); wake(); break;
      case 'progress':
        if (isTrack) { const to = Math.max(0, Math.min(1, fx)) * track.duration; clock.set(to, clock.playing); api.control('seek', to); wake(); }
        break;
      case 'volume': {
        const v = Math.round(Math.max(0, Math.min(1, fx)) * 100);
        volHold = Date.now() + 2500; showVolume(v); api.control('volume', v);
        break;
      }
      case 'mute': api.control('mute'); break;
      case 'shuffle': api.control('shuffle'); break;
      case 'cover': api.control('open'); break;
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
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    act(el.dataset.act, (e.clientX - r.left) / r.width);
  });
  api.onHit(e => {
    if (e.type === 'hover') hover(e.id);
    else if (e.type === 'click') act(e.id, e.fx);
  });
  // Tell the click layer where the buttons are (in this window's coordinates).
  let hitsTimer = null;
  function reportHits() {
    clearTimeout(hitsTimer);
    hitsTimer = setTimeout(() => {
      // Thin elements (the 4 px progress and volume bars, the small speaker) get a 24 px tall/wide target.
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
  const refit = () => { fit(); wake(); reportHits(); };
  addEventListener('resize', refit); api.onLayoutChanged(refit); fit();
  api.onRender(setFrozen);
  setFrozen(await api.getRender());
  // Apply the look; fetch the own picture only when it is new.
  function applyLook(look) {
    const newImage = look.imageVersion !== S.imageVersion || (look.bg === 'photo' && !userImg);
    if (look.audioReactive && !S.audioReactive) audioFailed = false; // turned on again: try again
    S = look;
    setCount(S.snowCount);
    applyBg();
    $('lyr').classList.toggle('off', !S.showLyrics);
    syncAudio();
    wake();
    if (newImage && look.hasImage) api.getImage().then(url => { userImg = url; applyBg(); });
  }
  api.onLook(applyLook);
  applyLook(await api.getLook());
  setFoot();
  showMessage('starting');
  api.onPlayer(onPlayer);
  onPlayer(await api.getPlayer());
  api.onLyrics(onLyrics);
  api.onWebNow(onWeb);
  api.onWebState(st => onWeb({ loggedIn: st.loggedIn }));
  onWeb(await api.getWebNow());
  onLyrics(await api.getLyrics());
  if (document.fonts) document.fonts.ready.then(() => { focusLine(true); reportHits(); });
  reportHits();
  wake();
})();
