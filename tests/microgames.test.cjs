const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// A deliberately small DOM test double. These tests verify game state and
// event lifecycles; visual layout and browser pointer capture require UI QA.
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.listeners = new Map();
    this.className = '';
    this.disabled = false;
    this._text = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => {
        const on = force === undefined ? !this.classList.contains(name) : !!force;
        this.classList[on ? 'add' : 'remove'](name);
        return on;
      },
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(html) {
    this.markup = html;
    this.children = [];
    this._text = '';
    // Only elements carrying class names are queried by the game library.
    // Flattening this SVG/HTML is sufficient for those descendant selectors.
    for (const match of html.matchAll(/<([a-z][\w-]*)\b[^>]*class="([^"]+)"[^>]*>/gi)) {
      const child = new Element(match[1]);
      child.className = match[2];
      this.append(child);
    }
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...elements) { for (const element of elements) { element.parentNode = this; this.children.push(element); } }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  querySelectorAll(selector) {
    const matches = element => selector.startsWith('.') ? element.classList.contains(selector.slice(1)) : element.tagName === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(handler);
  }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  setPointerCapture(pointerId) { this.capturedPointerId = pointerId; }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, right: 0, bottom: 0 }; }
  dispatch(name, values = {}) {
    if (name === 'click' && this.disabled) return;
    const event = { preventDefault() {}, pointerId: 1, pointerType: 'touch', button: 0, ...values };
    for (const handler of this.listeners.get(name) ?? []) handler(event);
  }
  click() { this.dispatch('click'); }
}

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../microgames.js'), 'utf8'), {
  window, document: { createElement: tag => new Element(tag) },
});
const { catalog, mount } = window.LittleRushGames;
const seeded = initial => {
  let seed = initial;
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
};
function game(type, options = {}) {
  const container = new Element('div');
  let completions = 0;
  let completionPayload;
  const feedback = [];
  const instance = mount(container, type, {
    random: () => 0, onComplete: payload => { completions++; completionPayload = payload; }, onFeedback: value => feedback.push(value), ...options,
  });
  return {
    ...instance, container, get completions() { return completions; }, get completionPayload() { return completionPayload; }, feedback,
    root: container.children[0],
    all: selector => container.querySelectorAll(selector),
    one: selector => { const result = container.querySelector(selector); assert.ok(result, `Missing ${selector}`); return result; },
    label: label => { const result = container.querySelectorAll('button').find(button => button.getAttribute('aria-label') === label); assert.ok(result, `Missing button ${label}`); return result; },
    hint: () => container.querySelector('.mg-hint').textContent,
  };
}
function assertCompleteOnce(g) {
  assert.equal(g.completions, 1);
  assert.ok(g.root.classList.contains('mg-complete'));
  const feedbackCount = g.feedback.length;
  g.all('button').forEach(button => button.click());
  g.tick(15000, 100);
  assert.equal(g.completions, 1);
  assert.equal(g.feedback.length, feedbackCount);
}

test('catalog contains ten unique supported games', () => {
  assert.equal(catalog.length, 10);
  assert.equal(new Set(catalog.map(item => item.id)).size, 10);
});

test('game packs register catalogue entries and receive mount options unchanged', () => {
  const isolatedWindow = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../microgames.js'), 'utf8'), {
    window: isolatedWindow, document: { createElement: tag => new Element(tag) },
  });
  const games = isolatedWindow.LittleRushGames;
  const container = new Element('div');
  const options = { demo: true, random: seeded(4) };
  const controller = { tick() {}, destroy() {} };
  games.register([{ id: 'extra', title: 'EXTRA', color: 'sage' }], (receivedContainer, type, receivedOptions) => {
    assert.equal(receivedContainer, container);
    assert.equal(type, 'extra');
    assert.equal(receivedOptions, options);
    return controller;
  });
  assert.equal(games.catalog.length, 11);
  assert.equal(games.mount(container, 'extra', options), controller);
  assert.throws(() => games.register([{ id: 'extra' }], () => controller), /Duplicate game/);
});

