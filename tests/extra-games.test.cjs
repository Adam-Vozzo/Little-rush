const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// DOM double for puzzle semantics. Browser QA checks rendering and real touch.
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.attributes = {}; this.style = { setProperty(name,value) { this[name] = value; } };
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
function drawSignature(paper, stroke, pointerId = 1, release = true) {
  paper.rect = { left: 0, top: 0, width: 160, height: 100 };
  paper.dispatch('pointerdown', { clientX: stroke[0][0], clientY: stroke[0][1], pointerId });
  for (const [clientX, clientY] of stroke.slice(1)) paper.dispatch('pointermove', { clientX, clientY, pointerId });
  if (release) paper.dispatch('pointerup', { pointerId });
}
function mazeGeometry(g) {
  const maze = g.one('.ex-maze-grid'), width = 20, left = 11, top = 17;
  maze.rect = { left, top, width: 100, height: 100 };
  g.all('.ex-maze-cell').forEach((cell, index) => { cell.rect = { left: left + index % 5 * width, top: top + Math.floor(index / 5) * width, width, height: width }; });
  return { maze, center: index => ({ clientX: left + (index % 5 + .5) * width, clientY: top + (Math.floor(index / 5) + .5) * width }) };
}

test('all twelve extensions register, mount, and remain inert in demo mode', () => {
  assert.equal(catalog.length, 12); assert.equal(new Set(catalog.map(item => item.id)).size, 12);
  for (const item of catalog) {
    const g = game(item.id, { demo: true });
    g.all('button').forEach(button => button.click()); g.tick(15000);
    assert.equal(g.completions, 0); assert.equal(g.feedback.length, 0);
    g.destroy(); assert.equal(g.container.children.length, 0);
  }
});
test('extras expose concise objectives with consistent category colors', () => {
  const expected = { match: ['MATCH', 'sage'], roll: ['TURN UPRIGHT', 'sage'], type: ['TYPE THE WORD', 'lavender'], maze: ['DRAG TO EXIT', 'blue'], sign: ['SIGN HERE', 'sage'], memory: ['REMEMBER', 'lavender'], level: ['SLIDE TO MARKS', 'blue'], catch: ['CATCH IT', 'sage'], upload: ['UPLOAD', 'peach'], connect: ['JOIN PIPES', 'blue'], dice: ['TAP LOW TO HIGH', 'butter'] };
  expected.aim = ['TAP TARGETS', 'sage'];
  catalog.forEach(item => assert.deepEqual([item.title, item.color], expected[item.id]));
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
test('generated mazes have varied walls and every mounted maze completes by continuously dragging the dot', () => {
  const layouts = new Set(), endpoints = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const puzzle = puzzles.generateMaze(seeded(seed)); const g = game('maze', { random: seeded(seed) });
    layouts.add(puzzle.cells.join(',')); endpoints.add(`${puzzle.start},${puzzle.end}`);
    const route = puzzles.solveMaze(puzzle); assert.ok(route.length >= 8);
    const { maze, center } = mazeGeometry(g);
    assert.equal(g.all('button').length, 0); assert.equal(g.all('.ex-maze-controls').length, 0);
    assert.equal(maze.tabIndex, 0); assert.match(maze.getAttribute('aria-label'), /drag.*arrow keys/i);
    maze.dispatch('pointerdown', center(route[0]));
    for (const cell of route.slice(1)) maze.dispatch('pointermove', center(cell));
    assert.equal(maze.captured, null); completedOnce(g);
  }
  assert.ok(layouts.size > 70); assert.ok(endpoints.size > 15);
});
test('maze checks every crossed passage during a fast straight swipe and stops before walls', () => {
  const g = game('maze'); const { maze, center } = mazeGeometry(g);
  maze.dispatch('pointerdown', center(0)); maze.dispatch('pointermove', center(4));
  assert.equal(g.one('.is-player').getAttribute('data-cell'), '4');
  // The entire eastward corridor is open, but the outer east wall remains closed.
  maze.dispatch('pointermove', { ...center(4), clientX: center(4).clientX + 80 });
  assert.equal(g.one('.is-player').getAttribute('data-cell'), '4'); assert.equal(maze.captured, 1);
  assert.equal(g.completions, 0); assert.equal(g.feedback.includes('error'), false);
  maze.dispatch('pointermove', center(4)); maze.dispatch('pointerup', center(24));
  assert.equal(g.one('.is-player').getAttribute('data-cell'), '24'); assert.equal(maze.captured, null);
});
test('maze cannot jump through walls or cut diagonally across cell corners', () => {
  const g = game('maze'); const { maze, center } = mazeGeometry(g);
  maze.dispatch('pointerdown', center(10)); assert.equal(maze.captured, undefined);
  maze.dispatch('pointerdown', center(0)); maze.dispatch('pointermove', center(10));
  assert.equal(g.one('.is-player').getAttribute('data-cell'), '0'); assert.equal(maze.captured, 1);
  maze.dispatch('pointermove', center(0)); maze.dispatch('pointermove', center(6));
  assert.equal(g.one('.is-player').getAttribute('data-cell'), '1'); assert.equal(maze.captured, 1);
  // A right-then-down route exists in this toy maze, but its corner is not a passage.
  const corner = { width: 2, height: 2, cells: [2, 12, 0, 1] };
  const trace = puzzles.traceMazeSegment(corner, 0, [.5, .5], [1.5, 1.5]);
  assert.equal(trace.blocked, true); assert.equal(trace.cell, 0); assert.equal(trace.visited.length, 0);
  // Check the intermediate wall even when both sampled positions are several cells apart.
  const corridor = { width: 5, height: 1, cells: [2, 8, 2, 10, 8] };
  const skippedWall = puzzles.traceMazeSegment(corridor, 0, [.5, .5], [4.5, .5]);
  assert.equal(skippedWall.blocked, true); assert.equal(skippedWall.cell, 1);
  assert.deepEqual(Array.from(skippedWall.visited), [1]);
});
test('maze dot and trail move continuously inside cells, clamp at walls, and resume without re-grabbing', () => {
  const g = game('maze'); const { maze, center } = mazeGeometry(g); const dot = g.one('.ex-maze-dot');
  const start = center(0); maze.dispatch('pointerdown', start);
  maze.dispatch('pointermove', { clientX: start.clientX + 4, clientY: start.clientY + 6 });
  assert.equal(g.one('.is-player').getAttribute('data-cell'), '0');
  assert.ok(Math.abs(Number(dot.getAttribute('cx')) - .7) < 1e-9); assert.ok(Math.abs(Number(dot.getAttribute('cy')) - .8) < 1e-9);
  assert.match(g.one('.ex-maze-ink').getAttribute('d'), /L0\.700 0\.800/);
  maze.dispatch('pointermove', { clientX: start.clientX + 4, clientY: start.clientY + 25 });
  assert.equal(maze.captured, 1); assert.ok(Number(dot.getAttribute('cy')) > .9 && Number(dot.getAttribute('cy')) < 1);
  maze.dispatch('pointermove', center(1));
  assert.equal(g.one('.is-player').getAttribute('data-cell'), '1'); assert.equal(Number(dot.getAttribute('cx')), 1.5);
  assert.equal(maze.captured, 1);
});
test('maze grip preserves the offset and does not snap the dot to a cell center', () => {
  const g = game('maze'); const { maze, center } = mazeGeometry(g); const dot = g.one('.ex-maze-dot');
  const start = center(0);
  maze.dispatch('pointerdown', { ...start, clientX: start.clientX + 4 });
  assert.equal(Number(dot.getAttribute('cx')), .5);
  maze.dispatch('pointermove', { ...start, clientX: start.clientX + 8 });
  assert.ok(Math.abs(Number(dot.getAttribute('cx')) - .7) < 1e-9);
  maze.dispatch('pointercancel');
  maze.dispatch('pointerdown', { ...start, clientX: start.clientX + 4 });
  assert.ok(Math.abs(Number(dot.getAttribute('cx')) - .7) < 1e-9);
  maze.dispatch('pointermove', { ...start, clientX: start.clientX + 6 });
  assert.ok(Math.abs(Number(dot.getAttribute('cx')) - .8) < 1e-9);
});
test('maze processes coalesced bend samples instead of cutting across a turn', () => {
  const g = game('maze'); const { maze, center } = mazeGeometry(g);
  maze.dispatch('pointerdown', center(0));
  maze.dispatch('pointermove', { ...center(9), getCoalescedEvents: () => [center(1), center(2), center(3), center(4)] });
  assert.equal(g.one('.is-player').getAttribute('data-cell'), '9'); assert.equal(maze.captured, 1);
});
test('maze keeps one pointer owner, preserves valid progress on cancel, and requires re-grabbing the dot', () => {
  for (const cancellation of ['pointercancel', 'lostpointercapture']) {
    const g = game('maze'); const { maze, center } = mazeGeometry(g);
    maze.dispatch('pointerdown', { ...center(0), pointerId: 7 });
    maze.dispatch('pointerdown', { ...center(0), pointerId: 8 });
    maze.dispatch('pointermove', { ...center(4), pointerId: 8 }); maze.dispatch('pointerup', { ...center(4), pointerId: 8 });
    maze.dispatch('keydown', { key: 'ArrowRight' }); assert.equal(g.one('.is-player').getAttribute('data-cell'), '0');
    assert.equal(maze.captured, 7);
    maze.dispatch('pointermove', { ...center(1), pointerId: 7 });
    maze.dispatch(cancellation, { pointerId: 8 }); assert.equal(maze.captured, 7);
    maze.dispatch(cancellation, { pointerId: 7 }); assert.equal(maze.captured, null);
    maze.dispatch('pointermove', { ...center(4), pointerId: 7 }); assert.equal(g.one('.is-player').getAttribute('data-cell'), '1');
    maze.dispatch('pointerdown', center(0)); assert.equal(maze.captured, null);
    maze.dispatch('pointerdown', center(1)); maze.dispatch('pointermove', center(4)); assert.equal(g.one('.is-player').getAttribute('data-cell'), '4');
    g.destroy(); assert.equal(maze.captured, null); assert.equal(g.container.children.length, 0);
    maze.dispatch('pointermove', center(24)); assert.equal(g.completions, 0);
  }
});
test('maze keeps keyboard arrow movement accessible while exposing no movement buttons', () => {
  const g = game('maze'); const maze = g.one('.ex-maze-grid');
  maze.dispatch('keydown', { key: 'ArrowDown' }); assert.equal(g.feedback.at(-1), 'error');
  const route = puzzles.solveMaze(puzzles.generateMaze(() => 0));
  for (let i = 1; i < route.length; i++) {
    const diff = route[i] - route[i - 1];
    maze.dispatch('keydown', { key: diff === 1 ? 'ArrowRight' : diff === -1 ? 'ArrowLeft' : diff === 5 ? 'ArrowDown' : 'ArrowUp' });
  }
  completedOnce(g);
});
test('sign accepts arbitrary substantial freehand strokes from any starting point on release', () => {
  const strokes = [
    [[10, 45], [140, 45]], [[150, 70], [130, 20], [110, 70], [85, 30], [50, 65], [15, 40]],
    [[80, 15], [125, 30], [130, 75], [70, 90], [25, 60], [35, 20]],
    [[15, 80], [30, 20], [45, 80], [70, 35], [95, 70], [145, 55]],
  ];
  for (const stroke of strokes) {
    const g = game('sign'); const paper = g.one('.ex-sign-paper');
    assert.equal(g.all('.ex-sign-guide').length, 0); assert.match(paper.getAttribute('aria-label'), /any long signature.*Enter/);
    drawSignature(paper, stroke, 1, false); assert.equal(g.completions, 0);
    paper.dispatch('pointerup'); completedOnce(g); assert.equal(paper.captured, null);
  }
});
test('free signature rejects taps, short strokes, and accumulated tiny jitter', () => {
  const g = game('sign'); const paper = g.one('.ex-sign-paper');
  for (const stroke of [[[20, 30]], [[10, 20], [30, 30]], Array.from({ length: 100 }, (_, i) => [70 + i % 2 * 3, 50 + i % 3])]) {
    drawSignature(paper, stroke); assert.equal(g.completions, 0); assert.equal(g.one('.ex-sign-ink').getAttribute('d'), '');
  }
});
test('free signature owns its pointer and cancels outside-box, coalesced outside, and interrupted strokes', () => {
  const valid = [[15, 80], [30, 20], [60, 65], [100, 35], [140, 70]];
  for (const cancellation of ['pointercancel', 'lostpointercapture', 'outside', 'coalesced']) {
    const g = game('sign'); const paper = g.one('.ex-sign-paper');
    drawSignature(paper, valid.slice(0, 3), 7, false);
    paper.dispatch('pointerdown', { clientX: 120, clientY: 0, pointerId: 8 });
    paper.dispatch('pointermove', { clientX: 150, clientY: 80, pointerId: 8 });
    paper.dispatch('pointerup', { pointerId: 8 }); paper.dispatch('keydown', { key: 'Enter' });
    assert.equal(g.completions, 0); assert.equal(paper.captured, 7);
    if (cancellation === 'outside') paper.dispatch('pointermove', { clientX: 180, clientY: 50, pointerId: 7 });
    else if (cancellation === 'coalesced') paper.dispatch('pointermove', { clientX: 130, clientY: 50, pointerId: 7, getCoalescedEvents: () => [{ clientX: -10, clientY: 50 }] });
    else paper.dispatch(cancellation, { pointerId: 7 });
    paper.dispatch('pointerup', { pointerId: 7 }); assert.equal(g.completions, 0); assert.equal(paper.captured, null);
    drawSignature(paper, valid); completedOnce(g);
  }
});
test('free signature has an explicit Enter-key accessible alternative', () => {
  const g = game('sign'); const paper = g.one('.ex-sign-paper');
  paper.click(); paper.dispatch('keydown', { key: 'Enter', repeat: true }); assert.equal(g.completions, 0);
  paper.dispatch('keydown', { key: 'Enter', repeat: false }); completedOnce(g);
});
test('memory waits for Start, uses five mixed characters, and allows a deliberate retry', () => {
  for(let seed=1;seed<=60;seed++){
    const g=game('memory',{random:seeded(seed)}), code=g.one('.ex-memory-code').textContent;
    assert.match(code,/^[A-Z2-9]{5}$/);assert.match(code,/[A-Z]/);assert.match(code,/[2-9]/);
    g.tick(12000);assert.equal(g.one('.ex-memory-code').textContent,code);assert.equal(g.one('.ex-mini-keys').hidden,true);
    g.label('Recall '+code[0]).click();assert.equal(g.completions,0);
    g.label('Start recall').click();assert.equal(g.one('.ex-memory-code').textContent,'·····');assert.equal(g.one('.ex-mini-keys').hidden,false);
    const wrong=g.all('.ex-key').find(k=>k.getAttribute('aria-label').startsWith('Recall ')&&k.textContent!==code[0]);
    wrong.click();assert.equal(g.one('.ex-memory-code').textContent,code);assert.equal(g.one('.ex-mini-keys').hidden,true);
    g.label('Start recall').click();[...code].forEach(c=>g.label('Recall '+c).click());completedOnce(g);
  }
});
test('Match requires color and shape, permits retries, and every target can be stopped', () => {
  for(let seed=1;seed<=60;seed++){
    const g=game('match',{random:seeded(seed)}),target=g.one('.ex-match-shape').getAttribute('aria-label');
    const reel=g.one('.ex-match-strip').children, index=reel.findIndex(el=>el.getAttribute('aria-label')===target);
    const wrong=(index+1)%9;
    g.tick(wrong*620);g.one('.ex-match-stop').click();assert.equal(g.completions,0);assert.equal(g.feedback.at(-1),'error');
    const next=((index<=wrong+1?9:0)+index)*620;
    g.tick(next);g.one('.ex-match-stop').click();completedOnce(g);
  }
});
test('claw arrows give a tiny tap nudge, continuous hold, and a release swing that settles',()=>{
  const g=game('catch'),claw=g.one('.ex-claw'),initial=Number(claw.getAttribute('aria-valuenow'));
  const right=g.label('Move claw right');
  right.dispatch('pointerdown'); g.tick(16,16); right.dispatch('pointerup'); right.dispatch('click',{detail:1});
  assert.equal(Number(claw.getAttribute('aria-valuenow')),initial+1);
  assert.notEqual(claw.style['--claw-swing'],'0.00deg');
  for(let t=32;t<=1000;t+=16)g.tick(t,16);
  assert.equal(Number(claw.getAttribute('aria-valuenow')),initial+1);
  right.dispatch('pointerdown');
  for(let t=1016;t<=1600;t+=16)g.tick(t,16);
  const heldPosition=Number(claw.getAttribute('aria-valuenow'));
  assert.ok(heldPosition>initial+15 && heldPosition<initial+35);
  right.dispatch('pointerup');
  let maxSwing=0;
  for(let t=1616;t<=4000;t+=16){g.tick(t,16);maxSwing=Math.max(maxSwing,Math.abs(parseFloat(claw.style['--claw-swing'])));}
  assert.ok(maxSwing>6);assert.ok(Math.abs(parseFloat(claw.style['--claw-swing']))<.1);
  assert.equal(Number(claw.getAttribute('aria-valuenow')),heldPosition);
  g.label('Drop claw').click();right.dispatch('pointerdown');g.tick(4100,16);
  assert.equal(Number(claw.getAttribute('aria-valuenow')),heldPosition);
});

test('claw holds move on every frame from the first press, with no nudge-pause-restart', () => {
  const endPositions = [];
  for (const fps of [30, 60, 120]) {
    const g = game('catch'), right = g.label('Move claw right'), claw = g.one('.ex-claw');
    let previous = parseFloat(claw.style.left), lastStep = 0;
    right.dispatch('pointerdown');
    assert.equal(parseFloat(claw.style.left), previous, 'pressing does not teleport the claw');
    const frames = Math.round(fps * .6);
    for (let frame = 1; frame <= frames; frame++) {
      g.tick(frame * 1000 / fps, 1000 / fps);
      const position = parseFloat(claw.style.left), step = position - previous;
      assert.ok(step > 0, 'every held frame moves, including the first 120ms');
      assert.ok(step >= lastStep - .00001, 'acceleration never stalls or reverses');
      previous = position; lastStep = step;
    }
    endPositions.push(previous); right.dispatch('pointerup'); g.tick(700, 16);
    assert.equal(parseFloat(claw.style.left), previous, 'release stops horizontal travel');
  }
  assert.ok(Math.max(...endPositions) - Math.min(...endPositions) < .00001);
});

test('a claw tap between frames nudges once, while a cancelled press does not move', () => {
  const g = game('catch'), right = g.label('Move claw right'), claw = g.one('.ex-claw');
  const initial = parseFloat(claw.style.left);
  right.dispatch('pointerdown'); right.dispatch('pointerup'); right.dispatch('click', {detail: 1});
  assert.equal(parseFloat(claw.style.left), initial + 1);
  right.dispatch('pointerdown'); right.dispatch('pointercancel');
  assert.equal(parseFloat(claw.style.left), initial + 1);
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

test('Match accepts a tile tap, keeps scrolling during cooldown, and blocks repeated guesses', () => {
  const g = game('match'), root = g.one('.mg-match'), stop = g.one('.ex-match-stop'), strip = g.one('.ex-match-strip');
  const target = g.one('.ex-match-shape').getAttribute('aria-label');
  const index = strip.children.findIndex(el => el.getAttribute('aria-label') === target);
  const wrong = (index + 1) % 9, missedAt = wrong * 620;
  g.tick(missedAt); root.dispatch('click'); assert.equal(g.feedback.at(-1), 'error');
  const before = strip.style.transform;
  g.tick(missedAt + 400); assert.notEqual(strip.style.transform, before); assert.equal(stop.disabled, true);
  for (let i = 0; i < 10; i++) root.dispatch('click');
  assert.equal(g.feedback.length, 1); assert.equal(g.completions, 0);
  g.tick(missedAt + 749); assert.equal(stop.disabled, true);
  g.tick(missedAt + 750); assert.equal(stop.disabled, false);
  g.tick(((index <= wrong + 1 ? 9 : 0) + index) * 620); root.dispatch('click'); completedOnce(g);
});

test('claw holds have one owner and release on cancel, capture loss, blur, pause, or the matching key', () => {
  for (const cancel of ['pointercancel', 'lostpointercapture', 'blur', 'pause']) {
    const g = game('catch'), left = g.label('Move claw left'), right = g.label('Move claw right'), claw = g.one('.ex-claw');
    left.dispatch('pointerdown', {pointerId: 7}); right.dispatch('pointerdown', {pointerId: 8});
    left.dispatch('pointerup', {pointerId: 8}); g.tick(300, 32);
    assert.equal(left.captured, 7); assert.equal(right.captured, undefined);
    if (cancel === 'pause') g.suspend(); else left.dispatch(cancel, {pointerId: 7});
    const at = claw.getAttribute('aria-valuenow');
    g.tick(600, 32); assert.equal(claw.getAttribute('aria-valuenow'), at); assert.equal(left.captured, null);
    right.dispatch('keydown', {key: 'Enter'}); g.tick(900, 32);
    right.dispatch('keyup', {key: ' '}); assert.ok(right.classList.contains('is-held'));
    right.dispatch('keyup', {key: 'Enter'}); assert.equal(right.classList.contains('is-held'), false);
    g.destroy();
  }
});

test('claw rod follows a slow descent, a grab pause, and retraction before completion', () => {
  const g = game('catch'), claw = g.one('.ex-claw'), rod = g.one('.ex-claw-rod');
  g.one('.ex-catch-machine').rect = {height: 100, width: 120}; claw.rect = {height: 40, width: 40};
  g.one('.ex-catch-prize').rect = {height: 24, width: 24};
  dragTo(claw, 20); g.label('Drop claw').click();
  g.tick(350); const halfway = parseFloat(rod.style.height); assert.ok(halfway > 8);
  g.tick(700); const bottom = parseFloat(rod.style.height); assert.ok(bottom > halfway);
  assert.equal(g.completions, 0); g.tick(850); assert.equal(parseFloat(rod.style.height), bottom);
  g.tick(1150); assert.ok(parseFloat(rod.style.height) < bottom); assert.ok(parseFloat(rod.style.height) > 8);
  g.tick(1450); assert.equal(parseFloat(rod.style.height), 8); completedOnce(g);
});

test('maze slides around an open corner and recovers from exact wall junctions', () => {
  const corner = {width: 2, height: 2, cells: [2, 12, 0, 1]};
  for (const from of [[.5, .5], [.999, .999], [1, 1]]) {
    const slide = puzzles.slideMazeSegment(corner, 0, from, [1.5, 1.5]);
    assert.equal(slide.cell, 3); assert.deepEqual(Array.from(slide.visited), [1, 3]);
    assert.ok(Math.hypot(slide.point[0] - 1.5, slide.point[1] - 1.5) < .01);
  }
  const closed = {width: 2, height: 2, cells: [2, 8, 0, 0]};
  const slide = puzzles.slideMazeSegment(closed, 0, [.999, .999], [1.5, 1.5]);
  assert.equal(slide.cell, 1); assert.deepEqual(Array.from(slide.visited), [1]);
});

test('aim is player-started, fades in for 500ms, and requires all six timed targets', () => {
  const g = game('aim'); g.tick(4000); assert.equal(g.all('.ex-aim-target').length, 0);
  g.label('Start aim trainer').click(); assert.equal(g.all('.ex-aim-target').length, 1);
  const first = g.label('Target 1'); first.click(); assert.equal(g.feedback.length, 1);
  g.tick(4250); assert.equal(first.style.opacity, '0.5');
  g.label('Start aim trainer').click(); assert.equal(g.all('.ex-aim-target').length, 1);
  g.tick(4499); first.click(); assert.equal(g.feedback.length, 1);
  for (let i = 1; i <= 6; i++) {
    g.tick(4000 + i * 500); const target = g.label('Target ' + i);
    assert.ok(target.classList.contains('is-ready')); target.dispatch('pointerdown'); target.click();
    assert.equal(g.feedback.length, i + 1);
    if (i < 6) assert.equal(g.completions, 0);
  }
  completedOnce(g);
});

test('aim misses reset the tile, cannot accept expired or stale targets, and use active time', () => {
  const g = game('aim'); g.label('Start aim trainer').click(); const first = g.label('Target 1');
  g.tick(999); for (let i = 0; i < 10; i++) g.tick(999);
  assert.equal(g.label('Start aim trainer').hidden, true);
  g.tick(1000); assert.equal(g.all('.ex-aim-target').length, 0); assert.equal(g.label('Start aim trainer').hidden, false);
  assert.equal(g.completions, 0); g.label('Start aim trainer').click();
  first.dispatch('pointerdown'); assert.equal(g.label('Start aim trainer').hidden, true);
  g.tick(1500); g.label('Target 1').click();
  g.tick(2500); assert.equal(g.all('.ex-aim-target').length, 0); assert.equal(g.completions, 0);
  g.label('Start aim trainer').click(); g.tick(9000); assert.equal(g.all('.ex-aim-target').length, 0);
  g.label('Start aim trainer').click(); g.destroy(); g.tick(10000); assert.equal(g.completions, 0);
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
  assert.equal(g.all('button').length, 3);
  g.label('Drop claw').click(); claw.dispatch('keydown', { key: 'ArrowLeft' });
  claw.dispatch('pointerdown', { clientX: 60 }); assert.equal(claw.captured, undefined);
  g.tick(1449); assert.equal(g.completions, 0); assert.equal(g.label('Drop claw').disabled, true);
  g.tick(1450); assert.equal(g.label('Drop claw').disabled, false);
  dragTo(claw, target, { release: false }); g.label('Drop claw').click(); g.tick(1600); assert.equal(g.completions, 0);
  claw.dispatch('pointerup'); g.label('Drop claw').click();
  g.tick(2300); assert.equal(g.completions, 0); assert.ok(g.one('.ex-catch-prize').classList.contains('is-held'));
  g.tick(3049); assert.equal(g.completions, 0); g.tick(3050); completedOnce(g);
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
    handle.dispatch('pointerdown', { clientX: 60, clientY: 35 }); assert.equal(handle.captured, 1);
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
