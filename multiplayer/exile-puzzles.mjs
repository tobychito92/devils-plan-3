import {plates} from './plates.mjs?v=scenes20';
export const studyMs = 120000;
export function availableScenes(history=[]) {
  const played = Array.isArray(history) ? history : [history];
  const fresh = plates.filter(plate=>!played.includes(plate.id));
  return fresh.length ? fresh : plates.filter(plate=>plate.id!==played.at(-1));
}
export function recordScene(history,id) {
  const played=Array.isArray(history)?history.filter(value=>plates.some(plate=>plate.id===value)):[];
  return played.length>=plates.length || played.includes(id) ? [id] : [...played,id];
}
export function spotLayout(random,history) {
  const choices=availableScenes(history);
  const plate=choices[Math.floor(random()*choices.length)];
  const order = plate.regions.map((_,i)=>i);
  for(let i=order.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [order[i],order[j]]=[order[j],order[i]];
  }
  return {plate, changes:order.slice(0,5).map(i=>plate.regions[i])};
}
export function spotScore(changes, marks) {
  if(!Array.isArray(marks)||marks.length!==5||marks.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))return null;
  const hit=new Set();
  for(const [x,y] of marks){
    const i=changes.findIndex(([cx,cy,rx,ry])=>((x-cx)/rx)**2+((y-cy)/ry)**2<=1);
    if(i>=0)hit.add(i);
  }
  return hit.size;
}

