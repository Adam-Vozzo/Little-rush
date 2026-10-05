(function () {
  'use strict';

  const catalog = [
    { id: 'bubbles', title: 'POP SIX', color: 'blue' },
    { id: 'jewels', title: 'MAKE THREE', color: 'lavender' },
    { id: 'pegs', title: 'HIT THREE PEGS', color: 'peach' },
    { id: 'telescope', title: 'FIND THE PLANET', color: 'blue' },
    { id: 'board', title: 'LAND ON THE GIFT', color: 'butter' },
    { id: 'golf', title: 'PUTT IT IN', color: 'sage' },
  ];
  const colors = ['#dd706b', '#459db3', '#d7a338', '#71985c'];
  const names = ['coral triangle', 'blue circle', 'gold diamond', 'green square'];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const integer = (random, n) => Math.min(n - 1, Math.floor(random() * n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const radians = degrees => degrees * Math.PI / 180;
  const svgText = body => `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  const gemPaths = [
    '<path d="M20 7 34 31H6Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
    '<circle cx="20" cy="20" r="12"/>',
    '<path d="M20 5 35 20 20 35 5 20Z"/>',
    '<rect x="9" y="9" width="22" height="22" rx="3"/>',
  ];
  const gem = kind => svgText(`<g fill="currentColor" color="${['#d94767', '#218fbe', '#e4b12c', '#429a65'][kind]}" stroke="none">${gemPaths[kind]}</g>`);
  function matches(cells, size = 4) {
    const found = new Set();
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === null) continue;
      for (const step of [1, size]) {
        const run = [i];
        for (let j = i + step; j < cells.length && cells[j] === cells[i] && (step !== 1 || Math.floor(j / size) === Math.floor(i / size)); j += step) run.push(j);
        if (run.length >= 3) run.forEach(index => found.add(index));
      }
    }
    return [...found];
  }
  function swaps(cells) {
    const moves = [];
    cells.forEach((_, i) => {
      for (const j of [i % 4 < 3 ? i + 1 : -1, i + 4]) {
        if (j < 0 || j >= 16 || cells[i] === cells[j]) continue;
        const next = [...cells]; [next[i], next[j]] = [next[j], next[i]];
        if (matches(next).length) moves.push([i, j]);
      }
    });
    return moves;
  }
  function generateJewels(random = Math.random) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const cells = Array.from({length: 16}, () => integer(random, 4));
      if (!matches(cells).length && swaps(cells).length) return cells;
    }
    // Deterministic fallback also handles a constant test/random source.
    return [0, 1, 0, 2, 2, 0, 3, 1, 1, 2, 1, 3, 3, 1, 2, 0];
  }
  const bubblePoint = (row, col) => ({x: 24 + col * 24 + row % 2 * 12, y: 16 + row * 20.8});
  const bubbleNeighbors = (a, b) => distance(a, b) < 25;
  function bubbleCluster(balls, start, sameColor = true) {
    const found = [start], queue = [start];
    while (queue.length) {
      const current = queue.shift();
      for (const ball of balls) {
        if (!found.includes(ball) && (!sameColor || ball.color === start.color) && bubbleNeighbors(current, ball)) { found.push(ball); queue.push(ball); }
      }
    }
    return found;
  }
  const shuffle = (values, random) => { const result = [...values]; for (let i = result.length - 1; i > 0; i--) { const j = integer(random, i + 1); [result[i], result[j]] = [result[j], result[i]]; } return result; };
  function generateBubbles(random = Math.random) {
    const balls = [], start = integer(random, 2), end = 6 - integer(random, 2);
    for (let row = 0; row < 4; row++) for (let col = start; col <= end; col++) {
      const p = bubblePoint(row, col), neighbors = balls.filter(ball => bubbleNeighbors(ball, p));
      if (row && (!neighbors.some(ball => ball.row === row - 1) || random() > [1, .93, .73, .35][row])) continue;
      const color = neighbors.length && random() < .57 ? neighbors[integer(random, neighbors.length)].color : integer(random, 4);
      balls.push({...p, row, col, color});
    }
    // Every rack has an exposed pair to aim at, without repeating striped columns.
    const bottom = [...balls].sort((a, b) => b.y - a.y)[0];
    const partner = balls.find(ball => ball !== bottom && bubbleNeighbors(ball, bottom));
    if (partner) partner.color = bottom.color;
    return balls;
  }
  function generatePegs(random = Math.random) {
    const pegs = [], count = 7 + integer(random, 4);
    const add = (x, y) => {
      const marked = pegs.length < 3, r = marked ? 8 : 5 + integer(random, 2), candidate = {x, y, r, marked, hit: false};
      if (pegs.some(peg => distance(peg, candidate) < peg.r + r + 12)) return false;
      pegs.push(candidate); return true;
    };
    for (let attempt = 0; attempt < 250 && pegs.length < count; attempt++) {
      const y = 40 + random() * 86, spread = Math.min(74, (y - 5) * 1.3);
      add(100 + (random() * 2 - 1) * spread, y);
    }
    // Bounded fallback for degenerate random sources; still respects all gaps.
    for (const y of [44, 82, 121]) for (const x of [44, 82, 120, 158]) if (pegs.length < count) add(x, y);
    return pegs;
  }
  function generateBoard(random = Math.random) {
    const values = shuffle([1, 2, 3, 4, 5, 6], random).slice(0, 4), options = [];
    for (let mask = 1; mask < 16; mask++) {
      const chosen = values.filter((_, i) => mask & 1 << i), total = chosen.reduce((sum, value) => sum + value, 0);
      if (chosen.length >= 2 && chosen.length <= 3 && total >= 6 && total <= 12) options.push(total);
    }
    const goal = options[integer(random, options.length)];
    const neighbors = cell => [cell % 6 ? cell - 1 : -1, cell % 6 < 5 ? cell + 1 : -1, cell - 6, cell + 6].filter(next => next >= 0 && next < 24);
    let route = [], visits = 0;
    const walk = cell => {
      if (++visits > 3000) return false;
      route.push(cell);
      if (route.length === goal + 1) return true;
      for (const next of shuffle(neighbors(cell), random)) {
        if (route.includes(next) || neighbors(next).some(n => n !== cell && route.includes(n))) continue;
        if (walk(next)) return true;
      }
      route.pop(); return false;
    };
    if (!walk(integer(random, 24))) route = [0, 1, 2, 3, 4, 5, 11, 17, 16, 15, 14, 13, 12].slice(0, goal + 1);
    const path = route.map(cell => ({x: 22 + cell % 6 * 31, y: 28 + Math.floor(cell / 6) * 31}));
    return {values, goal, path};
  }
  const telescopeSky = {width: 520, height: 400, edge: 65, planetGap: 110};
  function generatePlanets(random = Math.random) {
    const {width, height, edge, planetGap} = telescopeSky, inset = edge + 10;
    const planets = [], add = p => {
      if (distance(p, {x: width / 2, y: height / 2}) < 60 || planets.some(other => distance(p, other) < planetGap)) return;
      planets.push(p);
    };
    for (let attempt = 0; attempt < 200 && planets.length < 4; attempt++) add({x: inset + random() * (width - inset * 2), y: inset + random() * (height - inset * 2)});
    for (const y of [inset, height / 2, height - inset]) for (const x of [inset, inset + (width - inset * 2) / 3, width - inset - (width - inset * 2) / 3, width - inset]) if (planets.length < 4) add({x, y});
    return planets;
  }
  const obstacleDistance = (p, obstacle) => obstacle.kind === 'wall'
    ? Math.hypot(Math.max(Math.abs(p.x - obstacle.x) - obstacle.w / 2, 0), Math.max(Math.abs(p.y - obstacle.y) - obstacle.h / 2, 0))
    : distance(p, obstacle) - obstacle.r;
  function generateGolf(random = Math.random) {
    const start = {x: 25 + random() * 150, y: 30 + random() * 95};
    let hole = {x: 200 - start.x, y: 150 - start.y, r: 8};
    for (let attempt = 0; attempt < 80; attempt++) {
      const candidate = {x: 25 + random() * 150, y: 30 + random() * 95, r: 8};
      if (distance(start, candidate) >= 95) { hole = candidate; break; }
    }
    if (distance(start, hole) < 95) {
      // Pick a far corner if a constant random source supplied central points.
      hole = [{x: 22, y: 27}, {x: 178, y: 27}, {x: 22, y: 125}, {x: 178, y: 125}].sort((a, b) => distance(start, b) - distance(start, a))[0]; hole.r = 8;
    }
    const obstacles = [], count = 1 + integer(random, 3);
    for (let attempt = 0; attempt < 100 && obstacles.length < count; attempt++) {
      const kind = random() < .45 ? 'wall' : 'bumper', vertical = random() < .5;
      const obstacle = {kind, x: 42 + random() * 116, y: 43 + random() * 65, r: 10 + random() * 7};
      if (kind === 'wall') { obstacle.w = vertical ? 11 : 24 + random() * 18; obstacle.h = vertical ? 24 + random() * 18 : 11; }
      if (obstacleDistance(start, obstacle) < 23 || obstacleDistance(hole, obstacle) < 25) continue;
      const bound = kind === 'wall' ? Math.hypot(obstacle.w, obstacle.h) / 2 : obstacle.r;
      if (obstacles.some(other => distance(obstacle, other) < bound + (other.kind === 'wall' ? Math.hypot(other.w, other.h) / 2 : other.r) + 17)) continue;
      obstacles.push(obstacle);
    }
    return {start, hole, obstacles, turf: integer(random, 3)};
  }
  // Small fixed physics steps prevent thin pegs and holes being skipped on slow frames.
  function advanceBall(ball, seconds, {gravity = 0, friction = 0, radius = 4, top = 4, bottom = Infinity, left = 0, right = 200, bounce = .82, obstacles = [], onHit = () => {}, hole = null} = {}) {
    const steps = Math.max(1, Math.ceil(seconds * 240)), dt = seconds / steps;
    for (let step = 0; step < steps; step++) {
      ball.vy += gravity * dt;
      ball.vx *= Math.exp(-friction * dt); ball.vy *= Math.exp(-friction * dt);
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < left + radius || ball.x > right - radius) { ball.x = clamp(ball.x, left + radius, right - radius); ball.vx *= -bounce; }
      if (ball.y < top + radius) { ball.y = top + radius; ball.vy = Math.abs(ball.vy) * bounce; }
      if (ball.y > bottom - radius) { ball.y = bottom - radius; ball.vy = -Math.abs(ball.vy) * bounce; }
      for (const peg of obstacles) {
        if (peg.hit) continue;
        let center = peg, pegRadius = peg.r;
        if (peg.kind === 'wall') {
          center = {x: clamp(ball.x, peg.x - peg.w / 2, peg.x + peg.w / 2), y: clamp(ball.y, peg.y - peg.h / 2, peg.y + peg.h / 2)}; pegRadius = 0;
        }
        const d = distance(ball, center), limit = radius + pegRadius;
        if (d >= limit) continue;
        const nx = d > .0001 ? (ball.x - center.x) / d : 0, ny = d > .0001 ? (ball.y - center.y) / d : -1;
        ball.x = center.x + nx * (limit + .01); ball.y = center.y + ny * (limit + .01);
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) { ball.vx -= (1 + bounce) * dot * nx; ball.vy -= (1 + bounce) * dot * ny; onHit(peg); }
      }
      if (hole && distance(ball, hole) < hole.r && Math.hypot(ball.vx, ball.vy) < 145) { ball.x = hole.x; ball.y = hole.y; ball.vx = ball.vy = 0; return true; }
    }
    return false;
  }
  const pegLaunch = angle => ({x: 100 + Math.sin(radians(angle)) * 18, y: 5 + Math.cos(radians(angle)) * 18, vx: Math.sin(radians(angle)) * 165, vy: Math.cos(radians(angle)) * 165});
  function pegPreview(angle, pegs) {
    const ball = pegLaunch(angle), obstacles = pegs.map(({x, y, r, hit}) => ({x, y, r, hit}));
    const primary = [{x: ball.x, y: ball.y}], rebound = [];
    let hits = 0, after = 0;
    for (let step = 0; step < 190; step++) {
      const before = hits;
      advanceBall(ball, 1 / 240, {gravity: 180, bounce: .9, obstacles, onHit: peg => { peg.hit = true; hits++; }});
      const p = {x: ball.x, y: ball.y};
      if (!before && hits) { primary.push(p); rebound.push(p); }
      else if (step % 3 === 0 || hits > before) (hits ? rebound : primary).push(p);
      if (hits) after++;
      if (hits >= 2 || after >= 54 || !hits && step >= 131 || ball.y > 150) break;
    }
    return {primary, rebound};
  }
  window.LittleRushArcade = { matches, swaps, generateJewels, bubblePoint, bubbleCluster, generateBubbles, generatePegs, generateBoard, generatePlanets, generateGolf, obstacleDistance, advanceBall, pegLaunch, pegPreview };
  let sceneSerial = 0;

  function mount(container, type, {demo = false, random = Math.random, onComplete = () => {}, onFeedback = () => {}} = {}) {
    let done = false, destroyed = false, age = 0;
    const listeners = [], tickers = [], suspenders = [], captures = new Map();
    const node = (tag, cls = '', text) => { const el = document.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el; };
    const snode = (tag, attrs = {}, text) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value)); if (text !== undefined) el.textContent = text; return el; };
    const attr = (el, values) => Object.entries(values).forEach(([key, value]) => el.setAttribute(key, value));
    const root = node('div', `mg mg-arcade mg-${type}${demo ? ' mg-demo' : ''}`), body = node('div', 'mg-body'), hint = node('div', 'mg-hint');
    hint.setAttribute('aria-live', 'polite'); root.append(body, hint); container.append(root);
    const listen = (el, event, fn) => { if (demo) return; const cb = e => { if (!done && !destroyed) fn(e); }; el.addEventListener(event, cb); listeners.push(() => el.removeEventListener(event, cb)); };
    const button = (cls, label, text, fn) => { const el = node('button', cls, text); el.type = 'button'; el.setAttribute('aria-label', label); if (demo) el.tabIndex = -1; if (fn) listen(el, 'click', fn); return el; };
    const feedback = () => onFeedback('tap');
    const release = el => { const id = captures.get(el); captures.delete(el); if (id !== undefined && el.hasPointerCapture?.(id)) el.releasePointerCapture(id); };
    const capture = (el, e) => { el.setPointerCapture(e.pointerId); captures.set(el, e.pointerId); };
    const finish = () => { if (done || destroyed || demo) return; done = true; suspenders.forEach(fn => fn()); for (const el of captures.keys()) release(el); root.classList.add('mg-complete'); onComplete(); };
    const scene = (label, interactive = false) => {
      const el = snode('svg', {viewBox: '0 0 200 150', class: 'arc-scene', role: interactive ? 'group' : 'img', 'aria-label': label});
      if (interactive) el.setAttribute('tabindex', demo ? '-1' : '0');
      body.append(el); return el;
    };
    const caption = text => { const el = node('div', 'arc-caption', text); body.append(el); return el; };
    const point = (el, e) => { const rect = el.getBoundingClientRect(), height = Number(el.getAttribute('viewBox').split(' ')[3]), scale = Math.min(rect.width / 200, rect.height / height); return {x: (e.clientX - rect.left - (rect.width - 200 * scale) / 2) / scale, y: (e.clientY - rect.top - (rect.height - height * scale) / 2) / scale}; };
    // Match the actual play area without stretching circles or letterboxing the field.
    const fitScene = (field, resized) => {
      if (!window.ResizeObserver) return;
      const observer = new window.ResizeObserver(() => {
        if (destroyed || !field.clientWidth || !field.clientHeight) return;
        const height = 200 * field.clientHeight / field.clientWidth;
        field.setAttribute('viewBox', `0 0 200 ${height}`); resized(height);
      });
      observer.observe(field); listeners.push(() => observer.disconnect());
    };
    const aimControls = (field, direction, fire, changed, allowed) => {
      let angle = 0, pointer = null, original = 0;
      const controls = node('div', 'arc-controls');
      const shoot = button('arc-fire', 'Shoot ball', 'SHOOT', () => { if (allowed() && pointer === null) { fire(angle); feedback(); } });
      controls.append(shoot); body.append(controls);
      attr(field, {role: 'slider', 'aria-label': 'Drag to aim the ball', 'aria-valuemin': -65, 'aria-valuemax': 65, 'aria-orientation': 'horizontal'});
      const aim = value => { angle = clamp(value, -65, 65); changed(angle); field.setAttribute('aria-valuenow', String(Math.round(angle))); field.setAttribute('aria-valuetext', `${Math.abs(Math.round(angle))} degrees ${angle < 0 ? 'left' : 'right'}`); };
      const pointAim = e => { const p = point(field, e), dx = p.x - 100, dy = (p.y - (direction === -1 ? 138 : 5)) * direction; if (Math.hypot(dx, dy) >= 8) aim(Math.atan2(dx, Math.max(12, dy)) * 180 / Math.PI); };
      listen(field, 'pointerdown', e => { if (pointer !== null || e.button !== 0 || !allowed()) return; e.preventDefault(); pointer = e.pointerId; original = angle; capture(field, e); pointAim(e); field.classList.add('is-aiming'); });
      listen(field, 'pointermove', e => { if (pointer !== e.pointerId || !allowed()) return; e.preventDefault(); pointAim(e); });
      const stop = canceled => { if (pointer === null) return; pointer = null; if (canceled) aim(original); field.classList.remove('is-aiming'); release(field); };
      listen(field, 'pointerup', e => { if (pointer !== e.pointerId) return; if (allowed()) pointAim(e); stop(false); });
      for (const event of ['pointercancel', 'lostpointercapture']) listen(field, event, e => { if (pointer === e.pointerId) stop(true); });
      listen(field, 'blur', () => stop(true)); suspenders.push(() => stop(true));
      listen(field, 'keydown', e => { if (pointer !== null || !allowed() || !['ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key)) return; e.preventDefault(); if (e.key === 'ArrowLeft') aim(angle - 2); else if (e.key === 'ArrowRight') aim(angle + 2); else if (!e.repeat) { fire(angle); feedback(); } });
      aim(0);
      return { update() { shoot.disabled = !allowed(); field.setAttribute('aria-disabled', String(!allowed())); }, get angle() { return angle; } };
    };

    if (type === 'bubbles') {
      const field = scene('Bubble shooter. Match three of a color. Clear six bubbles.', true);
      const layer = snode('g'), guide = snode('path', {class: 'arc-guide'}), barrel = snode('path', {d: 'M100 138V119', class: 'arc-barrel'}), loaded = snode('circle', {cx: 100, cy: 137, r: 10, class: 'arc-bubble'}), projectile = snode('circle', {r: 10, class: 'arc-bubble', visibility: 'hidden'});
      field.append(guide, layer, barrel, loaded, projectile);
      let balls = [], shot = null, readyAt = 0, cleared = 0, color = 0, angle = 0;
      const status = caption('0 / 6');
      const paintAim = value => {
        angle = value; barrel.setAttribute('transform', `rotate(${angle} 100 138)`);
        let x = 100 + Math.sin(radians(angle)) * 18, y = 138 - Math.cos(radians(angle)) * 18, vx = Math.sin(radians(angle)) * 5, vy = -Math.cos(radians(angle)) * 5;
        let d = `M${x} ${y}`;
        for (let i = 0; i < 35; i++) { x += vx; y += vy; if (x < 11 || x > 189) { x = clamp(x, 11, 189); vx *= -1; } if (y < 10 || balls.some(ball => distance(ball, {x, y}) < 23)) break; d += `L${x} ${y}`; }
        guide.setAttribute('d', d);
      };
      const makeBall = (row, col, value) => { const ball = {...bubblePoint(row, col), row, col, color: value}; ball.el = snode('g', {class: 'arc-bubble-piece', transform: `translate(${ball.x} ${ball.y})`}); ball.el.append(snode('circle', {r: 11, fill: colors[value], class: 'arc-bubble'})); layer.append(ball.el); return ball; };
      const load = () => {
        // Pick an exposed cluster, so the next color always has a reachable match.
        const exposed = balls.filter(ball => !balls.some(other => other.y > ball.y && Math.abs(other.x - ball.x) < 14));
        const choices = exposed.filter(ball => bubbleCluster(balls, ball).length >= 2);
        color = (choices.length ? choices : exposed)[integer(random, (choices.length ? choices : exposed).length)]?.color ?? 0;
        loaded.setAttribute('fill', colors[color]); paintAim(angle);
      };
      const resetRack = () => {
        balls.forEach(ball => ball.el.remove()); balls = [];
        balls = generateBubbles(random).map(ball => makeBall(ball.row, ball.col, ball.color));
        load();
      };
      const settle = () => {
        const candidates = [];
        for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
          if (balls.some(ball => ball.row === row && ball.col === col)) continue;
          const p = bubblePoint(row, col);
          if (p.x > 188 || (row > 0 && !balls.some(ball => bubbleNeighbors(ball, p)))) continue;
          candidates.push({...p, row, col});
        }
        candidates.sort((a, b) => distance(a, shot) - distance(b, shot));
        const target = candidates[0];
        let cluster, required = 3;
        if (target) { const added = makeBall(target.row, target.col, color); balls.push(added); cluster = bubbleCluster(balls, added); }
        else {
          // Even a full rack can be cleared: the incoming ball completes a pair
          // at its point of impact instead of discarding the player's board.
          const impact = [...balls].sort((a, b) => distance(a, shot) - distance(b, shot))[0];
          cluster = impact?.color === color ? bubbleCluster(balls, impact) : []; required = 2;
        }
        const popped = new Set(cluster.length >= required ? cluster : []);
        if (popped.size) {
          const remaining = balls.filter(ball => !popped.has(ball)), attached = new Set();
          remaining.filter(ball => ball.row === 0).forEach(ball => bubbleCluster(remaining, ball, false).forEach(member => attached.add(member)));
          remaining.filter(ball => !attached.has(ball)).forEach(ball => popped.add(ball));
          cleared += popped.size; feedback();
          popped.forEach(ball => { ball.el.classList.add('is-popped'); ball.removeAt = age + 340; });
          status.textContent = `${Math.min(6, cleared)} / 6`; hint.textContent = `${Math.min(6, cleared)} of six bubbles cleared`;
        } else { hint.textContent = 'Aim for two or more bubbles of the same color'; }
        shot = null; readyAt = age + 380; projectile.setAttribute('visibility', 'hidden');
        if (cleared >= 6) finish();
      };
      const controls = aimControls(field, -1, value => {
        shot = {x: 100 + Math.sin(radians(value)) * 18, y: 138 - Math.cos(radians(value)) * 18, vx: Math.sin(radians(value)) * 220, vy: -Math.cos(radians(value)) * 220};
        attr(projectile, {visibility: 'visible', fill: colors[color], cx: shot.x, cy: shot.y}); loaded.setAttribute('visibility', 'hidden'); guide.setAttribute('visibility', 'hidden'); controls.update();
      }, paintAim, () => !shot && age >= readyAt);
      resetRack();
      tickers.push(dt => {
        const expired = balls.filter(ball => ball.removeAt && age >= ball.removeAt); expired.forEach(ball => ball.el.remove()); balls = balls.filter(ball => !expired.includes(ball));
        if (shot) {
          for (let remaining = dt / 1000; remaining > 0 && shot; remaining -= 1 / 240) {
            const step = Math.min(1 / 240, remaining); shot.x += shot.vx * step; shot.y += shot.vy * step;
            if (shot.x < 11 || shot.x > 189) { shot.x = clamp(shot.x, 11, 189); shot.vx *= -1; }
            if (shot.y <= 11 || balls.some(ball => !ball.removeAt && distance(ball, shot) <= 22)) settle();
          }
          if (shot) attr(projectile, {cx: shot.x, cy: shot.y});
        } else if (age >= readyAt) {
          if (readyAt) load();
          readyAt = 0; loaded.setAttribute('visibility', 'visible'); guide.setAttribute('visibility', 'visible');
        }
        controls.update();
      });
      hint.textContent = 'Tap or drag to aim, then press Shoot. Match three to clear six. Arrow keys aim; Space shoots.';
    } else if (type === 'jewels') {
      let cells = generateJewels(random), selected = null, pending = null, pointer = null, ignoreClick = false;
      const grid = node('div', 'arc-jewels'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Swap neighboring shapes to make three in a row');
      body.append(grid);
      const pieces = cells.map((_, i) => button('arc-gem', '', undefined, () => { if (ignoreClick) { ignoreClick = false; return; } choose(i); }));
      const paint = () => pieces.forEach((piece, i) => { piece.innerHTML = gem(cells[i]); piece.setAttribute('aria-label', `${names[cells[i]]}, row ${Math.floor(i / 4) + 1}, column ${i % 4 + 1}`); piece.setAttribute('aria-pressed', selected === i ? 'true' : 'false'); });
      const neighbor = (a, b) => Math.abs(a % 4 - b % 4) + Math.abs(Math.floor(a / 4) - Math.floor(b / 4)) === 1;
      const swap = (a, b) => {
        if (pending || !neighbor(a, b)) return;
        selected = null; paint(); feedback();
        const rect = pieces[a].getBoundingClientRect(), dx = (b % 4 - a % 4) * (rect.width + 3), dy = (Math.floor(b / 4) - Math.floor(a / 4)) * (rect.height + 3);
        pieces[a].style.transform = `translate(${dx}px,${dy}px)`; pieces[b].style.transform = `translate(${-dx}px,${-dy}px)`;
        pending = {a, b, at: age + 180, phase: 'swap'};
      };
      function choose(i) { if (pending) return; if (selected === i) selected = null; else if (selected !== null && neighbor(selected, i)) return swap(selected, i); else selected = i; paint(); }
      const drag = e => {
        if (pointer?.id !== e.pointerId) return;
        const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
        if (!pointer.axis && Math.hypot(dx, dy) < 5) return;
        e.preventDefault(); pointer.axis ||= Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        const offset = pointer.axis === 'x' ? dx : dy, span = pointer.axis === 'x' ? pointer.width : pointer.height;
        const j = pointer.i + (pointer.axis === 'x' ? 1 : 4) * (offset < 0 ? -1 : 1), valid = j >= 0 && j < 16 && neighbor(pointer.i, j);
        if (pointer.partner !== null && pointer.partner !== j) { pieces[pointer.partner].classList.remove('is-dragging'); pieces[pointer.partner].style.transform = ''; }
        pointer.partner = valid ? j : null; pointer.offset = offset;
        const amount = clamp(offset, -span * (valid ? 1 : .15), span * (valid ? 1 : .15));
        const x = pointer.axis === 'x' ? amount : 0, y = pointer.axis === 'y' ? amount : 0;
        pieces[pointer.i].classList.add('is-dragging'); pieces[pointer.i].style.transform = `translate(${x}px,${y}px)`;
        if (valid) { pieces[j].classList.add('is-dragging'); pieces[j].style.transform = `translate(${-x}px,${-y}px)`; }
      };
      const endDrag = canceled => {
        if (!pointer) return;
        const owner = pointer; pointer = null; release(pieces[owner.i]);
        pieces[owner.i].classList.remove('is-dragging'); if (owner.partner !== null) pieces[owner.partner].classList.remove('is-dragging');
        ignoreClick = !!owner.axis;
        if (!canceled && owner.partner !== null && Math.abs(owner.offset) >= 9) swap(owner.i, owner.partner);
        else { pieces[owner.i].style.transform = ''; if (owner.partner !== null) pieces[owner.partner].style.transform = ''; }
      };
      pieces.forEach((piece, i) => {
        grid.append(piece);
        listen(piece, 'pointerdown', e => { if (pointer || pending || e.button !== 0) return; ignoreClick = false; const rect = piece.getBoundingClientRect(); pointer = {id: e.pointerId, x: e.clientX, y: e.clientY, i, width: rect.width + 3, height: rect.height + 3, axis: null, partner: null, offset: 0}; capture(piece, e); });
        listen(piece, 'pointermove', drag);
        listen(piece, 'pointerup', e => {
          if (pointer?.id !== e.pointerId) return;
          drag(e); endDrag(false);
        });
        const cancel = e => { if (pointer?.id === e.pointerId) endDrag(true); };
        listen(piece, 'pointercancel', cancel); listen(piece, 'lostpointercapture', cancel);
        listen(piece, 'keydown', e => { const step = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4}[e.key]; if (!step || pointer) return; e.preventDefault(); const j = i + step; if (j >= 0 && j < 16 && neighbor(i, j)) swap(i, j); });
      });
      suspenders.push(() => endDrag(true));
      tickers.push(() => {
        if (!pending || age < pending.at) return;
        const {a, b, phase} = pending;
        pieces[a].style.transform = pieces[b].style.transform = '';
        if (phase === 'return') { pending = null; hint.textContent = 'Try a different neighboring swap'; return; }
        const next = [...cells]; [next[a], next[b]] = [next[b], next[a]];
        const run = matches(next);
        if (run.length) { pieces[a].classList.add('is-teleport'); pieces[b].classList.add('is-teleport'); cells = next; paint(); run.forEach(i => pieces[i].classList.add('is-cleared')); hint.textContent = 'Three in a row!'; finish(); }
        else { onFeedback('error'); pending = {a, b, phase: 'return', at: age + 180}; }
      });
      paint(); hint.textContent = 'Tap two neighboring shapes, or swipe one, to make three in a row.';
    } else if (type === 'pegs') {
      const field = scene('Aim from the top. Hit all three marked gold pegs over as many shots as needed.', true);
      const pegs = generatePegs(random);
      const guide = snode('path', {class: 'arc-guide'}), rebound = snode('path', {class: 'arc-guide arc-rebound'}), barrel = snode('path', {d: 'M100 5V23', class: 'arc-barrel'}), projectile = snode('circle', {r: 4.5, fill: '#fffaf0', stroke: '#4c6054', 'stroke-width': 1.5, visibility: 'hidden'});
      field.append(guide, rebound, barrel);
      pegs.forEach(peg => { peg.el = snode('g', {class: `arc-peg${peg.marked ? ' is-marked' : ''}`, transform: `translate(${peg.x} ${peg.y})`}); peg.el.append(snode('circle', {r: peg.r})); if (peg.marked) peg.el.append(snode('path', {d: 'M-3 0H3M0-3V3', stroke: '#fffaf0', 'stroke-width': 2, 'stroke-linecap': 'round'})); field.append(peg.el); });
      field.append(projectile); const status = caption('0 / 3 GOLD PEGS');
      let ball = null, hits = 0, readyAt = 0, flight = 0;
      const paintAim = angle => {
        barrel.setAttribute('transform', `rotate(${-angle} 100 5)`);
        const preview = pegPreview(angle, pegs), path = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
        guide.setAttribute('d', path(preview.primary)); rebound.setAttribute('d', path(preview.rebound));
      };
      const controls = aimControls(field, 1, value => {
        ball = pegLaunch(value); flight = 0;
        attr(projectile, {cx: ball.x, cy: ball.y, visibility: 'visible'}); guide.setAttribute('visibility', 'hidden'); rebound.setAttribute('visibility', 'hidden'); controls.update();
      }, paintAim, () => !ball && age >= readyAt);
      tickers.push(dt => {
        if (ball) {
          flight += dt;
          advanceBall(ball, dt / 1000, {gravity: 180, bounce: .9, obstacles: pegs, onHit: peg => { peg.hit = true; peg.el.classList.add('is-hit'); feedback(); if (peg.marked) { hits++; status.textContent = `${hits} / 3 GOLD PEGS`; hint.textContent = `${hits} of three marked pegs hit`; } }});
          attr(projectile, {cx: ball.x, cy: ball.y});
          if (hits === 3) { finish(); return; }
          if (ball.y > 160 || flight > 5500) { ball = null; readyAt = age + 280; projectile.setAttribute('visibility', 'hidden'); }
        } else if (age >= readyAt) { if (readyAt) { paintAim(controls.angle); readyAt = 0; } guide.setAttribute('visibility', 'visible'); rebound.setAttribute('visibility', 'visible'); }
        controls.update();
      });
      hint.textContent = 'Tap or drag to aim, then press Shoot. Hit the three gold pegs. Arrow keys aim; Space shoots.';
    } else if (type === 'telescope') {
      const field = scene('Telescope. Drag the sky or use arrow keys to center the target planet in the crosshair.', true), id = `arc-scope-${++sceneSerial}`;
      const defs = snode('defs'), clip = snode('clipPath', {id}), aperture = snode('rect', {x: 0, y: 20, width: 200, height: 130, rx: 16}); clip.append(aperture); defs.append(clip); field.append(defs);
      const viewport = snode('g', {'clip-path': `url(#${id})`}), sky = snode('g'), night = snode('rect', {width: 200, height: 150, fill: '#27394e'}); viewport.append(night, sky); field.append(viewport);
      const {width, height, edge} = telescopeSky;
      for (let i = 0; i < 100; i++) sky.append(snode('circle', {cx: 10 + (i * 73 % (width - 20)), cy: 10 + (i * 113 % (height - 20)), r: i % 5 === 0 ? 1.4 : .7, fill: '#e7f1ef', opacity: .25 + (i % 4) * .15}));
      const planets = generatePlanets(random);
      const offset = integer(random, 4), target = integer(random, 4);
      const planetGraphic = (kind, x, y, scale = 1) => {
        const group = snode('g', {transform: `translate(${x} ${y}) scale(${scale})`});
        if (kind === 2) group.append(snode('ellipse', {class: 'arc-ring-back', rx: 20, ry: 6, fill: 'none', stroke: '#c5a567', 'stroke-width': 3, transform: 'rotate(-25)'}));
        group.append(snode('circle', {r: 13, fill: colors[kind]}), snode('path', {d: 'M-9-7Q0-12 8-5M-11 1Q-1-5 11 2', fill: 'none', stroke: '#fff', opacity: '.28', 'stroke-width': 3}));
        if (kind === 2) group.append(snode('path', {class: 'arc-ring-front', d: 'M-20 0A20 6 0 0 0 20 0', fill: 'none', stroke: '#f4d491', 'stroke-width': 3, transform: 'rotate(-25)'}));
        else if (kind === 1) group.append(snode('circle', {cx: 7, cy: 6, r: 4, fill: '#267786'}));
        else if (kind === 3) group.append(snode('circle', {cx: -4, cy: 5, r: 4, fill: '#bad18b'}));
        return group;
      };
      planets.forEach((planet, i) => sky.append(planetGraphic((i + offset) % 4, planet.x, planet.y)));
      const reference = planetGraphic((target + offset) % 4, 30, 20, 1.2); reference.setAttribute('class', 'arc-target-planet'); field.append(reference);
      const cross = snode('circle', {cx: 100, cy: 77, r: 18, fill: 'none', stroke: '#dceadc', 'stroke-width': 1, 'stroke-dasharray': '3 4'}), lock = snode('circle', {cx: 100, cy: 77, r: 22, fill: 'none', stroke: '#b9dea7', 'stroke-width': 3, 'stroke-dasharray': '0 139', transform: 'rotate(-90 100 77)'});
      const reticle = snode('g'); reticle.append(cross, lock, snode('path', {d: 'M100 50V55M100 99V104M73 77H78M122 77H127', stroke: '#e4ead8', 'stroke-width': 1})); field.append(reticle);
      let camera = {x: width / 2, y: height / 2}, pointer = null, locked = 0, centerY = 85;
      const paint = () => { sky.setAttribute('transform', `translate(${100 - camera.x} ${centerY - camera.y})`); reticle.setAttribute('transform', `translate(0 ${centerY - 77})`); field.setAttribute('aria-description', `View ${Math.round(camera.x)}, ${Math.round(camera.y)}. Target ${['coral', 'blue', 'ringed gold', 'green'][(target + offset) % 4]} planet.`); };
      fitScene(field, height => { aperture.setAttribute('height', height - 20); night.setAttribute('height', height); centerY = (height + 20) / 2; paint(); });
      listen(field, 'pointerdown', e => { if (pointer || e.button !== 0) return; e.preventDefault(); pointer = {id: e.pointerId, at: point(field, e), camera: {...camera}}; capture(field, e); });
      listen(field, 'pointermove', e => { if (pointer?.id !== e.pointerId) return; e.preventDefault(); const p = point(field, e); camera = {x: clamp(pointer.camera.x - p.x + pointer.at.x, edge, width - edge), y: clamp(pointer.camera.y - p.y + pointer.at.y, edge, height - edge)}; paint(); });
      const cancel = () => { pointer = null; release(field); };
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(field, event, e => { if (pointer?.id === e.pointerId) cancel(); });
      suspenders.push(cancel);
      listen(field, 'keydown', e => { const d = {ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12]}[e.key]; if (!d) return; e.preventDefault(); camera.x = clamp(camera.x + d[0], edge, width - edge); camera.y = clamp(camera.y + d[1], edge, height - edge); paint(); });
      tickers.push(dt => { const found = distance(camera, planets[target]) < 14; locked = found ? locked + dt : 0; lock.setAttribute('stroke-dasharray', `${Math.min(1, locked / 400) * 139} 139`); if (locked >= 400) { hint.textContent = 'Target planet found'; finish(); } });
      paint(); hint.textContent = 'Find the pictured planet, then hold it in the center of the telescope.';
    } else if (type === 'board') {
      const field = scene('A winding board path. Choose a die to land exactly on the gift. Going past it returns to the start.');
      const {path, goal, values} = generateBoard(random), used = new Set();
      path.forEach((p, i) => { field.append(snode('rect', {class: 'arc-board-space', x: p.x - 14, y: p.y - 14, width: 28, height: 28, rx: 5, fill: i === goal ? '#efd282' : i % 2 ? '#e7ead8' : '#f9f5df', stroke: '#798d72', 'stroke-width': 1})); if (i > 0 && i < goal) field.append(snode('circle', {cx: p.x, cy: p.y, r: 2, fill: '#93a48a'})); });
      const reward = snode('g', {class: 'arc-reward', transform: `translate(${path[goal].x} ${path[goal].y})`}); reward.append(snode('rect', {x: -8, y: -5, width: 16, height: 13, rx: 2, fill: '#c87369'}), snode('path', {d: 'M0-5V8M-9-5H9M0-6C-14-15-5-18 0-6C14-15 5-18 0-6', fill: 'none', stroke: '#fff0c0', 'stroke-width': 2})); field.append(reward);
      const pawn = snode('g', {class: 'arc-pawn'}); pawn.append(snode('ellipse', {cy: 8, rx: 8, ry: 3, fill: '#304e4933'}), snode('path', {d: 'M-7 6Q-8-2-3-4H3Q8-2 7 6Z', fill: '#4f8792', stroke: '#f5f4df', 'stroke-width': 1.5}), snode('circle', {cy: -7, r: 5, fill: '#4f8792', stroke: '#f5f4df', 'stroke-width': 1.5})); field.append(pawn);
      const status = snode('text', {x: 99, y: 76, 'text-anchor': 'middle', class: 'arc-board-status'}, ''); field.append(status);
      const controls = node('div', 'arc-board-dice'); body.append(controls);
      let position = 0, motion = null;
      const dice = values.map((value, i) => button('arc-die', '', undefined, () => {
        if (motion || used.has(i)) return; feedback(); used.add(i); dice.forEach(die => { die.disabled = true; }); dice[i].classList.add('is-rolling'); motion = {start: age + 230, from: position, steps: value, die: i};
      })); controls.append(...dice);
      const pips = [[0, 0], [-8, -8], [8, 8], [8, -8], [-8, 8], [-8, 0], [8, 0]];
      const pipIndices = {1: [0], 2: [1, 2], 3: [0, 1, 2], 4: [1, 2, 3, 4], 5: [0, 1, 2, 3, 4], 6: [1, 2, 3, 4, 5, 6]};
      const paintDice = () => {
        dice.forEach((die, i) => { die.disabled = used.has(i); die.classList.remove('is-rolling'); die.classList.toggle('is-used', used.has(i)); die.setAttribute('aria-label', `${used.has(i) ? 'Used: ' : ''}Move ${values[i]} spaces`); });
      };
      dice.forEach((die, i) => { die.innerHTML = svgText(pipIndices[values[i]].map(index => `<circle cx="${20 + pips[index][0]}" cy="${20 + pips[index][1]}" r="2.7" fill="currentColor" stroke="none"/>`).join('')); });
      const paint = p => pawn.setAttribute('transform', `translate(${p.x} ${p.y})`);
      const waypoint = index => path[index] || {x: path[goal].x + (index - goal) * (path[goal].x - path[goal - 1].x) * .55, y: path[goal].y + (index - goal) * (path[goal].y - path[goal - 1].y) * .55};
      tickers.push(() => {
        if (!motion || age < motion.start) return;
        dice[motion.die].classList.remove('is-rolling');
        if (motion.resetAt) { if (age >= motion.resetAt) { position = 0; used.clear(); paint(path[0]); status.textContent = ''; motion = null; paintDice(); } return; }
        const progress = Math.min(motion.steps, (age - motion.start) / 150), step = Math.floor(progress), t = progress - step;
        const fromIndex = motion.from + step, a = waypoint(fromIndex), b = waypoint(fromIndex + 1);
        paint({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 7});
        if (progress < motion.steps) return;
        position = motion.from + motion.steps;
        dice[motion.die].classList.add('is-used');
        if (position === goal) { paint(path[goal]); status.textContent = 'A LITTLE GIFT!'; reward.classList.add('is-won'); hint.textContent = 'Landed exactly on the gift'; finish(); }
        else if (position > goal || used.size === 4) { paint(waypoint(position)); status.textContent = position > goal ? 'TOO FAR · RETRY' : 'TRY AGAIN'; hint.textContent = 'Back to the start. Try a different combination of the same dice.'; onFeedback('error'); motion.resetAt = age + 450; }
        else { paint(path[position]); status.textContent = ''; hint.textContent = 'Choose another die'; motion = null; paintDice(); }
      });
      paint(path[0]); paintDice(); hint.textContent = 'Choose from the four dice. Each can be used once. Land exactly on the gift.';
    } else if (type === 'golf') {
      const field = scene('Mini golf. Drag back from the ball and release to putt. Keyboard: left/right aim, up/down power, Space to shoot.', true);
      const {start, hole, obstacles, turf} = generateGolf(random);
      let ball = {...start, vx: 0, vy: 0}, moving = false, drag = null, keyboardAngle = Math.atan2(hole.y - start.y, hole.x - start.x) * 180 / Math.PI, power = 34, courseHeight = 150;
      const course = snode('rect', {x: 3, y: 3, width: 194, height: 144, rx: 16, fill: ['#8fb78b', '#8eaf94', '#a2bc88'][turf], stroke: '#496f55', 'stroke-width': 5});
      field.append(course);
      obstacles.forEach(obstacle => {
        obstacle.el = snode('g'); field.append(obstacle.el);
        if (obstacle.kind === 'wall') obstacle.el.append(snode('rect', {class: 'arc-golf-wall', x: -obstacle.w / 2, y: -obstacle.h / 2, width: obstacle.w, height: obstacle.h, rx: 3, fill: '#d2c596', stroke: '#f4e9bd', 'stroke-width': 2}));
        else obstacle.el.append(snode('circle', {r: obstacle.r + 2, fill: '#547755'}), snode('circle', {class: 'arc-golf-bumper', r: obstacle.r, fill: '#bfd3a0', stroke: '#edf0c8', 'stroke-width': 2}));
        obstacle.el.setAttribute('transform', `translate(${obstacle.x} ${obstacle.y})`);
      });
      const cup = snode('circle', {class: 'arc-golf-hole', cx: hole.x, cy: hole.y, r: 8, fill: '#293f35', stroke: '#d6e5b9', 'stroke-width': 2}), flag = snode('path', {d: `M${hole.x} ${hole.y - 2}v-22l14 5-14 5`, fill: '#efb269', stroke: '#fff2d3', 'stroke-width': 1.5, 'stroke-linejoin': 'round'}); field.append(cup, flag);
      const guide = snode('path', {class: 'arc-golf-guide', visibility: 'hidden'}), grip = snode('circle', {cx: ball.x, cy: ball.y, r: 12, fill: 'none', stroke: '#eef4d9', 'stroke-width': 1, opacity: '.7'}), ballEl = snode('circle', {cx: ball.x, cy: ball.y, r: 5, fill: '#fffef3', stroke: '#516f59', 'stroke-width': 1, class: 'arc-golf-ball'});
      field.append(guide, grip, ballEl); const label = hint;
      const paintBall = () => { attr(ballEl, {cx: ball.x, cy: ball.y}); attr(grip, {cx: ball.x, cy: ball.y, visibility: moving ? 'hidden' : 'visible'}); };
      fitScene(field, height => {
        const ratio = height / courseHeight;
        ball.y *= ratio; ball.vy *= ratio; hole.y *= ratio; courseHeight = height;
        course.setAttribute('height', height - 6);
        obstacles.forEach(obstacle => { obstacle.y *= ratio; obstacle.el.setAttribute('transform', `translate(${obstacle.x} ${obstacle.y})`); });
        cup.setAttribute('cy', hole.y); flag.setAttribute('d', `M${hole.x} ${hole.y - 2}v-22l14 5-14 5`); paintBall();
      });
      const aim = (dx, dy) => {
        const size = Math.hypot(dx, dy), factor = size > 60 ? 60 / size : 1;
        dx *= factor; dy *= factor;
        const heat = Math.min(1, size / 60);
        attr(guide, {visibility: 'visible', d: `M${ball.x} ${ball.y}L${ball.x - dx} ${ball.y - dy}`, stroke: `rgb(255, ${Math.round(255 - heat * 180)}, ${Math.round(255 - heat * 175)})`});
        label.textContent = `${Math.round(Math.min(1, size / 60) * 100)}% POWER`; return {dx, dy};
      };
      const launch = (dx, dy) => { guide.setAttribute('visibility', 'hidden'); if (Math.hypot(dx, dy) < 3) { label.textContent = 'PULL BACK · RELEASE'; return; } ball.vx = dx * 4.5; ball.vy = dy * 4.5; moving = true; label.textContent = 'NICE AND EASY…'; feedback(); };
      listen(field, 'pointerdown', e => { if (drag || moving || e.button !== 0) return; const p = point(field, e); if (distance(p, ball) > 28) return; e.preventDefault(); drag = {id: e.pointerId, at: p, dx: 0, dy: 0}; capture(field, e); });
      const dragAim = e => { if (drag?.id !== e.pointerId) return; const p = point(field, e), next = aim(drag.at.x - p.x, drag.at.y - p.y); drag.dx = next.dx; drag.dy = next.dy; };
      listen(field, 'pointermove', e => { if (drag?.id === e.pointerId) { e.preventDefault(); dragAim(e); } });
      listen(field, 'pointerup', e => { if (drag?.id !== e.pointerId) return; dragAim(e); const {dx, dy} = drag; drag = null; release(field); launch(dx, dy); });
      const cancel = () => { drag = null; release(field); guide.setAttribute('visibility', 'hidden'); if (!moving && !done) label.textContent = 'PULL BACK · RELEASE'; };
      for (const event of ['pointercancel', 'lostpointercapture']) listen(field, event, e => { if (drag?.id === e.pointerId) cancel(); }); suspenders.push(cancel);
      listen(field, 'keydown', e => {
        if (moving || drag || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(e.key)) return;
        e.preventDefault(); if (e.key === 'ArrowLeft') keyboardAngle -= 5; if (e.key === 'ArrowRight') keyboardAngle += 5; if (e.key === 'ArrowUp') power = Math.min(60, power + 4); if (e.key === 'ArrowDown') power = Math.max(4, power - 4);
        const dx = Math.cos(radians(keyboardAngle)) * power, dy = Math.sin(radians(keyboardAngle)) * power;
        if ([' ', 'Enter'].includes(e.key)) launch(dx, dy); else aim(dx, dy);
      });
      tickers.push(dt => {
        if (!moving) return;
        const sunk = advanceBall(ball, dt / 1000, {friction: 1.35, radius: 5, top: 4, bottom: courseHeight - 4, left: 4, right: 196, bounce: .7, obstacles, hole}); paintBall();
        if (sunk) { moving = false; ballEl.classList.add('is-sunk'); label.textContent = 'IN THE CUP!'; hint.textContent = 'Ball in the hole'; finish(); }
        else if (Math.hypot(ball.vx, ball.vy) < 6) { moving = false; ball.vx = ball.vy = 0; paintBall(); label.textContent = 'PULL BACK · RELEASE'; }
      });
      hint.textContent = 'Pull back from the ball to set direction and power, then release. Use another putt if needed.';
    }

    return {
      tick(ageMs, deltaMs = 0) { if (done || destroyed || demo) return; age = Math.max(age, ageMs); for (const ticker of tickers) { ticker(clamp(deltaMs, 0, 100)); if (done) break; } },
      suspend() { suspenders.forEach(fn => fn()); },
      destroy() { if (destroyed) return; destroyed = true; suspenders.forEach(fn => fn()); for (const el of captures.keys()) release(el); listeners.forEach(remove => remove()); root.remove(); },
    };
  }
  window.LittleRushGames.register(catalog, mount);
})();