test('hatch waits for a chrysalis, ignores early taps and reports the butterfly unlock', () => {
  const g = game('press');
  const button = g.one('.mg-hatch-button');
  button.click();
  assert.equal(g.completions, 0);
  assert.equal(g.hint(), 'Still growing · wait…');
  g.tick(2999, 100);
  button.click();
  assert.equal(g.completions, 0);
  g.tick(3000, 1);
  assert.equal(g.hint(), 'Ready! Tap to hatch');
  assert.ok(button.classList.contains('is-ready'));
  assert.equal(g.completions, 0, 'readiness alone does not complete');
  button.click();
  assert.equal(g.completionPayload.kind, 'hatch');
  assertCompleteOnce(g);
});

test('break varies its tap count and shows every completed geode', () => {
  const counts = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const g = game('break', { random: seeded(seed * 800) }), geode = g.one('.mg-geode');
    const count = Number(geode.getAttribute('aria-label').match(/geode (\d+) times/)[1]);
    counts.add(count); assert.ok(count >= 5 && count <= 11);
    for(let i=1;i<count;i++){geode.click();assert.equal(g.completions,0);}
    geode.click();assert.ok(geode.classList.contains('is-open'));assertCompleteOnce(g);
  }
  assert.equal(counts.size,7);
});
test('operation generates distinct answers, retries errors, and completes addition and subtraction', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const g = game('operation', { random: seeded(seed) });
    const [a, op, b] = g.one('.mg-equation').textContent.split(' ');
    seen.add(op);
    const answer = op === '+' ? +a + +b : +a - +b;
    const choices = g.all('.mg-choice');
    assert.equal(new Set(choices.map(choice => choice.textContent)).size, 3);
    choices.find(choice => +choice.textContent !== answer).click();
    assert.equal(g.completions, 0);
    assert.equal(g.feedback.at(-1), 'error');
    assert.ok(g.root.classList.contains('mg-error'));
    g.tick(380, 100);
    assert.ok(!g.root.classList.contains('mg-error'));
    assert.ok(choices.every(choice => choice.disabled));
    g.tick(750, 100);
    choices.find(choice => +choice.textContent === answer).click();
    assertCompleteOnce(g);
  }
  assert.deepEqual([...seen].sort(), ['+', '−'].sort());
});

test('wrong solve answers block every input for exactly 750ms of active game time', () => {
  const g = game('operation');
  const [a, op, b] = g.one('.mg-equation').textContent.split(' ');
  const answer = op === '+' ? +a + +b : +a - +b;
  const choices = g.all('.mg-choice');
  const correct = choices.find(choice => +choice.textContent === answer);
  const wrong = choices.find(choice => +choice.textContent !== answer);
  g.tick(4200, 100);
  wrong.click();
  assert.equal(g.hint(), 'Try again in 0.8s');
  assert.equal(g.one('.mg-cooldown').textContent, '0.8s');
  assert.equal(g.one('.mg-cooldown').hidden, false);
  assert.ok(choices.every(choice => choice.disabled));
  assert.ok(g.root.classList.contains('is-cooling'));
  for (let i = 0; i < 10; i++) {
    choices.forEach(choice => choice.click());
    // A queued click must also be ignored, even if it bypasses DOM disabled state.
    for (const handler of correct.listeners.get('click')) handler({ detail: 0 });
    g.tick(4200, 100);
  }
  assert.equal(g.feedback.length, 1);
  assert.equal(g.completions, 0);
  assert.equal(g.hint(), 'Try again in 0.8s', 'frozen active age cannot advance the cooldown');
  g.tick(4949, 100);
  assert.equal(g.hint(), 'Try again in 0.1s');
  correct.click();
  assert.equal(g.completions, 0);
  g.tick(4950, 1);
  assert.ok(choices.every(choice => !choice.disabled));
  assert.equal(g.hint(), 'Choose the answer');
  assert.equal(g.root.classList.contains('is-cooling'), false);
  assert.equal(g.one('.mg-cooldown').hidden, true);
  correct.dispatch('click', { detail: 0 });
  assertCompleteOnce(g);
});

