import {runGame} from './generated-game.mjs';
import {seededRandom} from './catalog.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => (
  {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]
));
const descendants = (node, tag) => (node.children || []).flatMap(child => typeof child === 'string' ? [] :
  [...(child.tag === tag ? [child] : []), ...descendants(child, tag)]);

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.className = '';
    this.attrs = {};
    this.style = {};
    Object.defineProperty(this.style, 'setProperty', {value: (key, value) => { this.style[key] = value; }});
    this.dataset = {};
    this.selectedIndex = 0;
    this.classList = {add: (...names) => {
      this.className = [...new Set(this.className.split(' ').filter(Boolean).concat(names))].join(' ');
    }};
  }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.markup = ''; }
  set innerHTML(markup) { this.replaceChildren(); this.markup = markup; }
  set textContent(content) { this.replaceChildren(String(content)); }
  get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  get firstChild() { return this.children[0]; }
  setAttribute(key, value) { this.attrs[key] = value; }
  querySelectorAll(tag) { return descendants(this, tag); }
  add(option) { this.append(option); }
  get selectedOptions() { return [this.children[this.selectedIndex]]; }

  html(buttons, selects, enabled) {
    const attr = {...this.attrs};
    if (this.className) attr.class = this.className;
    if (this.type) attr.type = this.type;
    if (this.open) attr.open = '';
    const styles = Object.entries(this.style).map(([key, value]) => key + ':' + value).join(';');
    if (styles) attr.style = styles;
    for (const [key, value] of Object.entries(this.dataset)) {
      attr['data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = value;
    }
    if (this.tag === 'button') {
      attr['data-step'] = buttons.indexOf(this);
      if (!enabled || this.disabled || !this.onclick) attr.disabled = '';
    }
    if (this.tag === 'select') {
      attr['data-field'] = selects.indexOf(this);
      if (this.onchange) attr['data-configure'] = '';
      if (!enabled) attr.disabled = '';
    }
    const contents = this.markup || this.children.map((c, i) => typeof c === 'string' ? escape(c) :
      this.tag === 'select' ? '<option value="' + i + '"' + (i === this.selectedIndex ? ' selected' : '') + '>' +
        escape(c.textContent) + '</option>' : c.html(buttons, selects, enabled)).join('');
    return '<' + this.tag + Object.entries(attr).map(([key, value]) => ' ' + key + '="' + escape(value) + '"').join('') +
      '>' + contents + '</' + this.tag + '>';
  }
}

export function prepareGame(game, count, seed) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element('div'));
      return elements.get(id);
    },
    createElement: tag => new Element(tag)
  };
  const board = document.getElementById('board');
  const controls = document.getElementById('controls');
  const notice = document.getElementById('msg');
  const online = {
    count, random: seededRandom(seed), roles: ['玩家一','玩家二'], seat: 0, private: false, ended: false,
    focus(seat, hidden, ended = false) {
      this.seat = seat;
      this.private = hidden;
      this.ended = ended;
    }
  };
  runGame(document, online, game);
  const buttons = () => [...descendants(board, 'button'), ...descendants(controls, 'button')];
  const selects = () => [...descendants(board, 'select'), ...descendants(controls, 'select')];
  return {
    act(seat, action) {
      if (online.ended || seat !== online.seat || !action || !Number.isInteger(action.index)) return false;
      const fields = selects();
      const values = action.values;
      if (!Array.isArray(values) || values.length !== fields.length ||
        values.some((value, i) => !Number.isInteger(value) || value < (fields[i].children.length ? 0 : -1) ||
          value >= fields[i].children.length)) return false;
      const target = action.kind === 'select' ? fields[action.index] : action.kind === 'click' ? buttons()[action.index] : null;
      const handler = action.kind === 'select' ? target?.onchange : target?.onclick;
      if (!handler || target.disabled) return false;
      // Selects that change the action set must use a separate change event.
      if (fields.some((field, i) => field.onchange && field !== target && values[i] !== field.selectedIndex)) return false;
      fields.forEach((field, i) => { field.selectedIndex = values[i]; });
      handler();
      return true;
    },
    view(seat) {
      const info = {turn: online.seat, ended: online.ended};
      if (online.private && seat !== online.seat) return info;
      const steps = buttons(), fields = selects();
      const enabled = seat === online.seat && !online.ended;
      return {...info, board: board.html(steps, fields, enabled), controls: controls.html(steps, fields, enabled), message: notice.textContent};
    }
  };
}

export function verifyRace(game, seed, proof, question = 1) {
  const elements = new Map();
  const document = {getElementById(id) {
    if (!elements.has(id)) elements.set(id, new Element('div'));
    return elements.get(id);
  }};
  const online = {raceCheck: true, random: seededRandom(seed)};
  runGame(document, online, game, question);
  return online.verify(proof);
}
