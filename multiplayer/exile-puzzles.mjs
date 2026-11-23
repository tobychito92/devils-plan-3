export const imageAnchors = [
  [15,19],[36,19],[57,17],[79,19],[21,36],[43,39],[63,36],[82,40],
  [13,57],[35,57],[59,57],[77,59],[20,78],[41,78],[61,80],[81,79]
];
export const spotStudyMs = 120_000;
export const spotCount = 5;
const sequence = size => Array.from({length:size},(_,i)=>i);
function shuffled(values, random) {
  const list = [...values];
  for (let i=list.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1));
    [list[i],list[j]]=[list[j],list[i]];
  }
  return list;
}
export function spotLayout(random) {
  const before=shuffled(sequence(imageAnchors.length),random);
  const changes=shuffled(sequence(before.length),random).slice(0,spotCount);
  const after=before.slice();
  for(const i of changes)after[i]=(before[i]+1+Math.floor(random()*(before.length-1)))%before.length;
  return {before,after,changes};
}
export function spotScore(changes, proof) {
  if(!Array.isArray(proof)||proof.length!==spotCount||new Set(proof).size!==spotCount||
    proof.some(i=>!Number.isInteger(i)||i<0||i>=imageAnchors.length))return null;
  return proof.filter(i=>changes.includes(i)).length;
}

export const assemblySize=8;
export const assemblyColors=['藍色','紅色','綠色'];
const profiles=[
  [[1,2,2,1],[1,1,3,1],[1,2,2,2,1]],
  [[1,2,3,2,1],[2,3,2,2,1],[1,2,3,3,1]],
  [[2,3,4,3,2],[1,3,3,4,2,1],[1,3,4,3,3,1]]
];
const neighbors=([x,y])=>[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
const normalize=cells=>{
  const minX=Math.min(...cells.map(([x])=>x)),minY=Math.min(...cells.map(([,y])=>y));
  return cells.map(([x,y])=>[x-minX,y-minY]);
};
export function rotatedPiece(piece, turns) {
  let cells=piece.map(([x,y])=>[x,y]);
  for(let r=0;r<turns;r++)cells=cells.map(([x,y])=>[-y,x]);
  return normalize(cells);
}

export function assemblyLayouts(random) {
  return profiles.map((variants,level)=>{
    const profile=variants[Math.floor(random()*variants.length)];
    const target=profile.flatMap((radius,y)=>sequence(2*radius).map(x=>[x+4-radius,y+1]));
    const key=([x,y])=>y*assemblySize+x;
    const available=new Set(target.map(key));
    const groups=shuffled(target,random).slice(0,level+3).map(point=>{
      available.delete(key(point));
      return [point];
    });
    while(available.size) {
      const options=groups.map(group=>{
        const candidates=new Map();
        for(const point of group)for(const next of neighbors(point)){
          if(next[0]<0||next[0]>=assemblySize||next[1]<0||next[1]>=assemblySize)continue;
          if(available.has(key(next)))candidates.set(key(next),next);
        }
        return {group,candidates:[...candidates.values()]};
      }).filter(({candidates})=>candidates.length).sort((a,b)=>a.group.length-b.group.length);
      const {group,candidates}=options[0];
      const point=candidates[Math.floor(random()*candidates.length)];
      group.push(point);
      available.delete(key(point));
    }
    const order=shuffled(groups,random);
    return {
      pieces:order.map(normalize),
      solution:order.map(group=>[Math.min(...group.map(([x])=>x)),Math.min(...group.map(([,y])=>y)),0])
    };
  });
}

export function occupiedCells(pieces, placements) {
  if(!Array.isArray(placements)||placements.length!==pieces.length)return null;
  const occupied=new Map();
  for(let i=0;i<pieces.length;i++){
    if(placements[i]===null)continue;
    if(!Array.isArray(placements[i])||placements[i].length!==3||!placements[i].every(Number.isInteger))return null;
    const [x,y,turns]=placements[i];
    if(turns<0||turns>3)return null;
    for(const [dx,dy] of rotatedPiece(pieces[i],turns)){
      const px=x+dx,py=y+dy,key=py*assemblySize+px;
      if(px<0||px>=assemblySize||py<0||py>=assemblySize||occupied.has(key))return null;
      occupied.set(key,i);
    }
  }
  return occupied;
}
export function isAssemblySolved(pieces, placements) {
  const occupied=occupiedCells(pieces,placements);
  if(!occupied||placements.includes(null)||!occupied.size)return false;
  const keys=[...occupied.keys()];
  const xs=keys.map(i=>i%assemblySize),axis=Math.min(...xs)+Math.max(...xs);
  if(!keys.every(i=>occupied.has(i-i%assemblySize+axis-i%assemblySize)))return false;
  const connected=new Set([keys[0]]);
  for(const key of connected)for(const [x,y] of neighbors([key%assemblySize,Math.floor(key/assemblySize)])){
    if(x>=0&&x<assemblySize&&y>=0&&y<assemblySize&&occupied.has(y*assemblySize+x))connected.add(y*assemblySize+x);
  }
  return connected.size===keys.length;
}

if(typeof window!=='undefined')window.exilePuzzles={imageAnchors,spotStudyMs,spotCount,spotLayout,spotScore,assemblySize,assemblyColors,assemblyLayouts,rotatedPiece,occupiedCells,isAssemblySolved};
