/* Демо-треки из макета. На шаге 4 их заменят настоящие данные из Spotify.
   Обложки рисуются прямо в коде, чтобы не нужны были картинки. */
window.DEMO_TRACKS = (() => {
  function cover(kind) {
    const c = document.createElement('canvas'); c.width = 960; c.height = 472;
    const g = c.getContext('2d');
    let s = [7, 19, 31, 43][kind]; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    if (kind === 0) {
      let gr = g.createLinearGradient(0, 0, 960, 472);
      gr.addColorStop(0, '#2a2a2e'); gr.addColorStop(1, '#0c0c0e');
      g.fillStyle = gr; g.fillRect(0, 0, 960, 472);
      const m = g.createRadialGradient(330, 200, 10, 330, 200, 260);
      m.addColorStop(0, 'rgba(240,240,245,.85)'); m.addColorStop(.3, 'rgba(200,200,210,.35)'); m.addColorStop(1, 'rgba(200,200,210,0)');
      g.fillStyle = m; g.fillRect(0, 0, 960, 472);
      g.save(); g.translate(720, -40); g.rotate(.06);
      for (let i = 0; i < 22; i++) {
        g.fillStyle = `rgba(${40 + i * 2},${40 + i * 2},${46 + i * 2},1)`; g.fillRect(-140, i * 24, 380, 14);
        g.fillStyle = 'rgba(180,180,190,.25)'; g.fillRect(-140, i * 24 + 14, 380, 2);
      }
      g.restore();
      g.fillStyle = 'rgba(8,8,10,.9)'; g.beginPath(); g.moveTo(170, 472); g.lineTo(200, 330); g.quadraticCurveTo(250, 250, 330, 270); g.quadraticCurveTo(410, 290, 430, 472); g.fill();
      g.beginPath(); g.arc(330, 215, 62, 0, Math.PI * 2); g.fillStyle = 'rgba(225,225,232,.92)'; g.fill();
      g.fillStyle = 'rgba(10,10,12,.75)'; g.beginPath(); g.arc(352, 228, 58, -.6, 1.9); g.fill();
    } else if (kind === 1) {
      let gr = g.createLinearGradient(0, 0, 960, 472);
      gr.addColorStop(0, '#3a1424'); gr.addColorStop(.6, '#180812'); gr.addColorStop(1, '#09050a');
      g.fillStyle = gr; g.fillRect(0, 0, 960, 472);
      for (let i = 9; i > 0; i--) { g.beginPath(); g.arc(600, 236, i * 32, 0, Math.PI * 2); g.strokeStyle = `hsla(${335 + i * 3},80%,${60 + i * 2}%,${.12 + (9 - i) * .06})`; g.lineWidth = 3; g.stroke(); }
      const gl = g.createRadialGradient(600, 236, 0, 600, 236, 130); gl.addColorStop(0, 'rgba(255,110,165,.75)'); gl.addColorStop(1, 'rgba(255,110,165,0)');
      g.fillStyle = gl; g.fillRect(0, 0, 960, 472);
      for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,${140 + r() * 70},${190 + r() * 50},${.2 + r() * .35})`; g.fillRect(0, 30 + i * 32 + r() * 10, 960 * r(), 2); }
    } else {
      const hues = [0, 0, 160, 30];
      let gr = g.createLinearGradient(0, 0, 0, 472);
      gr.addColorStop(0, `hsl(${hues[kind]} 25% 30%)`); gr.addColorStop(1, `hsl(${hues[kind]} 20% 8%)`);
      g.fillStyle = gr; g.fillRect(0, 0, 960, 472);
      for (let i = 0; i < 40; i++) { g.fillStyle = `hsla(${hues[kind]},40%,${50 + r() * 30}%,${r() * .4})`; g.beginPath(); g.arc(r() * 960, r() * 472, 4 + r() * 60, 0, Math.PI * 2); g.fill(); }
    }
    return c.toDataURL('image/jpeg', .9);
  }

  return [
    { title: 'Снег на проводах', artist: 'ночной рейс, тихий двор', hue: 228, dur: 168, start: 41, img: cover(0), vol: 64, shuffle: false, explicit: true,
      lines: ['Город выключил огни', 'Я считаю фонари до утра', 'Снег ложится на провода', 'И молчит, как ты вчера', 'Если слышишь, не звони', 'Я и так тебя найду', 'В каждом кадре, в каждом сне', 'Где-то в этом феврале'] },
    { title: 'Неон', artist: 'ровно в 3', hue: 300, dur: 192, start: 58, img: cover(1), vol: 71, shuffle: true, explicit: true,
      lines: ['Неон стекает по стеклу', 'Мы опять не спим', 'Две минуты до весны', 'И одна до тишины', 'Ты смеёшься невпопад', 'Я снимаю всё подряд', 'Пусть горит, пока горит', 'Этот город не простит'] },
    { title: 'Окна напротив', artist: 'пятый этаж', hue: 180, dur: 201, start: 30, img: cover(2), vol: 58, shuffle: true, explicit: true,
      lines: ['В окнах напротив горит', 'Чей-то длинный разговор', 'Я молчу, и снег молчит', 'Застывает коридор', 'Мы не виделись с весны', 'Но ты снишься до сих пор'] },
    { title: 'Без сигнала', artist: 'тихий двор', hue: 30, dur: 175, start: 22, img: cover(3), vol: 66, shuffle: false, explicit: true,
      lines: ['Нет сигнала, нет звонков', 'Только шум под потолком', 'Я пишу тебе без слов', 'И стираю целиком', 'Утро смотрит сквозь стекло', 'Будто знает обо всём'] }
  ];
})();