test('another wrong solve answer starts a fresh cooldown after the previous one ends', () => {
  const g = game('operation');
  const wrong = g.all('.mg-choice').find(choice => +choice.textContent !== 3);
  wrong.click(); g.tick(750, 100); wrong.click();
  assert.equal(g.feedback.length, 2);
  g.tick(1499, 100);
  assert.ok(g.all('.mg-choice').every(choice => choice.disabled));
  g.tick(1500, 1);
  assert.ok(g.all('.mg-choice').every(choice => !choice.disabled));
});

test('sequence rejects wrong order and permits retry without losing progress', () => {
  const g = game('sequence');
  g.label('Number 3').click();
  assert.equal(g.completions, 0);
  assert.equal(g.feedback.at(-1), 'error');
  g.label('Number 1').click();
  g.label('Number 3').click();
  assert.equal(g.hint(), 'Next: 2');
  [2, 3, 4].forEach(value => g.label(`Number ${value}`).click());
  assertCompleteOnce(g);
});

test('six switches start partially on and all must be on together', () => {
  for(let seed=1;seed<=40;seed++){
    const g=game('switch',{random:seeded(seed)}),buttons=g.all('.mg-toggle');
    assert.equal(buttons.length,6);
    const on=buttons.filter(b=>b.getAttribute('aria-pressed')==='true');
    assert.ok(on.length>=1&&on.length<=4);
    on[0].click();assert.equal(on[0].getAttribute('aria-pressed'),'false');assert.equal(g.completions,0);
    const off=buttons.filter(b=>b.getAttribute('aria-pressed')==='false');
    off.slice(0,-1).forEach(b=>b.click());assert.equal(g.completions,0);off.at(-1).click();assertCompleteOnce(g);
  }
});
test('simon ignores early input, flashes a pattern, replays mistakes, and accepts repetition', () => {
  const g = game('simon');
  const pink = g.label('Pink pattern button');
  const blue = g.label('Blue pattern button');
  pink.click();
  assert.equal(g.feedback.length, 0);
  g.label('Start pattern').click();
  for (const flashAt of [220, 820, 1420]) {
    g.tick(flashAt, 100);
    assert.ok(pink.classList.contains('is-lit'));
    g.tick(flashAt + 380, 100);
    assert.ok(!pink.classList.contains('is-lit'));
  }
  g.tick(2100, 100);
  assert.equal(g.hint(), 'Your turn · repeat');
  pink.click();
  blue.click();
  assert.equal(g.feedback.at(-1), 'error');
  assert.equal(g.hint(), 'Watch once more');
  assert.equal(g.all('.is-done').length, 0);
  const feedbackCount = g.feedback.length;
  pink.click();
  assert.equal(g.feedback.length, feedbackCount);
  g.tick(2820, 100);
  assert.ok(pink.classList.contains('is-lit'));
  g.tick(4700, 100);
  assert.equal(g.hint(), 'Your turn · repeat');
  pink.click(); pink.click();
  assert.equal(g.completions, 0);
  pink.click();
  assert.ok(pink.classList.contains('is-lit'), 'the final input keeps its successful highlight');
  assertCompleteOnce(g);
});

