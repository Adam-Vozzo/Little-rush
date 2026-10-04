const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.className = ''; this.attributes = {}; this.style = {}; this.events = new Map();
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      add: (...values) => { this.className += ` ${values.join(' ')}`; },
      remove: (...values) => { this.className = this.className.split(/\s+/).filter(value => !values.includes(value)).join(' '); },
      toggle: (value, force) => { const on = force ?? !this.classList.contains(value); this.classList[on ? 'add' : 'remove'](value); },
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  set innerHTML(value) {
    this.children = [];
    for (const match of value.matchAll(/<([a-z][\w-]*)\b[^>]*class="([^"]+)"[^>]*>/gi)) {
      const child = new Element(match[1]); child.className = match[2]; this.append(child);
    }
  }
  querySelectorAll(selector) {
    const matches = element => selector.startsWith('.') ? element.classList.contains(selector.slice(1)) : element.tagName === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(name, handler) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(handler); }
  removeEventListener(name, handler) { this.events.get(name)?.delete(handler); }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 120, height: 70 }; }
  fire(name, values = {}) {
    if (name === 'click' && this.disabled) return;
    for (const handler of this.events.get(name) ?? []) handler({ preventDefault() {}, pointerId: 1, pointerType: 'touch', button: 0, ...values });
  }
}
let mount;
const window = { LittleRushGames: { register(items, mounter) { mount = mounter; } } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extra-games.js'), 'utf8'), { window, document: { createElement: tag => new Element(tag) } });
const puzzles = window.LittleRushPuzzles;
const randomFor = seed => {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
};
const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function adjacent(cell, side, width, height) {
  const x = cell % width + offsets[side][0];
  const y = Math.floor(cell / width) + offsets[side][1];
  return x < 0 || x >= width || y < 0 || y >= height ? -1 : y * width + x;
}
function reachable(cells, start, width, height) {
  const seen = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i];
    for (let side = 0; side < 4; side++) {
      if (!(cells[from] & (1 << side))) continue;
      const to = adjacent(from, side, width, height);
      if (to < 0 || !(cells[to] & (1 << ((side + 2) % 4))) || seen.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return seen;
}
function routeTo(maze, end = maze.end) {
  const previous = new Map([[maze.start, null]]), queue = [maze.start];
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    for (let side = 0; side < 4; side++) {
      const next = adjacent(cell, side, maze.width, maze.height);
      if (next < 0 || previous.has(next) || !(maze.cells[cell] & (1 << side)) || !(maze.cells[next] & (1 << ((side + 2) % 4)))) continue;
      previous.set(next, cell); queue.push(next);
    }
  }
  assert.ok(previous.has(end));
  const route = [];
  for (let cell = end; cell !== null; cell = previous.get(cell)) route.unshift(cell);
  return route;
}
function pipeMask(type, rotation) {
  const base = type === 'bend' ? [0, 1] : [1, 3];
  return base.reduce((mask, side) => mask | (1 << ((side + rotation) % 4)), 0);
}
function isConnected(puzzle, rotations) {
  const cells = puzzle.types.map((type, index) => pipeMask(type, rotations[index]));
  if (!(cells[puzzle.start] & (1 << puzzle.entry)) || !(cells[puzzle.end] & (1 << puzzle.exit))) return false;
  return reachable(cells, puzzle.start, puzzle.width, puzzle.height).has(puzzle.end);
}
function game(type, seed = 0) {
  const container = new Element('div');
  let completions = 0;
  const controller = mount(container, type, { random: randomFor(seed), onComplete: () => completions++ });
  return { ...controller, container, get completions() { return completions; }, one: selector => container.querySelector(selector), all: selector => container.querySelectorAll(selector) };
}
const pointerAt = ([clientX, clientY]) => ({ clientX, clientY });
function mazeGame(seed) {
  const maze = puzzles.generateMaze(randomFor(seed));
  const g = game('maze', seed), grid = g.one('.ex-maze-grid'), cells = g.all('.ex-maze-cell');
  cells.forEach((cell, index) => {
    cell.getBoundingClientRect = () => ({ left: 13 + index % maze.width * 20, top: 17 + Math.floor(index / maze.width) * 20, width: 20, height: 20 });
  });
  const at = cell => ({ clientX: 13 + (cell % maze.width + .5) * 20, clientY: 17 + (Math.floor(cell / maze.width) + .5) * 20 });
  const current = () => Number(g.one('.is-player').getAttribute('data-cell'));
  return { ...g, get completions() { return g.completions; }, maze, grid, cells, at, current };
}
function moveSlider(handle, value, { pointerId = 1, release = true } = {}) {
  const initial = Number(handle.getAttribute('aria-valuenow'));
  // Grabbing the right edge of the thumb must preserve this arbitrary offset.
  const clientX = initial * 1.2 + 7;
  handle.fire('pointerdown', { clientX, pointerId });
  handle.fire('pointermove', { clientX: clientX + (value - initial) * 1.2, pointerId });
  if (release) handle.fire('pointerup', { pointerId });
}

test('independent review: 1000 generated mazes are reciprocal connected trees with reachable distinct exits', () => {
  const layouts = new Set();
  for (let seed = 0; seed < 1000; seed++) {
    const maze = puzzles.generateMaze(randomFor(seed));
    assert.equal(maze.cells.length, maze.width * maze.height);
    assert.notEqual(maze.start, maze.end);
    const seen = reachable(maze.cells, maze.start, maze.width, maze.height);
    assert.equal(seen.size, maze.cells.length, `Unreachable maze cells for seed ${seed}`);
    assert.ok(seen.has(maze.end));
    let connections = 0;
    maze.cells.forEach((mask, cell) => {
      for (let side = 0; side < 4; side++) {
        if (!(mask & (1 << side))) continue;
        const next = adjacent(cell, side, maze.width, maze.height);
        assert.ok(next >= 0, `Passage outside maze for seed ${seed}`);
        assert.ok(maze.cells[next] & (1 << ((side + 2) % 4)), `One-way passage for seed ${seed}`);
        connections++;
      }
    });
    assert.equal(connections / 2, maze.cells.length - 1);
    layouts.add(`${maze.start}:${maze.end}:${maze.cells.join(',')}`);
  }
  assert.ok(layouts.size > 900, `Only ${layouts.size} unique mazes`);
});

test('independent review: 200 generated mazes solve by dragging and display no movement buttons', () => {
  for (let seed = 0; seed < 200; seed++) {
    const g = mazeGame(seed), route = routeTo(g.maze);
    assert.equal(g.all('button').length, 0);
    assert.equal(g.all('.ex-maze-controls').length, 0);
    g.grid.fire('pointerdown', g.at(route[0]));
    assert.equal(g.grid.captured, 1);
    route.slice(1).forEach(cell => g.grid.fire('pointermove', g.at(cell)));
    assert.equal(g.current(), g.maze.end, `Drag failed to reach exit for seed ${seed}`);
    assert.equal(g.completions, 1);
    assert.equal(g.grid.captured, null);
    g.destroy();
  }
});

test('independent review: fast maze swipes stop at every intervening wall instead of jumping cells', () => {
  for (let seed = 0; seed < 100; seed++) {
    for (let side = 0; side < 4; side++) {
      const g = mazeGame(seed);
      let expected = g.maze.start;
      while (true) {
        const next = adjacent(expected, side, g.maze.width, g.maze.height);
        if (next < 0 || !(g.maze.cells[expected] & (1 << side)) || !(g.maze.cells[next] & (1 << ((side + 2) % 4)))) break;
        expected = next;
        if (expected === g.maze.end) break;
      }
      const from = g.at(g.maze.start);
      g.grid.fire('pointerdown', from);
      g.grid.fire('pointermove', { clientX: from.clientX + offsets[side][0] * 1000, clientY: from.clientY + offsets[side][1] * 1000 });
      assert.equal(g.current(), expected, `Wall skipped for seed ${seed}, direction ${side}`);
      assert.equal(g.grid.captured, g.completions ? null : 1);
      if (!g.completions) {
        g.grid.fire('pointermove', from);
        assert.equal(g.current(), g.maze.start, 'A wall hit must allow recovery without lifting');
        routeTo(g.maze).slice(1).forEach(cell => g.grid.fire('pointermove', g.at(cell)));
        assert.equal(g.completions, 1, 'The same gesture should continue to the exit after a wall hit');
      }
      g.destroy();
    }
  }
});

test('independent review: diagonal corner cuts and re-grabbing another cell cannot teleport the maze dot', () => {
  for (let seed = 0; seed < 100; seed++) {
    const g = mazeGame(seed);
    const x = g.maze.start % g.maze.width, y = Math.floor(g.maze.start / g.maze.width);
    const diagonal = (y + (y < g.maze.height - 1 ? 1 : -1)) * g.maze.width + x + (x < g.maze.width - 1 ? 1 : -1);
    g.grid.fire('pointerdown', g.at(diagonal));
    assert.notEqual(g.grid.captured, 1);
    assert.equal(g.current(), g.maze.start);
    g.grid.fire('pointerdown', g.at(g.maze.start));
    g.grid.fire('pointermove', g.at(diagonal));
    assert.equal(g.current(), g.maze.start);
    assert.equal(g.grid.captured, 1);
    assert.equal(g.completions, 0);
    g.grid.fire('pointermove', g.at(g.maze.start));
    routeTo(g.maze).slice(1).forEach(cell => g.grid.fire('pointermove', g.at(cell)));
    assert.equal(g.completions, 1);
    g.destroy();
  }
});

test('independent review: maze dot and trail move continuously within cells without jumping at grab time', () => {
  const g = mazeGame(7), from = g.at(g.maze.start), dot = g.one('.ex-maze-dot'), ink = g.one('.ex-maze-ink');
  const startX = Number(dot.getAttribute('cx')), startY = Number(dot.getAttribute('cy'));
  const initialTrail = ink.getAttribute('d');
  g.grid.fire('pointerdown', { clientX: from.clientX + 5, clientY: from.clientY });
  assert.equal(Number(dot.getAttribute('cx')), startX);
  g.grid.fire('pointermove', { clientX: from.clientX + 8, clientY: from.clientY + 2 });
  assert.ok(Math.abs(Number(dot.getAttribute('cx')) - startX - .15) < 1e-9);
  assert.ok(Math.abs(Number(dot.getAttribute('cy')) - startY - .1) < 1e-9);
  assert.equal(g.current(), g.maze.start);
  assert.notEqual(ink.getAttribute('d'), initialTrail);
  g.grid.fire('pointerup');
  assert.equal(g.grid.captured, null);
  assert.equal(g.completions, 0);
});

test('independent review: maze cancellation preserves progress and requires the same dot to be grabbed again', () => {
  for (const cancellation of ['pointercancel', 'lostpointercapture']) {
    const g = mazeGame(30), route = routeTo(g.maze);
    g.grid.fire('pointerdown', g.at(route[0]));
    g.grid.fire('pointermove', g.at(route[1]));
    g.grid.fire(cancellation);
    assert.equal(g.current(), route[1]);
    assert.equal(g.grid.captured, null);
    g.grid.fire('pointermove', g.at(route[2]));
    assert.equal(g.current(), route[1]);
    g.grid.fire('pointerdown', g.at(route[0]));
    assert.equal(g.grid.captured, null);
    g.grid.fire('pointerdown', g.at(route[1]));
    route.slice(2).forEach(cell => g.grid.fire('pointermove', g.at(cell)));
    assert.equal(g.completions, 1);
  }
});

test('independent review: a second finger and keyboard cannot alter an owned maze stroke', () => {
  const g = mazeGame(45), route = routeTo(g.maze);
  const firstSide = offsets.findIndex(([dx, dy]) => route[0] % 5 + dx === route[1] % 5 && Math.floor(route[0] / 5) + dy === Math.floor(route[1] / 5));
  const key = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][firstSide];
  g.grid.fire('pointerdown', g.at(route[0]));
  g.grid.fire('pointerdown', { ...g.at(route[0]), pointerId: 2 });
  g.grid.fire('pointermove', { ...g.at(route[1]), pointerId: 2 });
  g.grid.fire('pointerup', { ...g.at(route[1]), pointerId: 2 });
  g.grid.fire('pointercancel', { pointerId: 2 });
  g.grid.fire('keydown', { key });
  assert.equal(g.current(), route[0]);
  assert.equal(g.grid.captured, 1);
  route.slice(1).forEach(cell => g.grid.fire('pointermove', g.at(cell)));
  assert.equal(g.completions, 1);
});

