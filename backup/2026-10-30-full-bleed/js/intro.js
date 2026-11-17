// 인트로 "작동 원리" 4단계. 숫자는 tools/precompute.mjs 가 실제 모델로 계산한 값(intro-data.js)이며,
// 사이트와 같은 계산(그림 ↔ 단어 40개의 cosine → softmax)을 그대로 보여준다.
import { INTRO } from './intro-data.js';
import { softmax } from './clip.js';
import { formatPct } from './viz.js';

const clamp01 = x => Math.min(1, Math.max(0, x));
const ease = x => 1 - Math.pow(1 - clamp01(x), 3);
const span = (t, a, b) => clamp01((t - a) / (b - a));
const toDeg = c => Math.acos(Math.min(1, Math.max(-1, c))) * 180 / Math.PI;
const short = en => en.replace(/^(a|an|the) /, '');
// 한글 조사: 마지막 글자에 받침이 있으면 withFinal, 없으면 without (예: 집과, 나무와)
const josa = (word, withFinal, without) => {
  const c = word.charCodeAt(word.length - 1) - 0xAC00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? withFinal : without;
};

// 후보 단어를 cosine 내림차순으로. 확률은 사이트와 같은 softmax(100 × cosine)
const WORDS = (() => {
  const probs = softmax(INTRO.words.map(w => w.cos));
  return INTRO.words.map((w, i) => ({ ...w, prob: probs[i], deg: toDeg(w.cos) })).sort((a, b) => b.cos - a.cos);
})();
const TOP = WORDS[0], SECOND = WORDS[1], LAST = WORDS[WORDS.length - 1];

export function startExplainer(root) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  [stepImage, stepText, stepAngle, stepSoftmax].forEach((make, i) => attach(make(root.querySelector(`#story${i + 1}`)), reduced));
}