test('stop keeps moving during its 750ms wrong-answer cooldown and then accepts a retry', () => {
  const g = game('stop');
  const button = g.one('.mg-stop-button');
  assert.equal(catalog.find(entry => entry.id === 'stop').title, 'STOP IN THE GREEN');
  assert.equal(g.all('button').length, 1, 'the entire lower control is one stop button');
  assert.equal(g.one('.mg-stop-top').querySelector('.mg-stop-meter'), g.one('.mg-stop-meter'));
  assert.equal(button.querySelector('.mg-stop-meter'), null, 'the moving meter stays above the lower stop surface');
  button.click();
  assert.equal(g.completions, 0);
  assert.equal(g.feedback.at(-1), 'error');
  g.tick(420 * Math.PI / 2, 100);
  assert.ok(Math.abs(parseFloat(g.one('.mg-stop-dot').style.left) - 50) < 0.001);
  button.click();
  assert.equal(g.completions, 0); assert.equal(button.disabled, true);
  for (let i = 0; i < 10; i++) { g.tick(749); button.click(); }
  assert.equal(g.feedback.length, 1); assert.equal(button.disabled, true);
  g.tick(750); assert.equal(button.disabled, false);
  const center = parseFloat(g.one('.mg-stop-zone').style.left) + 14;
  g.tick(420 * (2 * Math.PI - Math.acos(1 - center / 50)));
  button.click();
  assertCompleteOnce(g);
});

test('stop uses each randomized visible zone for judging hits', () => {
  const starts = new Set();
  for (const value of [0, .25, .5, .75, .999]) {
    const g = game('stop', {random: () => value}), button = g.one('.mg-stop-button');
    const start = parseFloat(g.one('.mg-stop-zone').style.left); starts.add(start);
    assert.ok(start >= 5 && start + 28 <= 95);
    button.click(); assert.equal(g.completions,0);
    const hitAt = 420 * (2 * Math.PI - Math.acos(1 - (start + 14) / 50));
    g.tick(hitAt); button.click(); assertCompleteOnce(g);
  }
  assert.equal(starts.size,5);
});

function holdFor(g, milliseconds, startAge = 0) {
  for (let time = 100; time <= milliseconds; time += 100) g.tick(startAge + time, 100);
}
for (const releaseEvent of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
  test(`hold resets on ${releaseEvent} and requires a fresh uninterrupted second`, () => {
    const g = game('hold');
    const button = g.one('.mg-hold-button');
    button.dispatch('pointerdown');
    holdFor(g, 700);
    assert.equal(g.completions, 0);
    button.dispatch(releaseEvent);
    assert.equal(g.one('.mg-hold-progress').style.strokeDashoffset, '100');
    assert.equal(g.hint(), 'Hold for 1 second');
    holdFor(g, 1000, 700);
    assert.equal(g.completions, 0);
    button.dispatch('pointerdown');
    holdFor(g, 900, 1700);
    assert.equal(g.completions, 0);
    g.tick(2700, 100);
    assertCompleteOnce(g);
  });
}

test('hold supports keyboard press/release and ignores repeated keydowns', () => {
  const g = game('hold');
  const button = g.one('.mg-hold-button');
  button.dispatch('keydown', { key: ' ', repeat: false });
  holdFor(g, 500);
  button.dispatch('keydown', { key: ' ', repeat: true });
  button.dispatch('keyup', { key: ' ' });
  holdFor(g, 1000, 500);
  assert.equal(g.completions, 0);
  button.dispatch('keydown', { key: 'Enter', repeat: false });
  holdFor(g, 1000, 1500);
  assertCompleteOnce(g);
});

for (const releaseEvent of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  test(`hold ignores a second finger ${releaseEvent} while its original pointer stays held`, () => {
    const g = game('hold');
    const button = g.one('.mg-hold-button');
    button.dispatch('pointerdown', { pointerId: 1 });
    holdFor(g, 600);
    button.dispatch('pointerdown', { pointerId: 2 });
    button.dispatch(releaseEvent, { pointerId: 2 });
    holdFor(g, 400, 600);
    assertCompleteOnce(g);
  });
}

