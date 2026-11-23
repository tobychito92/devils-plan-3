import {roomGames, seededRandom} from './catalog.mjs?v=two-puzzles';

const board = document.getElementById('board');
const controls = document.getElementById('controls');
const notice = document.getElementById('msg');
const status = document.getElementById('room-status');
const pattern = /^[A-HJ-NP-Z2-9]{8}$/;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const configured = document.querySelector('meta[name="room-server"]').content;
const backend = configured || (location.hostname.endsWith('.github.io') ? '' : location.origin);
const messages = {
  missing: '房間已過期或者房號有誤。', full: '呢間房已滿。', seat: '呢部機冇呢間房嘅座位。',
  waiting: '座位未齊，或者比賽未開始。', stale: '房間已更新，請再試。',
  move: '呢個操作而家用唔到。', game: '房號同遊戲唔相符。', limit: '本局已達步數上限。'
};
const text = (parent, message, tag = 'p') => {
  const node = document.createElement(tag);
  node.textContent = message;
  parent.append(node);
  return node;
};
const makeButton = (parent, label, fn) => window.challengeButton(parent, label, fn);
const random = length => crypto.getRandomValues(new Uint8Array(length));
const getRoom = () => new URL(location.href).searchParams.get('room') || '';
const showError = error => messages[error.code] || '連線失敗，請再試。';
let abort;

function close() {
  abort?.abort();
  abort = undefined;
  status.replaceChildren();
  status.hidden = true;
}

