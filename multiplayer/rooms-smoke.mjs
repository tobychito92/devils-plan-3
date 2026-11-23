import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {roomGames, seededRandom} from './catalog.mjs';
import {prepareGame, verifyRace} from './headless.mjs';

function controls(screen, selector, property) {
  const dom = screen.board + screen.controls;
  return [...dom.matchAll(new RegExp('<' + selector + '\\b([^>]*)>([\\s\\S]*?)<\\/' + selector + '>', 'g'))]
    .map(([, attrs, contents]) => ({
      index: Number(attrs.match(new RegExp(property + '="(-?\\d+)"'))?.[1]),
      disabled: attrs.includes('disabled=""'), contents
    }));
}
function move(engine, name, values) {
  const seat = engine.view(0).turn;
  const screen = engine.view(seat);
  const step = controls(screen, 'button', 'data-step').find(b => !b.disabled && name.test(b.contents));
  assert(step, 'Missing ' + name + ' in seat ' + seat);
  const fields = controls(screen, 'select', 'data-field');
  const defaults = fields.map(f => Number(f.contents.match(/<option value="(\d+)" selected/)?.[1] ?? -1));
  const action = {kind:'click', index:step.index, values:values || defaults};
  assert(!engine.act((seat+1)%2, action));
  assert(engine.act(seat, action));
}
for (const id of [13,15,21,28,30,37,48]) {
  const count = ({21:5,37:7,48:4})[id] || 2;
  const engine = prepareGame(id, count, 10);
  assert.equal(engine.view(0).turn, 0);
  if ([21,28,30,37].includes(id)) assert.equal(engine.view(1).board, undefined);
  if (id === 13 || id === 15 || id === 48) {
    for (let i=0;i<(id===48?8:7);i++) move(engine, /.*/);
    assert.equal(engine.view(0).ended, false);
    if (id === 48) assert.match(engine.view(0).message, /點選/);
  }
  if (id === 21) {
    for (let i=0;i<5;i++) move(engine, /過牌/);
    for (let i=0;i<5;i++) move(engine, /過牌/);
    for (let i=0;i<5;i++) move(engine, /略過狙擊/);
    assert.match(engine.view(1).board, /獲派/);
  }
  if (id === 28) {
    move(engine, /.*/);
    assert.equal(engine.view(0).board, undefined);
    assert.match(engine.view(1).board, /暗牌/);
    move(engine, /押大/);
    assert.match(engine.view(0).board, /結算/);
  }
  if (id === 30) {
    for (let i=0;i<2;i++) {
      for (let j=0;j<8;j++) move(engine, /加入/);
      move(engine, /鎖定牌序/);
    }
    move(engine, /確認投標/, [1]);
    move(engine, /確認投標/, [0]);
    move(engine, /行動/);
    move(engine, /真相/);
    move(engine, /提交真相/, [1,2,3,4,5,6,7,8]);
    assert.equal(engine.view(1).ended, true);
  }
  if (id === 37) {
    for (let round=0;round<14;round++) {
      for (let player=0;player<count;player++) {
        move(engine, /^<span class="table-stone"/);
        move(engine, /^<span class="table-chip"/);
        move(engine, /鎖定重量同籌碼/);
      }
      move(engine, /開始放石/);
      for (let player=0;player<count;player++) move(engine, /heavy-pan-title/);
      if (round<13) move(engine, /下一輪/);
    }
    assert.equal(engine.view(0).ended, true);
  }
  console.log('PASS engine',id);
}

function answer(game,seed,question=1) {
  const random = seededRandom(seed);
  const range = n => Array.from({length:n},(_,i)=>i);
  if (game===36) return [0,1];
  if (game===40) {
    const shuffle16=()=>{
      const positions=range(16);
      for(let i=15;i>0;i--){
        const j=Math.floor(random()*(i+1));
        [positions[i],positions[j]]=[positions[j],positions[i]];
      }
      return positions;
    };
    shuffle16();
    return shuffle16().slice(0,4);
  }
  if (game===47) {
    const axis=(question-1)%3, clues=new Map(), pairs=[];
    for(let y=0;y<6;y++)for(let x=0;x<6;x++){
      const index=y*6+x;
      const mirror=[y*6+5-x,(5-y)*6+x,x*6+y][axis];
      if(index<=mirror)clues.set(index,1+Math.floor(random()*4));
      else pairs.push(mirror);
    }
    return pairs.map(index=>clues.get(index));
  }

  if (game===42) {
    if(question===1)return [0,13,15,22];
    const cards=range(26);
    for(let i=25;i>0;i--){const j=Math.floor(random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]]}
    return cards.slice(0,4).sort((a,b)=>a-b);
  }
  if (game===34) {
    const grid=question===1?[[1,8,6,null,7,3,1],[3,5,2,null,4,5,8],[7,4,9,21,9,2,6],[null,null,null,null,null,null,21],[null,null,null,null,9,4,7],[null,null,null,null,2,5,3],[null,null,null,null,6,8,1]]:range(5).map(()=>range(5).map(()=>1+Math.floor(random()*7)));
    const n=grid.length,target=question===1?20:grid[0][0]+grid[0][1];
    let valid=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let b=y;b<n;b++)for(let r=x;r<n;r++){
      const cells=grid.slice(y,b+1).flatMap(row=>row.slice(x,r+1));
      if(cells.every(Number.isInteger)&&cells.reduce((a,b)=>a+b,0)===target) valid++;
    }
    return valid;
  }
  if(game===33){
    const n=3+question%2,h=range(n).map(()=>Array(n).fill(0));
    for(let x=n-1;x>=0;x--)for(let y=n-1;y>=0;y--){
      h[x][y]=Math.min(6,Math.max(h[x+1]?.[y]||1,h[x][y+1]||1)+Math.floor(random()*2));
    }
    return h.flat().reduce((a,b)=>a+b,0);
  }
  if(game===44){
    const top=range(10).map(()=>Math.floor(random()*4));
    const bottom=range(10).map(()=>6+Math.floor(random()*4));
    const inside=(x,y)=>x>=0&&x<10&&y>=top[x]&&y<=bottom[x];
    const chosen=[];
    let index=0;
    for(let y=0;y<=10;y++)for(let x=0;x<=10;x++){
      if(x<10){if(inside(x,y)!==inside(x,y-1))chosen.push(index);index++}
      if(y<10){if(inside(x,y)!==inside(x-1,y))chosen.push(index);index++}
    }
    return chosen;
  }
  const starts=[0,4,12,20,24];
  for(let i=4;i>0;i--){const j=Math.floor(random()*(i+1));[starts[i],starts[j]]=[starts[j],starts[i]]}
  const adj=range(25).map(i=>range(25).filter(j=>Math.abs(i%5-j%5)*Math.abs(Math.floor(i/5)-Math.floor(j/5))===2));
  function solve(path){
    if(path.length===25)return path;
    const free=i=>adj[i].filter(j=>!path.includes(j));
    for(const step of free(path.at(-1)).sort((a,b)=>free(a).length-free(b).length)){
      const result=solve([...path,step]);
      if(result)return result;
    }
  }
  return solve([starts[0]]);
}

