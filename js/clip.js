// CLIP (Xenova/clip-vit-base-patch32) 래퍼. 모든 추론은 브라우저 안에서 Transformers.js로 실행된다.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';
export const MODEL_ID = 'Xenova/clip-vit-base-patch32';

export class Clip {
  constructor({ dtype = 'q8', device = 'wasm' } = {}) {
    this.dtype = dtype;
    this.device = device;
    this.ready = false;
  }

  // onProgress(0~1): 파일 다운로드 진행률(캐시에서 읽을 때는 거의 즉시 1)
  async load(onProgress = () => {}) {
    const t0 = performance.now();
    const T = await import(TRANSFORMERS_URL);
    this.T = T;

    const files = new Map();
    const report = () => {
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded || 0; total += f.total || 0; }
      if (total > 0) onProgress(loaded / total);
    };
    const progress_callback = p => {
      if (p.status === 'progress' && p.file) { files.set(p.file, p); report(); }
      if (p.status === 'done' && p.file) { const f = files.get(p.file); if (f) { f.loaded = f.total; report(); } }
    };
    const opts = { dtype: this.dtype, device: this.device, progress_callback };

    this.processor = await T.AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
    this.vision = await T.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, opts);
    this.tokenizer = await T.AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback });
    this.text = await T.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, opts);

    onProgress(1);
    this.ready = true;
    return { loadMs: performance.now() - t0 };
  }

  // 캔버스 → 정규화된 512차원 벡터
  async embedImage(canvas) {
    const image = this.T.RawImage.fromCanvas(canvas).rgb();
    const inputs = await this.processor(image);
    const { image_embeds } = await this.vision(inputs);
    return normalize(Float32Array.from(image_embeds.data));
  }

  // 문장 배열 → 정규화된 벡터 배열 (한 번에 배치로 계산)
  async embedTexts(texts) {
    const inputs = this.tokenizer(texts, { padding: true, truncation: true });
    const { text_embeds } = await this.text(inputs);
    const [n, d] = text_embeds.dims;
    const data = text_embeds.data;
    return Array.from({ length: n }, (_, i) => normalize(Float32Array.from(data.subarray(i * d, (i + 1) * d))));
  }
}

function normalize(v) {
  let s = 0;
  for (const x of v) s += x * x;
  const inv = 1 / Math.sqrt(s);
  return v.map(x => x * inv);
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// CLIP 영점 분류와 같은 방식: logit = 100 × cosine, 후보들 사이의 softmax
export function softmax(cosines, scale = 100) {
  const m = Math.max(...cosines);
  const e = cosines.map(c => Math.exp(scale * (c - m)));
  const z = e.reduce((s, v) => s + v, 0);
  return e.map(v => v / z);
}
