(function () {
  'use strict';

  const catalog = [
    { id: 'roll', title: 'ROLL', color: 'sage' },
    { id: 'type', title: 'TYPE', color: 'peach' },
    { id: 'maze', title: 'MAZE', color: 'lavender' },
    { id: 'sign', title: 'SIGN', color: 'butter' },
    { id: 'memory', title: 'MEMORY', color: 'lavender' },
    { id: 'level', title: 'LEVEL', color: 'blue' },
    { id: 'catch', title: 'CATCH', color: 'sage' },
    { id: 'upload', title: 'UPLOAD', color: 'peach' },
    { id: 'connect', title: 'CONNECT', color: 'blue' },
    { id: 'dice', title: 'DICE', color: 'butter' },
  ];
  const svg = (content, viewBox = '0 0 100 100') => `<svg viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${content}</svg>`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const pick = (random, values) => values[Math.min(values.length - 1, Math.floor(random() * values.length))];
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const opposite = side => (side + 2) % 4;
  const neighbor = (index, side, width, height) => {
    const x = index % width + directions[side][0], y = Math.floor(index / width) + directions[side][1];
    return x >= 0 && x < width && y >= 0 && y < height ? y * width + x : -1;
  };
  const directionBetween = (from, to, width) => directions.findIndex(([dx, dy]) => from % width + dx === to % width && Math.floor(from / width) + dy === Math.floor(to / width));
  const words = Object.freeze(('BUD SUN DEW JOY MOSS LEAF FERN PINE OAK ELM ASH BIRCH CEDAR MAPLE WILLOW ACORN SEED ROOT STEM PETAL BLOOM DAISY LILY ROSE IRIS POPPY TULIP ORCHID CLOVER MEADOW GROVE GARDEN FOREST EARTH SOIL STONE PEBBLE ROCK SAND DUNE DUST CLOUD RAIN MIST SNOW FROST STORM WIND BREEZE SKY MOON STAR DAWN DUSK LIGHT SHADE SHINE SPARK RIVER BROOK CREEK STREAM LAKE POND OCEAN WAVE TIDE REEF SHELL CORAL FISH FIN BIRD WREN ROBIN OWL SWAN DOVE HERON NEST WING BEE MOTH ANT SNAIL WORM FROG TOAD DEER FAWN FOX HARE OTTER PAW TAIL HONEY APPLE PEAR PLUM BERRY PEACH MELON MINT SAGE THYME BASIL').split(' '));

  function solveMaze(puzzle, end = puzzle.end) {
    const previous = new Map([[puzzle.start, null]]), queue = [puzzle.start];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      for (let side = 0; side < 4; side++) {
        const next = neighbor(current, side, puzzle.width, puzzle.height);
        if (next < 0 || !(puzzle.cells[current] & 1 << side) || !(puzzle.cells[next] & 1 << opposite(side)) || previous.has(next)) continue;
        previous.set(next, current); queue.push(next);
      }
    }
    if (!previous.has(end)) return [];
    const route = [];
    for (let cell = end; cell !== null; cell = previous.get(cell)) route.unshift(cell);
    return route;
  }

  function generateMaze(random = Math.random) {
    const width = 5, height = 5, cells = Array(25).fill(0);
    const edge = cells.map((_, i) => i).filter(i => i % width === 0 || i % width === 4 || i < width || i >= 20);
    const start = pick(random, edge), visited = new Set([start]), stack = [start];
    while (stack.length) {
      const current = stack[stack.length - 1];
      const candidates = directions.map((_, side) => ({ side, index: neighbor(current, side, width, height) })).filter(item => item.index >= 0 && !visited.has(item.index));
      if (!candidates.length) { stack.pop(); continue; }
      const next = pick(random, candidates);
      cells[current] |= 1 << next.side; cells[next.index] |= 1 << opposite(next.side);
      visited.add(next.index); stack.push(next.index);
    }
    const puzzle = { width, height, cells, start, end: start };
    const distances = cells.map((_, index) => solveMaze(puzzle, index).length);
    const maximum = Math.max(...distances);
    puzzle.end = pick(random, cells.map((_, index) => index).filter(index => distances[index] === maximum));
    return puzzle;
  }

  // Traverse each grid boundary along a pointer segment. Testing only its endpoint
  // would let a fast swipe cross intervening walls or cut diagonally through corners.
  function traceMazeSegment(puzzle, start, from, to) {
    let current = start;
    const visited = [], dx = to[0] - from[0], dy = to[1] - from[1], epsilon = 1e-7;
    const result = blocked => ({ cell: current, visited, blocked });
    if (![...from, ...to].every(Number.isFinite)) return result(true);
    const startX = start % puzzle.width, startY = Math.floor(start / puzzle.width);
    if (from[0] < startX - epsilon || from[0] > startX + 1 + epsilon || from[1] < startY - epsilon || from[1] > startY + 1 + epsilon) return result(true);
    for (let crossing = 0; crossing < puzzle.width + puzzle.height + 2; crossing++) {
      const x = current % puzzle.width, y = Math.floor(current / puzzle.width);
      const tx = dx > 0 ? (x + 1 - from[0]) / dx : dx < 0 ? (x - from[0]) / dx : Infinity;
      const ty = dy > 0 ? (y + 1 - from[1]) / dy : dy < 0 ? (y - from[1]) / dy : Infinity;
      const t = Math.min(tx, ty);
      if (t > 1 + epsilon) return result(false);
      if (Math.abs(tx - ty) < epsilon || t < -epsilon) return result(true);
      const side = tx < ty ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      const along = tx < ty ? from[1] + dy * t : from[0] + dx * t;
      const fraction = along - Math.floor(along);
      // Leave a little clearance for the visible dot around wall intersections.
      if (fraction < .13 || fraction > .87) return result(true);
      const next = neighbor(current, side, puzzle.width, puzzle.height);
      if (next < 0 || !(puzzle.cells[current] & 1 << side) || !(puzzle.cells[next] & 1 << opposite(side))) return result(true);
      current = next; visited.push(current);
    }
    return result(true);
  }

  const rotateMask = (mask, turns) => {
    const rotation = ((turns % 4) + 4) % 4;
    return ((mask << rotation) | (mask >> (4 - rotation))) & 15;
  };
  function pipesConnected(puzzle, rotations = puzzle.rotations) {
    const masks = puzzle.types.map((type, index) => rotateMask(type === 'bend' ? 3 : 10, rotations[index]));
    if (!(masks[puzzle.start] & 1 << puzzle.entry) || !(masks[puzzle.end] & 1 << puzzle.exit)) return false;
    const visited = new Set([puzzle.start]), queue = [puzzle.start];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (current === puzzle.end) return true;
      for (let side = 0; side < 4; side++) {
        const next = neighbor(current, side, puzzle.width, puzzle.height);
        if (next < 0 || !(masks[current] & 1 << side) || !(masks[next] & 1 << opposite(side)) || visited.has(next)) continue;
        visited.add(next); queue.push(next);
      }
    }
    return false;
  }

  function generatePipes(random = Math.random) {
    const width = 3, height = 2, start = Math.floor(random() * 6), paths = [];
    const explore = path => {
      if (path.length >= 4) paths.push([...path]);
      if (path.length === 6) return;
      for (let side = 0; side < 4; side++) {
        const next = neighbor(path[path.length - 1], side, width, height);
        if (next >= 0 && !path.includes(next)) explore([...path, next]);
      }
    };
    explore([start]);
    const route = pick(random, paths), end = route[route.length - 1];
    const outside = index => [0, 1, 2, 3].filter(side => neighbor(index, side, width, height) < 0);
    const entry = pick(random, outside(start)), exit = pick(random, outside(end));
    const types = Array.from({ length: 6 }, () => pick(random, ['bend', 'straight']));
    const solution = Array.from({ length: 6 }, () => Math.floor(random() * 4));
    route.forEach((index, step) => {
      const from = step === 0 ? entry : directionBetween(index, route[step - 1], width);
      const to = step === route.length - 1 ? exit : directionBetween(index, route[step + 1], width);
      const mask = (1 << from) | (1 << to);
      types[index] = opposite(from) === to ? 'straight' : 'bend';
      solution[index] = [0, 1, 2, 3].find(turn => rotateMask(types[index] === 'bend' ? 3 : 10, turn) === mask);
    });
    const rotations = solution.map(turn => (turn + 1 + Math.floor(random() * 3)) % 4);
    const puzzle = { width, height, start, end, entry, exit, types, rotations, solution, route };
    if (pipesConnected(puzzle)) {
      rotations[start] = [0, 1, 2, 3].find(turn => !(rotateMask(types[start] === 'bend' ? 3 : 10, turn) & 1 << entry));
    }
    return puzzle;
  }

  function generateSignature(random = Math.random) {
    const count = pick(random, [5, 6]), shape = Math.floor(random() * 3), flip = random() < .5;
    return Array.from({ length: count }, (_, i) => {
      const x = i === 0 ? 10 : i === count - 1 ? 110 : 10 + i * 100 / (count - 1) + Math.round(random() * 4 - 2);
      const phase = shape === 0 ? i % 2 : shape === 1 ? (i % 3 === 1 ? 1 : 0) : (i < count / 2 ? 1 : 0);
      const y = 28 + (flip ? 1 - phase : phase) * 24 + Math.floor(random() * 7);
      return [Math.round(x), y];
    });
  }

  function generateLevels(random = Math.random, count = 3, minInitial = 0, maxInitial = 100) {
    return Array.from({ length: count }, () => {
      const target = 20 + Math.floor(random() * 61);
      const candidates = Array.from({ length: maxInitial - minInitial + 1 }, (_, i) => i + minInitial).filter(value => Math.abs(value - target) >= 25);
      return { target, initial: pick(random, candidates) };
    });
  }

  window.LittleRushPuzzles = { words, generateMaze, solveMaze, traceMazeSegment, generatePipes, pipesConnected, rotateMask, generateSignature, generateLevels };

  function mount(container, type, options = {}) {
    const { demo = false, random = Math.random, onComplete = () => {}, onFeedback = () => {} } = options;
    let done = false, destroyed = false, age = 0, errorUntil = 0;
    const removers = [], tickers = [], captures = new Map();
    const node = (tag, cls, text) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text !== undefined) el.textContent = text;
      return el;
    };
    const root = node('div', `mg mg-extra mg-${type}${demo ? ' mg-demo' : ''}`);
    const body = node('div', 'mg-body');
    const hint = node('div', 'mg-hint');
    hint.setAttribute('aria-live', 'polite');
    root.append(body, hint);
    container.append(root);
    const listen = (el, event, fn) => {
      if (demo) return;
      const handler = e => { if (!done && !destroyed) fn(e); };
      el.addEventListener(event, handler);
      removers.push(() => el.removeEventListener(event, handler));
    };
    const button = (cls, label, text, fn) => {
      const el = node('button', cls, text);
      el.type = 'button';
      el.setAttribute('aria-label', label);
      if (demo) el.tabIndex = -1;
      if (fn) listen(el, 'click', fn);
      return el;
    };
    const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
    const shuffle = values => {
      const result = [...values];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    };
    const feedback = () => onFeedback('tap');
    const error = () => {
      root.classList.add('mg-error');
      errorUntil = age + 360;
      onFeedback('error');
    };
    const capture = (el, event) => {
      el.setPointerCapture(event.pointerId);
      captures.set(el, event.pointerId);
    };
    const release = el => {
      const id = captures.get(el);
      captures.delete(el);
      if (id !== undefined && el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    };
    const finish = () => {
      if (done || demo || destroyed) return;
      done = true;
      root.classList.add('mg-complete');
      for (const el of captures.keys()) release(el);
      onComplete();
    };

    // Both levels and the claw use a thumb-only slider. Relative motion preserves
    // the grip offset; neither touching the rail nor simply touching the thumb jumps.
    const slidingControl = ({ track, handle, initial, label, describe = value => `${Math.round(value)}%`, onChange = () => {}, onCommit = () => {}, canMove = () => true }) => {
      let value = initial, pointer = null, originX = 0, originValue = initial, travel = 1, moved = false, everMoved = false;
      handle.setAttribute('role', 'slider');
      handle.setAttribute('aria-label', label);
      handle.setAttribute('aria-valuemin', '0'); handle.setAttribute('aria-valuemax', '100');
      handle.setAttribute('aria-orientation', 'horizontal'); handle.tabIndex = demo ? -1 : 0;
      const paint = () => {
        handle.style.left = `${value}%`;
        handle.setAttribute('aria-valuenow', String(Math.round(value)));
        handle.setAttribute('aria-valuetext', describe(value));
      };
      const change = (next, source) => { value = clamp(next, 0, 100); paint(); onChange(value, source); };
      listen(handle, 'pointerdown', event => {
        if (pointer !== null || event.button > 0 || !canMove()) return;
        event.preventDefault();
        pointer = event.pointerId; originX = event.clientX; originValue = value;
        travel = Math.max(1, track.getBoundingClientRect().width); moved = false;
        handle.classList.add('is-dragging'); capture(handle, event);
      });
      listen(handle, 'pointermove', event => {
        if (event.pointerId !== pointer || !canMove()) return;
        event.preventDefault();
        const delta = event.clientX - originX;
        if (!moved && Math.abs(delta) < 3) return;
        moved = true;
        change(originValue + delta / travel * 100, 'pointer');
      });
      const end = (event, canceled) => {
        if (pointer === null || event.pointerId !== pointer) return;
        pointer = null; handle.classList.remove('is-dragging'); release(handle);
        if (canceled) { if (moved) change(originValue, 'cancel'); }
        else if (moved) { everMoved = true; onCommit(value, 'pointer'); }
        moved = false;
      };
      listen(handle, 'pointerup', event => end(event, false));
      listen(handle, 'pointercancel', event => end(event, true));
      listen(handle, 'lostpointercapture', event => end(event, true));
      listen(handle, 'keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || pointer !== null || !canMove()) return;
        event.preventDefault();
        const next = clamp(value + (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 2 : -2), 0, 100);
        if (next === value) return;
        everMoved = true; change(next, 'keyboard'); onCommit(value, 'keyboard');
      });
      paint();
      return { get value() { return value; }, get dragging() { return pointer !== null; }, get moved() { return everMoved; } };
    };

    if (type === 'roll') {
      let rotation = demo ? 90 : integer(1, 3) * 90;
      const board = node('div', 'ex-roll-board');
      const beetle = node('div', 'ex-beetle');
      beetle.innerHTML = svg('<path d="M35 42 22 33m43 9 13-9M34 56H19m47 0h15M35 69 24 82m41-13 11 13" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="m43 25-6-9m20 9 6-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><ellipse cx="50" cy="55" rx="21" ry="28" fill="#718b6e"/><path d="M50 32v48" stroke="#fff8e9" stroke-width="2"/><circle cx="50" cy="29" r="12" fill="currentColor"/><circle cx="45" cy="26" r="2" fill="#fff8e9"/><circle cx="55" cy="26" r="2" fill="#fff8e9"/>');
      const rotate = direction => {
        rotation += direction * 90;
        beetle.style.transform = `rotate(${rotation}deg)`;
        feedback();
        if ((rotation % 360 + 360) % 360 === 0) finish();
      };
      const left = button('ex-round', 'Roll left', '↶', () => rotate(-1));
      const right = button('ex-round', 'Roll right', '↷', () => rotate(1));
      beetle.style.transform = `rotate(${rotation}deg)`;
      board.append(left, beetle, right);
      body.append(board);
      hint.textContent = 'Turn beetle upright';
    } else if (type === 'type') {
      const word = demo ? 'BUD' : words[integer(0, words.length - 1)];
      let entered = 0;
      const prompt = node('div', 'ex-word');
      const letters = [...word].map(letter => node('span', '', letter));
      prompt.append(...letters);
      const keys = [...new Set([...word, ...shuffle(['A', 'E', 'I', 'O', 'U', 'R', 'T'])])].slice(0, 6);
      const keyboard = node('div', 'ex-mini-keys');
      const enter = letter => {
        if (letter !== word[entered]) return error();
        letters[entered].classList.add('is-typed');
        entered++;
        feedback();
        if (entered === word.length) finish();
      };
      shuffle(keys).forEach(letter => keyboard.append(button('ex-key', `Type ${letter}`, letter, () => enter(letter))));
      listen(root, 'keydown', event => {
        if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
          event.preventDefault();
          enter(event.key.toUpperCase());
        }
      });
      body.append(prompt, keyboard);
      hint.textContent = 'Type the word';
    } else if (type === 'maze') {
      const puzzle = generateMaze(random);
      let current = puzzle.start, pointer = null, previousPoint = null, geometry = null;
      const board = node('div', 'ex-maze-board');
      const maze = node('div', 'ex-maze-grid');
      const cells = [];
      puzzle.cells.forEach((openings, index) => {
        const cell = node('span', `ex-maze-cell is-path${index === puzzle.end ? ' is-exit' : ''}`);
        ['Top', 'Right', 'Bottom', 'Left'].forEach((side, direction) => { cell.style[`border${side}Color`] = openings & 1 << direction ? 'transparent' : '#66657b'; });
        cell.setAttribute('data-cell', String(index));
        cells.push(cell); maze.append(cell);
      });
      cells[current].classList.add('is-player');
      maze.tabIndex = demo ? -1 : 0;
      maze.setAttribute('role', 'group');
      maze.setAttribute('aria-label', 'Maze. Grab the pink dot and drag through open passages to the green square. Keyboard: use arrow keys.');
      const updatePosition = next => {
        cells[current].classList.remove('is-player'); current = next; cells[current].classList.add('is-player');
        maze.setAttribute('aria-description', `Dot at row ${Math.floor(current / puzzle.width) + 1}, column ${current % puzzle.width + 1}. Goal at row ${Math.floor(puzzle.end / puzzle.width) + 1}, column ${puzzle.end % puzzle.width + 1}.`);
      };
      updatePosition(current);
      const move = side => {
        const next = neighbor(current, side, puzzle.width, puzzle.height);
        if (next < 0 || !(puzzle.cells[current] & 1 << side) || !(puzzle.cells[next] & 1 << opposite(side))) return error();
        updatePosition(next);
        feedback();
        if (current === puzzle.end) finish();
      };
      const stopDrag = () => {
        pointer = null; previousPoint = null; geometry = null;
        maze.classList.remove('is-dragging'); release(maze);
      };
      const point = event => [(event.clientX - geometry.left) / geometry.width * puzzle.width, (event.clientY - geometry.top) / geometry.height * puzzle.height];
      const drag = event => {
        const nextPoint = point(event), traced = traceMazeSegment(puzzle, current, previousPoint, nextPoint);
        for (const cell of traced.visited) {
          updatePosition(cell);
          if (current === puzzle.end) { stopDrag(); feedback(); finish(); return; }
        }
        if (traced.blocked) { stopDrag(); hint.textContent = 'Wall · grab the dot again'; error(); return; }
        previousPoint = nextPoint;
      };
      listen(maze, 'pointerdown', event => {
        if (pointer !== null || event.button > 0) return;
        const first = cells[0].getBoundingClientRect(), last = cells[cells.length - 1].getBoundingClientRect();
        geometry = { left: first.left, top: first.top, width: last.left + last.width - first.left, height: last.top + last.height - first.top };
        const start = point(event);
        if (Math.floor(start[0]) !== current % puzzle.width || Math.floor(start[1]) !== Math.floor(current / puzzle.width)) { geometry = null; return; }
        event.preventDefault(); pointer = event.pointerId; previousPoint = start;
        hint.textContent = 'Drag the dot to □'; maze.classList.add('is-dragging'); capture(maze, event);
      });
      listen(maze, 'pointermove', event => {
        if (event.pointerId !== pointer) return;
        event.preventDefault();
        const samples = event.getCoalescedEvents?.() ?? [];
        for (const sample of samples) { if (pointer === null) return; drag(sample); }
        if (pointer !== null) drag(event);
      });
      listen(maze, 'pointerup', event => {
        if (event.pointerId !== pointer) return;
        if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) drag(event);
        if (pointer !== null) stopDrag();
      });
      const cancelDrag = event => { if (event.pointerId === pointer) stopDrag(); };
      listen(maze, 'pointercancel', cancelDrag); listen(maze, 'lostpointercapture', cancelDrag);
      listen(maze, 'keydown', event => {
        const keys = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
        if (Object.hasOwn(keys, event.key)) { event.preventDefault(); if (pointer === null) move(keys[event.key]); }
      });
      board.append(maze);
      body.append(board);
      hint.textContent = 'Drag the dot to □';
    } else if (type === 'sign') {
      const checkpoints = generateSignature(random);
      const path = values => values.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      const paper = button('ex-sign-paper', 'Trace the dotted signature from left to right in one stroke. Keyboard: Right Arrow traces each segment.');
      paper.innerHTML = svg(`<path d="M17 10h85M17 17h65" stroke="currentColor" opacity=".15" stroke-width="3" stroke-linecap="round"/><path class="ex-sign-guide" d="${path(checkpoints)}" stroke="currentColor" stroke-width="2" stroke-dasharray="3 4" opacity=".35"/><path class="ex-sign-ink" d="" stroke="#496b52" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${checkpoints[0][0]}" cy="${checkpoints[0][1]}" r="4" fill="#bc7563"/><circle cx="${checkpoints.at(-1)[0]}" cy="${checkpoints.at(-1)[1]}" r="4" stroke="currentColor" stroke-width="1.5"/>`, '0 0 120 70');
      const ink = paper.querySelector('.ex-sign-ink');
      let step = 1, pointer = null, points = [], keyboardStep = 0, invalid = false, traveled = 0;
      const point = event => {
        const rect = paper.getBoundingClientRect();
        // CSS fixes the same 12:7 aspect ratio as the SVG viewport.
        return [(event.clientX - rect.left) / rect.width * 120, (event.clientY - rect.top) / rect.height * 70];
      };
      const paint = () => ink.setAttribute('d', path(points));
      const reset = () => { step = 1; points = []; traveled = 0; keyboardStep = 0; paint(); };
      const distanceToSegment = (p, a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
        return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
      };
      const trace = event => {
        if (invalid) return;
        const p = point(event);
        const previous = points[points.length - 1], distance = Math.hypot(p[0] - previous[0], p[1] - previous[1]);
        const samples = Math.max(1, Math.ceil(distance / 3));
        for (let i = 1; i <= samples; i++) {
          const sample = [previous[0] + (p[0] - previous[0]) * i / samples, previous[1] + (p[1] - previous[1]) * i / samples];
          if (distanceToSegment(sample, checkpoints[step - 1], checkpoints[step]) > 11) {
            invalid = true; reset(); error(); return;
          }
          traveled += distance / samples;
          if (Math.hypot(sample[0] - checkpoints[step][0], sample[1] - checkpoints[step][1]) < 7) {
            step++;
            if (step === checkpoints.length) { points.push(p); paint(); if (traveled > 50) { feedback(); finish(); } return; }
          }
        }
        points.push(p); paint();
      };
      listen(paper, 'pointerdown', event => {
        if (pointer !== null || event.button > 0) return;
        event.preventDefault();
        reset(); invalid = false;
        const start = point(event);
        if (Math.hypot(start[0] - checkpoints[0][0], start[1] - checkpoints[0][1]) > 9) { error(); return; }
        pointer = event.pointerId;
        capture(paper, event);
        points.push(start); paint();
      });
      listen(paper, 'pointermove', event => {
        if (event.pointerId === pointer) { event.preventDefault(); trace(event); }
      });
      const stop = event => {
        if (event.pointerId !== pointer) return;
        pointer = null;
        release(paper);
        if (step !== checkpoints.length) { reset(); if (!invalid) error(); }
      };
      listen(paper, 'pointerup', stop);
      listen(paper, 'pointercancel', stop);
      listen(paper, 'lostpointercapture', stop);
      listen(paper, 'keydown', event => {
        if (event.key !== 'ArrowRight' || pointer !== null) return;
        event.preventDefault();
        keyboardStep = Math.min(keyboardStep + 1, checkpoints.length - 1);
        points = checkpoints.slice(0, keyboardStep + 1);
        paint(); feedback();
        if (keyboardStep === checkpoints.length - 1) finish();
      });
      body.append(paper);
      hint.textContent = 'Trace from ● to ○';
    } else if (type === 'memory') {
      const code = demo ? '425' : Array.from({ length: 3 }, () => integer(1, 6)).join('');
      let visible = true, entered = '';
      const display = node('div', 'ex-memory-code', code);
      const keys = node('div', 'ex-mini-keys');
      const digits = [];
      const enter = digit => {
        if (visible) return;
        if (digit !== code[entered.length]) {
          error(); entered = ''; visible = true; revealUntil = age + 900;
          display.textContent = code;
          digits.forEach(key => { key.disabled = true; });
          hint.textContent = 'Look once more';
          return;
        }
        entered += digit;
        display.textContent = entered.padEnd(3, '·');
        feedback();
        if (entered.length === code.length) finish();
      };
      for (let i = 1; i <= 6; i++) {
        const key = button('ex-key', `Recall ${i}`, i, () => enter(String(i)));
        key.disabled = true;
        digits.push(key); keys.append(key);
      }
      let revealUntil = 1400;
      tickers.push(() => {
        if (visible && age >= revealUntil) {
          visible = false; display.textContent = '···'; hint.textContent = 'Recall the 3 digits';
          digits.forEach(key => { key.disabled = false; });
        }
      });
      listen(root, 'keydown', event => {
        if (/^[1-6]$/.test(event.key)) { event.preventDefault(); enter(event.key); }
      });
      body.append(display, keys);
      hint.textContent = 'Remember these digits';
    } else if (type === 'level') {
      const levels = node('div', 'ex-levels');
      const matched = [false, false, false], touched = [false, false, false];
      generateLevels(random).forEach(({ target, initial }, index) => {
        const row = node('div', 'ex-level-row');
        const label = node('span', 'ex-level-label', String(target));
        const track = node('div', 'ex-level-track');
        const mark = node('span', 'ex-level-mark');
        mark.style.left = `${target}%`;
        const slider = node('div', 'ex-level-slider ex-slider-thumb');
        const update = (value, committed = false) => {
          const near = Math.abs(value - target) <= 4;
          if (committed) touched[index] = true;
          matched[index] = touched[index] && near;
          row.classList.toggle('is-matched', near);
        };
        slidingControl({
          track, handle: slider, initial, label: `Drag level ${index + 1} to ${target}`,
          describe: value => `${Math.round(value)}; target ${target}${Math.abs(value - target) <= 4 ? ', aligned' : ''}`,
          onChange: (value, source) => {
            update(value);
            if (source === 'pointer') matched[index] = false;
          },
          onCommit: value => { update(value, true); feedback(); if (matched.every(Boolean)) finish(); },
        });
        track.append(mark, slider); row.append(label, track); levels.append(row);
      });
      body.append(levels);
      hint.textContent = 'Slide knobs to marks';
    } else if (type === 'catch') {
      let dropAt = null;
      const { target, initial } = generateLevels(random, 1, 10, 90)[0];
      const machine = node('div', 'ex-catch-machine');
      const targetEl = node('span', 'ex-catch-prize', '✿');
      const claw = node('div', 'ex-claw ex-slider-thumb');
      claw.innerHTML = svg('<path d="M50 0v32m0 0L28 58l8 12m14-38 22 26-8 12" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><rect x="33" y="0" width="34" height="22" rx="4" fill="#fff8e9"/>');
      targetEl.style.left = `${target}%`;
      const slider = slidingControl({ track: machine, handle: claw, initial, label: 'Drag the claw over the flower', describe: value => `${Math.round(value)}%; flower at ${target}%`, canMove: () => dropAt === null });
      const controls = node('div', 'ex-catch-controls');
      const drop = () => {
        if (dropAt !== null || slider.dragging) return;
        dropAt = age; feedback(); claw.classList.add('is-dropping');
      };
      controls.append(button('ex-key ex-drop', 'Drop claw', 'DROP', drop));
      tickers.push(() => {
        if (dropAt === null || age - dropAt < 350) return;
        if (slider.moved && Math.abs(slider.value - target) <= 7) { targetEl.classList.add('is-caught'); finish(); }
        else { dropAt = null; claw.classList.remove('is-dropping'); error(); }
      });
      machine.append(targetEl, claw); body.append(machine, controls);
      hint.textContent = 'Drag claw · then drop';
    } else if (type === 'upload') {
      let state = 'idle', startedAt = 0;
      const cloud = node('div', 'ex-upload-cloud');
      cloud.innerHTML = svg('<path d="M29 70H23a16 16 0 0 1-1-32 26 26 0 0 1 49-5 19 19 0 0 1 5 37h-5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M50 75V43m-12 12 12-12 12 12" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>');
      const meter = node('div', 'ex-upload-meter'); const fill = node('span'); meter.append(fill);
      meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-label', 'Upload progress');
      meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100'); meter.setAttribute('aria-valuenow', '0');
      const controls = node('div', 'ex-upload-controls');
      const upload = button('ex-key ex-upload-button', 'Upload', 'Upload', () => {
        if (state === 'idle') {
          state = 'uploading'; startedAt = age; upload.disabled = true; upload.textContent = 'Uploading…';
          upload.setAttribute('aria-label', 'Uploading'); root.setAttribute('aria-busy', 'true');
          hint.textContent = 'Come back when it is ready'; feedback();
        } else if (state === 'ready') { feedback(); finish(); }
      });
      tickers.push(() => {
        if (state !== 'uploading') return;
        const percent = Math.min(100, (age - startedAt) / 3000 * 100);
        fill.style.width = `${percent}%`; meter.setAttribute('aria-valuenow', String(Math.round(percent)));
        if (percent === 100) {
          state = 'ready'; upload.disabled = false; upload.textContent = 'Complete'; upload.setAttribute('aria-label', 'Complete');
          root.setAttribute('aria-busy', 'false'); hint.textContent = 'Ready · tap Complete';
        }
      });
      controls.append(upload); body.append(cloud, meter, controls);
      hint.textContent = 'Upload · wait · complete';
    } else if (type === 'connect') {
      const layout = generatePipes(random);
      const puzzle = node('div', 'ex-pipes');
      const rotations = [...layout.rotations], pieces = [];
      for (let i = 0; i < 6; i++) {
        const piece = button('ex-pipe', `Rotate pipe ${i + 1} clockwise`, undefined, () => {
          rotations[i]++; graphic.style.transform = `rotate(${rotations[i] * 90}deg)`; feedback();
          piece.setAttribute('data-rotation', String(rotations[i] % 4));
          if (pipesConnected(layout, rotations)) { puzzle.classList.add('is-connected'); finish(); }
        });
        const graphic = node('span', 'ex-pipe-graphic');
        graphic.innerHTML = svg(layout.types[i] === 'straight' ? '<path d="M0 50h100" stroke="currentColor" stroke-width="13" stroke-linecap="round"/>' : '<path d="M50 0v50h50" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>');
        graphic.style.transform = `rotate(${rotations[i] * 90}deg)`;
        piece.setAttribute('data-rotation', String(rotations[i])); piece.setAttribute('data-type', layout.types[i]);
        piece.append(graphic); puzzle.append(piece); pieces.push(piece);
      }
      const from = node('span', 'ex-pipe-source', '●'); const to = node('span', 'ex-pipe-goal', '○');
      from.classList.add(`ex-port-${layout.entry}`); to.classList.add(`ex-port-${layout.exit}`);
      pieces[layout.start].append(from); pieces[layout.end].append(to); body.append(puzzle);
      hint.textContent = 'Rotate · join ● to ○';
    } else if (type === 'dice') {
      let next = 1;
      const board = node('div', 'ex-dice');
      const dots = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]] };
      shuffle([1, 2, 3, 4, 5, 6]).forEach(value => {
        const die = button('ex-die', `Die with ${value} ${value === 1 ? 'dot' : 'dots'}`, undefined, () => {
          if (value !== next) return error();
          next++; die.disabled = true; die.classList.add('is-done'); feedback();
          hint.textContent = next === 7 ? 'A perfect little order' : `Next: ${next} dots`;
          if (next === 7) finish();
        });
        die.innerHTML = svg(dots[value].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="currentColor"/>`).join(''));
        board.append(die);
      });
      body.append(board); hint.textContent = 'Tap dice · 1 → 6 dots';
    }

    return {
      tick(ageMs, deltaMs = 0) {
        if (done || destroyed || demo) return;
        age = Math.max(0, ageMs);
        if (errorUntil && age >= errorUntil) { errorUntil = 0; root.classList.remove('mg-error'); }
        tickers.forEach(ticker => ticker(Math.max(0, Math.min(deltaMs, 100))));
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        removers.forEach(remove => remove());
        for (const el of captures.keys()) release(el);
        root.remove();
      },
    };
  }

  window.LittleRushGames.register(catalog, mount);
})();
