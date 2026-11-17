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
// 확대 띠의 좌표계 (viewBox 0 0 400 190)
const ZX0=26, ZX1=374, ZAXIS=156;
const arcPath=(a,b,r)=>{const [x0,y0]=polar(a,r),[x1,y1]=polar(b,r);return 'M'+x0.toFixed(1)+' '+y0.toFixed(1)+' A'+r+' '+r+' 0 0 0 '+x1.toFixed(1)+' '+y1.toFixed(1);};
const span=([a,b])=>a.toFixed(0)+'~'+b.toFixed(0)+'°';
// 배율 차트의 좌표계 (viewBox 0 0 1000 312). 가로는 cosine에 곱하는 배율 1~100, 세로는 상대 점수 0~100%.
const AX0=70, AX1=850, AY0=34, AY1=266, ASTEPS=80;
const ampX=s=>AX0+(s-1)/99*(AX1-AX0);
const pct=p=>p>=.1?Math.round(p*100)+'%':(p*100).toFixed(p>=.01?1:2)+'%';
const ratioText=r=>r<10?r.toFixed(1):Math.round(r).toLocaleString('ko-KR');

export function startExplainer(){
  let selected=0, scores=[], angles=[], order=[], probs=[], araf=0, drawRaf=0, ampRaf=0, ampOther=0, ampSeen=false, zoomX=()=>0, picked=0;
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
    $('angleChoices').replaceChildren();const choices=[0,1,order.length/2-1,order.length-1].map(k=>order[k|0]); // 1위·2위·중간·꼴찌: 후보 사이의 차이가 가장 넓게 드러난다
    choices.forEach(j=>{const b=document.createElement('button');b.innerHTML=WORDS[j].ko+'<small>'+(order.indexOf(j)+1)+'위</small>';b.dataset.index=j;b.onclick=()=>showAngle(j);$('angleChoices').append(b);});
    probs=softmax(scores);$('introScores').innerHTML=order.slice(0,5).map((j,k)=>'<div class="score-row'+(k===0?' first':'')+'" style="animation-delay:'+k*60+'ms"><span>'+WORDS[j].ko+'</span><div class="score-track"><i style="width:'+probs[j]*100+'%;animation-delay:'+k*60+'ms"></i></div><strong>'+formatPct(probs[j])+'</strong></div>').join('')+'<p class="micro">나머지 35개 후보 합계 '+(order.slice(5).reduce((n,j)=>n+probs[j],0)*100).toFixed(1)+'%</p>';
    buildZoom();buildAmp();showAngle(order[0]);
  }

  // 후보 40개의 각도만 떼어 확대한 띠. 같은 자리에 겹치는 점은 위로 쌓는다.
  function buildZoom(){
    const lo=Math.floor(Math.min(...angles)),hi=Math.ceil(Math.max(...angles));
    zoomX=d=>ZX0+(d-lo)/(hi-lo)*(ZX1-ZX0);
    $('zoomRange').textContent=lo+'° ~ '+hi+'° 구간';
    const levels=[];
    const placed=[...order].sort((a,b)=>angles[a]-angles[b]).map(j=>{
      const x=zoomX(angles[j]);let level=levels.findIndex(last=>x-last>=10);
      if(level<0)level=levels.length;levels[level]=x;
      return {j,x,level};
    });
    // 가장 높이 쌓인 점도 위쪽 이름표 아래에 들어오도록 간격을 맞춘다
    const dy=Math.min(10,(ZAXIS-52)/Math.max(1,levels.length-1));
    const dots=placed.map(({j,x,level})=>'<circle class="zoom-dot'+(j===order[0]?' first':'')+'" data-index="'+j+'" cx="'+x.toFixed(1)+'" cy="'+(ZAXIS-11-level*dy).toFixed(1)+'" r="4.5"><title>'+WORDS[j].ko+' · '+angles[j].toFixed(1)+'° · cosine '+scores[j].toFixed(4)+'</title></circle>');
    const step=hi-lo>12?2:1;let ticks='';
    for(let d=lo;d<=hi;d+=step)ticks+='<line class="zoom-axis" x1="'+zoomX(d)+'" x2="'+zoomX(d)+'" y1="'+ZAXIS+'" y2="'+(ZAXIS+4)+'"/><text class="zoom-tick" text-anchor="middle" x="'+zoomX(d)+'" y="'+(ZAXIS+17)+'">'+d+'°</text>';
    $('angleZoom').innerHTML='<line class="zoom-axis" x1="'+ZX0+'" x2="'+ZX1+'" y1="'+ZAXIS+'" y2="'+ZAXIS+'"/>'+ticks+
      '<text class="zoom-end" x="'+ZX0+'" y="'+(ZAXIS+32)+'">← 그림과 더 가까움</text><text class="zoom-end" text-anchor="end" x="'+ZX1+'" y="'+(ZAXIS+32)+'">더 멂 →</text>'+
      '<line id="zoomMarker" class="zoom-marker" y1="26" y2="'+ZAXIS+'"/>'+dots.join('')+'<text id="zoomPick" class="zoom-pick" y="18"></text>';
    $('angleZoom').querySelectorAll('.zoom-dot').forEach(c=>c.addEventListener('click',()=>showAngle(+c.dataset.index)));
  }

  // 작은 차이가 커지는 과정. cosine에 곱하는 배율을 1에서 100(CLIP이 학습으로 정한 값)까지 키울 때
  // 후보 40개의 상대 점수를 선으로 그린다. 왼쪽 끝에서는 모두 2.5% 근처, 오른쪽 끝에서는 1위만 솟는다.
  const ampY=p=>AY0+(1-p)*(AY1-AY0);
  function buildAmp(){
    const cols=[];for(let k=0;k<=ASTEPS;k++)cols.push(softmax(scores,1+99*k/ASTEPS));
    const lines=[...order].reverse().map(i=>{let d='';for(let k=0;k<=ASTEPS;k++)d+=(k?'L':'M')+ampX(1+99*k/ASTEPS).toFixed(1)+' '+ampY(cols[k][i]).toFixed(2);return '<path class="amp-line" data-index="'+i+'" d="'+d+'"/>';}).join('');
    let axis='';
    for(const v of [0,.25,.5,.75,1])axis+='<line class="amp-grid" x1="'+AX0+'" x2="'+AX1+'" y1="'+ampY(v)+'" y2="'+ampY(v)+'"/><text class="amp-tick" text-anchor="end" x="'+(AX0-10)+'" y="'+(ampY(v)+4.5)+'">'+v*100+'%</text>';
    for(const s of [1,25,50,75,100])axis+='<line class="zoom-axis" x1="'+ampX(s)+'" x2="'+ampX(s)+'" y1="'+AY1+'" y2="'+(AY1+5)+'"/><text class="amp-tick" text-anchor="middle" x="'+ampX(s)+'" y="'+(AY1+21)+'">×'+s+'</text>';
    $('ampChart').innerHTML='<defs><clipPath id="ampClip"><rect id="ampClipRect" x="'+(AX0-3)+'" y="0" width="0" height="312"/></clipPath></defs>'+axis+
      '<text class="amp-tick" x="'+AX0+'" y="'+(AY1+40)+'">cosine 그대로</text><text class="amp-tick" text-anchor="middle" x="'+(AX0+AX1)/2+'" y="'+(AY1+40)+'">cosine에 곱하는 배율 · 마우스를 올려 움직여 보세요</text><text class="amp-tick" text-anchor="end" x="'+AX1+'" y="'+(AY1+40)+'">CLIP이 학습으로 정한 배율</text>'+
      '<path class="amp-leader" d="M'+(AX0+3)+' '+(ampY(.025)-7)+' V'+(ampY(.2)+2)+' H'+(AX0+12)+'"/><text class="amp-note" x="'+(AX0+17)+'" y="'+(ampY(.2)+7)+'">곱하지 않으면 40개 모두 2.5% 안팎</text>'+
      '<g clip-path="url(#ampClip)" id="ampLines">'+lines+'</g><g id="ampLabels"></g>'+
      '<g id="ampCursor"><line class="amp-cursor" y1="26" y2="'+(AY1+5)+'"/><line id="ampGap" class="amp-gap"/><text id="ampGapText" class="amp-gap-text" text-anchor="end" x="-10"></text><circle id="ampDotOther" class="amp-dot other" r="4.5"/><circle id="ampDotTop" class="amp-dot" r="6"/>'+
      '<rect class="amp-pill" x="-27" y="4" width="54" height="23" rx="11.5"/><text id="ampPillText" class="amp-pill-text" text-anchor="middle" y="20.5"></text></g>';
  }

  // 1위와 비교 대상(선택한 단어, 1위를 골랐으면 2위)의 선을 강조하고 오른쪽 끝에 이름과 값을 단다
  function markAmp(j){
    const top=order[0];ampOther=j===top?order[1]:j;
    const g=$('ampLines'),line=i=>g.querySelector('[data-index="'+i+'"]');
    g.querySelectorAll('path').forEach(el=>el.classList.remove('first','other'));
    line(ampOther).classList.add('other');g.append(line(ampOther));line(top).classList.add('first');g.append(line(top)); // 강조한 선을 맨 위에 그린다
    $('ampLabels').innerHTML='<g class="amp-right"><text class="amp-end first" x="'+(AX1+14)+'" y="'+(ampY(probs[top])+8).toFixed(1)+'">'+WORDS[top].ko+' '+pct(probs[top])+'</text>'+
      '<text class="amp-end" x="'+(AX1+14)+'" y="'+Math.min(ampY(probs[ampOther])+5,AY1-3).toFixed(1)+'">'+WORDS[ampOther].ko+' '+pct(probs[ampOther])+'</text></g>';
    $('ampPair').textContent='1위 '+WORDS[top].ko+' ↔ '+(order.indexOf(ampOther)+1)+'위 '+WORDS[ampOther].ko+' · 각도 '+(angles[ampOther]-angles[top]).toFixed(1)+'°, cosine '+(scores[top]-scores[ampOther]).toFixed(3)+' 차이';
    $('ampTopName').textContent=WORDS[top].ko;$('ampOtherName').textContent=WORDS[ampOther].ko;
    playAmp(1600);
  }

  // 배율이 s일 때의 값. 두 선 사이의 간격(점선)이 점수 차이다. sweeping이면 s까지만 선을 드러낸다.
  function setAmp(s,sweeping){
    const p=softmax(scores,s),top=order[0],x=ampX(s),yt=ampY(p[top]),yo=ampY(p[ampOther]),ratio=ratioText(p[top]/p[ampOther])+'배';
    $('ampClipRect').setAttribute('width',((sweeping?x:AX1)-AX0+6).toFixed(1));
    $('ampCursor').setAttribute('transform','translate('+x.toFixed(1)+' 0)');
    $('ampDotTop').setAttribute('cy',yt.toFixed(1));$('ampDotOther').setAttribute('cy',yo.toFixed(1));
    $('ampGap').setAttribute('y1',yt.toFixed(1));$('ampGap').setAttribute('y2',yo.toFixed(1));
    const gap=$('ampGapText');gap.textContent=yo-yt>26?ratio+' 차이':'';gap.setAttribute('y',((yt+yo)/2+5).toFixed(1));
    $('ampPillText').textContent=$('ampScale').textContent='×'+Math.round(s);
    $('ampTop').textContent=pct(p[top]);$('ampOther').textContent=pct(p[ampOther]);$('ampRatio').textContent=ratio;
    $('ampChart').classList.toggle('full',!sweeping);
  }
  // ×1에서 ×100까지 훑으며 그린다. 화면에 들어오기 전에는 완성된 모습으로 둔다.
  function playAmp(ms){
    cancelAnimationFrame(ampRaf);
    if(reduced||!ampSeen){setAmp(100,false);return;}
    const start=performance.now();
    const tick=now=>{const t=Math.min(1,(now-start)/ms);setAmp(1+99*(1-(1-t)**2),t<1);if(t<1)ampRaf=requestAnimationFrame(tick);};
    setAmp(1,true);ampRaf=requestAnimationFrame(tick);
  }
  $('ampChart').addEventListener('pointermove',e=>{const r=$('ampChart').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*1000;cancelAnimationFrame(ampRaf);setAmp(Math.min(100,Math.max(1,1+(x-AX0)/(AX1-AX0)*99)),false);});
  $('ampChart').addEventListener('pointerleave',()=>{cancelAnimationFrame(ampRaf);setAmp(100,false);});
  $('ampReplay').onclick=()=>playAmp(2600);

  let previous=75;
  function showAngle(j){
    cancelAnimationFrame(araf);picked=j;const dest=angles[j],from=previous,fromCos=Math.cos(from*Math.PI/180);previous=dest;const start=performance.now();
    $('angleTarget').textContent=MAP_DATA.samples[selected].name+' 그림 × '+WORDS[j].ko;
    [...$('angleChoices').children].forEach(b=>b.classList.toggle('active',+b.dataset.index===j));
    $('angleRank').innerHTML=(order.indexOf(j)+1)+'위<small>/ '+WORDS.length+'</small>';markAmp(j);
    // 확대 띠의 선택 표시
    $('angleZoom').querySelectorAll('.zoom-dot').forEach(c=>c.classList.toggle('picked',+c.dataset.index===j));
    const zx=zoomX(dest),pick=$('zoomPick');
    $('zoomMarker').setAttribute('x1',zx);$('zoomMarker').setAttribute('x2',zx);
    pick.textContent=WORDS[j].ko+' '+dest.toFixed(1)+'°';pick.setAttribute('x',zx);pick.setAttribute('text-anchor',zx<70?'start':zx>330?'end':'middle');
    // 후보 40개의 실제 각도를 옅은 선으로 깔고, 선택한 단어만 굵게 그린다
    const lo=Math.min(...angles),hi=Math.max(...angles);
    const fan=angles.map(a=>{const [x,y]=polar(a,RAY);return '<line class="angle-fan" x1="'+OX+'" y1="'+OY+'" x2="'+x.toFixed(1)+'" y2="'+y.toFixed(1)+'"/>';}).join('')+
      '<path class="fan-arc" d="'+arcPath(lo,hi,RAY+7)+'"/>';
    const tick=now=>{const t=reduced?1:Math.min(1,(now-start)/600),e=1-(1-t)**3,d=from+(dest-from)*e,[x,y]=polar(d,RAY),[ax,ay]=polar(d,48),[lx,ly]=polar(d,RAY+14),[tx,ty]=polar(d/2,64);
      $('angleDegrees').textContent=d.toFixed(1)+'°';$('angleCosine').textContent=(t<1?fromCos+(scores[j]-fromCos)*e:scores[j]).toFixed(4);
      $('cosineAngle').innerHTML='<path d="M'+OX+' 24 V'+OY+' H316" class="angle-guide"/><path d="M'+(OX+RAY)+' '+OY+' A'+RAY+' '+RAY+' 0 0 0 '+OX+' '+(OY-RAY)+'" class="angle-guide"/>'+fan+
        '<line x1="'+OX+'" y1="'+OY+'" x2="'+(OX+214)+'" y2="'+OY+'" class="image-ray"/><line x1="'+OX+'" y1="'+OY+'" x2="'+x+'" y2="'+y+'" class="word-ray"/><path d="M'+(OX+48)+' '+OY+' A48 48 0 0 0 '+ax+' '+ay+'" class="angle-arc"/>'+
        '<circle cx="'+(OX+214)+'" cy="'+OY+'" r="5" class="image-point"/><circle cx="'+x+'" cy="'+y+'" r="5" class="word-point"/><text x="'+(OX+223)+'" y="'+(OY+4)+'">그림</text>'+
        '<text class="word-label" x="'+(lx+2)+'" y="'+ly+'">'+WORDS[j].ko+'</text><text class="theta" text-anchor="middle" x="'+tx+'" y="'+(ty+4)+'">θ</text>'+
        '<text x="'+(OX-10)+'" y="'+(OY-RAY+26)+'" text-anchor="end" class="fan-label">후보 40개</text><text x="'+(OX-10)+'" y="'+(OY-RAY+44)+'" text-anchor="end" class="fan-label">'+span([lo,hi])+'</text>';
      if(t<1)araf=requestAnimationFrame(tick);
    };araf=requestAnimationFrame(tick);
  }
  $('replaySketch').onclick=()=>sketch();choose(0);
  // 스크롤해 들어오면 한 번만 떠오른다
  const obs=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');obs.unobserve(e.target);if(e.target.id==='angleAmp'){ampSeen=true;playAmp(2600);}}}),{threshold:.15,rootMargin:'0px 0px -6% 0px'});
  document.querySelectorAll('[data-reveal]').forEach(el=>obs.observe(el));
  window.__intro={map,choose};
}
