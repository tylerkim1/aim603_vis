// node tools/precompute.mjs  → js/intro-data.js 생성 (Chrome 필요, 최초 실행 시 인터넷 필요)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((q, s) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(d); });
});
await new Promise(r => srv.listen(8799, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('PAGEERROR', e.message));
await page.goto('http://localhost:8799/tools/precompute.html');
await page.waitForFunction('window.__out', { timeout: 600000, polling: 1000 });
const out = await page.evaluate(() => window.__out);
const file = path.join(ROOT, 'js', 'intro-data.js');
fs.writeFileSync(file, `// tools/precompute.mjs 가 실제 모델로 계산해 생성한 파일. 손으로 고치지 말 것.\n// 모델: ${out.model}, 문장 틀: "${out.template}"\nexport const INTRO = ${JSON.stringify(out)};\n`);
console.log('wrote', file);
await browser.close(); srv.close();