test('independent review: maze reads coalesced turns and permits keyboard-only navigation', () => {
  const g = mazeGame(100), route = routeTo(g.maze);
  g.grid.fire('pointerdown', g.at(route[0]));
  g.grid.fire('pointermove', { ...g.at(route.at(-1)), getCoalescedEvents: () => route.slice(1).map(cell => g.at(cell)) });
  assert.equal(g.completions, 1);
  const keyboard = mazeGame(100);
  for (let i = 1; i < route.length; i++) {
    const side = offsets.findIndex(([dx, dy]) => route[i - 1] % 5 + dx === route[i] % 5 && Math.floor(route[i - 1] / 5) + dy === Math.floor(route[i] / 5));
    keyboard.grid.fire('keydown', { key: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][side] });
  }
  assert.equal(keyboard.completions, 1);
});

test('independent review: 1000 pipe layouts begin unsolved and their intended rotations connect external anchors', () => {
  const layouts = new Set();
  for (let seed = 0; seed < 1000; seed++) {
    const pipe = puzzles.generatePipes(randomFor(seed));
    assert.equal(pipe.types.length, pipe.width * pipe.height);
    assert.notEqual(pipe.start, pipe.end);
    assert.equal(adjacent(pipe.start, pipe.entry, pipe.width, pipe.height), -1);
    assert.equal(adjacent(pipe.end, pipe.exit, pipe.width, pipe.height), -1);
    assert.ok(pipe.route.length >= 4 && pipe.route.length <= 6);
    assert.equal(new Set(pipe.route).size, pipe.route.length);
    assert.ok(pipe.solution.every(turn => Number.isInteger(turn) && turn >= 0 && turn <= 3));
    assert.ok(isConnected(pipe, pipe.solution), `Unsolvable intended route for seed ${seed}`);
    assert.equal(isConnected(pipe, pipe.rotations), false, `Already solved for seed ${seed}`);
    layouts.add(`${pipe.start}:${pipe.end}:${pipe.entry}:${pipe.exit}:${pipe.types.join(',')}:${pipe.rotations.join(',')}`);
  }
  assert.ok(layouts.size > 900, `Only ${layouts.size} unique pipe layouts`);
});

