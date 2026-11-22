export const points = Array.from({length: 25}, (_, index) => index);
const row = point => Math.floor(point / 5);
const column = point => point % 5;
export const edges = points.flatMap(point => {
  const links = [];
  if (column(point) < 4) links.push(point + 1);
  if (row(point) < 4) {
    links.push(point + 5);
    if (point % 2 === 0 && column(point) > 0) links.push(point + 4);
    if (point % 2 === 0 && column(point) < 4) links.push(point + 6);
  }
  return links.map(neighbor => [point, neighbor]);
});
const neighbors = points.map(point => edges.flatMap(([a, b]) => a === point ? [b] : b === point ? [a] : []));
export const sheep = '羊', tiger = '虎';

export function newGame() {
  return {
    board: points.map(point => [0, 4, 20, 24].includes(point) ? tiger : ''),
    turn: sheep, reserve: 20, caught: 0, quiet: 0, outcome: ''
  };
}

export function movesFrom(board, from) {
  return neighbors[from].flatMap(to => {
    if (!board[to]) return [{to, take: -1}];
    if (board[from] !== tiger || board[to] !== sheep) return [];
    const landingRow = 2 * row(to) - row(from);
    const landingColumn = 2 * column(to) - column(from);
    if (landingRow < 0 || landingRow > 4 || landingColumn < 0 || landingColumn > 4) return [];
    const landing = 5 * landingRow + landingColumn;
    return !board[landing] && neighbors[to].includes(landing) ? [{to: landing, take: to}] : [];
  });
}

export function playMove(state, side, from, to) {
  if (state.outcome || side !== state.turn || !points.includes(to) || state.board[to]) return null;
  const placing = side === sheep && state.reserve > 0;
  const move = placing ? (from === null ? {take: -1} : null) :
    points.includes(from) && state.board[from] === side && movesFrom(state.board, from).find(move => move.to === to);
  if (!move) return null;

  const next = {...state, board: [...state.board], turn: side === sheep ? tiger : sheep};
  next.board[to] = side;
  if (placing) next.reserve--;
  else next.board[from] = '';
  if (move.take >= 0) {
    next.board[move.take] = '';
    next.caught++;
  }
  next.quiet = placing || move.take >= 0 ? 0 : state.quiet + 1;
  const canMove = () => next.board.some((piece, point) => piece === next.turn && movesFrom(next.board, point).length);
  if (next.caught >= 5) next.outcome = '虎方捕獲五隻羊，勝出';
  else if (next.turn === tiger && !canMove()) next.outcome = '羊方困住所有虎，勝出';
  else if (next.turn === sheep && !next.reserve && !canMove()) next.outcome = '羊方無棋可移動，和局';
  else if (next.quiet >= 100) next.outcome = '連續 100 步無捕獲，和局';
  return next;
}
