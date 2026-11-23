const boards = [[1,6,3,2,4,5,6,2,5,2,1,3,4,5,3,5,1,1,3,5],[2,3,2,6,5,4,1,4,3,7,4,4,2,1,1,5,6,2,2,7],[4,3,3,1,2,1,4,5,2,3,5,1,3,5,2,2,2,3,3,6],[6,1,2,3,5,6,2,3,4,3,1,5,3,2,3,4,6,4,3,9],[3,1,2,6,3,7,2,4,2,2,3,6,7,3,4,1,5,6,1,8],[2,3,5,4,4,5,1,2,8,3,5,4,4,5,7,2,8,1,1,12],[6,5,2,4,3,4,2,2,5,5,3,6,7,5,1,4,1,1,2,10],[6,7,5,5,1,10,10,4,4,6,8,6,10,9,1,1,4,2,10,18],[4,7,1,4,3,3,5,6,3,2,5,2,2,6,1,1,1,2,5,11],[5,6,5,7,8,1,6,4,4,2,3,3,4,6,6,7,4,1,8,15]];
const words = [
  'INDIA JAPAN BRAZIL QATAR CANADA SPAIN FINLAND',
  'CHERRY DURIAN GRAPE AVOCADO PEAR KIWI COCONUT',
  'WOLF ZEBRA GIRAFFE PENGUIN FOX BUTTERFLY PIG'
];
const extras = [
  'USA UK UAE IRAN LAOS PERU CHINA KOREA RUSSIA VIETNAM TURKEY TAIWAN BRITAIN',
  'APPLE APRICOT BANANA BERRY DATE FIG GRAPEFRUIT GUAVA LEMON LIME LYCHEE MANGO MELON ORANGE PAPAYA PEACH PLUM PRUNE RAISIN NECTARINE PINEAPPLE JACKFRUIT OLIVE POMELO QUINCE TANGERINE WATERMELON PLANTAIN CURRANT CITRON YUZU ACAI CRANBERRY RASPBERRY BLUEBERRY STRAWBERRY',
  'APE ANT BAT BEE BEAR BOAR BUG BULL CAT COW CUB DOG DOE EEL ELK EMU EWE FLY GNU HEN HOG JAY KID OWL OX RAM RAT RAY YAK BISON BUNNY BURRO CALF CARP CROW CRAB DEER DOVE DUCK FAWN FLEA FROG GOAT GULL HARE IBEX KITE KIWI LAMB LARK LION LYNX MINK MOLE MOTH MULE NEWT PERCH PIKE PONY PUMA SEAL SLUG SOLE STAG SWAN TOAD TUNA VOLE WASP WREN WORM ANTILOPE ANTELOPE BADGER BEAGLE BEETLE BILBY BREAM CAMEL CANARY COBRA COUGAR CRANE EAGLE EGRET FERRET FINCH GECKO GIBBON GOPHER GOOSE HERON HORSE HYENA JAGUAR KOALA LEMUR LEOPARD LIZARD LLAMA MAGPIE MONKEY MOUSE OTTER PANDA PARROT PUFFIN PYTHON RABBIT RAVEN ROBIN SHARK SHEEP SHREW SKUNK SLOTH SNAIL SNAKE SPIDER SQUID STORK TAPIR TIGER TROUT TURKEY TURTLE VIPER WEASEL WHALE'
];
const dict = words.map((w,i)=>new Set((w+' '+extras[i]).split(' ')));
const regions = new Intl.DisplayNames(['en'],{type:'region',fallback:'none'});
for(const a of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')for(const b of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
  const name=regions.of(a+b);if(name)dict[0].add(name.toUpperCase().replace(/[^A-Z]/g,''));
}
export const themes=['國家','水果','動物'];
const alphabet='ABCDEFGHIJKLMNOPQRS';
const cells=[];
for(let r=-2;r<=2;r++)for(let q=Math.max(-2,-r-2);q<=Math.min(2,2-r);q++)cells.push([q,r]);
export const lines=[];
for(const [q,r] of cells)for(const [x,y] of [[1,0],[0,1],[-1,1]]){
  const line=[0,1,2].map(i=>cells.findIndex(([a,b])=>a===q+i*x&&b===r+i*y));
  if(line.every(i=>i>=0))lines.push(line);
}
function startRound(s,now){
  s.note='';s.round++;
  if(s.game===6){
    s.phase='build';s.end=now+600000;s.towers=Array(7).fill('');
    s.bank=[...words[s.round-1].replaceAll(' ','')].sort().join('');
  }else{
    let board=boards[s.round-1];
    if(!board){
      const nums=Array.from({length:19},()=>1+Math.floor(Math.random()*9));
      board=[...nums,lines[Math.floor(Math.random()*lines.length)].reduce((v,i)=>v+nums[i],0)];
    }
    s.board=board.slice(0,19);s.target=board[19];s.found=[];s.owner=null;
    s.phase='study';s.end=now+30000;
  }
}
export function create(game,now=Date.now()){
  const s={game,round:0,score:[0,0]};startRound(s,now);return s;
}
function finishRound(s){
  s.phase=s.round>=10&&s.score[0]!==s.score[1]?'done':'between';
  if(s.phase==='done')s.note='玩家 '+(s.score[0]>s.score[1]?1:2)+' 勝出';
}
export function advance(s,now){
  if(now<s.end)return false;
  if(s.phase==='build'){
    s.phase='done';s.note='時間到，今輪未完成。';return true;
  }
  if(s.phase==='study'){s.phase='buzz';s.end+=90000;advance(s,now);return true}
  if(s.phase==='answer'){s.score[s.owner]--;s.note='逾時，扣 1 分';s.owner=null;s.phase='buzz';s.end=s.idle;advance(s,now);return true}
  if(s.phase==='buzz'){finishRound(s);return true}
  return false;
}
export function act(s,seat,input,now=Date.now()){
  advance(s,now);
  if(input.kind==='next'&&seat===0&&s.phase==='between'){startRound(s,now);return true}
  if(s.phase==='build'&&Number.isInteger(seat)&&seat>=0&&seat<7){
    const ch=input.ch,w=s.towers[seat];
    if(input.kind==='take'&&typeof ch==='string'&&/^[A-Z]$/.test(ch)&&s.bank.includes(ch)){
      s.bank=s.bank.replace(ch,'');s.towers[seat]+=ch;
    }else if(input.kind==='return'&&Number.isInteger(input.index)&&input.index>=0&&input.index<w.length){
      s.bank=[...s.bank,w[input.index]].sort().join('');s.towers[seat]=w.slice(0,input.index)+w.slice(input.index+1);
    }else return false;
    if(!s.bank&&s.towers.every(w=>dict[s.round-1].has(w))){
      s.phase=s.round===3?'done':'between';s.note=s.round===3?'挑戰完成，三輪全部成功！':'七座塔完成！';
    }
    return true;
  }
  if(input.kind==='buzz'&&s.phase==='buzz'&&[0,1].includes(seat)){
    s.phase='answer';s.owner=seat;s.end=now+10000;s.idle=now+90000;s.note='';return true;
  }
  if(input.kind==='answer'&&s.phase==='answer'&&seat===s.owner){
    const key=String(input.value).toUpperCase();
    const line=lines.find(l=>{const v=l.map(i=>alphabet[i]).join('');return key===v||key===[...v].reverse().join('')});
    const valid=lines.filter(l=>l.reduce((sum,i)=>sum+s.board[i],0)===s.target);
    const ok=valid.includes(line)&&!s.found.includes(line.join(','));
    if(ok)s.found.push(line.join(','));
    s.score[seat]+=ok?1:-1;s.note='玩家 '+(seat+1)+(ok?' 答啱，得 1 分':' 答錯，扣 1 分');
    s.phase='buzz';s.owner=null;s.end=s.idle;
    if(s.found.length===valid.length)finishRound(s);
    return true;
  }
  return false;
}
export function visible(s){
  const {found,idle,board,target,...rest}=s;
  return {...rest,...(s.phase==='study'?{board}:{}),...(['buzz','answer'].includes(s.phase)?{target}:{})};
}