test('independent review: generated level targets are reachable and never begin near completion', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const levels = puzzles.generateLevels(randomFor(seed));
    assert.equal(levels.length, 3);
    levels.forEach(({ target, initial }) => {
      assert.ok(Number.isFinite(target) && target >= 20 && target <= 80);
      assert.ok(Number.isFinite(initial) && initial >= 0 && initial <= 100);
      assert.ok(Math.abs(initial - target) >= 25);
    });
  }
  assert.ok(puzzles.words.length >= 100);
  assert.equal(new Set(puzzles.words).size, puzzles.words.length);
});

test('independent review: 200 arbitrary signatures accept free strokes only when the owner releases', () => {
  for (let seed = 0; seed < 200; seed++) {
    const g = game('sign', seed), paper = g.one('.ex-sign-paper');
    paper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 160, height: 100 });
    const random = randomFor(seed);
    const from = [10 + random() * 25, 10 + random() * 80], to = [150, 10 + random() * 80];
    assert.equal(g.one('.ex-sign-guide'), null);
    paper.fire('pointerdown', pointerAt(from));
    paper.fire('pointermove', pointerAt(to));
    assert.equal(g.completions, 0, 'A signature must not complete while the finger is held');
    paper.fire('pointerup', pointerAt(to));
    assert.equal(g.completions, 1, `Free signature rejected for seed ${seed}`);
    assert.equal(paper.captured, null);
    g.destroy();
  }
});

