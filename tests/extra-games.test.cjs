const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// DOM double for puzzle semantics. Browser QA checks rendering and real touch.
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.attributes = {}; this.style = {};
    this.listeners = new Map(); this.className = ''; this.disabled = false; this._text = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => { const on = force ?? !this.classList.contains(name); this.classList[on ? 'add' : 'remove'](name); return on; },
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(html) {
    this.children = []; this._text = '';
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*class="([^"]+)"[^>]*)>/gi)) {
      const child = new Element(match[1]); child.className = match[3];
      for (const attribute of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(attribute[1], attribute[2]);
      this.append(child);
    }
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...elements) { elements.forEach(el => { el.parentNode = this; this.children.push(el); }); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  querySelectorAll(selector) {
    const matches = element => selector.startsWith('.') ? element.classList.contains(selector.slice(1)) : element.tagName === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture(id) { if (this.captured === id) this.captured = null; }
  getBoundingClientRect() { return this.rect ?? { left: 0, top: 0, width: 120, height: 70 }; }
  dispatch(name, values = {}) {
    if (name === 'click' && this.disabled) return;
    for (const fn of this.listeners.get(name) ?? []) fn({ preventDefault() {}, pointerId: 1, pointerType: 'touch', button: 0, ...values });
  }
  click() { this.dispatch('click'); }
}
let catalog, mount;
const window = { LittleRushGames: { register(items, mounter) { catalog = items; mount = mounter; } } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extra-games.js'), 'utf8'), { window, document: { createElement: tag => new Element(tag) } });
const puzzles = window.LittleRushPuzzles;
const seeded = initial => {
  let seed = initial;
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
};
function game(type, options = {}) {
  const container = new Element('div'); let completions = 0; const feedback = [];
  const controller = mount(container, type, { random: () => 0, onComplete: () => completions++, onFeedback: value => feedback.push(value), ...options });
  return {
    ...controller, container, feedback, get completions() { return completions; },
    all: selector => container.querySelectorAll(selector),
    one: selector => { const el = container.querySelector(selector); assert.ok(el, `Missing ${selector}`); return el; },
    label: name => { const el = container.querySelectorAll('button').find(button => button.getAttribute('aria-label') === name); assert.ok(el, `Missing ${name}`); return el; },
  };
}
function completedOnce(g) {
  assert.equal(g.completions, 1);
  const feedback = g.feedback.length;
  g.all('button').forEach(button => button.click()); g.tick(20000, 100);
  assert.equal(g.completions, 1); assert.equal(g.feedback.length, feedback);
}
function dragTo(handle, target, { release = true, pointerId = 1 } = {}) {
  const initial = Number(handle.getAttribute('aria-valuenow'));
  handle.dispatch('pointerdown', { clientX: 60, pointerId });
  handle.dispatch('pointermove', { clientX: 60 + (target - initial) * 1.2, pointerId });
  if (release) handle.dispatch('pointerup', { pointerId });
}
function traceSignature(paper, checkpoints, pointerId = 1) {
  paper.dispatch('pointerdown', { clientX: checkpoints[0][0], clientY: checkpoints[0][1], pointerId });
  for (const [clientX, clientY] of checkpoints.slice(1)) paper.dispatch('pointermove', { clientX, clientY, pointerId });
}

test('all ten extensions register, mount, and remain inert in demo mode', () => {
  assert.equal(catalog.length, 10); assert.equal(new Set(catalog.map(item => item.id)).size, 10);
  for (const item of catalog) {
    const g = game(item.id, { demo: true });
    g.all('button').forEach(button => button.click()); g.tick(15000);
    assert.equal(g.completions, 0); assert.equal(g.feedback.length, 0);
    g.destroy(); assert.equal(g.container.children.length, 0);
  }
});
test('roll requires beetle to reach upright', () => {
  const g = game('roll'); g.label('Roll right').click(); assert.equal(g.completions, 0);
  g.label('Roll right').click(); assert.equal(g.completions, 0);
  g.label('Roll right').click(); completedOnce(g);
});
test('type rejects a wrong character and accepts the displayed word', () => {
  const g = game('type'); g.label('Type U').click(); assert.equal(g.completions, 0); assert.equal(g.feedback[0], 'error');
  ['B', 'U', 'D'].forEach(letter => g.label(`Type ${letter}`).click()); completedOnce(g);
});
test('generated mazes have varied walls and endpoints and every mounted maze is playable', () => {
  const layouts = new Set(), endpoints = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const puzzle = puzzles.generateMaze(seeded(seed)); const g = game('maze', { random: seeded(seed) });
    layouts.add(puzzle.cells.join(',')); endpoints.add(`${puzzle.start},${puzzle.end}`);
    const route = puzzles.solveMaze(puzzle); assert.ok(route.length >= 8);
    const names = ['up', 'right', 'down', 'left'];
    const wall = [0, 1, 2, 3].find(side => !(puzzle.cells[puzzle.start] & 1 << side));
    g.label(`Move ${names[wall]}`).click(); assert.equal(g.feedback[0], 'error');
    assert.equal(g.one('.is-player').getAttribute('data-cell'), String(puzzle.start));
    for (let i = 1; i < route.length; i++) {
      const diff = route[i] - route[i - 1];
      g.label(`Move ${diff === 1 ? 'right' : diff === -1 ? 'left' : diff === 5 ? 'down' : 'up'}`).click();
    }
    completedOnce(g);
  }
  assert.ok(layouts.size > 70); assert.ok(endpoints.size > 15);
});
test('signatures vary and every generated guide accepts a continuous trace', () => {
  const signatures = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const guide = puzzles.generateSignature(seeded(seed)); const g = game('sign', { random: seeded(seed) });
    signatures.add(JSON.stringify(guide));
    traceSignature(g.one('.ex-sign-paper'), guide); completedOnce(g);
    assert.equal(g.one('.ex-sign-paper').captured, null);
  }
  assert.ok(signatures.size > 70);
});
test('signature rejects separate taps, endpoint jumps, wrong pointer input, and canceled traces', () => {
  const guide = puzzles.generateSignature(() => 0); const g = game('sign'); const paper = g.one('.ex-sign-paper');
  for (const [clientX, clientY] of guide) { paper.dispatch('pointerdown', { clientX, clientY }); paper.dispatch('pointerup'); }
  assert.equal(g.completions, 0);
  paper.dispatch('pointerdown', { clientX: guide[0][0], clientY: guide[0][1] });
  paper.dispatch('pointermove', { clientX: guide.at(-1)[0], clientY: guide.at(-1)[1] }); paper.dispatch('pointerup');
  assert.equal(g.completions, 0);
  paper.dispatch('pointerdown', { clientX: guide[0][0], clientY: guide[0][1], pointerId: 7 });
  paper.dispatch('pointerdown', { clientX: 120, clientY: 0, pointerId: 8 });
  for (const [clientX, clientY] of guide.slice(1)) paper.dispatch('pointermove', { clientX, clientY, pointerId: 8 });
  assert.equal(g.completions, 0); assert.equal(paper.captured, 7);
  paper.dispatch('pointercancel', { pointerId: 7 }); assert.equal(paper.captured, null);
  traceSignature(paper, guide); completedOnce(g);
});
test('memory hides the digits before accepting answers and reveals errors for a retry', () => {
  const g = game('memory'); g.label('Recall 1').click(); assert.equal(g.completions, 0);
  g.tick(1400); assert.equal(g.one('.ex-memory-code').textContent, '···');
  g.label('Recall 2').click(); assert.equal(g.one('.ex-memory-code').textContent, '111');
  g.tick(2299); assert.equal(g.label('Recall 1').disabled, true);
  g.tick(2300); for (let i = 0; i < 3; i++) g.label('Recall 1').click(); completedOnce(g);
});
test('random level targets and initial knobs are always separated and each puzzle can be dragged into place', () => {
  const variations = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const settings = puzzles.generateLevels(seeded(seed)); const g = game('level', { random: seeded(seed) });
    variations.add(JSON.stringify(settings)); const sliders = g.all('.ex-level-slider');
    settings.forEach(({ target, initial }, index) => {
      assert.ok(target >= 20 && target <= 80 && initial >= 0 && initial <= 100);
      assert.ok(Math.abs(target - initial) >= 25);
      dragTo(sliders[index], target, { release: false }); assert.equal(g.completions, 0);
      sliders[index].dispatch('pointerup');
    });
    completedOnce(g);
  }
  assert.ok(variations.size > 70);
});
test('shared sliders ignore rail taps and small clicks, preserve grip offset, and own their pointer', () => {
  for (const type of ['level', 'catch']) {
    const g = game(type); const track = g.one(type === 'level' ? '.ex-level-track' : '.ex-catch-machine');
    const handle = g.one(type === 'level' ? '.ex-level-slider' : '.ex-claw');
    const initial = Number(handle.getAttribute('aria-valuenow'));
    track.dispatch('pointerdown', { clientX: 0 }); track.dispatch('pointermove', { clientX: 120 }); track.dispatch('pointerup');
    assert.equal(Number(handle.getAttribute('aria-valuenow')), initial);
    handle.dispatch('pointerdown', { clientX: 73, pointerId: 7 });
    handle.dispatch('pointermove', { clientX: 74, pointerId: 7 }); assert.equal(Number(handle.getAttribute('aria-valuenow')), initial);
    handle.dispatch('pointerdown', { clientX: 0, pointerId: 8 });
    handle.dispatch('pointermove', { clientX: 120, pointerId: 8 }); assert.equal(Number(handle.getAttribute('aria-valuenow')), initial);
    handle.dispatch('pointerup', { pointerId: 8 }); assert.equal(handle.captured, 7);
    handle.dispatch('pointermove', { clientX: 85, pointerId: 7 }); assert.equal(Number(handle.getAttribute('aria-valuenow')), initial + 10);
    handle.dispatch('pointercancel', { pointerId: 7 }); assert.equal(Number(handle.getAttribute('aria-valuenow')), initial); assert.equal(handle.captured, null);
    handle.dispatch('keydown', { key: 'Home' }); handle.dispatch('keydown', { key: 'End' }); assert.equal(Number(handle.getAttribute('aria-valuenow')), initial);
    handle.dispatch('keydown', { key: 'ArrowRight' }); assert.equal(Number(handle.getAttribute('aria-valuenow')), initial + 2);
    assert.equal(g.completions, 0);
  }
});
test('a canceled final level drag cannot complete even with another pointer committing a matched knob', () => {
  const g = game('level'); const sliders = g.all('.ex-level-slider'); const settings = puzzles.generateLevels(() => 0);
  dragTo(sliders[0], settings[0].target); dragTo(sliders[1], settings[1].target);
  dragTo(sliders[2], settings[2].target, { release: false, pointerId: 7 });
  sliders[0].dispatch('keydown', { key: 'ArrowRight' }); assert.equal(g.completions, 0);
  sliders[2].dispatch('pointercancel', { pointerId: 7 }); assert.equal(g.completions, 0);
  dragTo(sliders[2], settings[2].target); completedOnce(g);
});
test('catch requires moving the claw and a finished drop, locks position while dropping, and allows retries', () => {
  const g = game('catch'); const claw = g.one('.ex-claw'); const target = puzzles.generateLevels(() => 0, 1, 10, 90)[0].target;
  assert.equal(g.all('button').length, 1);
  g.label('Drop claw').click(); claw.dispatch('keydown', { key: 'ArrowLeft' });
  claw.dispatch('pointerdown', { clientX: 60 }); assert.equal(claw.captured, undefined);
  g.tick(350); assert.equal(g.completions, 0);
  dragTo(claw, target, { release: false }); g.label('Drop claw').click(); g.tick(1000); assert.equal(g.completions, 0);
  claw.dispatch('pointerup'); g.label('Drop claw').click();
  g.tick(1349); assert.equal(g.completions, 0); g.tick(1350); completedOnce(g);
});
test('upload follows Upload → game-clock progress → Complete and never auto-completes', () => {
  const g = game('upload'); g.tick(500); g.label('Upload').click();
  assert.equal(g.label('Uploading').disabled, true);
  for (let i = 0; i < 8; i++) g.label('Uploading').click();
  g.tick(2000); const meter = g.one('.ex-upload-meter'); assert.equal(meter.getAttribute('aria-valuenow'), '50');
  for (let i = 0; i < 20; i++) g.tick(2000); assert.equal(meter.getAttribute('aria-valuenow'), '50');
  assert.equal(g.completions, 0); g.tick(3499); assert.equal(g.label('Uploading').disabled, true);
  g.tick(3500); assert.equal(g.label('Complete').disabled, false); assert.equal(g.completions, 0);
  g.tick(10000); assert.equal(g.completions, 0); g.label('Complete').click(); completedOnce(g);
});
test('generated pipe grids vary, start unsolved, and accept complete connected routes through six rotatable cells', () => {
  const layouts = new Set(), anchors = new Set();
  for (let seed = 1; seed <= 120; seed++) {
    const puzzle = puzzles.generatePipes(seeded(seed * 104729)); const g = game('connect', { random: seeded(seed * 104729) });
    layouts.add(`${puzzle.types.join(',')}/${puzzle.rotations.join(',')}`); anchors.add(`${puzzle.start},${puzzle.end},${puzzle.entry},${puzzle.exit}`);
    assert.equal(puzzles.pipesConnected(puzzle), false); assert.equal(puzzles.pipesConnected(puzzle, puzzle.solution), true);
    assert.equal(g.all('.ex-pipe').length, 6);
    puzzle.solution.forEach((solution, index) => {
      const turns = (solution - puzzle.rotations[index] + 4) % 4;
      for (let i = 0; i < turns; i++) g.label(`Rotate pipe ${index + 1} clockwise`).click();
    });
    completedOnce(g);
  }
  assert.ok(layouts.size > 100); assert.ok(anchors.size > 20);
});
test('dice only clears after all six faces are counted in ascending order', () => {
  const g = game('dice'); g.label('Die with 6 dots').click(); assert.equal(g.feedback[0], 'error');
  for (let i = 1; i <= 6; i++) g.label(`Die with ${i} ${i === 1 ? 'dot' : 'dots'}`).click(); completedOnce(g);
});
test('destroy removes listeners and pointer capture during a drag', () => {
  for (const type of ['sign', 'level', 'catch']) {
    const g = game(type); const handle = g.one(type === 'sign' ? '.ex-sign-paper' : type === 'level' ? '.ex-level-slider' : '.ex-claw');
    const guide = puzzles.generateSignature(() => 0);
    handle.dispatch('pointerdown', { clientX: type === 'sign' ? guide[0][0] : 60, clientY: guide[0][1] }); assert.equal(handle.captured, 1);
    g.destroy(); assert.equal(handle.captured, null); assert.equal(g.container.children.length, 0);
    handle.dispatch('pointermove', { clientX: 108, clientY: 48 }); assert.equal(g.completions, 0);
  }
});
test('typing offers at least sixty unique short words, all with complete six-key alphabets', () => {
  assert.ok(puzzles.words.length >= 60); assert.equal(new Set(puzzles.words).size, puzzles.words.length);
  puzzles.words.forEach((word, index) => {
    assert.match(word, /^[A-Z]{3,6}$/); assert.ok(new Set(word).size <= 6);
    const g = game('type', { random: () => (index + .5) / puzzles.words.length });
    assert.equal(g.one('.ex-word').textContent, word); assert.equal(g.all('.ex-key').length, 6);
    for (const letter of word) g.label(`Type ${letter}`).click(); completedOnce(g);
  });
});
