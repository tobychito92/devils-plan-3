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
    const race = Boolean(roomGames[game].race);
    return {
      game, capacity, started, race, seat, names: room.seats.map(player => player.name), version: room.version,
      ...(started && race ? {seed, results, question: room.session.question || 1} : {}),
      ...(game===40 ? {points: room.session.points || {}} : {}),
      ...(started && !race ? {screen: this.engine(room).view(seat)} : {})
    };
  }

  apply(room, seat, action, body) {
    const session = room.session;
    if (action === 'start') {
      if (seat !== 0 || room.seats.length !== session.capacity || session.started) return 'waiting';
      session.started = Date.now() + (roomGames[session.game].race ? 4000 : 0);
      return '';
    }
    if (!session.started || Date.now() < session.started) return 'waiting';
    if (action === 'next' && roomGames[session.game].race) {
      if (seat !== 0 || !Object.hasOwn(session.results, seat)) return 'waiting';
      session.question = (session.question || 1) + 1;
      const previous = session.seed;
      do { session.seed = crypto.getRandomValues(new Uint32Array(1))[0]; } while (session.seed === previous);
      session.results = {};
      if(session.game===40&&(session.question-1)%3===0)session.points={};
      session.started = Date.now() + 4000;
      return '';
    }
    if (action === 'finish' && roomGames[session.game].race) {
      const question = session.question || 1;
      if ((body.question ?? 1) !== question) return 'stale';
      if (Object.hasOwn(session.results, seat)) return 'unchanged';
      const score = verifyRace(session.game, session.seed, body.proof, question);
      if (score === null) return 'move';
      session.results[seat] = {elapsed: Date.now() - session.started, score};
      if(session.game===40){
        session.points||={};
        session.points[seat]=(session.points[seat]||0)+score;
      }
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