test('independent review: taps, tiny jitter, and separately short signatures cannot bypass meaningful drawing', () => {
  const g = game('sign'), paper = g.one('.ex-sign-paper');
  paper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 160, height: 100 });
  paper.fire('click'); paper.fire('pointerdown', pointerAt([80, 50])); paper.fire('pointerup', pointerAt([80, 50]));
  assert.equal(g.completions, 0);
  paper.fire('pointerdown', pointerAt([80, 50]));
  for (let i = 0; i < 100; i++) paper.fire('pointermove', pointerAt([80 + (i % 2 ? -2 : 2), 50]));
  paper.fire('pointerup', pointerAt([80, 50]));
  assert.equal(g.completions, 0);
  for (let i = 0; i < 3; i++) {
    paper.fire('pointerdown', pointerAt([20, 50])); paper.fire('pointermove', pointerAt([75, 50])); paper.fire('pointerup', pointerAt([75, 50]));
  }
  assert.equal(g.completions, 0);
});

test('independent review: signature ownership blocks another finger and Enter from completing a held stroke', () => {
  const g = game('sign'), paper = g.one('.ex-sign-paper');
  paper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 160, height: 100 });
  paper.fire('pointerdown', pointerAt([10, 60]));
  paper.fire('pointermove', { ...pointerAt([150, 30]), pointerId: 2 });
  paper.fire('pointerup', { ...pointerAt([150, 30]), pointerId: 2 });
  paper.fire('pointercancel', { pointerId: 2 });
  paper.fire('keydown', { key: 'Enter' });
  assert.equal(g.completions, 0);
  assert.equal(paper.captured, 1);
  paper.fire('pointermove', pointerAt([150, 30])); paper.fire('pointerup', pointerAt([150, 30]));
  assert.equal(g.completions, 1);
});

