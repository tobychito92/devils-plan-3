import {edges, points, movesFrom, sheep, tiger} from './rules.mjs';

const board = document.getElementById('board');
const controls = document.getElementById('controls');
const notice = document.getElementById('msg');
const codePattern = /^[A-HJ-NP-Z2-9]{8}$/;
const inviteCode = () => new URL(location.href).searchParams.get('tigerRoom') || '';
const configured = document.querySelector('meta[name="room-server"]').content;
const server = configured || (location.hostname.endsWith('.github.io') ? '' : location.origin);
const storage = 'devils-plan.tiger.';
const errors = {
  missing: '房間已過期或者房號有誤。',
  full: '呢間房已滿。',
  seat: '呢部機冇呢間房嘅座位。',
  waiting: '等朋友入房先可以落子。',
  stale: '棋盤已更新，請再揀一步。',
  move: '呢一步行唔到。'
};
const button = (parent, label, action) => window.challengeButton(parent, label, action);
const line = (text, parent = board) => {
  const element = document.createElement('p');
  element.textContent = text;
  parent.append(element);
  return element;
};
const random = length => crypto.getRandomValues(new Uint8Array(length));
const newToken = () => Array.from(random(24), byte => byte.toString(16).padStart(2, '0')).join('');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(random(8), byte => alphabet[byte & 31]).join('');