test('hold completes after one elapsed second even when animation frames are delayed', () => {
  const g = game('hold');
  g.tick(4200, 100);
  g.one('.mg-hold-button').dispatch('pointerdown');
  g.tick(5199, 999);
  assert.equal(g.completions, 0);
  g.tick(5200, 1);
  assertCompleteOnce(g);
});

test('hold pointer and keyboard inputs cannot release each other', () => {
  for (const mode of ['pointer', 'keyboard']) {
    const g = game('hold');
    const button = g.one('.mg-hold-button');
    if (mode === 'pointer') button.dispatch('pointerdown');
    else button.dispatch('keydown', { key: 'Enter', repeat: false });
    holdFor(g, 600);
    if (mode === 'pointer') {
      button.dispatch('keydown', { key: ' ', repeat: false });
      button.dispatch('keyup', { key: ' ' });
    } else {
      button.dispatch('pointerdown');
      button.dispatch('pointerup');
      button.dispatch('keydown', { key: ' ', repeat: false });
      button.dispatch('keyup', { key: ' ' });
    }
    holdFor(g, 400, 600);
    assertCompleteOnce(g);
  }
});

test('shapes supports keyboard pick/place, retries mismatches, and requires all three fits', () => {
  const g = game('shapes');
  g.label('Pick up circle').click();
  g.label('Place in square slot').click();
  assert.equal(g.feedback.at(-1), 'error');
  assert.equal(g.completions, 0);
  for (const name of ['circle', 'triangle', 'square']) {
    g.label(`Pick up ${name}`).click();
    g.label(`Place in ${name} slot`).click();
  }
  assert.equal(g.all('.is-filled').length, 3);
  assertCompleteOnce(g);
});

test('shapes uses dragged pointer coordinates, rejects wrong drops and ignores other pointers', () => {
  const g = game('shapes');
  const names = ['circle', 'triangle', 'square'];
  g.all('.mg-shape-slot').forEach((slot, index) => { slot.rect = { left: index * 45, right: index * 45 + 40, top: 10, bottom: 50 }; });
  const first = g.label('Pick up circle');
  first.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 90 });
  first.dispatch('pointerup', { pointerId: 2, clientX: 10, clientY: 25 });
  assert.equal(g.all('.is-filled').length, 0);
  first.dispatch('pointermove', { pointerId: 1, clientX: 70, clientY: 25 });
  assert.equal(first.style.transform, 'translate(-30px, -65px)');
  first.dispatch('pointerup', { pointerId: 1, clientX: 70, clientY: 25 });
  assert.equal(g.feedback.at(-1), 'error');
  assert.equal(first.style.transform, '');
  assert.equal(g.completions, 0);
  for (let index = 0; index < names.length; index++) {
    const button = g.label(`Pick up ${names[index]}`);
    button.dispatch('pointerdown', { clientX: 50, clientY: 90 });
    button.dispatch('pointerup', { clientX: index * 45 + 20, clientY: 25 });
  }
  assertCompleteOnce(g);
});

test('a cancelled shape drag does not fill a slot', () => {
  const g = game('shapes');
  const button = g.label('Pick up circle');
  g.label('Place in circle slot').rect = { left: 0, right: 40, top: 0, bottom: 40 };
  button.dispatch('pointerdown', { clientX: 70, clientY: 100 });
  button.dispatch('pointermove', { clientX: 20, clientY: 20 });
  button.dispatch('pointercancel', { clientX: 20, clientY: 20 });
  assert.equal(g.all('.is-filled').length, 0);
  assert.equal(button.style.transform, '');
  assert.equal(button.classList.contains('is-dragging'), false);
});

