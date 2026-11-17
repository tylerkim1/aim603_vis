import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {MAP_DATA} from '../js/map-data.js';
import {layoutSimilarities} from '../js/embedding-map.js';
import {dot} from '../js/clip.js';
const checks=[[-1,-.5,0,.5,1],[.2,.2,.2],[.9],[.2,.3,.3,.1],...MAP_DATA.samples.map(s=>MAP_DATA.textVectors.map(v=>dot(s.vector,v)))];
for(const scores of checks){const l=layoutSimilarities(scores);for(let i=0;i<scores.length;i++)for(let j=0;j<scores.length;j++){assert(Number.isFinite(l.radii[i]));if(scores[i]>scores[j]+1e-12)assert(l.radii[i]<l.radii[j]);if(scores[i]===scores[j])assert.equal(l.radii[i],l.radii[j]);}}
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],out={layoutCases:checks.length};
try {
 const p=await b.newPage();await p.setViewport({width:1440,height:1000});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto('http://localhost:8080/');
 await p.waitForSelector('#introMap .map-node');
 await p.waitForFunction(()=>document.querySelector('#sampleName').textContent==='집');
 await new Promise(r=>setTimeout(r,1200));
 await p.screenshot({path:'screenshots/redesign-intro.png',fullPage:true});
 out.samples=[];
 for(let i=0;i<3;i++){
   await p.click('.sample-tabs button:nth-child('+(i+1)+')');
   await p.waitForFunction(name=>document.getElementById('sampleName').textContent===name,{},MAP_DATA.samples[i].name);
   await p.waitForFunction(()=>window.__intro.map.scale===1);
   assert(await mapOrderMatches(p,'introMap'));
   out.samples.push(await p.evaluate(()=>({name:document.querySelector('#sampleName').textContent,top:document.querySelector('#introNeighbors').innerText,center:window.__intro.map.current,closest:window.__intro.map.words[window.__intro.map.order[0]].key})));
 }
 await p.click('#introMap .map-node[data-key="cat"] circle');
 assert((await p.$eval('#selectionNote',e=>e.textContent)).includes('고양이와 가까운 단어'));
 await p.click('.sample-tabs button:first-child');
 await p.waitForFunction(()=>window.__intro.map.scale===1);
 await p.$eval('#story1',e=>e.scrollIntoView({behavior:'instant',block:'start'}));
 await p.screenshot({path:'screenshots/similarity-centered.png'});
 await p.waitForFunction(()=>!document.getElementById('startBtn').disabled,{timeout:240000});
 await p.click('#startBtn');
 await p.select('#targetWord','house');
 const r=await p.$eval('#pad',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
 const samples=MAP_DATA.samples[0].strokes;
 for(const st of samples){
   await p.mouse.move(r.x+st[0][0]*r.w,r.y+st[0][1]*r.h);await p.mouse.down();
   for(const [x,y] of st.slice(1))await p.mouse.move(r.x+x*r.w,r.y+y*r.h,{steps:8});
   await p.mouse.up();
   await p.waitForFunction(()=>!window.__app.busy&&window.__app.lastResult?.strokeCount===window.__app.strokes.length,{timeout:30000});
 }
 await new Promise(r=>setTimeout(r,650));
 out.live=await p.evaluate(()=>({top:document.getElementById('liveWord').textContent,ms:window.__app.lastResult.ms,dimension:window.__app.lastResult.embedding.length,target:document.getElementById('targetScore').textContent,closest:window.__app.liveMap.words[window.__app.liveMap.order[0]].key}));
 assert.equal(out.live.top,'집');assert.equal(out.live.dimension,512);assert.equal(out.live.closest,'house');
 assert(await mapOrderMatches(p,'liveMap'));
 await p.screenshot({path:'screenshots/redesign-studio.png'});
 await p.click('#undoBtn');await p.waitForFunction(()=>!window.__app.busy&&window.__app.lastResult?.strokeCount===3);
 await p.click('#doneBtn');await p.waitForFunction(()=>!document.getElementById('result').hidden&&!window.__app.busy,{timeout:30000});
 await p.screenshot({path:'screenshots/redesign-result.png',fullPage:true});
 await p.click('#againBtn');assert.equal(await p.$eval('#liveMap .map-query',e=>e.getAttribute('opacity')),'0');
 // Clear while inference may be pending; stale results must not restore the query.
 await p.evaluate(s=>window.__app.setStrokes(s),samples);
 await new Promise(r=>setTimeout(r,150));await p.click('#clearBtn');
 await p.waitForFunction(()=>!window.__app.busy&&window.__app.lastResult===null);
 assert.equal(await p.$eval('#liveMap .map-query',e=>e.getAttribute('opacity')),'0');
 await p.setViewport({width:390,height:844});await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await p.reload();
 await p.waitForSelector('#introMap .map-node');
 await p.waitForFunction(()=>document.querySelector('#introMap .map-query').getAttribute('opacity')==='1');
 out.mobileOverflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await p.screenshot({path:'screenshots/redesign-mobile.png',fullPage:true});
 assert.equal(out.mobileOverflow,false);assert.deepEqual(errors,[]);
 out.errors=errors;fs.writeFileSync('screenshots/redesign-checks.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
}finally{await b.close();}

async function mapOrderMatches(p,id){return p.evaluate(id=>{const map=id==='introMap'?window.__intro.map:window.__app.liveMap;const q=document.querySelector('#'+id+' .map-query').transform.baseVal.consolidate().matrix;const radii=[...document.querySelectorAll('#'+id+' .map-node')].map(n=>{const m=n.transform.baseVal.consolidate().matrix;return Math.hypot(m.e-q.e,m.f-q.f);});for(let i=0;i<radii.length;i++)for(let j=0;j<radii.length;j++)if(map.cosines[i]>map.cosines[j]+1e-10&&radii[i]>=radii[j])return false;return true;},id);}
