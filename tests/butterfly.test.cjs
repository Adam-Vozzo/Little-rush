const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Engine = require('../engine.js');

// No browser simulation: this DOM double exercises event ownership and game
// lifecycle. Real SVG hit areas, layout and touch capture are verified in UI QA.
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parentElement = null;
    this.attributes = {}; this.dataset = {}; this.style = {}; this.listeners = new Map();
    this.className = ''; this.disabled = false; this.hidden = false; this._text = '';
    this.clientWidth = 400; this.clientHeight = 800;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => { const on = force === undefined ? !this.classList.contains(name) : !!force; this.classList[on ? 'add' : 'remove'](name); return on; },
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(html) {
    this.children = []; this._text = '';
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1)._text += token; continue; }
      const tag = token.match(/^<([\w-]+)/)?.[1];
      if (!tag) continue;
      const element = new Element(tag);
      for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(match[1], match[2]);
      stack.at(-1).append(element);
      if (!token.endsWith('/>') && !['input', 'br', 'hr', 'img'].includes(tag)) stack.push(element);
    }
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
  }
  append(...elements) { for (const element of elements) { element.parentElement = this; this.children.push(element); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  querySelectorAll(selector) {
    const matches = element => selector.startsWith('.') ? element.classList.contains(selector.slice(1)) : element.tagName === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(name, handler) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(handler); }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  dispatch(name, values = {}) {
    if (name === 'click' && this.disabled) return;
    const event = { preventDefault() {}, pointerId: 1, pointerType: 'touch', button: 0, detail: 1, clientX: 20, clientY: 20, ...values };
    for (const handler of this.listeners.get(name) ?? []) handler(event);
  }
  click(values) { this.dispatch('click', values); }
  setPointerCapture(id) { this.pointerId = id; }
  hasPointerCapture(id) { return this.pointerId === id; }
  releasePointerCapture(id) { if (this.pointerId === id) { this.pointerId = null; this.dispatch('lostpointercapture', { pointerId: id }); } }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  getBoundingClientRect() {
    if (this.rect) return this.rect;
    if (this.classList.contains('board-butterfly')) {
      const x = parseFloat(this.style.left) || 0, y = parseFloat(this.style.top) || 0;
      return { left: x - 30, right: x + 30, top: y - 27, bottom: y + 27, width: 60, height: 54 };
    }
    return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight };
  }
}