test('wires asks for labelled endpoints and completes only when that wire is cut', () => {
  const g = game('wires');
  const prompt = g.one('.mg-wire-prompt');
  assert.match(prompt.textContent, /^[A-Z]–[0-9]$/, 'the target is essential puzzle content without repeated instructions');
  const requested = prompt.getAttribute('aria-label');
  const wires = g.all('.mg-cut-wire');
  assert.equal(wires.length, 3);
  assert.equal(new Set(wires.map(wire => wire.getAttribute('aria-label'))).size, 3);
  wires.find(wire => wire.getAttribute('aria-label') !== requested).click();
  assert.equal(g.feedback.at(-1), 'error');
  assert.equal(g.completions, 0);
  g.label(requested).click();
  assert.equal(g.all('.is-cut').length, 1);
  assertCompleteOnce(g);
});

test('wires draws varied distinct uppercase letters and digits with matching visible endpoints', () => {
  const leftLabels = new Set(), rightLabels = new Set(), pairings = new Set(), prompts = new Set();
  for (let seed = 1; seed <= 160; seed++) {
    const g = game('wires', { random: seeded(seed * 7919) });
    const wires = g.all('.mg-cut-wire');
    const pairs = wires.map(wire => {
      const match = /^Cut wire ([A-Z])–([0-9])$/.exec(wire.getAttribute('aria-label'));
      assert.ok(match);
      const visible = [...wire.markup.matchAll(/<text\b[^>]*>([^<]+)<\/text>/g)].map(match => match[1]);
      assert.deepEqual(visible, [match[1], match[2]], 'labels on the drawn wire must match its accessible cut action');
      leftLabels.add(match[1]); rightLabels.add(match[2]);
      return match.slice(1);
    });
    assert.equal(new Set(pairs.map(pair => pair[0])).size, 3);
    assert.equal(new Set(pairs.map(pair => pair[1])).size, 3);
    const rightPositions = wires.map(wire => +wire.markup.match(/<text x="117" y="(\d+)"/)[1]);
    assert.equal(new Set(rightPositions).size, 3);
    assert.ok(rightPositions.some((position, index) => position !== 21 + index * 31), 'at least one wire crosses');
    pairings.add(rightPositions.join(','));
    const requested = g.one('.mg-wire-prompt').getAttribute('aria-label');
    prompts.add(requested);
    assert.equal(wires.filter(wire => wire.getAttribute('aria-label') === requested).length, 1);
    wires.find(wire => wire.getAttribute('aria-label') !== requested).click();
    assert.equal(g.completions, 0);
    g.label(requested).click();
    assertCompleteOnce(g);
  }
  assert.ok(leftLabels.size >= 20);
  assert.equal(rightLabels.size, 10);
  assert.ok(pairings.size >= 4);
  assert.ok(prompts.size >= 70);
});

test('every game ignores stale queued events and ticks after destroy', () => {
  for (const { id } of catalog) {
    const g = game(id);
    const callbacks = g.all('button').flatMap(button => [...button.listeners.values()].flatMap(set => [...set]));
    const buttons = g.all('button');
    const feedbackCount = g.feedback.length;
    g.destroy(); g.destroy();
    assert.equal(g.container.children.length, 0, id);
    callbacks.forEach(callback => callback({ preventDefault() {}, pointerType: 'touch', pointerId: 1, button: 0, key: 'Enter' }));
    g.tick(2000, 100);
    assert.equal(g.completions, 0, id);
    assert.equal(g.feedback.length, feedbackCount, id);
    assert.ok(buttons.every(button => [...button.listeners.values()].every(set => set.size === 0)), id);
  }
});

test('all demo games stay inert and mount with accessible button labels', () => {
  for (const { id } of catalog) {
    const g = game(id, { demo: true });
    for (const button of g.all('button')) {
      assert.ok(button.getAttribute('aria-label'), id);
      assert.equal(button.tabIndex, -1, id);
      button.click(); button.dispatch('pointerdown');
    }
    for (let time = 0; time <= 20000; time += 100) g.tick(time, 100);
    assert.equal(g.completions, 0, id);
    assert.equal(g.feedback.length, 0, id);
    g.destroy();
    assert.equal(g.container.children.length, 0, id);
  }
});