let active;
function stop() {
  active?.abort();
  active = undefined;
}
window.addEventListener('tiger-view-exit', stop);
window.ridgeOnline = function open() {
  stop();
  active = new AbortController();
  const {signal} = active;
  let code, token, snapshot, selected = -1, waiting = false, connected = true, timeout;
  signal.addEventListener('abort', () => clearTimeout(timeout));

  async function send(action, data = {}) {
    const response = await fetch(server + '/api/rooms/' + code + '/' + action, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token, ...data}),
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)])
    });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error), {code: body.error});
    return body;
  }

  function reset() {
    board.replaceChildren();
    controls.replaceChildren();
    notice.textContent = '';
  }

  function input(name, max, placeholder, value = '') {
    const label = document.createElement('label');
    label.textContent = name + ' ';
    const field = document.createElement('input');
    field.type = 'text';
    field.maxLength = max;
    field.placeholder = placeholder;
    field.value = value;
    field.autocomplete = 'off';
    field.spellcheck = false;
    label.append(field);
    return {label, field};
  }

  function showLobby(message = '') {
    clearTimeout(timeout);
    snapshot = undefined;
    reset();
    line('虎羊棋 · 雙人連線');
    button(controls, '返本機雙人', () => window.next());
    if (!server) {
      line('連線伺服器設定中。');
      return;
    }
    const invited = inviteCode();
    const name = input('暱稱', 20, '選填');
    const room = input('房號', 8, '8 位英數字', codePattern.test(invited) ? invited : '');
    const actions = document.createElement('div');
    actions.className = 'bar';
    actions.append(name.label, room.label);
    board.append(actions);
    const create = button(actions, '開新房', () => enter('create', newCode(), name.field.value));
    const join = button(actions, '加入／返回房間', () => enter('join', room.field.value.trim().toUpperCase(), name.field.value));
    notice.textContent = message;
    return enter;

    async function enter(action, requestedCode, nickname) {
      if (waiting) return;
      if (!codePattern.test(requestedCode)) {
        notice.textContent = '請輸入 8 位房號。';
        return;
      }
      code = requestedCode;
      try { token = sessionToken(code); } catch {
        notice.textContent = '瀏覽器未能儲存座位，請容許網站儲存後再試。';
        return;
      }
      create.disabled = join.disabled = waiting = true;
      notice.textContent = '連線中…';
      try {
        snapshot = await send(action, {name: nickname});
        if (signal.aborted) return;
        const address = new URL(location.href);
        address.searchParams.set('tigerRoom', code);
        history.replaceState(null, '', address);
        connected = true;
        waiting = false;
        render();
        schedule();
      } catch (error) {
        create.disabled = join.disabled = waiting = false;
        if (!signal.aborted) notice.textContent = errors[error.code] || '連線失敗，請再試。';
      }
    }
  }

  function sessionToken(room) {
    const key = storage + room;
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const generated = newToken();
    localStorage.setItem(key, generated);
    return generated;
  }

  function schedule() {
    clearTimeout(timeout);
    if (!signal.aborted && snapshot && !snapshot.state.outcome && !document.hidden) {
      const side = snapshot.seat === (snapshot.state.lane||0) ? sheep : tiger;
      if (connected && snapshot.names.length === 2 && snapshot.state.turn === side) return;
      timeout = setTimeout(refresh, connected ? 2000 : 5000);
    }
  }

  async function refresh() {
    if (!snapshot || waiting || signal.aborted) return;
    waiting = true;
    try {
      const latest = await send('state');
      if (signal.aborted) return;
      if (!connected || latest.version !== snapshot.version) {
        selected = -1;
        snapshot = latest;
        connected = true;
        render();
      }
    } catch (error) {
      if (signal.aborted) return;
      if (errors[error.code]) showLobby(errors[error.code]);
      else if (connected) {
        connected = false;
        render();
      }
    } finally {
      waiting = false;
      schedule();
    }
  }

  function render() {
    const {state, seat, names} = snapshot;
    const side = seat === (state.lane||0) ? sheep : tiger;
    const placing = side === sheep && state.reserve > 0;
    const myTurn = connected && names.length === 2 && !state.outcome && state.turn === side;
    const destinations = selected < 0 ? [] : movesFrom(state.board, selected);
    const enabled = point => myTurn && (placing ? !state.board[point] :
      (state.board[point] === side && movesFrom(state.board, point).length > 0) ||
      destinations.some(move => move.to === point));
    reset();
    window.pointBoard(5, points, edges, point => state.board[point], enabled, play);
    if (selected >= 0) board.querySelectorAll('button')[selected].classList.add('challengeSelected');
    const roomInfo = document.createElement('div');
    roomInfo.className = 'online-room-info';
    line('房號 ' + code + ' ｜ 你係' + side + '方', roomInfo);
    line('棋盤 '+((state.lane||0)+1)+' ｜ 羊方 ' + names[state.lane||0] + ' ｜ 虎方 ' + (names[1-(state.lane||0)] || '等候加入'), roomInfo);
    board.prepend(roomInfo);
    notice.textContent = connected ? state.outcome || (names.length < 2 ? '等朋友加入…' :
      (myTurn ? '輪到你' : '等對手') + '・' + state.turn + '方' + (state.turn === sheep && state.reserve ? '放羊' : '行棋') +
      ' ｜ 待放羊 ' + state.reserve + ' ｜ 被捕 ' + state.caught + '/5') : '連線中斷，會自動再試。';
    button(controls, '複製邀請連結', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        if (!signal.aborted) notice.textContent = '已複製邀請連結。房號 ' + code;
      } catch {
        if (!signal.aborted) notice.textContent = '可以分享瀏覽器網址。房號 ' + code;
      }
    });
    button(controls, '返回連線大堂', () => {
      if (waiting) return;
      const address = new URL(location.href);
      address.searchParams.delete('tigerRoom');
      history.replaceState(null, '', address);
      showLobby();
    });

    async function play(point) {
      if (waiting || !enabled(point)) return;
      if (!placing && state.board[point] === side) {
        selected = selected === point ? -1 : point;
        render();
        return;
      }
      waiting = true;
      notice.textContent = '同步落子中…';
      try {
        snapshot = await send('move', {from: placing ? null : selected, to: point, version: snapshot.version});
        if (signal.aborted) return;
        selected = -1;
        render();
      } catch (error) {
        if (signal.aborted) return;
        waiting = false;
        await refresh();
        if (!signal.aborted && snapshot && connected) notice.textContent = errors[error.code] || '已重新同步，請睇棋盤確認。';
      } finally {
        waiting = false;
        schedule();
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timeout);
    else refresh();
  }, {signal});
  window.addEventListener('online', refresh, {signal});
  const enter = showLobby();
  const requested = inviteCode();
  try {
    if (enter && codePattern.test(requested) && localStorage.getItem(storage + requested)) enter('join', requested, '');
  } catch { /* The form can report when browser storage is unavailable. */ }
};

if (codePattern.test(inviteCode())) window.openTigerInvite();
