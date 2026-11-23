import * as finals from './finals-rules.mjs';
import {studyMs} from './exile-puzzles.mjs';
import {roomGames} from './catalog.mjs';
import {prepareGame, verifyRace} from './headless.mjs';

const hasGame = id => Number.isInteger(id) && Object.hasOwn(roomGames, id);
const maxActions = 2400;

export function newSession(body) {
  const {game, capacity} = body;
  if (!hasGame(game) || !Number.isInteger(capacity)) return null;
  const config = roomGames[game];
  if (capacity < (config.min || config.size) || capacity > (config.max || config.size)) return null;
  return {game, capacity, seed: crypto.getRandomValues(new Uint32Array(1))[0], started: 0, question: 1, results: {}, actions: []};
}

function settleExile(s){
  const all=Array.from({length:s.capacity},(_,i)=>i);
  if(s.game===47){
    const pending=all.filter(i=>!Object.hasOwn(s.results,i));
    if(pending.length===1)s.outcome={survived:all.filter(i=>i!==pending[0]),out:pending};
    return;
  }
  const active=s.active||all;
  if(!active.every(i=>Object.hasOwn(s.results,i)))return;
  const phase=s.phase||1;
  if(phase<3)return;
  const scores=phase===3?s.points:Object.fromEntries(active.map(i=>[i,s.results[i].score]));
  const ranked=active.slice().sort((a,b)=>scores[b]-scores[a]);
  const saved=s.saved||[], slots=Math.ceil(s.capacity/2)-saved.length, cutoff=scores[ranked[slots-1]];
  const above=ranked.filter(i=>scores[i]>cutoff), tied=ranked.filter(i=>scores[i]===cutoff);
  if(above.length+tied.length>slots){
    s.saved=[...saved,...above];s.tied=tied;
  }else{
    const survived=[...saved,...above,...tied];
    s.outcome={survived,out:all.filter(i=>!survived.includes(i))};
  }
}
export class Session {
  cached;

  engine(room) {
    const {game, seed, capacity, actions} = room.session;
    if (this.cached?.seed === seed && this.cached.count === actions.length) return this.cached.engine;
    const engine = prepareGame(game, capacity, seed);
    for (const [seat, input] of actions) {
      if (!engine.act(seat, input)) throw new Error('Cannot restore game action');
    }
    this.cached = {seed, count: actions.length, engine};
    return engine;
  }

  view(room, seat) {
    const {game, capacity, started, seed, results} = room.session;
    if ([6,14].includes(game)) return {game,capacity,started,seat,names:room.seats.map(p=>p.name),version:room.version,table:started?finals.visible(room.session.table):null};
    const race = Boolean(roomGames[game].race);
    return {
      game, capacity, started, race, seat, names: room.seats.map(player => player.name), version: room.version,
      ...(started && race ? {seed, results, question: room.session.question || 1} : {}),
      ...(game===40 ? {points: room.session.points || {},phase:room.session.phase||1,active:room.session.active,tied:room.session.tied} : {}),
      ...([40,47].includes(game)?{outcome:room.session.outcome}:{}),
      ...(started && !race ? {screen: this.engine(room).view(seat)} : {})
    };
  }

  apply(room, seat, action, body) {
    const session = room.session;
    if (action === 'start') {
      if (seat !== 0 || room.seats.length !== session.capacity || session.started) return 'waiting';
      if ([6,14].includes(session.game)) session.table=finals.create(session.game);
      session.started = Date.now() + (roomGames[session.game].race ? 4000 : 0);
      return '';
    }
    if (!session.started || Date.now() < session.started) return 'waiting';
    if ([6,14].includes(session.game)) return action==='act'&&finals.act(session.table,seat,body)?'':'move';
    if (action === 'next' && roomGames[session.game].race) {
      if(seat!==0)return 'waiting';
      if(session.game===40){
        const active=session.active||Array.from({length:session.capacity},(_,i)=>i);
        if(!active.every(i=>Object.hasOwn(session.results,i)))return 'waiting';
        if(session.outcome){session.phase=1;session.points={};delete session.active;delete session.saved}
        else {session.phase=(session.phase||1)+1;if(session.tied)session.active=session.tied}
        delete session.tied;delete session.outcome;
      }else if(session.game===47){
        if(!session.outcome)return 'waiting';
        delete session.outcome;
      }else if(!Object.hasOwn(session.results,seat))return 'waiting';
      session.question = (session.question || 1) + 1;
      const previous = session.seed;
      do { session.seed = crypto.getRandomValues(new Uint32Array(1))[0]; } while (session.seed === previous);
      session.results = {};
      session.started = Date.now() + 4000;
      return '';
    }
    if (action === 'finish' && roomGames[session.game].race) {
      const question = session.question || 1;
      if ((body.question ?? 1) !== question) return 'stale';
      if (Object.hasOwn(session.results, seat)) return 'unchanged';
      if(session.outcome||session.active&&!session.active.includes(seat))return 'waiting';
      if(session.game===40&&Date.now()<session.started+studyMs)return 'waiting';
      const score = verifyRace(session.game, session.seed, body.proof, question);
      if (score === null) return 'move';
      session.results[seat] = {elapsed: Date.now() - session.started, score};
      if(session.game===40&&(session.phase||1)<=3){
        session.points||={};
        session.points[seat]=(session.points[seat]||0)+score;
      }
      if([40,47].includes(session.game))settleExile(session);
      return '';
    }
    if (action !== 'act' || roomGames[session.game].race) return 'move';
    if (session.actions.length >= maxActions) return 'limit';
    const engine = this.engine(room);
    const {kind, index, values} = body;
    const input = {kind, index, values};
    if (!engine.act(seat, input)) return 'move';
    session.actions.push([seat, input]);
    this.cached.count++;
    return '';
  }
}
