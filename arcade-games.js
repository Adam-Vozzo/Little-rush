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
  const names = ['coral diamond', 'blue circle', 'gold star', 'green square'];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const integer = (random, n) => Math.min(n - 1, Math.floor(random() * n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const radians = degrees => degrees * Math.PI / 180;
  const svgText = body => `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  const gemPaths = [
    '<path d="m20 3 16 17-16 17L4 20Z"/><path d="m20 8 10 12-10-3-10 3Z" fill="#fff" opacity=".4"/><path d="m20 17 0 15 10-12Z" fill="#000" opacity=".1"/>',
    '<circle cx="20" cy="20" r="15"/><path d="M10 18a11 11 0 0 1 14-9" fill="none" stroke="#fff" opacity=".65" stroke-width="3" stroke-linecap="round"/>',
    '<path d="m20 3 5 11 12 2-9 9 2 12-10-6-10 6 2-12-9-9 12-2Z"/><path d="m20 7 0 16-12-6 9-1Z" fill="#fff" opacity=".4"/>',
    '<rect x="6" y="6" width="28" height="28" rx="7"/><path d="M10 17v-5q0-2 3-2h13" fill="none" stroke="#fff" opacity=".55" stroke-width="3" stroke-linecap="round"/>',
  ];
  const gem = kind => svgText(`<g fill="${colors[kind]}" stroke="none">${gemPaths[kind]}</g>`);
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
        const d = distance(ball, peg), limit = radius + peg.r;
        if (d >= limit) continue;
        const nx = d > .0001 ? (ball.x - peg.x) / d : 0, ny = d > .0001 ? (ball.y - peg.y) / d : -1;
        ball.x = peg.x + nx * (limit + .01); ball.y = peg.y + ny * (limit + .01);
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) { ball.vx -= (1 + bounce) * dot * nx; ball.vy -= (1 + bounce) * dot * ny; onHit(peg); }
      }
      if (hole && distance(ball, hole) < hole.r && Math.hypot(ball.vx, ball.vy) < 145) { ball.x = hole.x; ball.y = hole.y; ball.vx = ball.vy = 0; return true; }
    }
    return false;
  }
  window.LittleRushArcade = { matches, swaps, generateJewels, bubblePoint, bubbleCluster, advanceBall };
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
    const point = (el, e) => { const rect = el.getBoundingClientRect(), scale = Math.min(rect.width / 200, rect.height / 150); return {x: (e.clientX - rect.left - (rect.width - 200 * scale) / 2) / scale, y: (e.clientY - rect.top - (rect.height - 150 * scale) / 2) / scale}; };
    const heldButton = (el, direction, move, allowed) => {
      let held = null, moved = 0;
      const start = (pointer, key) => { if (held || !allowed()) return; held = {pointer, key}; moved = 0; el.classList.add('is-held'); };
      const stop = (nudge = false) => { if (!held) return; if (nudge && moved < 1 && allowed()) move(direction * (1 - moved)); held = null; el.classList.remove('is-held'); release(el); };
      listen(el, 'pointerdown', e => { if (e.button !== 0 || held || !allowed()) return; e.preventDefault(); start(e.pointerId, null); capture(el, e); });
      listen(el, 'pointerup', e => { if (held?.pointer === e.pointerId) stop(true); });
      for (const event of ['pointercancel', 'lostpointercapture']) listen(el, event, e => { if (held?.pointer === e.pointerId) stop(); });
      listen(el, 'keydown', e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (!e.repeat) start(null, e.key); } });
      listen(el, 'keyup', e => { if (held?.key === e.key) { e.preventDefault(); stop(true); } });
      listen(el, 'click', e => { if (e.detail === 0 && !held && allowed()) move(direction); });
      listen(el, 'blur', () => stop()); suspenders.push(() => stop());
      tickers.push(dt => { if (!held) return; if (!allowed()) return stop(); const amount = 65 * dt / 1000; moved += amount; move(direction * amount); });
    };
    const aimControls = (fire, changed, allowed) => {
      let angle = 0;
      const controls = node('div', 'arc-controls');
      const left = button('arc-arrow', 'Aim left', '←'), shoot = button('arc-fire', 'Shoot ball', 'SHOOT', () => { if (allowed()) { fire(angle); feedback(); } }), right = button('arc-arrow', 'Aim right', '→');
      controls.append(left, shoot, right); body.append(controls);
      const move = amount => { angle = clamp(angle + amount, -65, 65); changed(angle); shoot.setAttribute('aria-description', `${Math.round(angle)} degrees ${angle < 0 ? 'left' : 'right'} of center`); };
      heldButton(left, -1, move, allowed); heldButton(right, 1, move, allowed);
      changed(0);
      return { update() { left.disabled = right.disabled = shoot.disabled = !allowed(); }, get angle() { return angle; } };
    };

    if (type === 'bubbles') {
      const field = scene('Bubble shooter. Match three of a color. Clear six bubbles.');
      const layer = snode('g'), guide = snode('path', {class: 'arc-guide'}), barrel = snode('path', {d: 'M100 138V119', class: 'arc-barrel'}), loaded = snode('circle', {cx: 100, cy: 137, r: 10, class: 'arc-bubble'}), projectile = snode('circle', {r: 10, class: 'arc-bubble', visibility: 'hidden'});
      field.append(guide, layer, barrel, loaded, projectile);
      let balls = [], shot = null, readyAt = 0, cleared = 0, color = 0, misses = 0, angle = 0;
      const status = caption('0 / 6 BUBBLES');
      const paintAim = value => {
        angle = value; barrel.setAttribute('transform', `rotate(${angle} 100 138)`);
        let x = 100 + Math.sin(radians(angle)) * 18, y = 138 - Math.cos(radians(angle)) * 18, vx = Math.sin(radians(angle)) * 5, vy = -Math.cos(radians(angle)) * 5;
        let d = `M${x} ${y}`;
        for (let i = 0; i < 35; i++) { x += vx; y += vy; if (x < 11 || x > 189) { x = clamp(x, 11, 189); vx *= -1; } if (y < 10 || balls.some(ball => distance(ball, {x, y}) < 23)) break; d += `L${x} ${y}`; }
        guide.setAttribute('d', d);
      };
      const makeBall = (row, col, value) => { const ball = {...bubblePoint(row, col), row, col, color: value}; ball.el = snode('g', {class: 'arc-bubble-piece', transform: `translate(${ball.x} ${ball.y})`}); ball.el.append(snode('circle', {r: 11, fill: colors[value], class: 'arc-bubble'}), snode('ellipse', {cx: -3, cy: -4, rx: 4, ry: 2.5, fill: '#fff', opacity: '.52'})); layer.append(ball.el); return ball; };
      const load = () => {
        // Pick an exposed cluster, so the next color always has a reachable match.
        const exposed = balls.filter(ball => !balls.some(other => other.y > ball.y && Math.abs(other.x - ball.x) < 14));
        const choices = exposed.filter(ball => bubbleCluster(balls, ball).length >= 2);
        color = (choices.length ? choices : exposed)[integer(random, (choices.length ? choices : exposed).length)]?.color ?? 0;
        loaded.setAttribute('fill', colors[color]); paintAim(angle);
      };
      const resetRack = () => {
        balls.forEach(ball => ball.el.remove()); balls = [];
        const offset = integer(random, 4);
        for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) balls.push(makeBall(row, col, (Math.floor(col / 2) + offset) % 4));
        misses = 0; load();
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
        if (!candidates.length) { shot = null; resetRack(); return; }
        const target = candidates[0], added = makeBall(target.row, target.col, color); balls.push(added);
        const cluster = bubbleCluster(balls, added), popped = new Set(cluster.length >= 3 ? cluster : []);
        if (popped.size) {
          const remaining = balls.filter(ball => !popped.has(ball)), attached = new Set();
          remaining.filter(ball => ball.row === 0).forEach(ball => bubbleCluster(remaining, ball, false).forEach(member => attached.add(member)));
          remaining.filter(ball => !attached.has(ball)).forEach(ball => popped.add(ball));
          cleared += popped.size; feedback(); misses = 0;
          popped.forEach(ball => { ball.el.classList.add('is-popped'); ball.removeAt = age + 340; });
          status.textContent = `${Math.min(6, cleared)} / 6 BUBBLES`; hint.textContent = `${Math.min(6, cleared)} of six bubbles cleared`;
        } else { misses++; hint.textContent = 'Aim for two or more bubbles of the same color'; }
        shot = null; readyAt = age + 380; projectile.setAttribute('visibility', 'hidden');
        if (cleared >= 6) finish();
      };
      const controls = aimControls(value => {
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
          if (misses >= 3 || !balls.length || balls.some(ball => ball.row >= 4)) resetRack();
          else if (readyAt) load();
          readyAt = 0; loaded.setAttribute('visibility', 'visible'); guide.setAttribute('visibility', 'visible');
        }
        controls.update();
      });
      hint.textContent = 'Hold arrows to aim, then shoot. Match three to clear six bubbles.';
    } else if (type === 'jewels') {
      let cells = generateJewels(random), selected = null, pending = null, pointer = null, ignoreClick = false;
      const grid = node('div', 'arc-jewels'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Swap neighboring shapes to make three in a row');
      body.append(grid); caption('SWAP NEIGHBORS · MAKE 3');
      const pieces = cells.map((_, i) => button('arc-gem', '', undefined, () => { if (ignoreClick) { ignoreClick = false; return; } choose(i); }));
      const paint = () => pieces.forEach((piece, i) => { piece.innerHTML = gem(cells[i]); piece.setAttribute('aria-label', `${names[cells[i]]}, row ${Math.floor(i / 4) + 1}, column ${i % 4 + 1}`); piece.setAttribute('aria-pressed', selected === i ? 'true' : 'false'); });
      const neighbor = (a, b) => Math.abs(a % 4 - b % 4) + Math.abs(Math.floor(a / 4) - Math.floor(b / 4)) === 1;
      const swap = (a, b) => {
        if (pending || !neighbor(a, b)) return;
        selected = null; paint(); feedback();
        const dx = (b % 4 - a % 4) * 100, dy = (Math.floor(b / 4) - Math.floor(a / 4)) * 100;
        pieces[a].style.transform = `translate(${dx}%,${dy}%)`; pieces[b].style.transform = `translate(${-dx}%,${-dy}%)`;
        pending = {a, b, at: age + 180, phase: 'swap'};
      };
      function choose(i) { if (pending) return; if (selected === i) selected = null; else if (selected !== null && neighbor(selected, i)) return swap(selected, i); else selected = i; paint(); }
      pieces.forEach((piece, i) => {
        grid.append(piece);
        listen(piece, 'pointerdown', e => { if (pointer || pending || e.button !== 0) return; ignoreClick = false; pointer = {id: e.pointerId, x: e.clientX, y: e.clientY, i}; capture(piece, e); });
        listen(piece, 'pointerup', e => {
          if (pointer?.id !== e.pointerId) return;
          const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y; pointer = null; release(piece);
          if (Math.hypot(dx, dy) < 9) return;
          ignoreClick = true;
          const j = i + (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : (dy > 0 ? 4 : -4));
          if (j >= 0 && j < 16 && neighbor(i, j)) swap(i, j);
        });
        const cancel = e => { if (pointer?.id !== e.pointerId) return; pointer = null; release(piece); };
        listen(piece, 'pointercancel', cancel); listen(piece, 'lostpointercapture', cancel);
        listen(piece, 'keydown', e => { const step = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4}[e.key]; if (!step) return; e.preventDefault(); const j = i + step; if (j >= 0 && j < 16 && neighbor(i, j)) swap(i, j); });
      });
      suspenders.push(() => { if (pointer) { const piece = pieces[pointer.i]; pointer = null; release(piece); } });
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
      const field = scene('Aim from the top. Hit all three marked gold pegs over as many shots as needed.');
      const mirror = random() < .5, shift = integer(random, 3) * 4;
      const pegs = [[48, 48, true], [137, 77, true], [72, 115, true], [90, 58, false], [168, 42, false], [31, 99, false], [170, 112, false]].map(([x, y, marked]) => ({x: mirror ? 200 - x : x, y: y - shift, r: marked ? 8 : 6, marked, hit: false}));
      const guide = snode('path', {class: 'arc-guide'}), barrel = snode('path', {d: 'M100 5V23', class: 'arc-barrel'}), projectile = snode('circle', {r: 4.5, fill: '#fffaf0', stroke: '#4c6054', 'stroke-width': 1.5, visibility: 'hidden'});
      field.append(guide, barrel);
      pegs.forEach(peg => { peg.el = snode('g', {class: `arc-peg${peg.marked ? ' is-marked' : ''}`, transform: `translate(${peg.x} ${peg.y})`}); peg.el.append(snode('circle', {r: peg.r})); if (peg.marked) peg.el.append(snode('path', {d: 'M-3 0H3M0-3V3', stroke: '#fffaf0', 'stroke-width': 2, 'stroke-linecap': 'round'})); field.append(peg.el); });
      field.append(projectile); const status = caption('0 / 3 GOLD PEGS');
      let ball = null, hits = 0, readyAt = 0, flight = 0;
      const controls = aimControls(value => {
        ball = {x: 100 + Math.sin(radians(value)) * 18, y: 5 + Math.cos(radians(value)) * 18, vx: Math.sin(radians(value)) * 165, vy: Math.cos(radians(value)) * 165}; flight = 0;
        attr(projectile, {cx: ball.x, cy: ball.y, visibility: 'visible'}); guide.setAttribute('visibility', 'hidden'); controls.update();
      }, angle => {
        barrel.setAttribute('transform', `rotate(${-angle} 100 5)`);
        const vx = Math.sin(radians(angle)) * 165, vy = Math.cos(radians(angle)) * 165;
        guide.setAttribute('d', Array.from({length: 15}, (_, i) => { const t = i * .025; return `${i ? 'L' : 'M'}${100 + Math.sin(radians(angle)) * 18 + vx * t} ${5 + Math.cos(radians(angle)) * 18 + vy * t + 90 * t * t}`; }).join(' '));
      }, () => !ball && age >= readyAt);
      tickers.push(dt => {
        if (ball) {
          flight += dt;
          advanceBall(ball, dt / 1000, {gravity: 180, bounce: .9, obstacles: pegs, onHit: peg => { peg.hit = true; peg.el.classList.add('is-hit'); feedback(); if (peg.marked) { hits++; status.textContent = `${hits} / 3 GOLD PEGS`; hint.textContent = `${hits} of three marked pegs hit`; } }});
          attr(projectile, {cx: ball.x, cy: ball.y});
          if (hits === 3) { finish(); return; }
          if (ball.y > 160 || flight > 5500) { ball = null; readyAt = age + 280; projectile.setAttribute('visibility', 'hidden'); }
        } else if (age >= readyAt) guide.setAttribute('visibility', 'visible');
        controls.update();
      });
      hint.textContent = 'Hold arrows to aim. Shoot and rebound off all three gold pegs. Hits carry over.';
    } else if (type === 'telescope') {
      const field = scene('Telescope. Drag the sky or use arrow keys to center the target planet in the crosshair.', true), id = `arc-scope-${++sceneSerial}`;
      const defs = snode('defs'), clip = snode('clipPath', {id}); clip.append(snode('circle', {cx: 100, cy: 77, r: 65})); defs.append(clip); field.append(defs);
      field.append(snode('circle', {cx: 100, cy: 77, r: 68, fill: '#f5edcf', stroke: '#637982', 'stroke-width': 2}));
      const viewport = snode('g', {'clip-path': `url(#${id})`}), sky = snode('g'); viewport.append(snode('rect', {width: 200, height: 150, fill: '#27394e'}), sky); field.append(viewport);
      for (let i = 0; i < 65; i++) sky.append(snode('circle', {cx: 15 + (i * 73 % 390), cy: 12 + (i * 113 % 295), r: i % 5 === 0 ? 1.4 : .7, fill: '#e7f1ef', opacity: .25 + (i % 4) * .15}));
      const planets = [{x: 80, y: 76}, {x: 337, y: 86}, {x: 93, y: 252}, {x: 324, y: 245}];
      const offset = integer(random, 4), target = integer(random, 4);
      const planetGraphic = (kind, x, y, scale = 1) => {
        const group = snode('g', {transform: `translate(${x} ${y}) scale(${scale})`});
        group.append(snode('circle', {r: 13, fill: colors[kind]}), snode('path', {d: 'M-9-7Q0-12 8-5M-11 1Q-1-5 11 2', fill: 'none', stroke: '#fff', opacity: '.28', 'stroke-width': 3}));
        if (kind === 2) group.append(snode('ellipse', {rx: 20, ry: 6, fill: 'none', stroke: '#f4d491', 'stroke-width': 3, transform: 'rotate(-25)'}));
        else if (kind === 1) group.append(snode('circle', {cx: 7, cy: 6, r: 4, fill: '#267786'}));
        else if (kind === 3) group.append(snode('circle', {cx: -4, cy: 5, r: 4, fill: '#bad18b'}));
        return group;
      };
      planets.forEach((planet, i) => sky.append(planetGraphic((i + offset) % 4, planet.x, planet.y)));
      field.append(snode('rect', {x: 2, y: 0, width: 42, height: 44, rx: 9, fill: '#fffaf0', stroke: '#a6b6b5', 'stroke-width': 1}), snode('text', {x: 23, y: 10, 'text-anchor': 'middle', class: 'arc-svg-label'}, 'FIND'), planetGraphic((target + offset) % 4, 23, 29, .65));
      const cross = snode('circle', {cx: 100, cy: 77, r: 18, fill: 'none', stroke: '#dceadc', 'stroke-width': 1, 'stroke-dasharray': '3 4'}), lock = snode('circle', {cx: 100, cy: 77, r: 22, fill: 'none', stroke: '#b9dea7', 'stroke-width': 3, 'stroke-dasharray': '0 139', transform: 'rotate(-90 100 77)'});
      field.append(cross, lock, snode('path', {d: 'M100 50V55M100 99V104M73 77H78M122 77H127', stroke: '#e4ead8', 'stroke-width': 1}));
      const label = caption('DRAG THE SKY');
      let camera = {x: 210, y: 160}, pointer = null, locked = 0;
      const paint = () => { sky.setAttribute('transform', `translate(${100 - camera.x} ${77 - camera.y})`); field.setAttribute('aria-description', `View ${Math.round(camera.x)}, ${Math.round(camera.y)}. Target ${['coral', 'blue', 'ringed gold', 'green'][(target + offset) % 4]} planet.`); };
      listen(field, 'pointerdown', e => { if (pointer || e.button !== 0) return; e.preventDefault(); pointer = {id: e.pointerId, at: point(field, e), camera: {...camera}}; capture(field, e); });
      listen(field, 'pointermove', e => { if (pointer?.id !== e.pointerId) return; e.preventDefault(); const p = point(field, e); camera = {x: clamp(pointer.camera.x - p.x + pointer.at.x, 65, 355), y: clamp(pointer.camera.y - p.y + pointer.at.y, 65, 255)}; paint(); });
      const cancel = () => { pointer = null; release(field); };
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(field, event, e => { if (pointer?.id === e.pointerId) cancel(); });
      suspenders.push(cancel);
      listen(field, 'keydown', e => { const d = {ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12]}[e.key]; if (!d) return; e.preventDefault(); camera.x = clamp(camera.x + d[0], 65, 355); camera.y = clamp(camera.y + d[1], 65, 255); paint(); });
      tickers.push(dt => { const found = distance(camera, planets[target]) < 14; locked = found ? locked + dt : 0; label.textContent = found ? 'HOLD IT THERE…' : 'DRAG THE SKY'; lock.setAttribute('stroke-dasharray', `${Math.min(1, locked / 400) * 139} 139`); if (locked >= 400) { label.textContent = 'PLANET FOUND'; hint.textContent = 'Target planet found'; finish(); } });
      paint(); hint.textContent = 'Find the pictured planet, then hold it in the center of the telescope.';
    } else if (type === 'board') {
      const field = scene('A winding board path. Choose a die to land exactly on the gift. Going past it returns to the start.');
      const path = [{x: 23, y: 112}, {x: 61, y: 112}, {x: 99, y: 111}, {x: 137, y: 108}, {x: 176, y: 97}, {x: 177, y: 60}, {x: 149, y: 31}, {x: 108, y: 28}, {x: 66, y: 28}, {x: 24, y: 31}];
      field.append(snode('path', {d: path.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '), fill: 'none', stroke: '#91a386', 'stroke-width': 31, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
      path.forEach((p, i) => { field.append(snode('rect', {x: p.x - 14, y: p.y - 14, width: 28, height: 28, rx: 5, fill: i === 9 ? '#efd282' : i % 2 ? '#e7ead8' : '#f9f5df', stroke: '#798d72', 'stroke-width': 1})); if (i > 0 && i < 9) field.append(snode('circle', {cx: p.x, cy: p.y, r: 2, fill: '#93a48a'})); });
      const reward = snode('g', {class: 'arc-reward', transform: 'translate(24 31)'}); reward.append(snode('rect', {x: -8, y: -5, width: 16, height: 13, rx: 2, fill: '#c87369'}), snode('path', {d: 'M0-5V8M-9-5H9M0-6C-14-15-5-18 0-6C14-15 5-18 0-6', fill: 'none', stroke: '#fff0c0', 'stroke-width': 2})); field.append(reward);
      const pawn = snode('g', {class: 'arc-pawn'}); pawn.append(snode('ellipse', {cy: 8, rx: 8, ry: 3, fill: '#304e4933'}), snode('path', {d: 'M-7 6Q-8-2-3-4H3Q8-2 7 6Z', fill: '#4f8792', stroke: '#f5f4df', 'stroke-width': 1.5}), snode('circle', {cy: -7, r: 5, fill: '#4f8792', stroke: '#f5f4df', 'stroke-width': 1.5})); field.append(pawn);
      const status = snode('text', {x: 99, y: 76, 'text-anchor': 'middle', class: 'arc-board-status'}, '9 TO GO'); field.append(status);
      const controls = node('div', 'arc-board-dice'); body.append(controls); caption('CHOOSE A DIE · LAND EXACTLY');
      let position = 0, motion = null, values = [1, 1];
      const dice = [0, 1].map(i => button('arc-die', '', undefined, () => {
        if (motion) return; feedback(); dice.forEach(die => { die.disabled = true; }); dice[i].classList.add('is-rolling'); motion = {start: age + 230, from: position, steps: values[i], die: i};
      })); controls.append(...dice);
      const pips = [[0, 0], [-8, -8], [8, 8], [8, -8], [-8, 8], [-8, 0], [8, 0]];
      const pipIndices = {1: [0], 2: [1, 2], 3: [0, 1, 2], 4: [1, 2, 3, 4], 5: [0, 1, 2, 3, 4], 6: [1, 2, 3, 4, 5, 6]};
      const rollOptions = () => {
        values = [1 + integer(random, 6), 1 + integer(random, 6)];
        if (9 - position <= 6) values[integer(random, 2)] = 9 - position;
        dice.forEach((die, i) => { die.disabled = false; die.classList.remove('is-rolling'); die.setAttribute('aria-label', `Move ${values[i]} spaces`); die.innerHTML = svgText(pipIndices[values[i]].map(index => `<circle cx="${20 + pips[index][0]}" cy="${20 + pips[index][1]}" r="2.7" fill="currentColor" stroke="none"/>`).join('')); });
      };
      const paint = p => pawn.setAttribute('transform', `translate(${p.x} ${p.y})`);
      const waypoint = index => path[index] || {x: 24 - (index - 9) * 18, y: 31 - (index - 9) * 9};
      tickers.push(() => {
        if (!motion || age < motion.start) return;
        dice[motion.die].classList.remove('is-rolling');
        if (motion.resetAt) { if (age >= motion.resetAt) { position = 0; paint(path[0]); status.textContent = '9 TO GO'; motion = null; rollOptions(); } return; }
        const progress = Math.min(motion.steps, (age - motion.start) / 150), step = Math.floor(progress), t = progress - step;
        const fromIndex = motion.from + step, a = waypoint(fromIndex), b = waypoint(fromIndex + 1);
        paint({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 7});
        if (progress < motion.steps) return;
        position = motion.from + motion.steps;
        if (position === 9) { paint(path[9]); status.textContent = 'A LITTLE GIFT!'; reward.classList.add('is-won'); hint.textContent = 'Landed exactly on the gift'; finish(); }
        else if (position > 9) { paint(waypoint(position)); status.textContent = 'TOO FAR · RETRY'; hint.textContent = 'Past the gift. Back to the start.'; onFeedback('error'); motion.resetAt = age + 450; }
        else { paint(path[position]); status.textContent = `${9 - position} TO GO`; hint.textContent = `${9 - position} spaces to the gift`; motion = null; rollOptions(); }
      });
      paint(path[0]); rollOptions(); hint.textContent = 'Choose either die to move that many spaces. Land exactly on the gift.';
    } else if (type === 'golf') {
      const field = scene('Mini golf. Drag back from the ball and release to putt. Keyboard: left/right aim, up/down power, Space to shoot.', true);
      const mirror = random() < .5, reflect = x => mirror ? 200 - x : x;
      const hole = {x: reflect(161), y: 31 + integer(random, 3) * 9, r: 8}, bumper = {x: 100, y: 77, r: 15};
      let ball = {x: reflect(36), y: 118, vx: 0, vy: 0}, moving = false, drag = null, keyboardAngle = mirror ? -135 : -45, power = 34;
      field.append(snode('rect', {x: 4, y: 4, width: 192, height: 142, rx: 18, fill: '#8fb78b', stroke: '#496f55', 'stroke-width': 5}), snode('path', {d: 'M13 102Q85 70 186 92M13 58Q115 31 185 53', fill: 'none', stroke: '#c4dcb1', opacity: '.3', 'stroke-width': 17}));
      field.append(snode('circle', {cx: bumper.x, cy: bumper.y, r: bumper.r + 2, fill: '#547755'}), snode('circle', {cx: bumper.x, cy: bumper.y - 1, r: bumper.r, fill: '#bfd3a0', stroke: '#edf0c8', 'stroke-width': 2}), snode('circle', {cx: hole.x, cy: hole.y, r: 8, fill: '#293f35', stroke: '#d6e5b9', 'stroke-width': 2}), snode('path', {d: `M${hole.x} ${hole.y - 2}v-22l14 5-14 5`, fill: '#efb269', stroke: '#fff2d3', 'stroke-width': 1.5, 'stroke-linejoin': 'round'}));
      const guide = snode('path', {class: 'arc-golf-guide', visibility: 'hidden'}), grip = snode('circle', {cx: ball.x, cy: ball.y, r: 12, fill: 'none', stroke: '#eef4d9', 'stroke-width': 1, opacity: '.7'}), ballEl = snode('circle', {cx: ball.x, cy: ball.y, r: 5, fill: '#fffef3', stroke: '#516f59', 'stroke-width': 1, class: 'arc-golf-ball'});
      field.append(guide, grip, ballEl); const label = caption('PULL BACK · RELEASE');
      const paintBall = () => { attr(ballEl, {cx: ball.x, cy: ball.y}); attr(grip, {cx: ball.x, cy: ball.y, visibility: moving ? 'hidden' : 'visible'}); };
      const aim = (dx, dy) => {
        const size = Math.hypot(dx, dy), factor = size > 60 ? 60 / size : 1;
        dx *= factor; dy *= factor;
        attr(guide, {visibility: 'visible', d: `M${ball.x - dx} ${ball.y - dy}L${ball.x} ${ball.y}L${ball.x + dx * .8} ${ball.y + dy * .8}`});
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
        const sunk = advanceBall(ball, dt / 1000, {friction: 1.35, radius: 5, top: 4, bottom: 146, left: 4, right: 196, bounce: .7, obstacles: [bumper], hole}); paintBall();
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