test('independent review: canceled or out-of-box signatures reset before a new valid stroke', () => {
  for (const cancellation of ['pointercancel', 'lostpointercapture', 'outside']) {
    const g = game('sign'), paper = g.one('.ex-sign-paper');
    paper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 160, height: 100 });
    paper.fire('pointerdown', pointerAt([10, 60])); paper.fire('pointermove', pointerAt([150, 30]));
    if (cancellation === 'outside') {
      paper.fire('pointermove', { ...pointerAt([140, 60]), getCoalescedEvents: () => [pointerAt([170, 60]), pointerAt([140, 60])] });
    } else paper.fire(cancellation);
    paper.fire('pointerup', pointerAt([150, 30]));
    assert.equal(g.completions, 0, cancellation);
    assert.equal(paper.captured, null, cancellation);
    assert.equal(g.one('.ex-sign-ink').getAttribute('d'), '', cancellation);
    paper.fire('pointerdown', pointerAt([10, 40])); paper.fire('pointermove', pointerAt([150, 70])); paper.fire('pointerup', pointerAt([150, 70]));
    assert.equal(g.completions, 1, cancellation);
  }
});

test('independent review: free signature keyboard fallback requires a fresh Enter press', () => {
  const g = game('sign'), paper = g.one('.ex-sign-paper');
  paper.fire('keydown', { key: 'Enter', repeat: true }); paper.fire('click');
  assert.equal(g.completions, 0);
  paper.fire('keydown', { key: 'Enter', repeat: false });
  assert.equal(g.completions, 1);
});

test('independent review: level rail taps and thumb taps cannot jump values; actual drags align all targets', () => {
  for (let seed = 0; seed < 100; seed++) {
    const levels = puzzles.generateLevels(randomFor(seed));
    const g = game('level', seed), handles = g.all('.ex-level-slider');
    g.all('.ex-level-track').forEach((track, index) => {
      track.fire('pointerdown', { clientX: levels[index].target * 1.2 });
      track.fire('pointerup');
      handles[index].fire('pointerdown', { clientX: levels[index].target * 1.2 });
      handles[index].fire('pointerup');
      assert.equal(Number(handles[index].getAttribute('aria-valuenow')), levels[index].initial);
    });
    assert.equal(g.completions, 0);
    handles.forEach((handle, index) => moveSlider(handle, levels[index].target));
    assert.equal(g.completions, 1, `Level drag rejected for seed ${seed}`);
    g.destroy();
  }
});

test('independent review: canceled slider drag rolls back; ignored fingers cannot release its owner', () => {
  const levels = puzzles.generateLevels(randomFor(5));
  const g = game('level', 5), handle = g.one('.ex-level-slider');
  moveSlider(handle, levels[0].target, { release: false });
  handle.fire('pointerup', { pointerId: 2 });
  assert.equal(handle.captured, 1);
  handle.fire('pointercancel');
  assert.equal(Number(handle.getAttribute('aria-valuenow')), levels[0].initial);
  assert.equal(handle.captured, null);
  assert.equal(g.completions, 0);
});

test('independent review: 100 catch games require dragging then dropping, never jumping from a rail tap', () => {
  for (let seed = 0; seed < 100; seed++) {
    const { target, initial } = puzzles.generateLevels(randomFor(seed), 1, 10, 90)[0];
    const g = game('catch', seed), handle = g.one('.ex-claw'), rail = g.one('.ex-catch-machine'), drop = g.one('.ex-drop');
    rail.fire('pointerdown', { clientX: target * 1.2 }); rail.fire('pointerup');
    handle.fire('pointerdown', { clientX: target * 1.2 }); handle.fire('pointerup');
    assert.equal(Number(handle.getAttribute('aria-valuenow')), initial);
    drop.fire('click'); g.tick(350);
    assert.equal(g.completions, 0);
    moveSlider(handle, target);
    drop.fire('click'); g.tick(699);
    assert.equal(g.completions, 0);
    g.tick(700);
    assert.equal(g.completions, 1, `Catch drag rejected for seed ${seed}`);
    g.destroy();
  }
});

test('independent review: upload waits three seconds from activation and requires an explicit final click', () => {
  const g = game('upload'), button = g.one('.ex-upload-button'), meter = g.one('.ex-upload-meter');
  g.tick(2000); button.fire('click');
  assert.equal(button.disabled, true);
  g.tick(4999, 5000); button.fire('click');
  assert.equal(g.completions, 0);
  assert.equal(button.disabled, true);
  g.tick(5000, 1);
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-label'), 'Complete');
  assert.equal(meter.getAttribute('aria-valuenow'), '100');
  assert.equal(g.completions, 0);
  button.fire('click');
  assert.equal(g.completions, 1);
});