// 화면에 들어오면 재생하고, 완전히 벗어나면 처음 상태로 되돌려 다시 볼 때 또 재생한다
function attach(step, reduced) {
  const replay = step.el.closest('.story').querySelector('.replay');
  if (reduced) { step.render(step.duration); if (replay) replay.hidden = true; return; }
  let raf = 0, played = false;
  const play = () => {
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const tick = now => {
      const t = (now - t0) / 1000;
      step.render(Math.min(t, step.duration));
      if (t < step.duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  step.render(0);
  replay?.addEventListener('click', play);
  new IntersectionObserver(entries => {
    const e = entries[entries.length - 1];
    if (e.intersectionRatio >= 0.45 && !played) { played = true; play(); }
    else if (!e.isIntersecting && played) { played = false; cancelAnimationFrame(raf); step.render(0); }
  }, { threshold: [0, 0.45] }).observe(step.el);
}

// ---------------------------------------------------------------- 1. 그림 → 벡터
function stepImage(article) {
  const el = article.querySelector('.story-visual');
  const drawSketch = makeSketch(el.querySelector('.ex-sketch'), INTRO.sketch);
  const grid = makeGrid(el.querySelector('.ex-grid'), INTRO.imageVec);
  const nums = el.querySelector('.ex-nums');
  return {
    el, duration: 2.8,
    render(t) {
      drawSketch(ease(span(t, 0, 1.2)));
      const p = ease(span(t, 1.4, 2.6));
      grid.fill(p);
      nums.textContent = numbersText(INTRO.imageVec, p);
    },
  };
}

// ---------------------------------------------------------------- 2. 단어 → 문장 → 벡터
function stepText(article) {
  const el = article.querySelector('.story-visual');
  const word = INTRO.words.find(w => w.key === INTRO.textKey);
  const sentence = INTRO.template.replace('{}', word.en);
  const typeEl = el.querySelector('.ex-sentence');
  const grid = makeGrid(el.querySelector('.ex-grid'), INTRO.textVec);
  const nums = el.querySelector('.ex-nums');
  const chipsEl = el.querySelector('.ex-chips');
  chipsEl.innerHTML = INTRO.words.map(w => `<span class="chip${w.key === INTRO.textKey ? ' self' : ''}">${w.ko}</span>`).join('');
  const chips = [...chipsEl.children];
  return {
    el, duration: 4.4,
    render(t) {
      const tp = span(t, 0, 1.2);
      typeEl.textContent = sentence.slice(0, Math.round(tp * sentence.length));
      typeEl.classList.toggle('typing', tp > 0 && tp < 1);
      const p = ease(span(t, 1.4, 2.6));
      grid.fill(p);
      nums.textContent = numbersText(INTRO.textVec, p);
      const n = Math.round(span(t, 2.8, 4.2) * chips.length);
      chips.forEach((c, i) => c.classList.toggle('on', c.classList.contains('self') ? p >= 1 : i < n));
    },
  };
}

// ---------------------------------------------------------------- 3. 각도 = cosine similarity
function stepAngle(article) {
  const el = article.querySelector('.story-visual');
  const svg = el.querySelector('svg.ang');
  const O = { x: 56, y: 384 }, R = 300, ARC = 328;
  const P = (deg, r) => { const a = deg * Math.PI / 180; return [O.x + r * Math.cos(a), O.y - r * Math.sin(a)]; };
  const f = n => n.toFixed(1);
  const line = (a, b, cls) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" class="${cls}"/>`;

  const ticks = [0, 30, 60, 90].map(d => {
    const [tx, ty] = P(d, ARC + 26);
    return line(P(d, ARC - 5), P(d, ARC + 5), 'tick') +
      `<text x="${f(tx)}" y="${f(ty)}" class="tick-label" text-anchor="middle">${d}°</text>` +
      `<text x="${f(tx)}" y="${f(ty + 14)}" class="tick-sub" text-anchor="middle">cos ${Math.cos(d * Math.PI / 180).toFixed(2)}</text>`;
  }).join('');
  const band = WORDS.slice(1).map(w => line(P(w.deg, ARC - 14), P(w.deg, ARC + 14), 'band')).join('') +
    line(P(TOP.deg, ARC - 18), P(TOP.deg, ARC + 18), 'band-top');
  const [tlx, tly] = P(TOP.deg, ARC + 22);
  const [fx, fy] = P(0, R);

  svg.innerHTML = `
    <path d="M ${O.x + ARC} ${O.y} A ${ARC} ${ARC} 0 0 0 ${O.x} ${O.y - ARC}" class="arc"/>
    ${ticks}
    <g class="band-group" opacity="0">${band}
      <text x="${f(tlx + 6)}" y="${f(tly + 4)}" class="band-label">${TOP.ko} ${TOP.deg.toFixed(1)}°</text></g>
    <path class="angle-arc" d=""/>
    ${line([O.x, O.y], [fx, fy], 'ray')}
    <circle cx="${f(fx)}" cy="${f(fy)}" r="4.5" class="ray-dot"/>
    <text x="${f(fx)}" y="${f(fy + 24)}" class="ray-label" text-anchor="middle">집 그림</text>
    <line x1="${O.x}" y1="${O.y}" x2="${f(fx)}" y2="${f(fy)}" class="ray moving"/>
    <circle cx="${f(fx)}" cy="${f(fy)}" r="4.5" class="ray-dot moving-dot"/>
    <text x="0" y="0" class="ray-label moving-label" text-anchor="end"></text>`;
  const moving = svg.querySelector('.moving'), movingDot = svg.querySelector('.moving-dot');
  const movingLabel = svg.querySelector('.moving-label'), angleArc = svg.querySelector('.angle-arc');
  const bandGroup = svg.querySelector('.band-group');
  const roTarget = el.querySelector('.ro-target'), roDeg = el.querySelector('.ro-deg'), roCos = el.querySelector('.ro-cos');
  const [lo, hi] = [TOP.deg, LAST.deg].map(d => +d.toFixed(1)); // 화면에 보이는 숫자로 폭을 계산해 앞뒤가 맞게 한다
  el.querySelector('.story-note').textContent =
    `회색 띠가 나머지 ${WORDS.length - 1}개 단어입니다. 40개 모두 ${lo}°~${hi}° 사이(폭 ${(hi - lo).toFixed(1)}°)에 몰려 있습니다. ` +
    'CLIP에서 그림과 문장 사이의 cosine은 짝이 맞아도 0.3 안팎이라, 값 자체보다 어느 단어가 가장 가까운지가 중요합니다.';

  function setRay(deg) {
    const [x, y] = P(deg, R);
    moving.setAttribute('x2', f(x)); moving.setAttribute('y2', f(y));
    movingDot.setAttribute('cx', f(x)); movingDot.setAttribute('cy', f(y));
    movingLabel.setAttribute('x', f(x - 12)); movingLabel.setAttribute('y', f(y + 4));
    const [ax, ay] = P(deg, 52);
    angleArc.setAttribute('d', deg > 0.5 ? `M ${O.x + 52} ${O.y} A 52 52 0 0 0 ${f(ax)} ${f(ay)}` : '');
    roDeg.textContent = deg.toFixed(1) + '°';
    roCos.textContent = Math.cos(deg * Math.PI / 180).toFixed(3);
  }

  // 0° → 90° 한 바퀴로 각도와 cosine의 관계를 보여준 뒤, 꼴등 → 2등 → 1등 단어 순으로 방문
  const visits = [LAST, SECOND, TOP];
  const SWEEP = [0.3, 2.1], V0 = 2.5, MOVE = 0.8, HOLD = 1.0, BAND = V0 + visits.length * (MOVE + HOLD) - HOLD;
  return {
    el, duration: BAND + 1.2,
    render(t) {
      let deg = 0, target = null;
      if (t < V0) deg = 90 * ease(span(t, SWEEP[0], SWEEP[1]));
      else {
        const k = Math.min(visits.length - 1, Math.floor((t - V0) / (MOVE + HOLD)));
        const from = k === 0 ? 90 : visits[k - 1].deg;
        deg = from + (visits[k].deg - from) * ease(span(t - V0 - k * (MOVE + HOLD), 0, MOVE));
        target = visits[k];
      }
      setRay(deg);
      const showBand = ease(span(t, BAND, BAND + 0.8));
      bandGroup.setAttribute('opacity', showBand.toFixed(2));
      movingLabel.textContent = target && showBand < 0.5 ? target.ko : '';
      roTarget.textContent = target ? `${target.ko} (${short(target.en)}) 문장` : '0°에서 90°까지 돌려 보기';
    },
  };
}

// ---------------------------------------------------------------- 4. cosine → 확률 (softmax)
function stepSoftmax(article) {
  const el = article.querySelector('.story-visual');
  const ROWS = 8;
  const shown = WORDS.slice(0, ROWS);
  const rowsEl = el.querySelector('.sm-rows');
  const cell = title => `<span class="sm-cell"><span class="sm-track" title="${title}"><span class="sm-bar"></span><span class="sm-val"></span></span></span>`;
  rowsEl.innerHTML = shown.map((w, i) => `
    <div class="sm-row${i === 0 ? ' top' : ''}">
      <span class="sm-label"><span class="ko">${w.ko}</span><span class="en">${short(w.en)}</span></span>
      ${cell(`cosine ${w.cos.toFixed(4)}`)}
      <span></span>
      ${cell(`확률 ${(w.prob * 100).toFixed(2)}%`)}
    </div>`).join('');
  const rows = [...rowsEl.children].map(r => {
    const bars = r.querySelectorAll('.sm-bar'), vals = r.querySelectorAll('.sm-val');
    return { cosBar: bars[0], probBar: bars[1], cosVal: vals[0], probVal: vals[1] };
  });
  const arrow = el.querySelector('.sm-arrow'), probHead = el.querySelector('.sm-head-prob'), rest = el.querySelector('.sm-rest');
  const restProb = WORDS.slice(ROWS).reduce((s, w) => s + w.prob, 0);
  rest.textContent = `나머지 ${WORDS.length - ROWS}개 단어의 확률을 모두 더하면 ${formatPct(restProb)}`;
  article.querySelector('.sm-example').textContent =
    `예를 들어 1등 ${TOP.ko}(${TOP.cos.toFixed(3)})${josa(TOP.ko, '과', '와')} 2등 ${SECOND.ko}(${SECOND.cos.toFixed(3)})의 cosine 차이는 ${(TOP.cos - SECOND.cos).toFixed(3)}뿐이지만, ` +
    `확률로는 ${formatPct(TOP.prob)} 대 ${formatPct(SECOND.prob)}가 됩니다.`;

  // 막대 길이와 막대 끝의 값 라벨을 함께 옮긴다
  const setBar = (bar, val, frac, text) => {
    const pct = (frac * 100).toFixed(2) + '%';
    bar.style.width = pct; val.style.left = pct; val.textContent = text;
  };
  return {
    el, duration: 3.2,
    render(t) {
      const a = ease(span(t, 0.1, 1.1)), b = ease(span(t, 1.8, 3.0)), mid = span(t, 1.3, 1.8);
      rows.forEach((r, i) => {
        const w = shown[i];
        setBar(r.cosBar, r.cosVal, w.cos * a, a > 0 ? (w.cos * a).toFixed(3) : '');      // cosine 축: 0 ~ 1
        setBar(r.probBar, r.probVal, w.prob * b, b > 0 ? formatPct(w.prob * b) : '');   // 확률 축: 0 ~ 100%
      });
      arrow.style.opacity = mid.toFixed(2);
      probHead.style.opacity = mid.toFixed(2);
      rest.style.opacity = b.toFixed(2);
    },
  };
}

// ---------------------------------------------------------------- 그리기 도우미
function makeSketch(canvas, strokes) {
  const ctx = canvas.getContext('2d'), S = canvas.width;
  const total = strokes.reduce((s, st) => s + st.length - 1, 0);
  return p => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#111'; ctx.lineWidth = S * 7 / 512; ctx.lineCap = ctx.lineJoin = 'round';
    let budget = p * total; // 남은 선분 수 (소수 부분은 마지막 선분을 일부만 그린다)
    for (const st of strokes) {
      if (budget <= 0) break;
      ctx.beginPath(); ctx.moveTo(st[0][0] * S, st[0][1] * S);
      for (let i = 1; i < st.length && budget > 0; i++, budget--) {
        const k = Math.min(1, budget), [x0, y0] = st[i - 1], [x1, y1] = st[i];
        ctx.lineTo((x0 + (x1 - x0) * k) * S, (y0 + (y1 - y0) * k) * S);
      }
      ctx.stroke();
    }
  };
}

// 512개 값을 32×16 칸으로 (값이 클수록 진하게). 극단값 몇 개가 색을 눌러버리지 않도록 2~98 퍼센타일로 범위를 잡는다
function makeGrid(canvas, vec) {
  const COLS = 32, cell = canvas.width / COLS, ctx = canvas.getContext('2d');
  const sorted = [...vec].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.98)];
  return {
    fill(p) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const n = Math.round(p * vec.length);
      for (let i = 0; i < n; i++) {
        const g = Math.round(235 - 195 * clamp01((vec[i] - lo) / (hi - lo)));
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect((i % COLS) * cell + 1, Math.floor(i / COLS) * cell + 1, cell - 2, cell - 2);
      }
    },
  };
}

