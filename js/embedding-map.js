import { dot } from './clip.js';
import { reducedMotion as reduced } from './motion.js';
const NS='http://www.w3.org/2000/svg';
const CENTER=[320,195], INNER=52, OUTER=152;
const make=(tag,attrs={})=>{const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};

// A query-centered comparison, not a 2D projection of the embedding space.
// Relative radii are an affine decreasing function of the actual cosine.
// Angles only spread labels. Equal cosine values always have equal radii.
export function layoutSimilarities(scores) {
  if(!scores.length||scores.some(s=>!Number.isFinite(s)))throw new Error('유효한 cosine 값이 필요합니다.');
  const hi=Math.max(...scores),lo=Math.min(...scores),range=hi-lo;
  const radii=scores.map(s=>range<1e-12?(INNER+OUTER)/2:INNER+(hi-s)/range*(OUTER-INNER));
  const angles=scores.map((_,i)=>-Math.PI/2+i/scores.length*2*Math.PI);
  const points=radii.map((r,i)=>[CENTER[0]+r*Math.cos(angles[i]),CENTER[1]+r*Math.sin(angles[i])]);
  const order=scores.map((_,i)=>i).sort((a,b)=>scores[b]-scores[a]);
  return {radii,angles,points,order,hi,lo};
}

export class EmbeddingMap {
  constructor(el,words,vectors,{onSelect=null}={}) {
    this.el=el;this.words=words;this.vectors=vectors;this.onSelect=onSelect;
    this.selected=null;this.target=-1;this.current=null;this.scale=1;
    el.classList.add('embedding-map');
    this.svg=make('svg',{viewBox:'0 0 640 390',role:'img','aria-label':'그림 중심 유사도 지도. 중심에 가까운 단어일수록 실제 cosine이 높습니다. 방향과 단어 사이의 거리는 의미하지 않습니다.'});
    el.replaceChildren(this.svg);
    const rings=make('g',{'class':'similarity-rings'});
    for(const r of [INNER,(INNER+OUTER)/2,OUTER])rings.append(make('circle',{cx:CENTER[0],cy:CENTER[1],r}));
    this.svg.append(rings);
    this.links=Array.from({length:3},(_,i)=>{const l=make('line',{'class':'map-link link-'+i});this.svg.append(l);return l;});
    this.nodes=words.map((w,i)=>{
      const g=make('g',{'class':'map-node',tabindex:0,role:'button','aria-label':w.ko+' 유사도 살펴보기','data-key':w.key});
      g.append(make('circle',{r:4}));const text=make('text');text.textContent=w.ko;g.append(text);
      const title=make('title');g.append(title);
      g.addEventListener('click',()=>this.select(i));
      g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.select(i);}});
      this.svg.append(g);return g;
    });
    this.query=make('g',{'class':'map-query',opacity:0,transform:'translate('+CENTER.join(',')+')'});
    this.query.append(make('circle',{r:13,'class':'query-halo'}),make('circle',{r:5.5}));
    const label=make('text',{x:0,y:33,'text-anchor':'middle'});label.textContent='내 그림';this.query.append(label);this.svg.append(this.query);
    this.nearestLabel=make('text',{x:22,y:24,'class':'map-nearest-label'});this.svg.append(this.nearestLabel);
    this.empty=make('text',{x:22,y:375,'class':'map-empty'});this.svg.append(this.empty);
    this.render();
  }
  select(i){this.selected=i;this.render();this.onSelect?.(i);}
  setTarget(key){this.target=this.words.findIndex(w=>w.key===key);this.render();}
  update(vector,cosines,{label='내 그림'}={}) {
    this.vector=vector;this.cosines=Array.from(cosines);
    this.layout=layoutSimilarities(this.cosines);this.order=this.layout.order;
    this.query.querySelector('text').textContent=label;this.current=CENTER;
    cancelAnimationFrame(this.raf);
    // Shared radial reveal preserves the distance ordering throughout animation.
    const start=performance.now();
    const tick=now=>{const t=reduced?1:Math.min(1,(now-start)/500);
      this.scale=.88+.12*(1-(1-t)**3);this.render();
      if(t<1)this.raf=requestAnimationFrame(tick);
    };tick(start);
  }
  clear(){cancelAnimationFrame(this.raf);this.current=null;this.vector=null;this.cosines=null;this.order=null;this.layout=null;this.scale=1;this.selected=null;this.render();}
  render(){
    const active=this.order?.slice(0,3)||[];
    const near=this.selected==null?[]:this.vectors.map((v,i)=>({i,c:dot(v,this.vectors[this.selected])})).sort((a,b)=>b.c-a.c).slice(0,4).map(x=>x.i);
    const fallback=layoutSimilarities(this.words.map(()=>0));
    const data=this.layout||fallback;
    const points=data.points.map(p=>p.map((x,i)=>CENTER[i]+(x-CENTER[i])*this.scale));
    this.points=points;
    const occupied=[{x:276,y:211,w:88,h:28}];
    const priority=points.map((_,i)=>i).sort((a,b)=>(active.includes(b)?3:b===this.selected?2:b===this.target?1:0)-(active.includes(a)?3:a===this.selected?2:a===this.target?1:0));
    for(const i of priority){
      const g=this.nodes[i],[x,y]=points[i];g.setAttribute('transform','translate('+x+','+y+')');
      const tiedFirst=this.cosines&&Math.abs(this.cosines[i]-data.hi)<1e-12;
      g.classList.toggle('nearest',!!tiedFirst);g.classList.toggle('neighbor',active.includes(i)||near.includes(i));
      g.classList.toggle('selected',i===this.selected);g.classList.toggle('target',i===this.target);
      const title=this.cosines?this.words[i].ko+' · cosine '+this.cosines[i].toFixed(4):this.words[i].ko;
      g.setAttribute('aria-label',title);g.querySelector('title').textContent=title;
      const text=g.querySelector('text'),w=this.words[i].ko.length*14+6;
      let best=null,bestCost=Infinity;
      for(const dy of [-9,9,25,-25])for(const dx of [10,-w-10]){
        const box={x:x+dx,y:y+dy-13,w,h:16};
        const overlaps=occupied.filter(b=>box.x<b.x+b.w&&box.x+w>b.x&&box.y<b.y+b.h&&box.y+16>b.y).length;
        const cost=overlaps*100+Math.abs(dy+9)+(box.x<8||box.x+w>630||box.y<30||box.y+16>360?1000:0);
        if(cost<bestCost){bestCost=cost;best={dx,dy,box};}
      }
      text.setAttribute('x',best.dx);text.setAttribute('y',best.dy);
      text.style.opacity=bestCost>=100&&!active.includes(i)&&i!==this.selected&&i!==this.target?'0':'1';
      occupied.push(best.box);
    }
    this.query.setAttribute('opacity',this.current?1:0);
    this.links.forEach((l,k)=>{
      const p=points[active[k]];l.setAttribute('opacity',this.current&&p?1:0);if(!p)return;
      for(const [a,v]of Object.entries({x1:CENTER[0],y1:CENTER[1],x2:p[0],y2:p[1]}))l.setAttribute(a,v);
    });
    this.nearestLabel.textContent=this.current?'가장 가까운 후보  '+this.words[active[0]].ko+'  ·  cosine '+data.hi.toFixed(3):'그림을 그리면 가까운 후보가 중심으로 모입니다';
    this.empty.textContent=this.current?'중심에 가까울수록 높은 cosine · 후보 안에서 거리를 확대해 표시':'40개 후보 · 아직 비교 전';
  }
}
