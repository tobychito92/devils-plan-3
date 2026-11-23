import {create,advance,act,visible,themes} from './finals-rules.mjs?v=rules1';
const $=id=>document.getElementById(id);
const url=new URL(location.href),game=Number(url.searchParams.get('game'))===14?14:6;
const capacity=game===6?7:2, alphabet='ABCDEFGHIJKLMNOPQRS';
const server=location.hostname.endsWith('.github.io')?'https://devils-plan-3.difficult-telephone.workers.dev':'';
const box=$('box');
let polling=false,local,snap,code,token,mat=0,picks='',busy=false,lastPoll=0,viewKey='';
$('title').textContent=document.title=game===6?'06 · 單字塔':'14 · 六角形';
$('cover').src='./art/game-'+game+'.webp';
window.showGameRules(game);
function el(parent,tag,label='',cls=''){const n=document.createElement(tag);n.className=cls;n.textContent=label;parent.append(n);return n}
function btn(parent,label,fn,cls=''){const b=el(parent,'button',label,cls);b.onclick=fn;return b}
function makeCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...crypto.getRandomValues(new Uint8Array(8))].map(n=>chars[n%32]).join('')}
function lobby(){
 box.replaceChildren();
 const bar=el(box,'div','','actions');btn(bar,'同機開始',()=>{local=create(game);render()});
 btn(bar,'開連線房',()=>enter('create',makeCode()));const join=el(box,'div','','actions');
 const field=el(join,'input','','entry');field.placeholder='8 位房號';field.maxLength=8;field.value=url.searchParams.get('room')||'';field.setAttribute('aria-label','房號');
 btn(join,'加入房間',()=>enter('join',field.value.trim().toUpperCase()));
}
async function request(action,data={}){
 const res=await fetch(server+'/api/rooms/'+code+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,game,capacity,version:snap?.version,...data}),signal:AbortSignal.timeout(8000)});
 const body=await res.json();
 if(!res.ok)throw Error(({stale:'有玩家啱啱操作咗，請再撳一次。',full:'房間已滿。',missing:'搵唔到房間。',game:'房間同遊戲唔相符。',move:'呢個操作已經過時。'})[body.error]||'連線失敗，請再試。');
 if(!body.unchanged&&(!snap||body.version>=snap.version))snap=body;
}
async function enter(action,c){
 if(busy)return;if(!/^[A-HJ-NP-Z2-9]{8}$/.test(c)){$('error').textContent='請輸入 8 位房號。';return}
 busy=true;code=c;
 try{token=sessionStorage.getItem('final-'+c)||[...crypto.getRandomValues(new Uint8Array(24))].map(n=>n.toString(16).padStart(2,'0')).join('');sessionStorage.setItem('final-'+c,token);await request(action);url.searchParams.set('room',c);history.replaceState(null,'',url);$('error').textContent='';render()}catch(e){$('error').textContent=e.message}finally{busy=false}
}
async function move(seat,data,action='act'){
 if(busy)return;
 if(local){act(local,seat,data);render();return}
 busy=true;try{await request(action,data);$('error').textContent='';render()}catch(e){$('error').textContent=e.message}finally{busy=false}
}
function render(){
 const s=local?visible(local):snap?.table;
 const key=JSON.stringify([s,snap?.version,mat,picks]);if(viewKey===key)return;viewKey=key;
 box.replaceChildren();$('cover').hidden=!!s;
 if(!s){if(!snap){lobby();return}
 el(box,'h2','房號 '+code);el(box,'p','你係玩家 '+(snap.seat+1)+' · 已入房 '+snap.names.length+' / '+capacity);
 const share=new URL(location.href);btn(box,'複製邀請連結',async()=>{try{await navigator.clipboard.writeText(share.href);$('error').textContent='已複製邀請連結。'}catch{$('error').textContent=share.href}});
 if(snap.seat===0){btn(box,'開始遊戲',()=>move(0,{},'start')).disabled=snap.names.length!==capacity}return}
 el(box,'h2',(s.round>10?'延長賽 ':'第 '+s.round+' 輪')+(game===6?' · '+themes[s.round-1]:' · '+s.score.join(' 比 ')));
 const clock=el(box,'strong','','time');clock.id='clock';updateClock(s);
 if(s.note)el(box,'p',s.note);
 if(s.phase==='done'){btn(box,'返回遊戲入口',()=>{url.searchParams.delete('room');location.href=url.href});return}
 if(s.phase==='between'){if(local||snap.seat===0)btn(box,'開始下一輪',()=>move(0,{kind:'next'}));else el(box,'p','等待房主開始下一輪');return}
 if(game===6){
 const seat=local?mat:snap.seat;
 el(box,'p',local?'點玩家揀字塔，再點公用字粒砌字。點塔上字粒可以放返去。':'你係玩家 '+(seat+1)+'。點公用字粒加到自己座塔；點自己塔上字粒可以放返去。');
 const mats=el(box,'div','','towers');s.towers.forEach((w,i)=>{const m=el(mats,'div','','mat'+(seat===i?' on':''));btn(m,'玩家 '+(i+1),()=>{if(local){mat=i;render()}},'who');
 for(const [index,ch] of [...w].entries()){const b=btn(m,ch,()=>move(i,{kind:'return',index}),'cube');b.disabled=i!==seat}});
 el(box,'h2','公用字粒 · '+s.bank.length);const bank=el(box,'div','','bank');for(const ch of s.bank)btn(bank,ch,()=>move(seat,{kind:'take',ch}),'cube');return}
 const answering=s.phase==='answer'&&(local||snap.seat===s.owner);
 el(box,'p',s.phase==='study'?'記住每格數字':('目標數字 '+s.target+(s.phase==='answer'?' · 玩家 '+(s.owner+1)+' 作答':'')));
 let i=0;for(const n of [3,4,5,4,3]){const row=el(box,'div','','row');for(let k=0;k<n;k++,i++){
 const ch=alphabet[i];btn(row,s.board?.[i]??ch,()=>{if(answering&&picks.length<3){picks+=ch;render()}},'hex'+(picks.includes(ch)?' sel':''))}}
 const bar=el(box,'div','','actions');
 if(s.phase==='buzz'){for(const seat of (local?[0,1]:[snap.seat]))btn(bar,'玩家 '+(seat+1)+' 搶答',()=>{picks='';move(seat,{kind:'buzz'})},'buzz')}
 if(answering){el(bar,'strong',picks.padEnd(3,'＿'));btn(bar,'重選',()=>{picks='';render()});btn(bar,'提交',()=>{const value=picks;picks='';move(s.owner,{kind:'answer',value})}).disabled=picks.length!==3}
}
function updateClock(s){const clock=$('clock');if(clock)clock.textContent=['build','study','buzz','answer'].includes(s.phase)?'剩餘 '+Math.max(0,Math.ceil((s.end-Date.now())/1000))+' 秒':''}
lobby();
if(url.searchParams.has('room'))enter('join',url.searchParams.get('room'));
setInterval(async()=>{
 if(local){if(advance(local,Date.now())){picks='';render()}updateClock(local);return}
 if(!snap)return;if(snap.table)updateClock(snap.table);
 if(busy||polling||Date.now()-lastPoll<650)return;polling=true;lastPoll=Date.now();
 try{const phase=snap.table?.phase;await request('state');if(phase!==snap.table?.phase)picks='';render()}catch(e){$('error').textContent=e.message}finally{polling=false}
},180);
