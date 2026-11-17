// 소개 화면 맨 위의 도식: 예시 그림 → 512차원 벡터 → 가까운 단어.
// map-data.js의 실제 값(예시 3개의 선, 벡터, cosine)을 차례로 재생한다.
import { MAP_DATA } from './map-data.js';
import { WORDS } from './words.js';
import { dot } from './clip.js';
import { reducedMotion as reduced } from './motion.js';

const SIZE = 356;          // 스케치 캔버스 한 변
const CELLS = 64;          // 보여 주는 벡터 값 개수 (512개 중 앞 64개)
const HOLD = 6500;         // 한 예시를 보여 주는 시간(ms)
const COSINE_FULL = 0.35;  // 막대가 꽉 차는 cosine

export function startHero() {
  const $ = id => document.getElementById(id);
  const stage = $('heroStage');
  if (!stage) return;
  const ctx = $('heroSketch').getContext('2d');
  const arrows = [...stage.querySelectorAll('.stage-arrow')];
  const cells = Array.from({ length: CELLS }, () => $('heroVector').appendChild(document.createElement('i')));

  // 예시마다 cosine 상위 3개 단어
  const tops = MAP_DATA.samples.map(s =>
    MAP_DATA.textVectors.map((v, i) => ({ i, c: dot(s.vector, v) })).sort((a, b) => b.c - a.c).slice(0, 3));

  const label = document.createElement('span');
  const dots = MAP_DATA.samples.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', '예시 ' + s.name + ' 보기');
    b.onclick = () => play(i);
    $('heroDots').append(b);
    return b;
  });
  $('heroDots').append(label);

  let index = 0, raf = 0, timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const stop = () => { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); };

  function drawSketch(strokes, duration) {
    const total = strokes.reduce((n, s) => n + s.length - 1, 0), start = performance.now();
    const tick = now => {
      const p = duration ? Math.min(1, (now - start) / duration) : 1;
      let budget = p * total;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = '#172220'; ctx.lineWidth = SIZE * 7 / 512; ctx.lineCap = ctx.lineJoin = 'round';
      for (const st of strokes) {
        if (budget <= 0) break;
        ctx.beginPath(); ctx.moveTo(st[0][0] * SIZE, st[0][1] * SIZE);
        for (let j = 1; j < st.length && budget > 0; j++, budget--) {
          const k = Math.min(1, budget);
          ctx.lineTo((st[j - 1][0] + (st[j][0] - st[j - 1][0]) * k) * SIZE, (st[j - 1][1] + (st[j][1] - st[j - 1][1]) * k) * SIZE);
        }
        ctx.stroke();
      }
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    tick(start);
  }

  function showVector(vector, animate) {
    cells.forEach((c, i) => {
      c.style.transitionDelay = animate ? i * 9 + 'ms' : '0ms';
      c.style.opacity = vector ? (0.12 + 0.88 * Math.min(1, Math.abs(vector[i]) / 0.07)).toFixed(2) : '';
    });
  }

  function showWords(top, animate) {
    const rows = top.map(({ i, c }, k) => {
      const row = document.createElement('div');
      row.className = 'word-row' + (k === 0 ? ' first' : '');
      row.innerHTML = '<span>' + WORDS[i].ko + '</span><span>' + c.toFixed(3) + '</span><span class="word-bar"><i></i></span>';
      return row;
    });
    $('heroWords').replaceChildren(...rows);
    rows.forEach((row, k) => later(() => {
      row.classList.add('in');
      row.querySelector('i').style.width = Math.min(100, top[k].c / COSINE_FULL * 100) + '%';
    }, animate ? k * 140 + 20 : 0));
  }

  const runArrow = el => { el.classList.remove('run'); void el.offsetWidth; el.classList.add('run'); };

  function play(i) {
    stop();
    index = i;
    const s = MAP_DATA.samples[i], animate = !reduced;
    dots.forEach((b, j) => { b.classList.toggle('active', j === i); b.setAttribute('aria-pressed', j === i); });
    label.textContent = '예시 · ' + s.name;
    $('heroName').textContent = '예시 그림 · ' + s.name;
    if (!animate) { drawSketch(s.strokes, 0); showVector(s.vector, false); showWords(tops[i], false); return; }
    showVector(null, false);
    $('heroWords').replaceChildren();
    drawSketch(s.strokes, 1100);
    later(() => runArrow(arrows[0]), 950);
    later(() => showVector(s.vector, true), 1450);
    later(() => runArrow(arrows[1]), 2250);
    later(() => showWords(tops[i], true), 2800);
    later(next, HOLD);
  }

  // 화면에 보일 때만 다음 예시로 넘어간다
  function next() {
    const visible = !document.hidden && stage.offsetParent !== null && stage.getBoundingClientRect().bottom > 0;
    if (visible) play((index + 1) % MAP_DATA.samples.length);
    else later(next, 1000);
  }

  play(0);
}