window.addEventListener('tiger-view-exit', close);
window.openGameRoom = function openGameRoom(game) {
  window.dispatchEvent(new Event('tiger-view-exit'));
  window.onlineGameView(game);
  window.stopRace();
  abort = new AbortController();
  const {signal} = abort;
  const config = roomGames[game];
  const key = 'devils-plan.room.';
  let code, token, snapshot, timer, question, waiting = false, racing = false, submitted, lastError = '';

  signal.addEventListener('abort', () => clearTimeout(timer));
  status.hidden = false;

  function address(room) {
    const url = new URL(location.href);
    url.searchParams.delete('tigerRoom');
    if (room) {
      url.searchParams.set('game', game);
      url.searchParams.set('room', room);
    } else {
      url.searchParams.delete('game');
      url.searchParams.delete('room');
    }
    return url;
  }

  function reset() {
    board.className = 'panel';
    board.replaceChildren();
    controls.replaceChildren();
    notice.textContent = '';
  }

  async function send(action, data) {
    const response = await fetch(backend + '/api/rooms/' + code + '/' + action, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token, version: snapshot?.version, ...data}),
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)])
    });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error), {code: body.error});
    return body;
  }

  function lobby(message = '') {
    reset();
    status.replaceChildren();
    makeButton(controls, '返回原有玩法', () => window.next());
    const title = window.onlineGameLabel(game);
    text(board, title + (config.race ? ' · 好友競速' : ' · 網上對戰'), 'h3');
    if (!backend) {
      text(board, '連線伺服器設定中。');
      return;
    }
    notice.textContent = message;
    function input(label, length, value) {
      const wrapper = text(board, label + ' ', 'label');
      const field = document.createElement('input');
      field.maxLength = length;
      field.value = value;
      field.autocomplete = 'off';
      wrapper.append(field);
      return field;
    }
    const nickname = input('暱稱（選填）', 20, '');
    const room = input('房號', 8, getRoom());
    const capacity = document.createElement('select');
    capacity.setAttribute('aria-label', '連線人數');
    for (let count = config.min || config.size; count <= (config.max || config.size); count++) {
      capacity.add(new Option(count + ' 人', count));
    }
    const create = document.createElement('div');
    create.className = 'bar';
    create.append(capacity);
    board.append(create);
    makeButton(create, '開新房', () => enter('create', Array.from(random(8), b => alphabet[b & 31]).join('')));
    makeButton(create, '加入／返回房間', () => enter('join', room.value.trim().toUpperCase()));
    return enter;

    async function enter(action, requested) {
      if (waiting) return;
      if (!pattern.test(requested)) {
        notice.textContent = '請輸入 8 位房號。';
        return;
      }
      code = requested;
      try {
        token = localStorage.getItem(key + code) ||
          Array.from(random(24), b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(key + code, token);
      } catch {
        notice.textContent = '請容許瀏覽器儲存座位後再試。';
        return;
      }
      waiting = true;
      notice.textContent = '連線中…';
      try {
        const joined = await send(action, {game, capacity: Number(capacity.value), name: nickname.value});
        if (signal.aborted) return;
        snapshot = joined;
        history.replaceState(null, '', address(code));
        lastError = '';
        render();
      } catch (error) {
        if (!signal.aborted) notice.textContent = showError(error);
      } finally {
        waiting = false;
        schedule();
      }
    }
  }

  async function request(action = 'state', data = {}) {
    if (waiting || !snapshot || signal.aborted) return;
    waiting = true;
    const stateBefore = snapshot;
    try {
      const result = await send(action, data);
      if (signal.aborted) return;
      if (!result.unchanged) snapshot = result;
      if (snapshot !== stateBefore || lastError) {
        lastError = '';
        render();
      }
    } catch (error) {
      if (signal.aborted) return;
      if (['missing','seat'].includes(error.code)) {
        racing = false;
        snapshot = undefined;
        window.onlineGameView(game);
        window.stopRace();
        lobby(showError(error));
        return;
      }
      if (action === 'finish' && error.code === 'move') {
        window.stopRace();
        racing = false;
        submitted = undefined;
      }
      if (error.code === 'stale') {
        try {
          const latest = await send('state');
          if (signal.aborted) return;
          if (!latest.unchanged) snapshot = latest;
        } catch { /* Keep the last known board until the next poll. */ }
      }
      lastError = showError(error);
      render();
    } finally {
      waiting = false;
      schedule();
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (signal.aborted || !snapshot || document.hidden || snapshot.screen?.ended) return;
    const allDone = snapshot.results && Object.keys(snapshot.results).length === snapshot.capacity;
    if (snapshot.started > Date.now() && !racing) {
      timer = setTimeout(() => {render(); schedule()}, Math.min(1000, Math.max(50, snapshot.started - Date.now())));
    } else timer = setTimeout(() => {
      if (submitted !== undefined && snapshot.race && !snapshot.results?.[snapshot.seat]) {
        request('finish', {question, proof: submitted});
      } else request();
    }, allDone ? 3500 : 1800);
  }

  function textStatus() {
    status.replaceChildren();
    text(status, '房號 ' + code + ' ｜ 你係玩家 ' + (snapshot.seat + 1));
    text(status, snapshot.names.map((name,i) => (i + 1) + '. ' + name).join(' ｜ '));
    if (lastError) text(status, lastError);
    if (snapshot.race && snapshot.started) {
      const roundInSet=1+((snapshot.question||1)-1)%3;
      text(status, game===40?'第 '+roundInSet+'／3 回合':'第 '+(snapshot.question||1)+' 題');
      if(game===40&&snapshot.points){
        const standings=Object.entries(snapshot.points).sort(([,a],[,b])=>b-a);
        if(standings.length)text(status,'累計：'+standings.map(([seat,points])=>snapshot.names[seat]+' '+points+'／15').join(' ｜ '));
      }
      const results = Object.entries(snapshot.results).sort(([, a], [, b]) => b.score - a.score || a.elapsed - b.elapsed);
      const allDone = results.length === snapshot.capacity;
      if (!results.length) return;
      text(status, allDone ? '本題完成' : game === 36 ? '暫時排名（牌力優先）' : '完成排名');
      const list = document.createElement('ol');
      status.append(list);
      for (const [seat, result] of results) text(list, snapshot.names[seat] + ' · ' + (game===40?result.score+'／5 · ':'') + (result.elapsed / 1000).toFixed(1) + ' 秒', 'li');
      if (snapshot.seat === 0 && snapshot.results[0]) {
        makeButton(status, game===40&&roundInSet<3?'下一回合':'下一題', () => {
          if (allDone || window.confirm('仲有人未完成，確定而家開下一題？')) request('next');
        });
      } else if (snapshot.results[snapshot.seat]) {
        text(status, '等房主開下一題。');
      }
    }
  }

  function roomButtons(parent) {
    makeButton(parent, '複製邀請連結', async () => {
      try {
        await navigator.clipboard.writeText(address(code).href);
        if (!signal.aborted) text(status, '已複製邀請連結。');
      } catch {
        if (!signal.aborted) text(status, '可以分享瀏覽器網址。');
      }
    });
    makeButton(parent, '返回連線大堂', () => {
      if (waiting) return;
      history.replaceState(null, '', address(null));
      window.openGameRoom(game);
    });
  }

  function render() {
    textStatus();
    roomButtons(status);
    if (!snapshot.started) {
      reset();
      text(board, '等朋友加入 · ' + snapshot.names.length + '／' + snapshot.capacity, 'h3');
      if (snapshot.seat === 0) {
        makeButton(controls, '開始對局', () => request('start')).disabled = snapshot.names.length < snapshot.capacity;
      }
      return;
    }
    if (snapshot.race) {
      const activeQuestion = snapshot.question || 1;
      if (question !== activeQuestion) {
        question = activeQuestion;
        window.stopRace();
        racing = false;
        submitted = undefined;
      }
      if (racing) return;
      reset();
      if (snapshot.started > Date.now()) {
        text(board, '準備開始 · ' + Math.ceil((snapshot.started - Date.now()) / 1000) + ' 秒', 'h3');
        return;
      }
      if (snapshot.results[snapshot.seat]) {
        text(board, '你已完成呢一局。', 'h3');
        return;
      }
      racing = true;
      window.launchRace(game, question, seededRandom(snapshot.seed), proof => {
        submitted = proof;
        request('finish', {question, proof});
      }, snapshot.started);
      return;
    }
    reset();
    const {screen} = snapshot;
    if (!screen.board) {
      text(board, '等玩家 ' + (screen.turn + 1) + ' 完成操作。', 'h3');
      return;
    }
    board.innerHTML = screen.board;
    controls.innerHTML = screen.controls;
    notice.textContent = (screen.ended ? '比賽結束' : screen.turn === snapshot.seat ? '輪到你' :
      '等玩家 ' + (screen.turn + 1)) + (screen.message ? ' ｜ ' + screen.message : '');
    const fields = [...board.querySelectorAll('select[data-field]'), ...controls.querySelectorAll('select[data-field]')];
    const values = () => fields.map(field => field.selectedIndex);
    for (const field of fields.filter(field => field.hasAttribute('data-configure'))) {
      field.onchange = () => request('act', {kind: 'select', index: Number(field.dataset.field), values: values()});
    }
    for (const step of [...board.querySelectorAll('button[data-step]'), ...controls.querySelectorAll('button[data-step]')]) {
      step.onclick = () => request('act', {kind: 'click', index: Number(step.dataset.step), values: values()});
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else if (snapshot?.race && snapshot.started && !racing) {render(); schedule()}
    else request();
  }, {signal});
  window.addEventListener('online', () => request(), {signal});
  const enter = lobby();
  try {
    if (enter && pattern.test(getRoom()) && localStorage.getItem(key + getRoom())) enter('join', getRoom());
  } catch { /* The form can report when browser storage is unavailable. */ }
};

const invite = new URL(location.href);
const game = Number(invite.searchParams.get('game'));
if (Object.hasOwn(roomGames, game) && pattern.test(getRoom())) window.openGameRoom(game);
