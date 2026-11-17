import { Clip, MODEL_ID, dot, softmax } from './clip.js';
import { WORDS, PROMPT_TEMPLATE } from './words.js';
import { RankedBars, formatPct } from './viz.js';
import { startExplainer, startHeroDemo } from './intro.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

const INFER_SIZE = 512;        // 모델에 넣는 캔버스 크기 (processor가 224로 줄인다)
const LINE_WIDTH = 7 / 512;    // 캔버스 한 변 대비 선 굵기
const MAX_UNITS = 12;          // 선 중요도 분석 단위 수 상한

// ---------------------------------------------------------------- 모델
const clip = new Clip({ dtype: params.get('dtype') || 'q8', device: params.get('device') || 'wasm' });
let textEmbeds = null;

// 인트로 맨 위와 맨 아래의 시작 버튼, 상단 바의 상태 표시는 같은 상태를 가진다
const startBtns = [...document.querySelectorAll('.start-btn')];
function setStart(text, enabled, state = 'loading') {
  for (const b of startBtns) { b.querySelector('.start-label').textContent = text; b.disabled = !enabled; }
  $('modelStatus').textContent = state === 'ready' ? '모델 준비 완료' : state === 'error' ? '모델 로드 실패' : text;
  $('statusDot').className = 'dot' + (state === 'loading' ? '' : ' ' + state);
}
$('modelInfo').textContent = `CLIP ViT-B/32 · ${clip.dtype} · ${clip.device}`;

async function boot() {
  const bar = $('progressBar');
  try {
    await clip.load(p => { bar.style.width = (p * 100).toFixed(1) + '%'; setStart(`모델 준비 중 ${Math.round(p * 100)}%`, false); });
    setStart('단어 준비 중', false);
    textEmbeds = await clip.embedTexts(WORDS.map(w => PROMPT_TEMPLATE.replace('{}', w.en)));
    setStart('시작하기', true, 'ready');
    bar.parentElement.hidden = true;
  } catch (e) {
    console.error(e);
    setStart('준비 실패', false, 'error');
    $('loadError').hidden = false;
    $('loadError').textContent = '모델을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요. (' + e.message + ')';
  }
}

// 이미지 벡터 → 후보별 cosine, 확률
function score(imgEmb) {
  const cosines = textEmbeds.map(t => dot(imgEmb, t));
  const probs = softmax(cosines);
  let top = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[top]) top = i;
  return { cosines, probs, top };
}

function confidenceText(p) {
  if (p >= 0.5) return '꽤 확신해요';
  if (p >= 0.25) return '아마도';
  return '확신은 없지만 가장 가까운 건';
}

// ---------------------------------------------------------------- 그리기
const pad = $('pad'), padCtx = pad.getContext('2d');
const infer = document.createElement('canvas'); infer.width = infer.height = INFER_SIZE;
const inferCtx = infer.getContext('2d');

let strokes = [];   // [{ pts: [[x,y], ...] }]  좌표는 0~1
let current = null;
let locked = false;

