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
      for (const name of ['checked', 'disabled', 'hidden']) element[name] = new RegExp(`\\s${name}(?=[\\s/>])`).test(token);
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
    const attribute = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    const matches = element => attribute ? element.getAttribute(attribute[1]) !== null && (attribute[2] === undefined || element.getAttribute(attribute[1]) === attribute[2])
      : selector.startsWith('.') ? element.classList.contains(selector.slice(1)) : element.tagName === selector;
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

function environment({ app = false, actualTiming = false, reducedMotion = false, saved = {}, calendarTime = new Date(2026, 9, 5, 12).getTime() } = {}) {
  const body = new Element('body');
  const ids = new Map();
  for (const match of fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').matchAll(/\bid="([^"]+)"/g)) {
    const element = new Element('div'); ids.set(match[1], element); body.append(element);
  }
  const documentListeners = new Map(), windowListeners = new Map();
  const document = {
    querySelectorAll: selector => body.querySelectorAll(selector),
    body, createElement: tag => new Element(tag),
    addEventListener(name, handler) { if (!documentListeners.has(name)) documentListeners.set(name, new Set()); documentListeners.get(name).add(handler); },
    getElementById(id) { return ids.get(id) ?? null; },
  };
  const board = document.getElementById('game-board');
  board.remove();
  const wrapper = new Element('div'); body.append(wrapper); wrapper.append(board);
  let feedMount;
  const catalog = ['press', 'wires', 'switch', 'shapes', 'maze', 'level', 'break', 'connect', 'upload', 'hold'].map(id => ({ id, title: id.toUpperCase(), color: 'sage' }));
  const mounts = [];
  const themeCalls = [];
  const window = {
    matchMedia: () => ({ matches: reducedMotion }),
    addEventListener(name, handler) { if (!windowListeners.has(name)) windowListeners.set(name, new Set()); windowListeners.get(name).add(handler); },
    LittleRushTheme: { setTheme(theme) { themeCalls.push(theme); } },
    LittleRushGames: {
      catalog,
      register(entries, mounter) { catalog.push(...entries); feedMount = mounter; },
      mount(container, type, options) {
        if (type === 'feed') return feedMount(container, type, options);
        const mounted = { type, options, container, destroyed: false }; mounts.push(mounted);
        return { tick(ageMs) { mounted.age = ageMs; mounted.onTick?.(); }, destroy() { mounted.destroyed = true; } };
      },
    },
  };
  let now = 0, nextFrame, engine;
  let wallTime = calendarTime;
  const storage = new Map(Object.entries(saved).map(([key, value]) => [key, String(value)]));
  class CalendarDate extends Date {
    constructor(...args) { super(...(args.length ? args : [wallTime])); }
    static now() { return wallTime; }
  }
  window.LittleRushEngine = class extends Engine { constructor(options) { assert.equal(options.firstSpawnDelayMs,650); super({ ...options, firstSpawnDelayMs: actualTiming ? options.firstSpawnDelayMs : 0, random: () => 0 }); engine = this; } };
  const context = vm.createContext({ window, document, Date: CalendarDate, performance: { now: () => now }, localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); } }, requestAnimationFrame: callback => { nextFrame = callback; } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../butterfly.js'), 'utf8'), context);
  let habitat;
  if (app) {
    const Habitat = window.LittleRushButterfly.Habitat;
    window.LittleRushButterfly.Habitat = class extends Habitat { constructor(container) { super(container); habitat ??= this; } };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../previews.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  } else habitat = new window.LittleRushButterfly.Habitat(wrapper);
  const state = {
    window, body, document, ids, board, wrapper, habitat, mounts, storage, themeCalls,
    get engine() { return engine; },
    advance(time) { now = time; if (nextFrame) nextFrame(now); },
    calendar(time) { wallTime = time; },
    dispatchDocument(name, values = {}) { for (const handler of documentListeners.get(name) ?? []) handler({ preventDefault() {}, ...values }); },
    dispatchWindow(name, values = {}) { for (const handler of windowListeners.get(name) ?? []) handler({ preventDefault() {}, ...values }); },
    action(action) { document.getElementById('dialog-content').dispatch('click', { target: { closest: () => ({ dataset: { action } }) } }); },
    toggleGame(id, checked) {
      const input = document.getElementById('dialog-content').querySelector(`[data-game-toggle="${id}"]`);
      assert.ok(input, `Missing game toggle ${id}`); input.checked = checked;
      document.getElementById('dialog-content').dispatch('change', { target: input });
    },
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

test('nectar drag follows a moving butterfly and completes exactly once at its current position', () => {
  const env = environment(); const { habitat } = env;
  habitat.hatch(7, 0); habitat.update(5000, true);
  const feed = env.feed(); let position = { ...habitat.position };
  feed.button.dispatch('pointerdown');
  assert.equal(env.body.querySelectorAll('.nectar-ghost').length, 1);
  habitat.update(8000, true);
  assert.notEqual(habitat.position.x, position.x); assert.notEqual(habitat.position.y, position.y);
  position = { ...habitat.position };
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
  env.advance(8080);
  assert.equal(env.mounts.filter(m => !m.options.demo && m.type === 'hold').length, 1);
  assert.equal(env.mounts.filter(m => !m.destroyed && !m.options.demo && ['upload', 'hold'].includes(m.type)).length, 0);
});

test('filled pie countdown and microgame age use the same 25-second lifetime without timer digits', () => {
  const env = environment({app: true});
  env.document.getElementById('start-button').click();
  const hatch = env.mounts.find(m => m.type === 'press' && !m.options.demo);
  const timer = env.board.querySelector('.tile-timer'), fill = timer.querySelector('.timer-fill');
  const full = fill.getAttribute('d');
  assert.ok(full);
  assert.equal(timer.querySelector('span'), null);
  assert.equal(timer.querySelector('.timer-arc'), null);
  assert.equal(timer.getAttribute('aria-label'), '25 seconds remaining');
  env.advance(1000);
  assert.equal(hatch.age, 1000);
  assert.equal(env.board.querySelector('.tile-timer').getAttribute('aria-label'), '24 seconds remaining');
  assert.notEqual(fill.getAttribute('d'), full);
  assert.match(fill.getAttribute('d'), /^M12 12L12 2A/);
  env.advance(17500);
  assert.equal(env.engine.snapshot(17500).tiles.filter(Boolean).length, 8);
  assert.equal(env.document.getElementById('next-label'), null);
  assert.equal(env.document.getElementById('spawn-fill'), null);
  env.advance(24999);
  assert.equal(env.engine.status, 'running');
  env.advance(25000);
  assert.equal(env.engine.status, 'ended');
  assert.equal(fill.getAttribute('d'), '');
});

test('geode reveal reserves its slot for 880ms and cannot expire', () => {
  const env = environment({app: true});
  env.document.getElementById('start-button').click();
  env.engine.enqueueType('break'); env.advance(2500);
  const geode = env.mounts.find(m => !m.options.demo && m.type === 'break');
  env.complete('break'); env.advance(2516);
  assert.equal(env.engine.score, 1);
  assert.equal(env.engine.snapshot(2516).tiles.some(tile => tile?.type === 'break' && tile.completedAt !== undefined), true);
  assert.equal(geode.destroyed, false);
  assert.equal(env.board.querySelector('.is-solved').querySelector('.tile-timer').hidden, true);
  env.advance(3379); assert.equal(geode.destroyed, false);
  env.advance(3380); assert.equal(geode.destroyed, true);
});

test('a new scheduled spawn respects the reserved geode completion beat', () => {
  const env = environment({app: true});
  env.document.getElementById('start-button').click();
  env.engine.enqueueType('break'); env.advance(2500);
  const geode = env.mounts.find(m => !m.options.demo && m.type === 'break');
  env.advance(4990); env.complete('break'); env.advance(4991);
  assert.equal(geode.destroyed, false);
  env.advance(5000);
  assert.equal(geode.destroyed, false);
  assert.equal(env.engine.snapshot(5000).tiles[1].type, 'break');
  env.advance(5870); assert.equal(geode.destroyed,true);
});

test('title screen starts with records and no game previews, then exposes only the active play screen', () => {
  const env = environment({ app: true });
  assert.equal(env.document.getElementById('home-screen').hidden, false);
  assert.equal(env.document.getElementById('play-screen').hidden, true);
  assert.equal(env.mounts.length, 0);
  assert.equal(env.board.querySelectorAll('.empty').length, 8);
  for (const id of ['alltime-time', 'today-time']) assert.equal(env.document.getElementById(id).textContent, '00:00');
  for (const id of ['alltime-score', 'today-score']) assert.equal(env.document.getElementById(id).textContent, '0');
  for (const id of ['best-time', 'next-game', 'next-label', 'next-count', 'spawn-fill', 'game-footer', 'desktop-help', 'sound-button']) assert.equal(env.document.getElementById(id), null);
  env.document.getElementById('start-button').click();
  assert.equal(env.document.getElementById('home-screen').hidden, true);
  assert.equal(env.document.getElementById('play-screen').hidden, false);
  assert.equal(env.mounts.length, 1);
  assert.equal(env.document.getElementById('score').textContent, '0');
});

test('pause menu exposes help and sound, keeps the clock frozen, and returns cleanly to the title', () => {
  const env = environment({ app: true });
  env.document.getElementById('start-button').click(); env.advance(2000);
  const pie = env.board.querySelector('.timer-fill').getAttribute('d');
  env.document.getElementById('pause-button').click();
  assert.equal(env.engine.status, 'paused'); assert.equal(env.board.getAttribute('inert'), '');
  env.action('help'); env.advance(9000);
  assert.equal(env.engine.snapshot(9000).elapsedMs, 2000);
  assert.equal(env.board.querySelector('.timer-fill').getAttribute('d'), pie);
  env.action('back-pause');
  assert.equal(env.engine.status, 'paused');
  env.action('sound'); assert.equal(env.storage.get('little-rush-sound'), 'on');
  env.action('resume');
  assert.equal(env.engine.status, 'running'); assert.equal(env.board.getAttribute('inert'), null);
  env.advance(10000); assert.equal(env.engine.snapshot(10000).elapsedMs, 3000);
  env.document.getElementById('pause-button').click(); env.action('home');
  assert.equal(env.document.getElementById('home-screen').hidden, false);
  assert.equal(env.document.getElementById('play-screen').hidden, true);
  assert.ok(env.mounts.every(mount => mount.destroyed));
});

test('records preserve independent time and score maxima for all-time and the current local day', () => {
  const key = 'little-rush-records-v1';
  const env = environment({ app: true, saved: { [key]: JSON.stringify({
    allTime: { timeMs: 90000, score: 0 }, daily: { date: '2026-10-05', timeMs: 20000, score: 5 }
  }) } });
  env.document.getElementById('start-button').click(); env.advance(3000); env.complete('press'); env.advance(27500);
  const saved = JSON.parse(env.storage.get(key));
  assert.deepEqual(saved.allTime, { timeMs: 90000, score: 1 });
  assert.deepEqual(saved.daily, { date: '2026-10-05', timeMs: 27500, score: 5 });
  env.action('home');
  assert.equal(env.document.getElementById('alltime-time').textContent, '01:30');
  assert.equal(env.document.getElementById('alltime-score').textContent, '1');
  assert.equal(env.document.getElementById('today-time').textContent, '00:27');
  assert.equal(env.document.getElementById('today-score').textContent, '5');
  const restored = environment({ app: true, saved: Object.fromEntries(env.storage) });
  assert.equal(restored.document.getElementById('alltime-score').textContent, '1');
  assert.equal(restored.document.getElementById('today-time').textContent, '00:27');
});

test('legacy best time migrates and malformed, negative, or non-finite records cannot corrupt title statistics', () => {
  for (const value of ['not-json', JSON.stringify({ allTime: { timeMs: -50, score: 'Infinity' }, daily: { date: '2026-10-05', timeMs: 'NaN', score: -4 } })]) {
    const env = environment({ app: true, saved: { 'little-rush-records-v1': value, 'little-rush-best-v3': '120000' } });
    assert.equal(env.document.getElementById('alltime-time').textContent, '02:00');
    assert.equal(env.document.getElementById('alltime-score').textContent, '0');
    assert.equal(env.document.getElementById('today-time').textContent, '00:00');
    assert.equal(env.document.getElementById('today-score').textContent, '0');
  }
});

test('daily records reset at local midnight while title is open and when the page becomes visible', () => {
  const key = 'little-rush-records-v1';
  const env = environment({ app: true, saved: { [key]: JSON.stringify({ allTime: { timeMs: 45000, score: 9 }, daily: { date: '2026-10-05', timeMs: 30000, score: 4 } }) } });
  env.calendar(new Date(2026, 9, 6, 0, 0, 1).getTime()); env.advance(16);
  let saved = JSON.parse(env.storage.get(key));
  assert.deepEqual(saved.daily, { date: '2026-10-06', timeMs: 0, score: 0 });
  assert.deepEqual(saved.allTime, { timeMs: 45000, score: 9 });
  assert.equal(env.document.getElementById('today-time').textContent, '00:00');
  assert.equal(env.document.getElementById('today-score').textContent, '0');
  env.calendar(new Date(2026, 9, 7, 0, 0, 1).getTime()); env.document.hidden = false; env.dispatchDocument('visibilitychange');
  saved = JSON.parse(env.storage.get(key));
  assert.equal(saved.daily.date, '2026-10-07');
});

test('pausing, restarting, and pagehide save active progress without counting hidden time', () => {
  const key = 'little-rush-records-v1';
  const env = environment({ app: true });
  env.document.getElementById('start-button').click(); env.advance(3000); env.complete('press');
  env.dispatchWindow('pagehide');
  assert.equal(env.engine.status, 'paused');
  assert.deepEqual(JSON.parse(env.storage.get(key)).daily, { date: '2026-10-05', timeMs: 3000, score: 1 });
  env.advance(100000);
  assert.equal(JSON.parse(env.storage.get(key)).allTime.timeMs, 3000);
  env.action('restart'); env.advance(101000); env.document.getElementById('pause-button').click();
  assert.deepEqual(JSON.parse(env.storage.get(key)).allTime, { timeMs: 3000, score: 1 });
});

test('Tweaks persists checkbox choices, blocks an empty catalog, and supports a single repeatable game', () => {
  const key = 'little-rush-disabled-games-v1';
  const env = environment({ app: true });
  env.document.getElementById('tweaks-button').click(); env.action('all-off');
  assert.equal(env.document.getElementById('start-button').disabled, true);
  env.action('close'); env.document.getElementById('start-button').click();
  assert.equal(env.engine.status, 'idle');
  env.document.getElementById('tweaks-button').click(); env.toggleGame('switch', true); env.action('close');
  assert.equal(env.document.getElementById('start-button').disabled, false);
  const saved = JSON.parse(env.storage.get(key));
  assert.ok(saved.includes('press') && saved.includes('feed')); assert.equal(saved.includes('switch'), false);
  env.document.getElementById('start-button').click(); env.advance(2500);
  assert.deepEqual(env.engine.snapshot(2500).tiles.filter(Boolean).map(tile => tile.type), ['switch']);
  const restored = environment({ app: true, saved: Object.fromEntries(env.storage) });
  restored.document.getElementById('start-button').click();
  assert.equal(restored.engine.snapshot(0).tiles.find(Boolean).type, 'switch');
});

test('Tweaks enforces the Hatch dependency for Feed and prevents Hatch-only runs', () => {
  const env = environment({ app: true });
  env.document.getElementById('tweaks-button').click(); env.action('all-off');
  let feed = env.document.getElementById('dialog-content').querySelector('[data-game-toggle="feed"]');
  assert.equal(feed.disabled, true); assert.equal(feed.checked, false);
  env.toggleGame('feed', true);
  assert.equal(env.document.getElementById('start-button').disabled, true);
  env.toggleGame('press', true);
  assert.equal(feed.disabled, false); assert.equal(env.document.getElementById('start-button').disabled, true);
  env.toggleGame('feed', true);
  assert.equal(env.document.getElementById('start-button').disabled, false);
  env.toggleGame('press', false);
  assert.equal(feed.disabled, true); assert.equal(feed.checked, false);
  assert.ok(JSON.parse(env.storage.get('little-rush-disabled-games-v1')).includes('feed'));
  env.action('all-on');
  assert.deepEqual(JSON.parse(env.storage.get('little-rush-disabled-games-v1')), []);
  assert.equal(env.document.getElementById('start-button').disabled, false);
});

test('Tweaks ignores malformed saved catalogs and unknown IDs without disabling legitimate games', () => {
  for (const saved of ['{bad', '{"press":false}', '["unknown-game"]']) {
    const env = environment({ app: true, saved: { 'little-rush-disabled-games-v1': saved } });
    assert.equal(env.document.getElementById('start-button').disabled, false);
    env.document.getElementById('start-button').click();
    assert.equal(env.engine.snapshot(0).tiles.find(Boolean).type, 'press');
  }
});

test('Styles applies Flat by default and switching to Holofoil preserves game choices across tabs', () => {
  const env = environment({ app: true });
  const dialog = env.document.getElementById('dialog-content');
  assert.deepEqual(env.themeCalls, ['flat']);
  env.document.getElementById('tweaks-button').click(); env.toggleGame('switch', false);
  const gameChoices = env.storage.get('little-rush-disabled-games-v1');
  env.action('styles-tab');
  assert.equal(dialog.querySelector('[id="styles-panel"]').hidden, false);
  assert.equal(dialog.querySelector('[id="games-panel"]').hidden, true);
  assert.equal(dialog.querySelector('[data-action="theme-flat"]').getAttribute('aria-pressed'), 'true');
  env.action('theme-holofoil');
  assert.deepEqual(env.themeCalls, ['flat', 'holofoil']);
  assert.equal(env.storage.get('little-rush-theme-v1'), 'holofoil');
  assert.equal(dialog.querySelector('[data-action="theme-holofoil"]').getAttribute('aria-pressed'), 'true');
  assert.equal(dialog.querySelector('[data-action="theme-flat"]').getAttribute('aria-pressed'), 'false');
  assert.equal(dialog.querySelector('[data-action="styles-tab"]').getAttribute('aria-selected'), 'true');
  assert.equal(env.storage.get('little-rush-disabled-games-v1'), gameChoices);
  env.action('games-tab');
  assert.equal(dialog.querySelector('[data-game-toggle="switch"]').checked, false);
  assert.equal(dialog.querySelector('[id="styles-panel"]').hidden, true);
  assert.equal(dialog.querySelector('[id="games-panel"]').hidden, false);
});

test('selected Holofoil and Aero styles restore and can persistently switch back to Flat', () => {
  for (const theme of ['holofoil','aero']) {
    const env = environment({ app: true, saved: { 'little-rush-theme-v1': theme, 'little-rush-disabled-games-v1': '["switch"]' } });
    assert.deepEqual(env.themeCalls, [theme]);
    env.document.getElementById('tweaks-button').click(); env.action('styles-tab');
    assert.equal(env.document.getElementById('dialog-content').querySelector('[data-action="theme-'+theme+'"]').getAttribute('aria-pressed'), 'true');
    env.action('theme-flat');
    assert.deepEqual(env.themeCalls, [theme, 'flat']);
    const restored = environment({ app: true, saved: Object.fromEntries(env.storage) });
    assert.deepEqual(restored.themeCalls, ['flat']);
    assert.equal(restored.storage.get('little-rush-disabled-games-v1'), '["switch"]');
  }
});

test('unrecognized saved styles fall back to Flat and cannot inject markup into the Styles panel', () => {
  for (const invalid of ['unknown', 'HOLOFOIL', '"><img src=x onerror="alert(1)"><script>alert(1)</script>']) {
    const env = environment({ app: true, saved: { 'little-rush-theme-v1': invalid } });
    assert.deepEqual(env.themeCalls, ['flat']);
    env.document.getElementById('tweaks-button').click(); env.action('styles-tab');
    const dialog = env.document.getElementById('dialog-content');
    assert.equal(dialog.querySelectorAll('img').length, 0);
    assert.equal(dialog.querySelectorAll('script').length, 0);
    assert.equal(dialog.querySelector('[data-action="theme-flat"]').getAttribute('aria-pressed'), 'true');
    env.action('theme-unrecognized');
    assert.deepEqual(env.themeCalls, ['flat']);
  }
});

test('Tweaks tabs support keyboard navigation without changing selections', () => {
  const env = environment({ app: true });
  env.document.getElementById('tweaks-button').click();
  const dialog = env.document.getElementById('dialog-content');
  env.toggleGame('maze', false);
  const saved = env.storage.get('little-rush-disabled-games-v1');
  let target = dialog.querySelector('[data-action="games-tab"]');
  dialog.dispatch('keydown', { target, key: 'ArrowRight' });
  target = dialog.querySelector('[data-action="styles-tab"]');
  assert.equal(target.getAttribute('aria-selected'), 'true'); assert.equal(target.focused, true);
  dialog.dispatch('keydown', { target, key: 'Home' });
  target = dialog.querySelector('[data-action="games-tab"]');
  assert.equal(target.getAttribute('aria-selected'), 'true');
  dialog.dispatch('keydown', { target, key: 'End' });
  target = dialog.querySelector('[data-action="gameplay-tab"]');
  assert.equal(target.getAttribute('aria-selected'), 'true');
  dialog.dispatch('keydown', { target, key: 'ArrowLeft' });
  assert.equal(dialog.querySelector('[data-action="styles-tab"]').getAttribute('aria-selected'), 'true');
  dialog.dispatch('keydown', { target: dialog.querySelector('[data-action="styles-tab"]'), key: 'ArrowLeft' });
  assert.equal(dialog.querySelector('[data-action="games-tab"]').getAttribute('aria-selected'), 'true');
  assert.equal(dialog.querySelector('[data-game-toggle="maze"]').checked, false);
  assert.equal(env.storage.get('little-rush-disabled-games-v1'), saved);
  assert.deepEqual(env.themeCalls, ['flat']);
});

test('real app startup shows an empty board then a random first tile, and honors difficulty',()=>{
  for(const [mode,spawn,expiry] of [['calm',3000,30000],['normal',2500,25000],['extreme',1500,15000]]){
    const env=environment({app:true,actualTiming:true,saved:{'little-rush-difficulty':mode}});
    env.document.getElementById('start-button').click();
    assert.equal(env.engine.initialType,null);assert.equal(env.engine.snapshot(0).tiles.filter(Boolean).length,0);
    env.advance(649);assert.equal(env.mounts.length,0);
    env.advance(650);assert.equal(env.mounts.length,1);
    assert.equal(env.engine.snapshot(650).tiles.find(Boolean).remainingMs,expiry);
    env.advance(650+spawn);assert.equal(env.engine.snapshot(650+spawn).tiles.filter(Boolean).length,2);
  }
});

test('Gameplay saves its scoring preference, changes the HUD, and keeps cleared count separately',()=>{
  const env=environment({app:true});
  env.document.getElementById('tweaks-button').click();env.action('gameplay-tab');
  const dialog=env.document.getElementById('dialog-content');
  dialog.dispatch('change',{target:{id:'time-based-points',checked:true}});
  assert.equal(dialog.querySelector('.points-options').disabled,false);
  dialog.dispatch('change',{target:{name:'points-preference',value:'late'}});
  assert.deepEqual(JSON.parse(env.storage.get('little-rush-gameplay-v1')),{timeBasedPoints:true,pointsPreference:'late'});
  env.action('close');env.document.getElementById('start-button').click();env.advance(5000);env.complete('press');env.advance(5016);
  assert.equal(env.engine.score,1);assert.equal(env.engine.points,20);
  assert.equal(env.document.getElementById('score').textContent,'20');
  assert.equal(env.board.querySelector('.tile-points').textContent,'+20');
  assert.equal(env.document.getElementById('hud-score').getAttribute('aria-label'),'Points scored');
  const restored=environment({app:true,saved:Object.fromEntries(env.storage)});restored.document.getElementById('start-button').click();
  assert.equal(restored.engine.scoringMode,'late');
});

test('Zen fills the real board, hides deadlines, counts clears and preserves timed-run records and points preferences', () => {
  const records = JSON.stringify({allTime: {timeMs: 90000, score: 30}, daily: {date: '2026-10-05', timeMs: 90000, score: 30}});
  const env = environment({app: true, actualTiming: true, saved: {
    'little-rush-difficulty': 'zen', 'little-rush-records-v1': records,
    'little-rush-gameplay-v1': JSON.stringify({timeBasedPoints: true, pointsPreference: 'late'})
  }});
  env.document.getElementById('start-button').click();
  assert.equal(env.engine.zen, true); assert.equal(env.engine.scoringMode, 'off');
  assert.equal(env.engine.snapshot(0).tiles.filter(Boolean).length, 8);
  assert.equal(env.board.querySelectorAll('.tile-timer').length, 0);
  assert.equal(env.document.getElementById('run-time').textContent, 'zen');
  env.advance(3600000); assert.equal(env.engine.status, 'running');
  env.complete('press'); env.advance(3600016);
  assert.equal(env.document.getElementById('score').textContent, '1');
  assert.equal(env.engine.points, 0); assert.equal(env.board.querySelectorAll('.tile-points').length, 0);
  env.advance(3600500); assert.equal(env.engine.snapshot(3600500).tiles.filter(Boolean).length, 8);
  env.document.getElementById('pause-button').click(); env.action('help');
  assert.match(env.document.getElementById('dialog-content').textContent, /No expiry timers/);
  env.action('home'); assert.equal(env.storage.get('little-rush-records-v1'), records);
  env.document.getElementById('difficulty-options').dispatch('click', {target: {closest: () => ({dataset: {difficulty: 'normal'}})}});
  env.document.getElementById('start-button').click();
  assert.equal(env.engine.zen, false); assert.equal(env.engine.scoringMode, 'late');
  assert.equal(env.engine.snapshot(3600500).tiles.filter(Boolean).length, 0);
});

test('Zen needs a repeatable game and never repeats the cocoon, even after hatching', () => {
  const env = environment({app: true, actualTiming: true, saved: {'little-rush-difficulty': 'zen'}});
  env.document.getElementById('tweaks-button').click(); env.action('all-off'); env.toggleGame('press', true);
  assert.equal(env.document.getElementById('start-button').disabled, true);
  env.toggleGame('feed', true);
  assert.equal(env.document.getElementById('start-button').disabled, true);
  env.toggleGame('switch', true); env.action('close'); env.document.getElementById('start-button').click();
  assert.equal(env.engine.snapshot(0).tiles.filter(Boolean).length, 2);
  assert.equal(env.engine.snapshot(0).tiles.filter(tile => tile?.type === 'press').length, 1);
  env.advance(3000); env.complete('press'); env.advance(3500);
  assert.equal(env.habitat.active, true); assert.ok(env.engine.snapshot(3500).tiles.some(tile => tile?.type === 'feed'));
  assert.equal(env.engine.snapshot(3500).tiles.filter(Boolean).length, 2);
  assert.equal(env.engine.snapshot(3500).tiles.filter(tile => tile?.type === 'press').length, 0);
  env.complete('switch'); env.advance(4000);
  assert.equal(env.engine.snapshot(4000).tiles.filter(Boolean).length, 2);
  assert.equal(env.engine.snapshot(4000).tiles.filter(tile => tile?.type === 'press').length, 0);
});

test('Tweaks games play with independent clocks, retain the completed pose, then mount fresh puzzles', () => {
  const env = environment({app: true});
  env.document.getElementById('tweaks-button').click();
  const old = env.mounts.find(m => m.type === 'switch');
  assert.notEqual(old.options.demo, true);
  assert.equal(old.container.parentElement.getAttribute('inert'), null);
  env.advance(100); assert.equal(old.age, 100);
  const records = env.storage.get('little-rush-records-v1'); old.options.onComplete();
  assert.ok(old.container.parentElement.classList.contains('is-solved'));
  for (const time of [200, 300, 400, 500]) env.advance(time);
  assert.equal(old.destroyed, false); assert.equal(env.engine.score, 0);
  env.advance(600); assert.equal(old.destroyed, true);
  const fresh = env.mounts.filter(m => m.type === 'switch').at(-1);
  assert.notEqual(fresh, old); assert.equal(fresh.destroyed, false);
  old.options.onComplete(); assert.equal(fresh.container.parentElement.classList.contains('is-solved'), false);
  assert.equal(env.storage.get('little-rush-records-v1'), records);
  env.action('styles-tab'); assert.ok(env.mounts.every(m => m.destroyed));
  env.advance(700); assert.equal(env.engine.status, 'idle');
});

test('Feed practice has its own butterfly, resets after feeding, and cleans up nectar on close', () => {
  const env = environment({app: true}); env.document.getElementById('tweaks-button').click();
  const content = env.document.getElementById('dialog-content');
  const nectar = content.querySelector('.nectar-button'); const butterfly = content.querySelector('.board-butterfly');
  assert.equal(butterfly.hidden, false); assert.equal(env.habitat.active, false);
  nectar.dispatch('click', {detail: 0}); butterfly.click();
  for (const time of [100, 200, 300, 400, 500]) env.advance(time);
  const fresh = content.querySelector('.nectar-button'); assert.notEqual(fresh, nectar);
  fresh.dispatch('pointerdown'); assert.ok(env.body.querySelector('.nectar-ghost'));
  env.action('close'); assert.equal(env.body.querySelector('.nectar-ghost'), null);
  assert.equal(env.habitat.active, false); assert.equal(env.engine.score, 0);
});
