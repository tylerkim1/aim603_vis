import {MAP_DATA} from './map-data.js';
import {WORDS} from './words.js';
import {EmbeddingMap} from './embedding-map.js';
import {dot,softmax} from './clip.js';
import {formatPct} from './viz.js';
import {reducedMotion as reduced} from './motion.js';
const $=id=>document.getElementById(id);
const angle=c=>Math.acos(Math.min(1,Math.max(-1,c)))*180/Math.PI;

// 각도 도식의 좌표계 (viewBox 0 0 400 226)
const OX=92, OY=204, RAY=170;
const polar=(deg,r)=>[OX+r*Math.cos(deg*Math.PI/180),OY-r*Math.sin(deg*Math.PI/180)];
// 확대 띠의 좌표계 (viewBox 0 0 400 104)
const ZX0=26, ZX1=374, ZAXIS=72;

export function startExplainer(){
  let selected=0, scores=[], angles=[], order=[], araf=0, drawRaf=0, zoomX=()=>0, picked=0;
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
    selected=i;const s=MAP_DATA.samples[i];scores=MAP_DATA.textVectors.map(v=>dot(s.vector,v));angles=scores.map(angle);order=scores.map((_,j)=>j).sort((a,b)=>scores[b]-scores[a]);
    [...tabs.children].forEach((b,j)=>{b.classList.toggle('active',j===i);b.setAttribute('aria-pressed',j===i);});
    $('sampleName').textContent=s.name;sketch();map.selected=null;map.update(s.vector,scores,{label:s.name+' 그림'});
    $('introNeighbors').replaceChildren();order.slice(0,3).forEach((j,k)=>{const b=document.createElement('button');b.className='neighbor-row'+(k===0?' first':'');b.style.animationDelay=k*70+'ms';b.innerHTML='<span class="row-index">0'+(k+1)+'</span><strong>'+WORDS[j].ko+'</strong><span>'+scores[j].toFixed(3)+'</span>';b.onclick=()=>{map.select(j);};$('introNeighbors').append(b);});
    $('selectionNote').textContent='중심의 그림에 가까운 점일수록 cosine이 높습니다. 가장 안쪽 후보가 1위입니다.';
    $('angleChoices').replaceChildren();const choices=[...new Set([order[0],order[1],WORDS.findIndex(w=>w.key==='cat'),WORDS.findIndex(w=>w.key==='tree')])];
    choices.forEach(j=>{const b=document.createElement('button');b.textContent=WORDS[j].ko;b.dataset.index=j;b.onclick=()=>showAngle(j);$('angleChoices').append(b);});
    const probs=softmax(scores);$('introScores').innerHTML=order.slice(0,5).map((j,k)=>'<div class="score-row'+(k===0?' first':'')+'" style="animation-delay:'+k*60+'ms"><span>'+WORDS[j].ko+'</span><div class="score-track"><i style="width:'+probs[j]*100+'%;animation-delay:'+k*60+'ms"></i></div><strong>'+formatPct(probs[j])+'</strong></div>').join('')+'<p class="micro">나머지 35개 후보 합계 '+(order.slice(5).reduce((n,j)=>n+probs[j],0)*100).toFixed(1)+'%</p>';
    buildZoom();showAngle(order[0]);
  }

  // 후보 40개의 각도만 떼어 확대한 띠. 같은 자리에 겹치는 점은 위로 쌓는다.
  function buildZoom(){
    const lo=Math.floor(Math.min(...angles)),hi=Math.ceil(Math.max(...angles));
    zoomX=d=>ZX0+(d-lo)/(hi-lo)*(ZX1-ZX0);
    $('zoomRange').textContent=lo+'° ~ '+hi+'° 구간';
    const levels=[];
    const dots=[...order].sort((a,b)=>angles[a]-angles[b]).map(j=>{
      const x=zoomX(angles[j]);let level=levels.findIndex(last=>x-last>=8);
      if(level<0)level=levels.length;levels[level]=x;
      return '<circle class="zoom-dot'+(j===order[0]?' first':'')+'" data-index="'+j+'" cx="'+x.toFixed(1)+'" cy="'+(ZAXIS-9-level*8)+'" r="3.5"><title>'+WORDS[j].ko+' · '+angles[j].toFixed(1)+'° · cosine '+scores[j].toFixed(4)+'</title></circle>';
    });
    const step=hi-lo>12?2:1;let ticks='';
    for(let d=lo;d<=hi;d+=step)ticks+='<line class="zoom-axis" x1="'+zoomX(d)+'" x2="'+zoomX(d)+'" y1="'+ZAXIS+'" y2="'+(ZAXIS+4)+'"/><text class="zoom-tick" text-anchor="middle" x="'+zoomX(d)+'" y="'+(ZAXIS+17)+'">'+d+'°</text>';
    $('angleZoom').innerHTML='<line class="zoom-axis" x1="'+ZX0+'" x2="'+ZX1+'" y1="'+ZAXIS+'" y2="'+ZAXIS+'"/>'+ticks+
      '<text class="zoom-end" x="'+ZX0+'" y="102">← 그림과 더 가까움</text><text class="zoom-end" text-anchor="end" x="'+ZX1+'" y="102">더 멂 →</text>'+
      '<line id="zoomMarker" class="zoom-marker" y1="20" y2="'+ZAXIS+'"/>'+dots.join('')+'<text id="zoomPick" class="zoom-pick" y="13"></text>';
    $('angleZoom').querySelectorAll('.zoom-dot').forEach(c=>c.addEventListener('click',()=>showAngle(+c.dataset.index)));
  }

  let previous=75;
  function showAngle(j){
    cancelAnimationFrame(araf);picked=j;const dest=angles[j],from=previous,fromCos=Math.cos(from*Math.PI/180);previous=dest;const start=performance.now();
    $('angleTarget').textContent=MAP_DATA.samples[selected].name+' 그림 × '+WORDS[j].ko;
    [...$('angleChoices').children].forEach(b=>b.classList.toggle('active',+b.dataset.index===j));
    $('angleRank').innerHTML=(order.indexOf(j)+1)+'위<small>/ '+WORDS.length+'</small>';
    // 확대 띠의 선택 표시
    $('angleZoom').querySelectorAll('.zoom-dot').forEach(c=>c.classList.toggle('picked',+c.dataset.index===j));
    const zx=zoomX(dest),pick=$('zoomPick');
    $('zoomMarker').setAttribute('x1',zx);$('zoomMarker').setAttribute('x2',zx);
    pick.textContent=WORDS[j].ko+' '+dest.toFixed(1)+'°';pick.setAttribute('x',zx);pick.setAttribute('text-anchor',zx<70?'start':zx>330?'end':'middle');
    // 후보 40개의 실제 각도를 옅은 선으로 깔고, 선택한 단어만 굵게 그린다
    const lo=Math.min(...angles),hi=Math.max(...angles),[fx0,fy0]=polar(lo,RAY+7),[fx1,fy1]=polar(hi,RAY+7);
    const fan=angles.map(a=>{const [x,y]=polar(a,RAY);return '<line class="angle-fan" x1="'+OX+'" y1="'+OY+'" x2="'+x.toFixed(1)+'" y2="'+y.toFixed(1)+'"/>';}).join('')+
      '<path class="fan-arc" d="M'+fx0.toFixed(1)+' '+fy0.toFixed(1)+' A'+(RAY+7)+' '+(RAY+7)+' 0 0 0 '+fx1.toFixed(1)+' '+fy1.toFixed(1)+'"/>';
    const tick=now=>{const t=reduced?1:Math.min(1,(now-start)/600),e=1-(1-t)**3,d=from+(dest-from)*e,[x,y]=polar(d,RAY),[ax,ay]=polar(d,48),[lx,ly]=polar(d,RAY+14),[tx,ty]=polar(d/2,64);
      $('angleDegrees').textContent=d.toFixed(1)+'°';$('angleCosine').textContent=(t<1?fromCos+(scores[j]-fromCos)*e:scores[j]).toFixed(4);
      $('cosineAngle').innerHTML='<path d="M'+OX+' 24 V'+OY+' H316" class="angle-guide"/><path d="M'+(OX+RAY)+' '+OY+' A'+RAY+' '+RAY+' 0 0 0 '+OX+' '+(OY-RAY)+'" class="angle-guide"/>'+fan+
        '<line x1="'+OX+'" y1="'+OY+'" x2="'+(OX+214)+'" y2="'+OY+'" class="image-ray"/><line x1="'+OX+'" y1="'+OY+'" x2="'+x+'" y2="'+y+'" class="word-ray"/><path d="M'+(OX+48)+' '+OY+' A48 48 0 0 0 '+ax+' '+ay+'" class="angle-arc"/>'+
        '<circle cx="'+(OX+214)+'" cy="'+OY+'" r="5" class="image-point"/><circle cx="'+x+'" cy="'+y+'" r="5" class="word-point"/><text x="'+(OX+223)+'" y="'+(OY+4)+'">그림</text>'+
        '<text class="word-label" x="'+(lx+2)+'" y="'+ly+'">'+WORDS[j].ko+'</text><text class="theta" text-anchor="middle" x="'+tx+'" y="'+(ty+4)+'">θ</text>'+
        '<text x="'+(OX-10)+'" y="'+(OY-RAY+26)+'" text-anchor="end">후보</text><text x="'+(OX-10)+'" y="'+(OY-RAY+44)+'" text-anchor="end">40개</text>';
      if(t<1)araf=requestAnimationFrame(tick);
    };araf=requestAnimationFrame(tick);
  }
  $('replaySketch').onclick=()=>sketch();choose(0);
  // 스크롤해 들어오면 한 번만 떠오른다
  const obs=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');obs.unobserve(e.target);}}),{threshold:.15,rootMargin:'0px 0px -6% 0px'});
  document.querySelectorAll('[data-reveal]').forEach(el=>obs.observe(el));
  window.__intro={map,choose};
}