// strokes를 주어진 크기의 캔버스에 그린다. colorOf(i)로 선마다 색을 정할 수 있다.
function render(ctx, size, list, colorOf = () => '#111') {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = LINE_WIDTH * size;
  list.forEach((st, i) => {
    ctx.strokeStyle = ctx.fillStyle = colorOf(i);
    if (st.pts.length === 1) {
      ctx.beginPath(); ctx.arc(st.pts[0][0] * size, st.pts[0][1] * size, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.beginPath();
    st.pts.forEach(([x, y], k) => k ? ctx.lineTo(x * size, y * size) : ctx.moveTo(x * size, y * size));
    ctx.stroke();
  });
}
const redrawPad = () => render(padCtx, pad.width, strokes);

function pointerPos(e) {
  const r = pad.getBoundingClientRect();
  return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
}
pad.addEventListener('pointerdown', e => {
  if (locked) return;
  pad.setPointerCapture(e.pointerId);
  current = { pts: [pointerPos(e)] };
  strokes.push(current);
  redrawPad();
});
pad.addEventListener('pointermove', e => {
  if (!current) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs) current.pts.push(pointerPos(ev));
  redrawPad();
});
const endStroke = () => { if (!current) return; current = null; afterChange(); };
pad.addEventListener('pointerup', endStroke);
pad.addEventListener('pointercancel', endStroke);

$('undoBtn').onclick = () => { strokes.pop(); redrawPad(); afterChange(); };
$('clearBtn').onclick = () => { strokes = []; redrawPad(); afterChange(); };

function afterChange() {
  $('doneBtn').disabled = strokes.length === 0;
  scheduleAnalyze();
}

// ---------------------------------------------------------------- 실시간 분석
const liveBars = new RankedBars($('liveBars'), WORDS, { rows: 10, rowHeight: 42 });
liveBars.clear();
let timer = null, busy = false, dirty = false;
let lastResult = null; // { cosines, probs, top, ms, strokeCount }

function scheduleAnalyze() { clearTimeout(timer); timer = setTimeout(analyze, 120); }

async function analyze() {
  if (busy) { dirty = true; return; }
  busy = true;
  try {
    do {
      dirty = false;
      if (strokes.length === 0) { showEmpty(); lastResult = null; continue; }
      const snapshot = strokes.slice();
      render(inferCtx, INFER_SIZE, snapshot);
      const t = performance.now();
      const emb = await clip.embedImage(infer);
      const r = { ...score(emb), ms: performance.now() - t, strokeCount: snapshot.length };
      lastResult = r;
      showLive(r);
    } while (dirty);
  } catch (e) {
    console.error(e);
    $('liveStatus').textContent = '분석 중 오류: ' + e.message;
  } finally { busy = false; }
}

function showEmpty() {
  $('liveWord').textContent = '—'; $('liveWord').classList.add('empty');
  $('liveSub').textContent = '아직 아무것도 그리지 않았어요';
  $('liveStatus').textContent = '';
  liveBars.clear();
}
function showLive(r) {
  const w = WORDS[r.top], p = r.probs[r.top];
  $('liveWord').textContent = w.ko; $('liveWord').classList.remove('empty');
  $('liveSub').textContent = `${WORDS.length}개 후보 중 ${formatPct(p)} · ${confidenceText(p)}`;
  $('liveStatus').textContent = `분석 ${r.ms.toFixed(0)} ms · ${MODEL_ID} (${clip.dtype}, ${clip.device})`;
  liveBars.update(r.probs, r.cosines);
}

// ---------------------------------------------------------------- 결과 + 선 중요도
const resultPad = $('resultPad'), resultCtx = resultPad.getContext('2d');
const resultBars = new RankedBars($('resultBars'), WORDS, { rows: 10, rowHeight: 36 });
let finishing = false;

$('doneBtn').onclick = finish;

async function finish() {
  if (finishing || strokes.length === 0) return;
  finishing = true; locked = true; pad.classList.add('locked');
  $('doneBtn').disabled = true;
  clearTimeout(timer);
  while (busy) await new Promise(r => setTimeout(r, 30)); // 진행 중인 실시간 분석이 끝날 때까지

  const final = strokes.slice();
  render(inferCtx, INFER_SIZE, final);
  const t0 = performance.now();
  const base = score(await clip.embedImage(infer));
  const w = WORDS[base.top], p0 = base.probs[base.top];

  // 결과 화면 먼저 보여주고, 선 중요도는 그 위에서 계산
  show('result');
  render(resultCtx, resultPad.width, final);
  $('resultWord').textContent = w.ko;
  $('resultSub').textContent = `${w.en.replace(/^(a|an|the) /, '')} · ${WORDS.length}개 후보 중 ${formatPct(p0)} · ${confidenceText(p0)}`;
  resultBars.update(base.probs, base.cosines);
  fillTable(base);
  $('importanceLegend').hidden = true;

  const units = groupUnits(final.length);
  if (units.length < 2) {
    $('importanceCaption').textContent = '선이 하나뿐이라 선별 중요도는 분석하지 않았습니다.';
    $('resultStatus').textContent = `분석 ${(performance.now() - t0).toFixed(0)} ms`;
    finishing = false; return;
  }

  // 단위를 하나씩 빼고 다시 판단시켜 '정답 단어' 확률이 얼마나 떨어지는지 잰다
  const drops = [];
  for (let u = 0; u < units.length; u++) {
    $('importanceCaption').textContent = `선을 하나씩 지워 보며 "${w.ko}" 확률이 얼마나 변하는지 재는 중… ${u + 1}/${units.length}`;
    const rest = final.filter((_, i) => !units[u].includes(i));
    render(inferCtx, INFER_SIZE, rest);
    const r = score(await clip.embedImage(infer));
    drops.push(p0 - r.probs[base.top]);
  }
  const maxDrop = Math.max(...drops);
  const importance = final.map(() => 0);
  units.forEach((idxs, u) => idxs.forEach(i => { importance[i] = maxDrop > 0.01 ? Math.max(0, drops[u]) / maxDrop : 1; }));
  render(resultCtx, resultPad.width, final, i => { const v = Math.round(210 * (1 - importance[i])); return `rgb(${v},${v},${v})`; });

  const most = drops.indexOf(maxDrop);
  if (maxDrop > 0.01) {
    $('importanceCaption').textContent =
      `선을 하나씩 지워 보며 "${w.ko}" 확률이 얼마나 떨어지는지 쟀습니다. 가장 중요한 선을 지우면 ${formatPct(p0)}에서 ${formatPct(p0 - maxDrop)}로 떨어집니다.` +
      (units.length < final.length ? ` (선 ${final.length}개를 ${units.length}묶음으로 나눠 분석)` : '');
    $('importanceLegend').hidden = false;
  } else {
    $('importanceCaption').textContent = `어느 선을 지워도 "${w.ko}"라는 판단이 거의 달라지지 않았습니다. 특정 선이 아니라 전체 모양으로 판단한 것으로 보입니다.`;
  }
  $('resultStatus').textContent = `분석 ${(performance.now() - t0).toFixed(0)} ms (추론 ${units.length + 1}회) · ${MODEL_ID} (${clip.dtype}, ${clip.device})`;
  finishing = false;
}

// 선이 많으면 그린 순서대로 묶어서 MAX_UNITS개 이하의 단위로 만든다
function groupUnits(n) {
  const k = Math.min(n, MAX_UNITS), units = [];
  for (let u = 0; u < k; u++) {
    const a = Math.floor(u * n / k), b = Math.floor((u + 1) * n / k);
    units.push(Array.from({ length: b - a }, (_, i) => a + i));
  }
  return units;
}

function fillTable(r) {
  const order = r.probs.map((_, i) => i).sort((a, b) => r.probs[b] - r.probs[a]);
  $('fullTable').innerHTML = '<tr><th>#</th><th>단어</th><th class="num">확률</th><th class="num">cosine</th></tr>' +
    order.map((i, k) => `<tr><td>${k + 1}</td><td>${WORDS[i].ko} <span class="hint">${WORDS[i].en}</span></td><td class="num">${(r.probs[i] * 100).toFixed(1)}%</td><td class="num">${r.cosines[i].toFixed(4)}</td></tr>`).join('');
}

// ---------------------------------------------------------------- 화면 전환
function show(id) {
  for (const s of ['intro', 'studio', 'result']) $(s).hidden = s !== id;
  window.scrollTo(0, 0);
}
for (const b of startBtns) b.onclick = () => { show('studio'); redrawPad(); };
$('againBtn').onclick = () => {
  strokes = []; locked = false; pad.classList.remove('locked');
  redrawPad(); showEmpty(); lastResult = null;
  $('doneBtn').disabled = true;
  show('studio');
};

redrawPad();
startExplainer($('explainer'));
startHeroDemo($('heroDemo'));
boot();

// 테스트/디버그용 훅
window.__app = {
  get strokes() { return strokes; },
  setStrokes(list) { strokes = list.map(pts => ({ pts })); redrawPad(); afterChange(); },
  get lastResult() { return lastResult; },
  get busy() { return busy || finishing; },
  finish,
};