// Half-plane clipping computes the area shared by two convex polygons.
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const dist=(a,b)=>Math.hypot(...sub(a,b));
const signedArea=p=>p.reduce((s,a,i)=>s+cross(a,p[(i+1)%p.length]),0)/2;
const area=p=>Math.abs(signedArea(p));
function cut(poly, side){
  const result=[];
  poly.forEach((a,i)=>{
    const b=poly[(i+1)%poly.length],u=side(a),v=side(b);
    if(u>=0)result.push(a);
    if((u>0&&v<0)||(u<0&&v>0))result.push(a.map((n,k)=>n+(b[k]-n)*u/(u-v)));
  });
  return result;
}
function intersection(a,b){
  const sign=Math.sign(signedArea(b));
  for(let i=0;i<b.length&&a.length;i++){
    const start=b[i],edge=sub(b[(i+1)%b.length],start);
    a=cut(a,p=>sign*cross(edge,sub(p,start)));
  }
  return area(a);
}
// Ear clipping preserves the re-entrant corners on the green pieces.
function convexParts(poly){
  const sign=Math.sign(signedArea(poly));
  const side=(a,b,c)=>sign*cross(sub(b,a),sub(c,a));
  if(poly.every((v,i)=>side(poly.at(i-1),v,poly[(i+1)%poly.length])>=-1e-7))return [poly];
  const rest=poly.slice(),parts=[];
  while(rest.length>3){
    const i=rest.findIndex((v,k)=>{
      const a=rest.at(k-1),b=rest[(k+1)%rest.length];
      return side(a,v,b)>1e-7&&!rest.some(q=>q!==a&&q!==v&&q!==b&&
        side(a,v,q)>=-1e-7&&side(v,b,q)>=-1e-7&&side(b,a,q)>=-1e-7);
    });
    if(i<0)throw new Error('Invalid puzzle contour');
    parts.push([rest.at(i-1),rest[i],rest[(i+1)%rest.length]]);
    rest.splice(i,1);
  }
  return [...parts,rest];
}
function serratedPieces(random){
  const jitter=()=>Math.round(random()*8)-4;
  const rows=[
    [[-45,-66],[45,-66]],
    [[-70,-40],[-31,-25],[-13,-41+jitter()],[20,-19],[49,-34+jitter()],[70,-40]],
    [[-78,-4],[-38,7],[-11,-9+jitter()],[16,12],[51,-5+jitter()],[78,-4]],
    [[-58,36],[-28,25],[2,43+jitter()],[31,23],[58,36]],
    [[0,78]]
  ];
  return rows.slice(1).map((row,i)=>[...rows[i],...row.slice().reverse()]);
}
function centroid(p){
  const sum=[0,0];
  p.forEach((a,i)=>{
    const b=p[(i+1)%p.length],w=cross(a,b);
    for(let k=0;k<2;k++)sum[k]+=(a[k]+b[k])*w;
  });
  return sum.map(v=>v/(6*signedArea(p)));
}
export function world(piece,[x,y,angle]){
  const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  return piece.map(([u,v])=>[x+u*c-v*s,y+u*s+v*c]);
}
export const colors=['藍','紅','綠'];
// Cut each convex silhouette along oblique seams, then scatter the pieces on the table.
export function assemblyLayouts(random){
  const outlines=[
    [[-82,48],[0,-83],[82,48]],
    [[-84,0],[-48,-60],[48,-60],[84,0],[0,78]],
    [[-80,-35],[-40,-65],[40,-65],[80,-35],[68,38],[0,78],[-68,38]]
  ];
  return outlines.map((outline,level)=>{
    let pieces=[outline];
    for(let n=0;n<level+2;n++){
      pieces.sort((a,b)=>area(b)-area(a));
      const source=pieces.shift(), center=centroid(source);
      const angle=(30+15*Math.floor(random()*9))*Math.PI/180;
      const normal=[Math.cos(angle),Math.sin(angle)],offset=(random()-.5)*8;
      const side=p=>(p[0]-center[0])*normal[0]+(p[1]-center[1])*normal[1]-offset;
      pieces.push(cut(source,side),cut(source,p=>-side(p)));
    }
    if(level===2)pieces=serratedPieces(random);
    const centers=pieces.map(centroid);
    return {pieces:pieces.map((p,i)=>p.map(v=>sub(v,centers[i]))),
      solution:centers.map(([x,y])=>[x+200,y+170,0]),
      start:pieces.map((_,i)=>[82+118*(i%3),94+145*Math.floor(i/3),15*Math.floor(random()*24)])};
  });
}
function edgesTouch(a,b){
  return a.some((v,i)=>{
    const w=a[(i+1)%a.length],len=dist(v,w),d=sub(w,v).map(n=>n/len);
    const project=p=>(p[0]-v[0])*d[0]+(p[1]-v[1])*d[1];
    return b.some((p,j)=>{
      const q=b[(j+1)%b.length];
      return Math.abs(cross(d,sub(p,v)))<1.3&&Math.abs(cross(d,sub(q,v)))<1.3&&
        Math.min(len,Math.max(project(p),project(q)))-Math.max(0,Math.min(project(p),project(q)))>3;
    });
  });
}
export function solved(pieces,poses){
  if(!Array.isArray(poses)||poses.length!==pieces.length||poses.some(p=>!Array.isArray(p)||p.length!==3||p.some(n=>!Number.isFinite(n)||Math.abs(n)>2000)))return false;
  const polys=pieces.map((p,i)=>world(p,poses[i]));
  if(polys.flat().some(([x,y])=>x<-.1||x>400.1||y<-.1||y>340.1))return false;
  const connected=new Set([0]);
  for(const i of connected)polys.forEach((p,j)=>{if(!connected.has(j)&&edgesTouch(polys[i],p))connected.add(j)});
  if(connected.size!==polys.length)return false;
  const total=polys.reduce((n,p)=>n+area(p),0);
  const fragments=polys.map(convexParts);
  const shared=(a,b)=>a.reduce((sum,p)=>sum+b.reduce((n,q)=>n+intersection(p,q),0),0);
  let overlap=0;
  fragments.forEach((p,i)=>fragments.slice(i+1).forEach(q=>overlap+=shared(p,q)));
  if(overlap>total*.003)return false;
  const center=[0,0];
  polys.forEach(p=>centroid(p).forEach((v,k)=>center[k]+=v*area(p)/total));
  // A reflection pairs hull vertices or fixes a vertex on the axis. Test these candidate directions.
  const points=polys.flat(), angles=[];
  points.forEach((a,i)=>{
    angles.push(Math.atan2(a[1]-center[1],a[0]-center[0]));
    points.slice(i+1).forEach(b=>{if(dist(a,b)>2)angles.push(Math.atan2(b[1]-a[1],b[0]-a[0])+Math.PI/2)});
  });
  return angles.some(t=>{
    const c=Math.cos(2*t),s=Math.sin(2*t);
    const all=fragments.flat();
    const coverage=all.reduce((sum,p)=>{
      const mirror=p.map(v=>{const [x,y]=sub(v,center);return [center[0]+c*x+s*y,center[1]+s*x-c*y]});
      return sum+all.reduce((n,q)=>n+intersection(mirror,q),0);
    },0);
    return coverage-overlap>=total*.994;
  });
}
if(typeof window!=='undefined')window.exilePuzzles={recordScene,spotLayout,spotScore,studyMs,assemblyLayouts,colors,world,solved};