for(const [id,config] of Object.entries(roomGames)){
  if(!config.race)continue;
  const game=Number(id);
  assert.equal(verifyRace(game,242,[]),null);
  assert.notEqual(verifyRace(game,242,answer(game,242)),null,game+' proof');
  assert.notEqual(verifyRace(game,999,answer(game,999,2),2),null,game+' second proof');
  if(game===40||game===47){
    const third=answer(game,781,3);
    assert.equal(verifyRace(game,781,third,3),0);
    third[0]=-1;
    assert.equal(verifyRace(game,781,third,3),null);
  }
  console.log('PASS race validation twice',game);
}

if (process.argv[2]) {
  const base = process.argv[2];
  await Promise.all(Object.entries(roomGames).map(async ([id, config]) => {
    const game = Number(id), capacity = config.max || config.size;
    const code = randomBytes(4).toString('hex').toUpperCase().replaceAll('0', 'G').replaceAll('1', 'H');
    const tokens = Array.from({length:capacity}, () => randomBytes(24).toString('hex'));
    async function send(action, seat, body = {}, expected = 200) {
      const response = await fetch(base + '/api/rooms/' + code + '/' + action, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token:tokens[seat], ...body}), signal:AbortSignal.timeout(15000)
      });
      const result = await response.text();
      assert.equal(response.status, expected, game+' '+action+' '+result.slice(0,200));
      assert(tokens.every(token=>!result.includes(token)));
      return JSON.parse(result);
    }
    await send('create',0,{game,capacity});
    for(let seat=1;seat<capacity;seat++) await send('join',seat,{game});
    const joined = await send('state',0);
    assert.equal(joined.names.length,capacity);
    const started = await send('start',0,{version:joined.version});
    const guest = await send('state',1);
    if (config.race) {
      assert.equal(started.seed,guest.seed);
      await new Promise(resolve=>setTimeout(resolve, Math.max(3000, started.started-Date.now()+600)));
      await send('finish',0,{version:started.version,proof:[]},422);
      const proof=answer(game,started.seed);
      await send('finish',0,{version:started.version,proof});
      const current=await send('state',1);
      await send('finish',1,{version:current.version,proof:game===36?[2,3]:proof});
      const finished=await send('state',0);
      assert(finished.results[0].elapsed>=0);
      await send('next',1,{version:finished.version},409);
      const next=await send('next',0,{version:finished.version});
      assert.equal(next.question,2);
      assert.notEqual(next.seed,started.seed);
      assert.deepEqual(next.results,{});
      assert.deepEqual(next.names,finished.names);
      assert.equal((await send('state',1)).question,2);
      await new Promise(resolve=>setTimeout(resolve, Math.max(3000, next.started-Date.now()+600)));
      await send('finish',0,{version:next.version,question:1,proof},409);
      const second=await send('finish',0,{version:next.version,question:2,proof:answer(game,next.seed,2)});
      assert(second.results[0].elapsed>=0);
    } else {
      assert.equal(started.screen.turn,0);
      if ([21,28,30,37].includes(game)) assert.equal(guest.screen.board, undefined);
      const step = controls(started.screen,'button','data-step').find(b=>!b.disabled);
      const fields = controls(started.screen,'select','data-field');
      const input = {kind:'click',index:step.index,values:fields.map(()=>0),version:started.version};
      await send('act',1,input,422);
      await send('act',0,input);
      assert.equal((await send('join',0,{game})).version,started.version+1);
    }
    console.log('PASS online',game);
  }));
}
