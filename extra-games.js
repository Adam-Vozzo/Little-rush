(function () {
  'use strict';

  const catalog = [
    { id: 'roll', title: 'TURN UPRIGHT', color: 'sage' },
    { id: 'type', title: 'TYPE THE WORD', color: 'lavender' },
    { id: 'maze', title: 'DRAG TO EXIT', color: 'blue' },
    { id: 'sign', title: 'SIGN HERE', color: 'sage' },
    { id: 'memory', title: 'REMEMBER', color: 'lavender' },
    { id: 'match', title: 'MATCH', color: 'sage' },
    { id: 'aim', title: 'TAP TARGETS', color: 'sage' },
    { id: 'level', title: 'SLIDE TO MARKS', color: 'blue' },
    { id: 'catch', title: 'CATCH IT', color: 'sage' },
    { id: 'upload', title: 'UPLOAD', color: 'peach' },
    { id: 'connect', title: 'JOIN PIPES', color: 'blue' },
    { id: 'dice', title: 'TAP LOW TO HIGH', color: 'butter' },
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
    const entries = [];
    let lastBoundary = 0;
    const result = (blocked, point = from) => ({ cell: current, visited, entries, blocked, point: [...point] });
    const beforeBoundary = t => {
      const safeT = Math.max(lastBoundary, t - .003 / Math.max(Math.abs(dx), Math.abs(dy), 1));
      return [from[0] + dx * safeT, from[1] + dy * safeT];
    };
    if (![...from, ...to].every(Number.isFinite)) return result(true);
    const startX = start % puzzle.width, startY = Math.floor(start / puzzle.width);
    if (from[0] < startX - epsilon || from[0] > startX + 1 + epsilon || from[1] < startY - epsilon || from[1] > startY + 1 + epsilon) return result(true);
    for (let crossing = 0; crossing < puzzle.width + puzzle.height + 2; crossing++) {
      const x = current % puzzle.width, y = Math.floor(current / puzzle.width);
      const tx = dx > 0 ? (x + 1 - from[0]) / dx : dx < 0 ? (x - from[0]) / dx : Infinity;
      const ty = dy > 0 ? (y + 1 - from[1]) / dy : dy < 0 ? (y - from[1]) / dy : Infinity;
      const t = Math.min(tx, ty);
      if (t > 1 + epsilon) return result(false, to);
      if (Math.abs(tx - ty) < epsilon || t < -epsilon) return result(true, beforeBoundary(Math.max(0, t)));
      const side = tx < ty ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      const along = tx < ty ? from[1] + dy * t : from[0] + dx * t;
      const fraction = along - Math.floor(along);
      // The dot has a generous visual radius and a tiny collision core to avoid sticky corners.
      if (fraction < .0001 || fraction > .9999) return result(true, beforeBoundary(t));
      const next = neighbor(current, side, puzzle.width, puzzle.height);
      if (next < 0 || !(puzzle.cells[current] & 1 << side) || !(puzzle.cells[next] & 1 << opposite(side))) return result(true, beforeBoundary(t));
      current = next; visited.push(current);
      entries.push({ cell: current, point: [from[0] + dx * t, from[1] + dy * t] });
      lastBoundary = t;
    }
    return result(true);
  }

  function slideMazeSegment(puzzle, start, from, to) {
    let result = traceMazeSegment(puzzle, start, from, to);
    if (!result.blocked || ![...from, ...to].every(Number.isFinite)) return result;
    // Resolve the remaining motion after each wall contact, including a turn at
    // the end of that wall. A tiny interior margin keeps exact corners traversable.
    for (let pass = 0; pass < 8; pass++) {
      const x = result.cell % puzzle.width, y = Math.floor(result.cell / puzzle.width);
      const origin = [clamp(result.point[0], x + .02, x + .98), clamp(result.point[1], y + .02, y + .98)];
      let best = null, distance = Math.hypot(result.point[0] - to[0], result.point[1] - to[1]);
      for (const target of [[to[0], origin[1]], [origin[0], to[1]]]) {
        const next = traceMazeSegment(puzzle, result.cell, origin, target);
        const remaining = Math.hypot(next.point[0] - to[0], next.point[1] - to[1]);
        if (remaining < distance - .001) { best = next; distance = remaining; }
      }
      if (!best) break;
      result = { ...best, blocked: true, visited: [...result.visited, ...best.visited], entries: [...result.entries, {cell: result.cell, point: origin}, ...best.entries, {cell: best.cell, point: best.point}] };
      if (distance < .001) break;
    }
    return result;
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

  function generateLevels(random = Math.random, count = 3, minInitial = 0, maxInitial = 100) {
    return Array.from({ length: count }, () => {
      const target = 20 + Math.floor(random() * 61);
      const candidates = Array.from({ length: maxInitial - minInitial + 1 }, (_, i) => i + minInitial).filter(value => Math.abs(value - target) >= 25);
      return { target, initial: pick(random, candidates) };
    });
  }

  window.LittleRushPuzzles = { words, generateMaze, solveMaze, traceMazeSegment, slideMazeSegment, generatePipes, pipesConnected, rotateMask, generateLevels };

  function mount(container, type, options = {}) {
    const { demo = false, random = Math.random, onComplete = () => {}, onFeedback = () => {} } = options;
    let done = false, destroyed = false, age = 0, errorUntil = 0;
    const removers = [], tickers = [], suspenders = [], captures = new Map();
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
      return { get value() { return value; }, get dragging() { return pointer !== null; }, get moved() { return everMoved; }, nudgeTo(next) { if (!canMove() || pointer !== null) return; everMoved = true; change(next, 'control'); } };
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
      const left = button('ex-round', 'Roll left', undefined, () => rotate(-1));
      const right = button('ex-round', 'Roll right', undefined, () => rotate(1));
      const arrow = '<path d="M3 10h5M3 10V5M3 10a9 9 0 1 1 .5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      left.innerHTML = svg(arrow, '0 0 24 24');
      right.innerHTML = svg(`<g transform="translate(24 0) scale(-1 1)">${arrow}</g>`, '0 0 24 24');
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
      let current = puzzle.start, pointer = null, geometry = null, grabOffset = [0, 0], wallContact = false;
      let dotPoint = [current % puzzle.width + .5, Math.floor(current / puzzle.width) + .5];
      const trail = [[...dotPoint]];
      const board = node('div', 'ex-maze-board');
      const maze = node('div', 'ex-maze-grid');
      const cells = [];
      puzzle.cells.forEach((openings, index) => {
        const cell = node('span', `ex-maze-cell is-path${index === puzzle.end ? ' is-exit' : ''}`);
        ['Top', 'Right', 'Bottom', 'Left'].forEach((side, direction) => { cell.style[`border${side}Color`] = openings & 1 << direction ? 'transparent' : '#66657b'; });
        cell.setAttribute('data-cell', String(index));
        cells.push(cell); maze.append(cell);
      });
      const overlay = node('div', 'ex-maze-overlay');
      overlay.innerHTML = '<svg viewBox="0 0 5 5" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path class="ex-maze-ink" stroke="#b96869" stroke-width=".075" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><circle class="ex-maze-dot" r=".34" fill="#b96869" stroke="#fff8ed" stroke-width=".07"/></svg>';
      const mazeInk = overlay.querySelector('.ex-maze-ink'), mazeDot = overlay.querySelector('.ex-maze-dot');
      maze.append(overlay);
      const paintDot = point => {
        const previous = trail[trail.length - 1];
        dotPoint = [...point];
        if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) > .008) trail.push([...point]);
        mazeDot.setAttribute('cx', String(dotPoint[0])); mazeDot.setAttribute('cy', String(dotPoint[1]));
        mazeInk.setAttribute('d', trail.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`).join(' '));
      };
      paintDot(dotPoint);
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
        paintDot([current % puzzle.width + .5, Math.floor(current / puzzle.width) + .5]);
        feedback();
        if (current === puzzle.end) finish();
      };
      const stopDrag = () => {
        pointer = null; geometry = null; wallContact = false;
        maze.classList.remove('is-dragging'); release(maze);
      };
      const point = event => [(event.clientX - geometry.left) / geometry.width * puzzle.width, (event.clientY - geometry.top) / geometry.height * puzzle.height];
      const drag = event => {
        const raw = point(event), nextPoint = [raw[0] + grabOffset[0], raw[1] + grabOffset[1]];
        const traced = slideMazeSegment(puzzle, current, dotPoint, nextPoint);
        for (const cell of traced.visited) {
          updatePosition(cell);
          if (current === puzzle.end) {
            paintDot(traced.cell === current ? traced.point : traced.entries.find(entry => entry.cell === current).point);
            stopDrag(); feedback(); finish(); return;
          }
        }
        paintDot(traced.point);
        if (traced.blocked) {
          // Wall contact is ordinary movement, not a failed action.
          wallContact = true; hint.textContent = 'Keep drawing along an open passage';
        } else { wallContact = false; hint.textContent = 'Drag the dot to □'; }
      };
      listen(maze, 'pointerdown', event => {
        if (pointer !== null || event.button > 0) return;
        const first = cells[0].getBoundingClientRect(), last = cells[cells.length - 1].getBoundingClientRect();
        geometry = { left: first.left, top: first.top, width: last.left + last.width - first.left, height: last.top + last.height - first.top };
        const start = point(event);
        if (!start.every(Number.isFinite) || Math.hypot(start[0] - dotPoint[0], start[1] - dotPoint[1]) > .95) { geometry = null; return; }
        event.preventDefault(); pointer = event.pointerId; grabOffset = [dotPoint[0] - start[0], dotPoint[1] - start[1]]; wallContact = false;
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
      const path = values => values.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      const paper = button('ex-sign-paper', 'Draw any long signature inside this box, then lift your finger. Keyboard: press Enter to sign.');
      paper.innerHTML = '<svg viewBox="0 0 160 100" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path class="ex-sign-ink" d="" stroke="#496b52" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const ink = paper.querySelector('.ex-sign-ink');
      let pointer = null, points = [], traveled = 0, minX = 0, maxX = 0, minY = 0, maxY = 0;
      const point = event => {
        const rect = paper.getBoundingClientRect();
        return [(event.clientX - rect.left) / rect.width * 160, (event.clientY - rect.top) / rect.height * 100];
      };
      const paint = () => ink.setAttribute('d', path(points));
      const reset = () => { points = []; traveled = 0; paint(); };
      const inside = p => p.every(Number.isFinite) && p[0] >= 0 && p[0] <= 160 && p[1] >= 0 && p[1] <= 100;
      const cancel = () => {
        pointer = null; paper.classList.remove('is-drawing'); release(paper); reset();
      };
      const draw = event => {
        const p = point(event);
        if (!inside(p)) { cancel(); error(); return; }
        const previous = points[points.length - 1], distance = Math.hypot(p[0] - previous[0], p[1] - previous[1]);
        traveled += distance;
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        points.push(p); paint();
      };
      listen(paper, 'pointerdown', event => {
        if (pointer !== null || event.button > 0) return;
        event.preventDefault();
        const start = point(event);
        if (!inside(start)) return;
        reset(); minX = maxX = start[0]; minY = maxY = start[1];
        pointer = event.pointerId;
        capture(paper, event); paper.classList.add('is-drawing');
        points.push(start); paint();
      });
      listen(paper, 'pointermove', event => {
        if (event.pointerId !== pointer) return;
        event.preventDefault();
        for (const sample of event.getCoalescedEvents?.() ?? []) { if (pointer === null) return; draw(sample); }
        if (pointer !== null) draw(event);
      });
      listen(paper, 'pointerup', event => {
        if (event.pointerId !== pointer) return;
        if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) draw(event);
        if (pointer === null) return;
        pointer = null; paper.classList.remove('is-drawing'); release(paper);
        if (traveled >= 100 && Math.hypot(maxX - minX, maxY - minY) >= 64) { feedback(); finish(); }
        else { reset(); error(); }
      });
      const cancelPointer = event => { if (event.pointerId === pointer) cancel(); };
      listen(paper, 'pointercancel', cancelPointer);
      listen(paper, 'lostpointercapture', cancelPointer);
      listen(paper, 'keydown', event => {
        if (event.key !== 'Enter' || event.repeat || pointer !== null) return;
        event.preventDefault();
        points = [[14, 77], [37, 24], [29, 77], [56, 40], [50, 73], [74, 50], [70, 75], [112, 58], [99, 82], [147, 73]];
        paint(); feedback(); finish();
      });
      body.append(paper);
      hint.textContent = 'Draw any signature, then release';
    } else if (type === 'memory') {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const numbers = '23456789';
      const symbols = shuffle([pick(random, [...alphabet]), pick(random, [...numbers]), ...shuffle([...alphabet + numbers]).slice(0, 4)]).slice(0, 6);
      // Guarantee a mixed code even for a degenerate random source.
      const code = demo ? 'A7K3B' : shuffle([pick(random, symbols.filter(c => /[A-Z]/.test(c))) || 'A', pick(random, symbols.filter(c => /[0-9]/.test(c))) || '7', ...Array.from({ length: 3 }, () => pick(random, symbols))]).join('');
      const choices = shuffle([...new Set([...code, ...symbols])]).slice(0, 6);
      let visible = true, entered = '';
      const display = node('div', 'ex-memory-code', code);
      const keys = node('div', 'ex-mini-keys');
      keys.hidden = true;
      const start = button('ex-key ex-memory-start', 'Start recall', 'Start', () => {
        visible = false; entered = ''; display.textContent = '·····';
        start.hidden = true; keys.hidden = false; hint.textContent = 'Enter the five characters'; feedback();
      });
      const enter = character => {
        if (visible) return;
        if (character !== code[entered.length]) {
          error(); entered = ''; visible = true; display.textContent = code;
          keys.hidden = true; start.hidden = false; hint.textContent = 'Look once more, then press Start'; return;
        }
        entered += character; display.textContent = entered.padEnd(5, '·'); feedback();
        if (entered.length === code.length) finish();
      };
      choices.forEach(character => keys.append(button('ex-key', 'Recall ' + character, character, () => enter(character))));
      listen(root, 'keydown', event => {
        const character = event.key.toUpperCase();
        if (choices.includes(character)) { event.preventDefault(); enter(character); }
      });
      body.append(display, start, keys); hint.textContent = 'Remember the code, then press Start';
    } else if (type === 'match') {
      const shapes = [
        ['circle', '<circle cx="50" cy="50" r="30" fill="currentColor"/>'],
        ['triangle', '<path d="M50 17 84 78H16Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>'],
        ['square', '<rect x="22" y="22" width="56" height="56" rx="8" fill="currentColor"/>']
      ];
      const colors = [['coral', '#b95260'], ['blue', '#427d9e'], ['green', '#548453']];
      const pool = shapes.flatMap((shape, si) => colors.map((color, ci) => ({ shape, color, id: si * 3 + ci })));
      const target = pool[demo ? 0 : integer(0, 8)];
      const items = shuffle(pool);
      const row = node('div', 'ex-match-row');
      const icon = item => {
        const el = node('div', 'ex-match-shape'); el.style.color = item.color[1]; el.innerHTML = svg(item.shape[1]);
        el.setAttribute('role', 'img'); el.setAttribute('aria-label', item.color[0] + ' ' + item.shape[0]); return el;
      };
      const reference = icon(target), equals = node('span', 'ex-match-equals', '=');
      const reel = node('div', 'ex-match-window'), strip = node('div', 'ex-match-strip');
      [...items, items[0]].forEach(item => strip.append(icon(item))); reel.append(strip);
      row.append(reference, equals, reel);
      let position = 0, retryAt = 0;
      const attempt = () => {
        if (age < retryAt) return;
        const index = Math.round(position) % items.length;
        if (Math.abs(position - Math.round(position)) <= .34 && items[index].id === target.id) {
          strip.style.transform = 'translateY(-' + Math.round(position) * 100 / (items.length + 1) + '%)';
          reel.classList.add('is-matched'); stop.textContent = 'Matched'; feedback(); finish();
        } else {
          retryAt = age + 750; stop.disabled = true; root.classList.add('is-cooling');
          stop.textContent = '0.8'; hint.textContent = 'Missed · try again in a moment'; error();
        }
      };
      const stop = button('ex-key ex-match-stop', 'Stop on the matching colored shape', 'Stop', attempt);
      // The whole tile is a stop target, including its title and margins. The
      // actual button retains keyboard access without handling its click twice.
      listen(container.closest?.('.tile') || root, 'click', event => {
        if (event.target === stop || event.target?.closest?.('.ex-match-stop')) return;
        attempt();
      });
      body.append(row, stop); hint.textContent = 'Tap anywhere · match shape and color';
      tickers.push(() => {
        const cooling = age < retryAt;
        stop.disabled = cooling; root.classList.toggle('is-cooling', cooling);
        stop.textContent = cooling ? ((retryAt - age) / 1000).toFixed(1) : 'Stop';
        position = (age / 620) % items.length;
        strip.style.transform = 'translateY(-' + position * 100 / (items.length + 1) + '%)';
        reel.setAttribute('aria-label', 'Scrolling: ' + items[Math.round(position) % items.length].color[0] + ' ' + items[Math.round(position) % items.length].shape[0]);
      });
    } else if (type === 'aim') {
      let startedAt = null, spawned = 0, hits = 0, lastPosition = null;
      const field = node('div', 'ex-aim-field'), progress = node('div', 'ex-aim-progress');
      const dots = Array.from({length: 6}, () => node('span'));
      progress.append(...dots); progress.setAttribute('aria-label', '0 of 6 targets');
      const targets = [];
      const start = button('ex-key ex-aim-start', 'Start aim trainer', 'Start', () => {
        if (startedAt !== null) return;
        startedAt = age; spawned = hits = 0; start.hidden = true;
        progress.setAttribute('aria-label', '0 of 6 targets');
        dots.forEach(dot => dot.classList.remove('is-done')); feedback();
        hint.textContent = 'Tap each circle when it fills'; update();
      });
      const reset = () => {
        startedAt = null; targets.splice(0).forEach(target => target.el.remove());
        start.hidden = false; start.textContent = 'Try again';
        progress.setAttribute('aria-label', 'Missed target. Start again.');
        dots.forEach(dot => dot.classList.remove('is-done'));
        hint.textContent = 'Missed one · press Start to retry'; error();
      };
      const spawn = born => {
        // Select from spaced positions so the emerging circle never covers the
        // one currently ready. Jitter keeps repeated rounds from feeling fixed.
        const positions = [22, 50, 78].flatMap(x => [25, 75].map(y => [x, y]));
        const available = positions.filter(p => !lastPosition || Math.hypot(p[0] - lastPosition[0], p[1] - lastPosition[1]) >= 48);
        const position = pick(random, available); lastPosition = position;
        const target = {born, hit: false, el: null};
        const tap = () => {
          if (startedAt === null || !targets.includes(target) || target.hit || age < born + 500) return;
          if (age >= born + 1000) { reset(); return; }
          target.hit = true; hits++; target.el.disabled = true;
          target.el.classList.add('is-hit'); dots[hits - 1].classList.add('is-done');
          progress.setAttribute('aria-label', hits + ' of 6 targets'); feedback();
          if (hits === 6) { hint.textContent = 'All six!'; finish(); }
        };
        const el = button('ex-aim-target', 'Target ' + (spawned + 1), '', tap);
        el.innerHTML = '<span class="ex-aim-core"></span>';
        el.style.left = (position[0] + (random() - .5) * 4) + '%';
        el.style.top = (position[1] + (random() - .5) * 4) + '%';
        target.el = el; targets.push(target); field.append(el); spawned++;
        // Pointer-down makes the half-second window feel immediate; keyboard
        // and assistive clicks share the same guarded hit path.
        listen(el, 'pointerdown', event => { if (event.button > 0) return; event.preventDefault(); tap(); });
      };
      const update = () => {
        if (startedAt === null) return;
        if (targets.some(target => !target.hit && age >= target.born + 1000)) { reset(); return; }
        while (spawned < 6 && age >= startedAt + spawned * 500) spawn(startedAt + spawned * 500);
        // A delayed frame must not make an expired target newly playable.
        if (targets.some(target => !target.hit && age >= target.born + 1000)) { reset(); return; }
        targets.forEach(target => {
          const growth = clamp((age - target.born) / 500, 0, 1);
          target.el.classList.toggle('is-ready', growth === 1);
          target.el.setAttribute('aria-disabled', String(growth < 1 || target.hit));
          if (!target.hit) {
            target.el.style.opacity = String(growth);
            target.el.style.transform = 'translate(-50%,-50%) scale(' + (.35 + .65 * (1 - (1 - growth) ** 3)) + ')';
          }
          if (target.hit && age >= target.born + 1000) target.el.remove();
        });
      };
      field.append(start); body.append(field, progress); hint.textContent = 'Start · tap six circles as they fill';
      tickers.push(update);
    } else if (type === 'level') {
      const levels = node('div', 'ex-levels');
      const matched = [false, false, false], touched = [false, false, false];
      generateLevels(random).forEach(({ target, initial }, index) => {
        const row = node('div', 'ex-level-row');
        const track = node('div', 'ex-level-track');
        const mark = node('span', 'ex-level-mark');
        mark.style.left = `${target}%`;
        const slider = node('div', 'ex-level-slider ex-slider-thumb');
        const update = (value, committed = false) => {
          const near = Math.abs(value - target) <= 9;
          if (committed) touched[index] = true;
          matched[index] = touched[index] && near;
          row.classList.toggle('is-matched', near);
        };
        slidingControl({
          track, handle: slider, initial, label: `Drag level ${index + 1} to ${target}`,
          describe: value => `${Math.round(value)}; target ${target}${Math.abs(value - target) <= 9 ? ', aligned' : ''}`,
          onChange: (value, source) => {
            update(value);
            if (source === 'pointer') matched[index] = false;
          },
          onCommit: value => { update(value, true); feedback(); if (matched.every(Boolean)) finish(); },
        });
        track.append(mark, slider); row.append(track); levels.append(row);
      });
      body.append(levels);
      hint.textContent = 'Slide knobs to marks';
    } else if (type === 'catch') {
      let dropAt = null, held = null, swing = 0, swingVelocity = 0, previousVelocity = 0;
      let travel = 0, caught = false, grabbed = false;
      const { target, initial } = generateLevels(random, 1, 10, 90)[0];
      let previousPosition = initial;
      const machine = node('div', 'ex-catch-machine');
      const targetEl = node('span', 'ex-catch-prize', '✿');
      const rod = node('span', 'ex-claw-rod');
      const claw = node('div', 'ex-claw ex-slider-thumb');
      claw.innerHTML = svg('<path d="M50 0v32m0 0L28 58l8 12m14-38 22 26-8 12" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><rect x="33" y="0" width="34" height="22" rx="4" fill="#fff8e9"/>');
      targetEl.style.left = `${target}%`;
      const slider = slidingControl({ track: machine, handle: claw, initial, label: 'Drag the claw over the flower', describe: value => `${Math.round(value)}%; flower at ${target}%`, canMove: () => dropAt === null && !held });
      const controls = node('div', 'ex-catch-controls');
      const stopMoving = (settleTap = false) => {
        if (!held) return;
        const owner = held, control = owner.control; held = null;
        // Very short taps may fall between animation frames. Give those a tiny
        // release nudge without adding a jump or a delay at the start of a hold.
        if (settleTap === true && age - owner.since < 120 && Math.abs(slider.value - owner.origin) < 1) {
          slider.nudgeTo(owner.origin + owner.direction);
        }
        control.classList.remove('is-held'); release(control);
      };
      suspenders.push(stopMoving);
      const drop = () => {
        if (dropAt !== null || slider.dragging) return;
        stopMoving(); dropAt = age; grabbed = caught = false;
        travel = Math.max(0, machine.getBoundingClientRect().height - (claw.clientHeight || claw.getBoundingClientRect().height) * .7 - targetEl.getBoundingClientRect().height * .45);
        controls.querySelectorAll('button').forEach(control => { control.disabled = true; });
        feedback(); claw.classList.add('is-dropping');
      };
      const arrow = (direction, label, text) => {
        const control = button('ex-key ex-claw-arrow', label, text, event => {
          // Screen readers issue a click without a pointer or held key.
          if (event.detail === 0 && !held && dropAt === null && !slider.dragging) { slider.nudgeTo(slider.value + direction); feedback(); }
        });
        const begin = (pointer, key) => {
          if (held || dropAt !== null || slider.dragging) return false;
          held = {control, direction, pointer, key, since: age, origin: slider.value};
          control.classList.add('is-held'); feedback(); return true;
        };
        listen(control, 'pointerdown', event => {
          if (event.button > 0) return;
          event.preventDefault(); if (begin(event.pointerId, null)) capture(control, event);
        });
        for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(control, eventName, event => {
          if (held?.control === control && held.pointer === event.pointerId) { event.preventDefault(); stopMoving(eventName === 'pointerup'); }
        });
        listen(control, 'keydown', event => {
          if (![' ', 'Enter'].includes(event.key)) return;
          event.preventDefault(); if (!event.repeat) begin(null, event.key);
        });
        listen(control, 'keyup', event => { if (held?.control === control && held.key === event.key) { event.preventDefault(); stopMoving(true); } });
        listen(control, 'blur', stopMoving);
        return control;
      };
      controls.append(arrow(-1, 'Move claw left', '←'), button('ex-key ex-drop', 'Drop claw', 'DROP', drop), arrow(1, 'Move claw right', '→'));
      tickers.push(delta => {
        const dt = Math.min(delta, 32) / 1000;
        if (held && dropAt === null) {
          const seconds = Math.max(0, age - held.since) / 1000;
          // Integrate a smooth 18 → 46%/s acceleration from the first frame.
          // Absolute game-clock travel stays consistent across refresh rates.
          const distance = 46 * seconds - 28 * .12 * (1 - Math.exp(-seconds / .12));
          // The slider's direct manipulation lock does not apply to its owner.
          const owner = held; held = null; slider.nudgeTo(owner.origin + owner.direction * distance); held = owner;
        }
        const velocity = dt ? clamp((slider.value - previousPosition) / dt, -65, 65) : 0;
        swingVelocity -= (velocity - previousVelocity) * 1.8;
        previousPosition = slider.value; previousVelocity = velocity;
        swingVelocity += (-swing * 70 - swingVelocity * 4.4) * dt;
        swing = clamp(swing + swingVelocity * dt, -22, 22);
        if (Math.abs(swing) + Math.abs(swingVelocity) < .03) swing = swingVelocity = 0;
        claw.style.setProperty('--claw-swing', `${swing.toFixed(2)}deg`);
        rod.style.left = claw.style.left;
        if (dropAt === null) return;
        const elapsed = age - dropAt, ease = t => t * t * (3 - 2 * t);
        const depth = ease(clamp(elapsed / 700, 0, 1)) * (1 - ease(clamp((elapsed - 850) / 600, 0, 1))) * travel;
        claw.style.top = depth + 'px'; rod.style.height = (depth + 8) + 'px';
        if (elapsed >= 700 && !grabbed) {
          grabbed = true; caught = slider.moved && Math.abs(slider.value - target) <= 7;
          if (caught) { targetEl.classList.add('is-held'); feedback(); }
        }
        if (caught) targetEl.style.translate = '0 ' + (depth - travel) + 'px';
        if (elapsed < 1450) return;
        claw.classList.remove('is-dropping');
        if (caught) { targetEl.classList.add('is-caught'); finish(); }
        else { dropAt = null; controls.querySelectorAll('button').forEach(control => { control.disabled = false; }); error(); }
      });
      rod.style.left = initial + '%';
      machine.append(rod, targetEl, claw); body.append(machine, controls);
      hint.textContent = 'Hold arrows to move · tap for a nudge · drop';
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
      suspend() { suspenders.forEach(suspend => suspend()); },
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
