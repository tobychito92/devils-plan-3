import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {points, movesFrom, sheep, tiger} from './rules.mjs';

const base = process.argv[2] || 'http://127.0.0.1:8787';
const code = randomBytes(4).toString('hex').toUpperCase().replaceAll('0', 'G').replaceAll('1', 'H');
const tokens = [0, 1, 2].map(() => randomBytes(24).toString('hex'));
async function call(action, token, data, expected = 200) {
  const response = await fetch(base + '/api/rooms/' + code + '/' + action, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({token, ...data}),
    signal: AbortSignal.timeout(12000)
  });
  const text = await response.text();
  assert.equal(response.status, expected, action + ' ' + text.slice(0, 300));
  const result = JSON.parse(text);
  assert(tokens.every(token => !text.includes(token)));
  return result;
}
const homepage = await fetch(base);
assert.equal(homepage.status, 200);
assert.match(await homepage.text(), /multiplayer\/client\.mjs/);
const script = await fetch(base + '/multiplayer/client.mjs');
assert.match(script.headers.get('Content-Type') || '', /javascript/);
const created = await call('create', tokens[0], {name: '羊玩家'});
assert.equal(created.seat, 0);
assert.equal(created.state.reserve, 20);
await call('move', tokens[0], {version: 0, from: null, to: 1}, 409);
const guest = await call('join', tokens[1], {name: '虎玩家'});
assert.equal(guest.seat, 1);
assert.deepEqual(guest.names, ['羊玩家', '虎玩家']);
await call('join', tokens[2], {}, 409);
await call('state', tokens[2], {}, 403);
await call('move', tokens[1], {version: guest.version, from: 0, to: 1}, 422);
let current = await call('state', tokens[0]);
for (let capture = 1; capture <= 5; capture++) {
  const {board} = current.state;
  const placement = points.find(point => {
    if (board[point]) return false;
    const testBoard = [...board];
    testBoard[point] = sheep;
    return points.some(from => board[from] === tiger && movesFrom(testBoard, from).some(move => move.take === point));
  });
  assert.notEqual(placement, undefined);
  const move = {version: current.version, from: null, to: placement};
  current = await call('move', tokens[0], move);
  await call('move', tokens[0], move, 409);
  const restored = await call('join', tokens[1], {name: '忽略新名'});
  assert.deepEqual(restored.state, current.state);
  assert.equal(restored.names[1], '虎玩家');
  const from = points.find(point => restored.state.board[point] === tiger &&
    movesFrom(restored.state.board, point).some(move => move.take === placement));
  const to = movesFrom(restored.state.board, from).find(move => move.take === placement).to;
  await call('move', tokens[1], {version: restored.version, from, to});
  current = await call('state', tokens[0]);
  assert.equal(current.state.board[placement], '');
  assert.equal(current.state.caught, capture);
}
assert.match(current.state.outcome, /虎方.*勝出/);
await call('move', tokens[0], {version: current.version, from: null, to: 2}, 422);
console.log('PASS create, join, seat auth, turns, stale writes, reconnect, five captures and final result — ' + base);
