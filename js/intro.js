import {MAP_DATA} from './map-data.js';
import {WORDS} from './words.js';
import {EmbeddingMap} from './embedding-map.js';
import {dot,softmax} from './clip.js';
import {formatPct} from './viz.js';
const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const angle=c=>Math.acos(Math.min(1,Math.max(-1,c)))*180/Math.PI;
export function startExplainer(){
  let selected=0, scores=[], order=[], araf=0, drawRaf=0;
  const map=new EmbeddingMap($('introMap'),WORDS,MAP_DATA.textVectors,{onSelect:i=>{
    const neighbors=WORDS.map((w,j)=>({name:w.ko,value:dot(MAP_DATA.textVectors[i],MAP_DATA.textVectors[j]),j})).filter(x=>x.j!==i).sort((a,b)=>b.value-a.value).slice(0,3);
    $('selectionNote').textContent=WORDS[i].ko+'와 가까운 단어: '+neighbors.map(x=>x.name).join(' · ');showAngle(i);
  }});
  const tabs=document.querySelector('.sample-tabs');
  MAP_DATA.samples.forEach((s,i)=>{const b=document.createElement('button');b.textContent=s.name;b.type='button';b.onclick=()=>choose(i);tabs.append(b);});
  function sketch(animate=true){
    cancelAnimationFrame(drawRaf);const c=$('sampleSketch'),ctx=c.getContext('2d'),strokes=MAP_DATA.samples[selected].strokes;
    const total=strokes.reduce((n,s)=>n+s.length-1,0),start=performance.now();
    const tick=now=>{const p=reduced||!animate?1:Math.min(1,(now-start)/1000);let budget=p*total;
      ctx.fillStyle='#fff';ctx.fillRect(0,0,320,320);ctx.strokeStyle='#172220';ctx.lineWidth=4.375;ctx.lineCap=ctx.lineJoin='round';
      for(const st of strokes){if(budget<=0)break;ctx.beginPath();ctx.moveTo(st[0][0]*320,st[0][1]*320);for(let j=1;j<st.length&&budget>0;j++,budget--){const k=Math.min(1,budget);ctx.lineTo((st[j-1][0]+(st[j][0]-st[j-1][0])*k)*320,(st[j-1][1]+(st[j][1]-st[j-1][1])*k)*320);}ctx.stroke();}
      if(p<1)drawRaf=requestAnimationFrame(tick);
    };drawRaf=requestAnimationFrame(tick);
  }
  function choose(i){
    selected=i;const s=MAP_DATA.samples[i];scores=MAP_DATA.textVectors.map(v=>dot(s.vector,v));order=scores.map((_,j)=>j).sort((a,b)=>scores[b]-scores[a]);
    [...tabs.children].forEach((b,j)=>{b.classList.toggle('active',j===i);b.setAttribute('aria-pressed',j===i);});
    $('sampleName').textContent=s.name;sketch();map.selected=null;map.update(s.vector,scores,{label:s.name+' 그림'});
    $('introNeighbors').replaceChildren();order.slice(0,3).forEach((j,k)=>{const b=document.createElement('button');b.className='neighbor-row'+(k===0?' first':'');b.innerHTML='<span class="row-index">0'+(k+1)+'</span><strong>'+WORDS[j].ko+'</strong><span>'+scores[j].toFixed(3)+'</span>';b.onclick=()=>{map.select(j);};$('introNeighbors').append(b);});
    $('selectionNote').textContent='중심의 그림에 가까운 점일수록 cosine이 높습니다. 가장 안쪽 후보가 1위입니다.';
    $('angleChoices').replaceChildren();const choices=[...new Set([order[0],order[1],WORDS.findIndex(w=>w.key==='cat'),WORDS.findIndex(w=>w.key==='tree')])];
    choices.forEach(j=>{const b=document.createElement('button');b.textContent=WORDS[j].ko;b.dataset.index=j;b.onclick=()=>showAngle(j);$('angleChoices').append(b);});
    const probs=softmax(scores);$('introScores').innerHTML=order.slice(0,5).map((j,k)=>'<div class="score-row'+(k===0?' first':'')+'"><span>'+WORDS[j].ko+'</span><div class="score-track"><i style="width:'+probs[j]*100+'%"></i></div><strong>'+formatPct(probs[j])+'</strong></div>').join('')+'<p class="micro">나머지 35개 후보 합계 '+(order.slice(5).reduce((n,j)=>n+probs[j],0)*100).toFixed(1)+'%</p>';
    showAngle(order[0]);
  }
  let previous=75;
  function showAngle(j){
    cancelAnimationFrame(araf);const dest=angle(scores[j]),from=previous;previous=dest;const start=performance.now();
    $('angleTarget').textContent=MAP_DATA.samples[selected].name+' 그림 × '+WORDS[j].ko;
    [...$('angleChoices').children].forEach(b=>b.classList.toggle('active',+b.dataset.index===j));
    $('angleDegrees').textContent=dest.toFixed(1)+'°';$('angleCosine').textContent=scores[j].toFixed(4);
    const tick=now=>{const t=reduced?1:Math.min(1,(now-start)/600),d=from+(dest-from)*(1-(1-t)**3),r=d*Math.PI/180,x=64+170*Math.cos(r),y=208-170*Math.sin(r),ax=64+48*Math.cos(r),ay=208-48*Math.sin(r);
      $('cosineAngle').innerHTML='<path d="M64 28 V208 H300" class="angle-guide"/><path d="M234 208 A170 170 0 0 0 64 38" class="angle-guide"/><line x1="64" y1="208" x2="284" y2="208" class="image-ray"/><line x1="64" y1="208" x2="'+x+'" y2="'+y+'" class="word-ray"/><path d="M112 208 A48 48 0 0 0 '+ax+' '+ay+'" class="angle-arc"/><circle cx="284" cy="208" r="5" class="image-point"/><circle cx="'+x+'" cy="'+y+'" r="5" class="word-point"/><text x="292" y="212">그림</text><text x="'+(x+14)+'" y="'+(y+4)+'">'+WORDS[j].ko+'</text><text x="122" y="180">θ</text>';
      if(t<1)araf=requestAnimationFrame(tick);
    };araf=requestAnimationFrame(tick);
  }
  $('replaySketch').onclick=()=>sketch();choose(0);
  const obs=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');obs.unobserve(e.target);}}),{threshold:.12});
  document.querySelectorAll('.story').forEach(el=>obs.observe(el));
  window.__intro={map,choose};
}