function numbersText(vec, p) {
  if (p <= 0) return '';
  const shown = vec.slice(0, 6).map(v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2));
  return `[${shown.join(', ')}, …]  숫자 512개`;
}

// ---------------------------------------------------------------- 첫 화면 미니 데모
// 예시 집을 한 획씩 그리며, 획이 끝날 때마다 그 시점의 실제 판단(상위 3개)을 보여준다. 첫 화면이 보일 때만 움직인다.
export function startHeroDemo(el) {
  const canvas = el.querySelector('.demo-pad'), ctx = canvas.getContext('2d'), S = canvas.width;
  const strokes = INTRO.sketch, prog = INTRO.progression;
  const wordEl = el.querySelector('.demo-word'), probEl = el.querySelector('.demo-prob'), stepEl = el.querySelector('.demo-step');
  const barsEl = el.querySelector('.demo-bars');
  barsEl.innerHTML = [0, 1, 2].map(() => '<div class="demo-row"><span class="k"></span><span class="t"><span class="b"></span></span><span class="v"></span></div>').join('');
  const rows = [...barsEl.children].map(r => ({ k: r.querySelector('.k'), b: r.querySelector('.b'), v: r.querySelector('.v') }));

  // done: 다 그린 획 수, frac: 다음 획을 얼마나 그렸는지(0~1)
  function draw(done, frac) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#0b0b0b'; ctx.lineWidth = S * 7 / 512; ctx.lineCap = ctx.lineJoin = 'round';
    for (let i = 0; i < Math.min(strokes.length, done + 1); i++) {
      const st = strokes[i], f = i < done ? 1 : frac;
      if (f <= 0) break;
      let budget = f * (st.length - 1);
      ctx.beginPath(); ctx.moveTo(st[0][0] * S, st[0][1] * S);
      for (let j = 1; j < st.length && budget > 0; j++, budget--) {
        const k = Math.min(1, budget), [x0, y0] = st[j - 1], [x1, y1] = st[j];
        ctx.lineTo((x0 + (x1 - x0) * k) * S, (y0 + (y1 - y0) * k) * S);
      }
      ctx.stroke();
    }
  }
  let shown = -1;
  function show(k) {
    if (k === shown) return;
    shown = k;
    stepEl.textContent = `· 선 ${k}/${strokes.length}`;
    const top = k > 0 ? prog[k - 1].top : [];
    wordEl.textContent = top[0] ? top[0].ko : '—';
    probEl.textContent = top[0] ? formatPct(top[0].prob) : '';
    rows.forEach((r, i) => {
      r.k.textContent = top[i] ? top[i].ko : '';
      r.b.style.width = top[i] ? (top[i].prob * 100).toFixed(1) + '%' : '0%';
      r.v.textContent = top[i] ? formatPct(top[i].prob) : '';
    });
  }

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { draw(strokes.length, 0); show(strokes.length); return; }

  const DRAW = 0.9, HOLD = 1.4, END = 2.4, CYCLE = strokes.length * (DRAW + HOLD) + END;
  function frame(t) {
    const tc = t % CYCLE, i = Math.floor(tc / (DRAW + HOLD)), local = tc - i * (DRAW + HOLD);
    if (i >= strokes.length) { draw(strokes.length, 0); show(strokes.length); return; }
    const finished = local >= DRAW;
    draw(finished ? i + 1 : i, finished ? 0 : local / DRAW); // 펜 속도는 일정하게: 획이 끝나는 순간 판단이 바뀐다
    show(finished ? i + 1 : i);
  }
  let raf = 0, t0 = 0;
  const loop = now => { frame((now - t0) / 1000); raf = requestAnimationFrame(loop); };
  new IntersectionObserver(entries => {
    if (entries[entries.length - 1].isIntersecting) {
      if (!raf) { t0 = performance.now(); shown = -1; raf = requestAnimationFrame(loop); }
    } else { cancelAnimationFrame(raf); raf = 0; }
  }).observe(el);
}