function environment({ app = false, reducedMotion = false } = {}) {
  const body = new Element('body');
  const ids = new Map();
  const document = {
    body, createElement: tag => new Element(tag), addEventListener() {},
    getElementById(id) { if (!ids.has(id)) { const element = new Element('div'); ids.set(id, element); body.append(element); } return ids.get(id); },
  };
  const board = document.getElementById('game-board');
  board.remove();
  const wrapper = new Element('div'); body.append(wrapper); wrapper.append(board);
  let feedMount;
  const catalog = ['press', 'wires', 'switch', 'shapes', 'maze', 'level', 'break', 'connect', 'upload', 'hold'].map(id => ({ id, title: id.toUpperCase(), color: 'sage' }));
  const mounts = [];
  const window = {
    matchMedia: () => ({ matches: reducedMotion }), addEventListener() {},
    LittleRushGames: {
      catalog,
      register(entries, mounter) { catalog.push(...entries); feedMount = mounter; },
      mount(container, type, options) {
        if (type === 'feed') return feedMount(container, type, options);
        const mounted = { type, options, destroyed: false }; mounts.push(mounted);
        return { tick(ageMs) { mounted.age = ageMs; mounted.onTick?.(); }, destroy() { mounted.destroyed = true; } };
      },
    },
  };
  let now = 0, nextFrame, engine;
  window.LittleRushEngine = class extends Engine { constructor(options) { super({ ...options, random: () => 0 }); engine = this; } };
  const context = vm.createContext({ window, document, performance: { now: () => now }, localStorage: { getItem() { return null; }, setItem() {} }, requestAnimationFrame: callback => { nextFrame = callback; } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../butterfly.js'), 'utf8'), context);
  let habitat;
  if (app) {
    const Habitat = window.LittleRushButterfly.Habitat;
    window.LittleRushButterfly.Habitat = class extends Habitat { constructor(container) { super(container); habitat = this; } };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  } else habitat = new window.LittleRushButterfly.Habitat(wrapper);
  const state = {
    window, body, document, ids, board, wrapper, habitat, mounts,
    get engine() { return engine; },
    advance(time) { now = time; if (nextFrame) nextFrame(now); },
    action(action) { document.getElementById('dialog-content').dispatch('click', { target: { closest: () => ({ dataset: { action } }) } }); },
    complete(type) { const game = mounts.find(m => !m.destroyed && !m.options.demo && m.type === type); assert.ok(game, `missing active ${type}`); game.options.onComplete(); },
    feed(options = {}) {
      const container = new Element('section'); board.append(container);
      let completions = 0, payload;
      const api = feedMount(container, 'feed', { butterfly: habitat, onComplete: value => { completions++; payload = value; }, ...options });
      return { ...api, container, button: container.querySelector('button'), hint: container.querySelector('.mg-hint'), get completions() { return completions; }, get payload() { return payload; } };
    },
  };
  return state;
}

test('a butterfly hatches once, freezes during pause and resumes from the same active elapsed time', () => {
  const { habitat } = environment();
  assert.equal(habitat.hatch(5, 3000), true);
  assert.equal(habitat.hatch(1, 4000), false);
  habitat.update(5200, true);
  const position = { ...habitat.position };
  habitat.update(5200, false);
  habitat.update(5200, false);
  assert.equal(habitat.position.x, position.x); assert.equal(habitat.position.y, position.y);
  assert.equal(habitat.button.disabled, true);
  habitat.update(5200, true);
  assert.equal(habitat.position.x, position.x); assert.equal(habitat.position.y, position.y);
  habitat.update(5600, true);
  assert.notEqual(habitat.position.x, position.x);
});

test('nectar drag crosses the board, holds butterfly still, and completes exactly once on a hit', () => {
  const env = environment(); const { habitat } = env;
  habitat.hatch(7, 0); habitat.update(5000, true);
  const feed = env.feed(); const position = { ...habitat.position };
  feed.button.dispatch('pointerdown');
  assert.equal(env.body.querySelectorAll('.nectar-ghost').length, 1);
  habitat.update(8000, true);
  assert.equal(habitat.position.x, position.x); assert.equal(habitat.position.y, position.y);
  feed.button.dispatch('pointermove', { clientX: position.x, clientY: position.y });
  assert.equal(env.body.querySelector('.nectar-ghost').style.left, `${position.x}px`);
  feed.button.dispatch('pointerup', { clientX: position.x, clientY: position.y });
  assert.equal(feed.completions, 1); assert.equal(feed.payload.kind, 'feed');
  assert.equal(env.body.querySelectorAll('.nectar-ghost').length, 0);
  assert.equal(habitat.offer, null);
  habitat.button.click(); feed.button.dispatch('pointerdown');
  assert.equal(feed.completions, 1);
});

test('a wrong nectar drop cancels cleanly and permits retry', () => {
  const env = environment(); env.habitat.hatch(7, 0);
  const feed = env.feed();
  feed.button.dispatch('pointerdown'); feed.button.dispatch('pointerup', { clientX: -100, clientY: -100 });
  assert.equal(feed.completions, 0); assert.equal(env.habitat.offer, null);
  assert.equal(env.body.querySelectorAll('.nectar-ghost').length, 0);
  feed.button.dispatch('pointerdown');
  feed.button.dispatch('pointerup', { clientX: env.habitat.position.x, clientY: env.habitat.position.y });
  assert.equal(feed.completions, 1);
});

test('another finger cannot move, cancel, or drop the selected nectar', () => {
  const env = environment(); env.habitat.hatch(7, 0);
  const feed = env.feed();
  feed.button.dispatch('pointerdown', { pointerId: 1 });
  feed.button.dispatch('pointerdown', { pointerId: 2 });
  feed.button.dispatch('pointermove', { pointerId: 2, clientX: 200, clientY: 300 });
  assert.equal(env.body.querySelector('.nectar-ghost').style.left, '20px');
  for (const name of ['pointercancel', 'lostpointercapture', 'pointerup']) feed.button.dispatch(name, { pointerId: 2 });
  assert.ok(env.habitat.offer); assert.equal(feed.completions, 0);
  feed.button.dispatch('pointerup', { pointerId: 1, clientX: env.habitat.position.x, clientY: env.habitat.position.y });
  assert.equal(feed.completions, 1);
});

for (const name of ['pointercancel', 'lostpointercapture']) test(`${name} removes a nectar offer and drag ghost`, () => {
  const env = environment(); env.habitat.hatch(0, 0);
  const feed = env.feed(); feed.button.dispatch('pointerdown'); feed.button.dispatch(name);
  assert.equal(env.habitat.offer, null); assert.equal(feed.completions, 0);
  assert.equal(env.body.querySelectorAll('.nectar-ghost').length, 0);
});

test('keyboard selection focuses the butterfly and its activation feeds it', () => {
  const env = environment(); env.habitat.hatch(0, 0);
  const feed = env.feed(); feed.button.click({ detail: 0 });
  assert.equal(env.habitat.button.focused, true);
  assert.equal(env.habitat.button.tabIndex, 0);
  env.habitat.button.click({ detail: 0 });
  assert.equal(feed.completions, 1);
});

test('pause, destruction and reset revoke nectar ownership and stale events cannot complete it', () => {
  for (const operation of ['pause', 'destroy', 'reset']) {
    const env = environment(); env.habitat.hatch(0, 0);
    const feed = env.feed(); feed.button.dispatch('pointerdown');
    const position = { ...env.habitat.position };
    if (operation === 'pause') env.habitat.update(0, false);
    if (operation === 'destroy') feed.destroy();
    if (operation === 'reset') env.habitat.reset();
    feed.button.dispatch('pointerup', { clientX: position.x, clientY: position.y });
    env.habitat.button.click();
    assert.equal(feed.completions, 0, operation); assert.equal(env.habitat.offer, null, operation);
    assert.equal(env.body.querySelectorAll('.nectar-ghost').length, 0, operation);
  }
});

test('superseding one offer cannot be cancelled by the former owner', () => {
  const env = environment(); env.habitat.hatch(0, 0);
  const first = env.feed(), second = env.feed();
  first.button.dispatch('pointerdown'); second.button.dispatch('pointerdown');
  assert.equal(env.body.querySelectorAll('.nectar-ghost').length, 1);
  first.destroy();
  assert.ok(env.habitat.offer);
  second.button.dispatch('pointerup', { clientX: env.habitat.position.x, clientY: env.habitat.position.y });
  assert.equal(second.completions, 1); assert.equal(first.completions, 0);
});

test('Feed demo and locked habitat remain inert', () => {
  const env = environment(); const feed = env.feed();
  feed.button.dispatch('pointerdown'); assert.equal(env.habitat.offer, null);
  env.habitat.hatch(0, 0);
  const demo = env.feed({ demo: true }); demo.button.click({ detail: 0 }); demo.button.dispatch('pointerdown');
  assert.equal(demo.button.tabIndex, -1); assert.equal(env.habitat.offer, null); assert.equal(demo.completions, 0);
});

test('app introduces HATCH once per run, queues Feed for next regular spawn and revokes it on restart', () => {
  const env = environment({ app: true });
  env.document.getElementById('start-button').click();
  assert.equal(env.engine.snapshot(0).tiles.find(Boolean).type, 'press');
  env.advance(3000); env.complete('press');
  assert.equal(env.habitat.active, true);
  assert.equal(env.engine.snapshot(3000).tiles.some(tile => tile?.type === 'feed'), false);
  env.advance(5000);
  assert.equal(env.engine.snapshot(5000).tiles.filter(tile => tile?.type === 'feed').length, 1);
  env.advance(7500);
  assert.equal(env.mounts.filter(m => m.type === 'press' && !m.options.demo).length, 1);
  const nectar = env.board.querySelector('.nectar-button'); nectar.dispatch('pointerdown');
  env.document.getElementById('pause-button').click();
  assert.equal(env.engine.status, 'paused'); assert.equal(env.habitat.offer, null);
  const position = { ...env.habitat.position };
  env.advance(9000);
  assert.equal(env.habitat.position.x, position.x); assert.equal(env.habitat.position.y, position.y);
  env.action('restart');
  assert.equal(env.habitat.active, false); assert.equal(env.habitat.button.hidden, true);
  assert.equal(env.engine.snapshot(9000).tiles.find(Boolean).type, 'press');
  nectar.dispatch('pointerup', { clientX: position.x, clientY: position.y });
  assert.equal(env.engine.score, 0);
});

test('app expiry cancels an active Feed drag and a late release cannot score', () => {
  const env = environment({ app: true });
  env.document.getElementById('start-button').click(); env.advance(3000); env.complete('press'); env.advance(5000);
  const nectar = env.board.querySelector('.nectar-button'); nectar.dispatch('pointerdown');
  const position = { ...env.habitat.position };
  env.advance(27500);
  assert.equal(env.engine.status, 'ended'); assert.equal(env.habitat.offer, null);
  assert.equal(env.body.querySelectorAll('.nectar-ghost').length, 0);
  nectar.dispatch('pointerup', { clientX: position.x, clientY: position.y }); env.habitat.button.click();
  assert.equal(env.engine.score, 1);
});

test('simultaneous tick completions do not remount cleared games from a stale render snapshot', () => {
  const env = environment({ app: true });
  env.document.getElementById('start-button').click();
  env.engine.enqueueType('upload'); env.advance(3000); env.complete('press');
  env.engine.enqueueType('hold'); env.advance(7500);
  const automatic = env.mounts.filter(m => !m.destroyed && !m.options.demo && ['upload', 'hold'].includes(m.type));
  assert.equal(automatic.length, 2);
  for (const mounted of automatic) mounted.onTick = () => { mounted.onTick = null; mounted.options.onComplete(); };
  env.advance(7600);
  assert.equal(env.engine.score, 3);
  env.advance(7616);
  assert.equal(env.mounts.filter(m => !m.options.demo && m.type === 'hold').length, 1);
  assert.equal(env.mounts.filter(m => !m.destroyed && !m.options.demo && ['upload', 'hold'].includes(m.type)).length, 0);
});

test('UI countdown and microgame age use the same 25-second lifetime', () => {
  const env = environment({app: true});
  env.document.getElementById('start-button').click();
  const hatch = env.mounts.find(m => m.type === 'press' && !m.options.demo);
  assert.equal(env.board.querySelector('.tile-timer').getAttribute('aria-label'), '25 seconds remaining');
  env.advance(1000);
  assert.equal(hatch.age, 1000);
  assert.equal(env.board.querySelector('.tile-timer').getAttribute('aria-label'), '24 seconds remaining');
  env.advance(17500);
  assert.equal(env.engine.snapshot(17500).tiles.filter(Boolean).length, 8);
  assert.equal(env.document.getElementById('next-label').textContent, 'Grid full · clear a tile');
  env.advance(24999);
  assert.equal(env.engine.status, 'running');
  env.advance(25000);
  assert.equal(env.engine.status, 'ended');
});

test('geode reveal lasts 700ms while its engine slot is already free', () => {
  const env = environment({app: true});
  env.document.getElementById('start-button').click();
  env.engine.enqueueType('break'); env.advance(2500);
  const geode = env.mounts.find(m => !m.options.demo && m.type === 'break');
  env.complete('break'); env.advance(2516);
  assert.equal(env.engine.score, 1);
  assert.equal(env.engine.snapshot(2516).tiles.some(tile => tile?.type === 'break'), false);
  assert.equal(geode.destroyed, false);
  assert.equal(env.board.querySelector('.geode-cleared').querySelector('.tile-timer').hidden, true);
  env.advance(3199); assert.equal(geode.destroyed, false);
  env.advance(3200); assert.equal(geode.destroyed, true);
});

test('a new scheduled spawn can replace the geode reveal immediately', () => {
  const env = environment({app: true});
  env.document.getElementById('start-button').click();
  env.engine.enqueueType('break'); env.advance(2500);
  const geode = env.mounts.find(m => !m.options.demo && m.type === 'break');
  env.advance(4990); env.complete('break'); env.advance(4991);
  assert.equal(geode.destroyed, false);
  env.advance(5000);
  assert.equal(geode.destroyed, true);
  assert.equal(env.engine.snapshot(5000).tiles[1].type, 'wires');
});
