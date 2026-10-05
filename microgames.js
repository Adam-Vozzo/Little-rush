(function () {
  'use strict';

  const catalog = [
    { id: 'press', title: 'WAIT & HATCH', color: 'peach', once: true },
    { id: 'break', title: 'CRACK IT', color: 'peach' },
    { id: 'operation', title: 'SOLVE', color: 'butter' },
    { id: 'sequence', title: 'TAP IN ORDER', color: 'butter' },
    { id: 'switch', title: 'TURN ON', color: 'blue' },
    { id: 'simon', title: 'REPEAT', color: 'lavender' },
    { id: 'stop', title: 'STOP IN THE GREEN', color: 'sage' },
    { id: 'hold', title: 'HOLD', color: 'sage' },
    { id: 'shapes', title: 'MATCH SHAPES', color: 'blue' },
    { id: 'wires', title: 'CUT THE WIRE', color: 'blue' },
  ];
  const extensions = new Map();
  function register(entries, mounter) {
    if (typeof mounter !== 'function') throw new TypeError('A game mounter is required');
    for (const entry of entries) {
      if (catalog.some(game => game.id === entry.id)) throw new Error(`Duplicate game: ${entry.id}`);
      catalog.push(entry);
      extensions.set(entry.id, mounter);
    }
  }

  const svg = (contents, viewBox = '0 0 100 100', preserveAspectRatio = 'xMidYMid meet') =>
    `<svg viewBox="${viewBox}" preserveAspectRatio="${preserveAspectRatio}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${contents}</svg>`;
  const check = svg('<path d="m29 51 14 14 28-31" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>');
  const shapePaths = {
    circle: '<circle cx="50" cy="50" r="29" fill="currentColor"/>',
    triangle: '<path d="m50 17 34 61H16z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
    square: '<rect x="23" y="23" width="54" height="54" rx="7" fill="currentColor"/>',
  };

  function mount(container, type, options = {}) {
    if (extensions.has(type)) return extensions.get(type)(container, type, options);
    const { onComplete = () => {}, onFeedback = () => {}, demo = false, random = Math.random } = options;
    let complete = false;
    let destroyed = false;
    let age = 0;
    let errorUntil = 0;
    const listeners = [];
    const tickers = [];
    const root = document.createElement('div');
    root.className = `mg mg-${type}${demo ? ' mg-demo' : ''}`;
    const body = document.createElement('div');
    body.className = 'mg-body';
    const hint = document.createElement('div');
    hint.className = 'mg-hint';
    hint.setAttribute('aria-live', 'polite');
    root.append(body, hint);
    container.append(root);

    const node = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const listen = (element, name, callback) => {
      if (demo) return;
      const handler = event => {
        if (!destroyed && !complete) callback(event);
      };
      element.addEventListener(name, handler);
      listeners.push(() => element.removeEventListener(name, handler));
    };
    const button = (className, label, handler) => {
      const element = node('button', className);
      element.type = 'button';
      element.setAttribute('aria-label', label);
      if (demo) element.tabIndex = -1;
      if (handler) listen(element, 'click', handler);
      return element;
    };
    const feedback = () => onFeedback('tap');
    const error = () => {
      errorUntil = age + 380;
      root.classList.add('mg-error');
      onFeedback('error');
    };
    const finish = payload => {
      if (complete || destroyed || demo) return;
      complete = true;
      root.classList.add('mg-complete');
      onComplete(payload);
    };
    const shuffle = input => {
      const array = [...input];
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };
    const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
    const progressDots = count => {
      const dots = node('div', 'mg-dots');
      dots.setAttribute('aria-hidden', 'true');
      const all = Array.from({ length: count }, () => {
        const dot = node('span');
        dots.append(dot);
        return dot;
      });
      return { element: dots, update: current => all.forEach((dot, i) => dot.classList.toggle('is-done', i < current)) };
    };

    if (type === 'press') {
      let ready = false;
      const caterpillar = '<path d="M13 77Q49 84 88 70" stroke="#69806b" stroke-width="3" stroke-linecap="round"/><path d="m21 68 1 7m15-8 1 8m14-9 1 8m12-11 1 8" stroke="#526e55" stroke-width="2" stroke-linecap="round"/><circle cx="25" cy="62" r="10" fill="#95ad77"/><circle cx="40" cy="60" r="11" fill="#89a56c"/><circle cx="55" cy="57" r="12" fill="#789b61"/><circle cx="72" cy="52" r="14" fill="#688e57"/><path d="m68 39-3-6m13 6 3-6" stroke="#4f7047" stroke-width="2" stroke-linecap="round"/><circle cx="76" cy="50" r="2" fill="#31452f"/><path d="M77 57q3 2 5-1" stroke="#31452f" stroke-width="1.5" stroke-linecap="round"/>';
      const chrysalis = '<path d="M18 18q31 8 65-3" stroke="#6f7c57" stroke-width="4" stroke-linecap="round"/><path d="M50 23v12" stroke="#7b825f" stroke-width="2"/><path d="M50 32c-10 7-16 14-15 29 1 16 8 24 15 28 9-7 16-16 16-31 0-11-7-22-16-26Z" fill="#78915d"/><path d="m39 48 21 8-21 10 19 10" stroke="#b9c58a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="m76 39 3-5m-1 22 6 1M27 41l-5-3" stroke="#fff8df" stroke-width="2.5" stroke-linecap="round"/>';
      const tap = button('mg-hatch-button', 'Wait for the chrysalis', () => {
        if (!ready) {
          hint.textContent = 'Still growing · wait…';
          onFeedback('soft');
          return;
        }
        feedback();
        hint.textContent = 'A little butterfly!';
        finish({ kind: 'hatch' });
      });
      tap.innerHTML = svg(caterpillar, '4 13 93 80');
      body.append(tap);
      hint.textContent = 'Wait for the chrysalis';
      tickers.push(() => {
        if (age < 3000 || ready) return;
        ready = true;
        tap.innerHTML = svg(chrysalis, '4 13 93 80');
        tap.classList.add('is-ready');
        tap.setAttribute('aria-label', 'Tap the chrysalis to release a butterfly');
        hint.textContent = 'Ready! Tap to hatch';
      });
    } else if (type === 'break') {
      const requiredHits = demo ? 8 : integer(5, 11);
      let hits = 0;
      let hitUntil = 0;
      const geode = button('mg-geode', `Tap the geode ${requiredHits} times to reveal its crystals`, () => {
        hits++;
        feedback();
        geode.setAttribute('data-hits', String(hits));
        geode.setAttribute('aria-label', hits === requiredHits ? 'Geode opened. Crystals discovered.' : `Open the geode: ${requiredHits - hits} taps left`);
        cracks.forEach((crack, index) => { crack.style.opacity = (hits / requiredHits * 8) > index ? '1' : '0'; });
        const opening = Math.max(0, hits / requiredHits * 8 - 3);
        leftShell.style.transform = `translate(${-opening * 1.7}px, ${opening * .5}px) rotate(${-opening * 2}deg)`;
        rightShell.style.transform = `translate(${opening * 1.7}px, ${opening * .5}px) rotate(${opening * 2}deg)`;
        crystals.style.opacity = hits >= 3 ? '1' : '0';
        chips.forEach((chip, index) => { chip.style.opacity = hits >= index + 2 ? '1' : '0'; });
        hitUntil = age + 110;
        geode.style.transform = `rotate(${hits % 2 ? -2 : 2}deg) scale(.96)`;
        dots.update(hits);
        hint.textContent = hits === requiredHits ? 'A little wonder inside' : `${requiredHits - hits} taps to reveal`;
        if (hits === requiredHits) {
          geode.style.transform = '';
          geode.classList.add('is-open');
          finish({ kind: 'geode' });
        }
      });
      geode.innerHTML = svg(`<ellipse cx="55" cy="86" rx="35" ry="5" fill="#6d8991" opacity=".12"/>
        <g class="mg-geode-crystals"><circle class="mg-geode-glow" cx="55" cy="47" r="32" fill="#fff3c9" opacity=".7"/>
        <path d="m30 39 17-21 22 3 14 24-7 29-26 9-22-14Z" fill="#797b99"/>
        <path d="m46 35 10-17 9 18-2 36-16 3Z" fill="#d4c5e8"/><path d="m56 18 1 54 6 0 2-36Z" fill="#a69bce"/><path d="m46 35 10-17 1 18Z" fill="#fff0e2"/>
        <path d="m28 47 7-16 11 14 5 30-15-3Z" fill="#c2d4de"/><path d="m35 31 7 17 9 27-7-1-8-25Z" fill="#94b1c3"/><path d="m28 47 7-16 1 18Z" fill="#e9f1e5"/>
        <path d="m64 44 10-14 8 17-8 24-14 6Z" fill="#e4bfc9"/><path d="m74 30-3 17-11 30 7-2 15-28Z" fill="#bc9ebc"/><path d="m64 44 10-14-3 17Z" fill="#ffe8dc"/>
        <path d="m47 68 7-17 9 16-5 12-10-1Z" fill="#f1dac8"/><path d="m54 51 1 16 3 12 5-12Z" fill="#cbb6cd"/>
        <path class="mg-geode-spark" d="M55 8v8m-4-4h8M83 28v6m-3-3h6M24 58v6m-3-3h6" stroke="#fff9e8" stroke-width="2" stroke-linecap="round"/></g>
        <g class="mg-geode-shell mg-geode-left"><path d="m55 11-23 4-16 21 3 28 17 17 18 3-4-18 8-14-10-13 9-12Z" fill="#9daeb2"/><path d="m55 11-23 4-16 21 27-6 14-3Z" fill="#c1cece"/><path d="m16 36 3 28 17 17-7-25 14-26Z" fill="#afc0c2"/><path d="m36 81 18 3-4-18-21-10Z" fill="#82999f"/>
        <path class="mg-geode-crack" d="m53 14-8 14 5 9-11 13"/><path class="mg-geode-crack" d="m18 39 16 4 5 7-6 12"/><path class="mg-geode-crack" d="m32 17 5 13 8-2"/><path class="mg-geode-crack" d="m34 63 13 5 4 14"/></g>
        <g class="mg-geode-shell mg-geode-right"><path d="m55 11 24 7 15 22-4 28-18 15-18 1-4-18 8-14-10-13 9-12Z" fill="#91a6ac"/><path d="m55 11 24 7 15 22-22-6-15-7Z" fill="#b3c3c5"/><path d="m94 40-4 28-18 15 6-24-6-25Z" fill="#78939d"/><path d="m48 39 24-5 6 25-20-7Z" fill="#a5b7bc"/>
        <path class="mg-geode-crack" d="m58 25 11 9-3 10 11 10"/><path class="mg-geode-crack" d="m92 42-15 12 2 14"/><path class="mg-geode-crack" d="m59 55 8 12-3 15"/><path class="mg-geode-crack" d="m78 20-9 14 13 4"/></g>
        <path class="mg-geode-chip" d="m12 58-5 7 8 1Z" fill="#a9bdc1"/><path class="mg-geode-chip" d="m97 63 7 5-7 3Z" fill="#a2b5bc"/><path class="mg-geode-chip" d="m22 80-5 3 7 3Z" fill="#becbc7"/><path class="mg-geode-chip" d="m90 79 5 5-8 1Z" fill="#8da5b0"/><path class="mg-geode-chip" d="m10 36 5-5 1 7Z" fill="#d1d9cb"/><path class="mg-geode-chip" d="m95 25 5 2-4 6Z" fill="#b2c4c5"/>`, '0 0 110 95');
      const cracks = geode.querySelectorAll('.mg-geode-crack');
      const chips = geode.querySelectorAll('.mg-geode-chip');
      const leftShell = geode.querySelector('.mg-geode-left');
      const rightShell = geode.querySelector('.mg-geode-right');
      const crystals = geode.querySelector('.mg-geode-crystals');
      const dots = progressDots(requiredHits);
      body.append(geode, dots.element);
      hint.textContent = 'Tap to discover crystals';
      tickers.push(() => { if (hitUntil && age >= hitUntil) { geode.style.transform = ''; hitUntil = 0; } });
    } else if (type === 'operation') {
      const first = demo ? 8 : integer(3, 12);
      const second = demo ? 6 : integer(2, 9);
      const subtract = !demo && random() < 0.45;
      const a = subtract ? first + second : first;
      const answer = subtract ? first : first + second;
      const equation = node('div', 'mg-equation', `${a} ${subtract ? '−' : '+'} ${second}`);
      const answers = node('div', 'mg-answers');
      const choices = shuffle([answer, answer + integer(1, 3), Math.max(0, answer - integer(1, 3))]);
      const answerButtons = [];
      const cooldown = node('span', 'mg-cooldown');
      cooldown.setAttribute('aria-hidden', 'true');
      cooldown.hidden = true;
      let cooldownUntil = 0;
      const updateCooldown = () => {
        if (!cooldownUntil) return;
        const remaining = Math.max(0, cooldownUntil - age);
        if (remaining) {
          const seconds = `${(Math.ceil(remaining / 100) / 10).toFixed(1)}s`;
          hint.textContent = `Try again in ${seconds}`;
          cooldown.textContent = seconds;
          cooldown.hidden = false;
        }
        else {
          cooldownUntil = 0;
          answerButtons.forEach(choice => { choice.disabled = false; });
          root.classList.remove('is-cooling');
          cooldown.hidden = true;
          hint.textContent = 'Choose the answer';
        }
      };
      choices.forEach(value => {
        const choice = button('mg-choice', `Answer ${value}`, () => {
          if (age < cooldownUntil) return;
          if (value === answer) {
            feedback();
            choice.classList.add('is-correct');
            finish();
          } else {
            error();
            cooldownUntil = age + 750;
            answerButtons.forEach(answerButton => { answerButton.disabled = true; });
            root.classList.add('is-cooling');
            updateCooldown();
          }
        });
        choice.textContent = value;
        answerButtons.push(choice);
        answers.append(choice);
      });
      answers.append(cooldown);
      body.append(equation, answers);
      hint.textContent = 'Choose the answer';
      tickers.push(updateCooldown);
    } else if (type === 'sequence') {
      let next = 1;
      const grid = node('div', 'mg-order-grid');
      const sequence = demo ? [3, 1, 4, 2] : shuffle([1, 2, 3, 4]);
      sequence.forEach(value => {
        const choice = button('mg-order-button', `Number ${value}`, () => {
          if (value !== next) return error();
          feedback();
          next++;
          choice.disabled = true;
          choice.classList.add('is-done');
          choice.innerHTML = check;
          hint.textContent = next > 4 ? 'In order' : `Next: ${next}`;
          if (next > 4) finish();
        });
        choice.textContent = value;
        grid.append(choice);
      });
      body.append(grid);
      hint.textContent = 'Tap 1 → 2 → 3 → 4';
    } else if (type === 'switch') {
      const initiallyOn = new Set(shuffle([0, 1, 2, 3, 4, 5]).slice(0, demo ? 2 : integer(1, 4)));
      let activated = initiallyOn.size;
      const switches = node('div', 'mg-switches');
      for (let i = 0; i < 6; i++) {
        const toggle = button('mg-toggle', 'Switch ' + (i + 1), () => {
          const on = toggle.getAttribute('aria-pressed') !== 'true';
          activated += on ? 1 : -1;
          toggle.setAttribute('aria-pressed', String(on));
          toggle.classList.toggle('is-on', on);
          feedback();
          if (activated === 6) finish();
        });
        toggle.setAttribute('aria-pressed', String(initiallyOn.has(i)));
        toggle.classList.toggle('is-on', initiallyOn.has(i));
        toggle.innerHTML = '<span class="mg-toggle-track"><span class="mg-toggle-knob"></span></span>';
        switches.append(toggle);
      }
      body.append(switches);
      hint.textContent = 'Turn them all on';
    } else if (type === 'simon') {
      const pattern = demo ? [0, 2, 1] : Array.from({ length: 3 }, () => integer(0, 3));
      const board = node('div', 'mg-simon-board');
      const colors = ['rose', 'gold', 'sky', 'leaf'];
      const colorNames = ['Pink', 'Yellow', 'Blue', 'Green'];
      let replayStart = 0, started = false;
      let inputIndex = 0;
      let watching = true;
      let tapped = -1;
      let tapUntil = 0;
      const pads = colors.map((color, index) => {
        const pad = button(`mg-simon-pad mg-pad-${color}`, `${colorNames[index]} pattern button`, () => {
          if (!started || watching) return;
          tapped = index;
          tapUntil = age + 160;
          pads.forEach((item, i) => item.classList.toggle('is-lit', i === index));
          if (index !== pattern[inputIndex]) {
            error();
            inputIndex = 0;
            dots.update(0);
            replayStart = age + 500;
            watching = true;
            start.textContent = '•••';
            hint.textContent = 'Watch once more';
          } else {
            feedback();
            inputIndex++;
            dots.update(inputIndex);
            if (inputIndex === pattern.length) finish();
          }
        });
        pad.innerHTML = svg('<rect class="mg-simon-sector" x="2" y="2" width="96" height="96" rx="10" fill="currentColor"/><rect class="mg-simon-rim" x="4" y="4" width="92" height="92" rx="8" stroke="white" stroke-width="2"/>').replace('<svg ', '<svg preserveAspectRatio="none" ');
        board.append(pad);
        return pad;
      });
      const dots = progressDots(3);
      const start = button('mg-simon-start', 'Start pattern', () => {
        if (started) return;
        started = true; watching = true; replayStart = age;
        start.disabled = true; start.textContent = '•••';
        hint.textContent = 'Watch the pattern'; feedback();
      });
      start.textContent = 'Start'; board.append(start);
      body.append(board, dots.element);
      hint.textContent = 'Press Start when ready';
      if (demo) pads[2].classList.add('is-lit');
      tickers.push(() => {
        if (!started) return;
        const elapsed = age - replayStart;
        const wasWatching = watching;
        watching = elapsed < 2100;
        if (wasWatching && !watching) { hint.textContent = 'Your turn · repeat'; start.textContent = 'Go'; }
        const step = Math.floor((elapsed - 220) / 600);
        const flash = elapsed >= 220 && step < 3 && (elapsed - 220) % 600 < 380 ? pattern[step] : -1;
        pads.forEach((pad, index) => pad.classList.toggle('is-lit', watching ? flash === index : age < tapUntil && tapped === index));
      });
    } else if (type === 'stop') {
      const meterArea = node('div', 'mg-stop-top');
      const meter = node('div', 'mg-stop-meter');
      meter.innerHTML = '<span class="mg-stop-zone"></span><span class="mg-stop-dot"></span>';
      const movingDot = meter.querySelector('.mg-stop-dot');
      const zoneStart = demo ? 36 : integer(5, 67), zoneEnd = zoneStart + 28;
      meter.querySelector('.mg-stop-zone').style.left = `${zoneStart}%`;
      let position = demo ? 41 : 0, retryAt = 0;
      const stop = button('mg-stop-button', 'Stop the moving dot inside the highlighted zone', () => {
        if (age < retryAt) return;
        if (position >= zoneStart && position <= zoneEnd) {
          feedback();
          finish();
        } else {
          retryAt = age + 750; stop.disabled = true; root.classList.add('is-cooling');
          hint.textContent = 'Missed · try again in a moment'; error(); renderCooldown();
        }
      });
      stop.innerHTML = '<span class="mg-stop-symbol" aria-hidden="true">■</span>';
      const symbol = stop.querySelector('.mg-stop-symbol');
      const renderCooldown = () => {
        const cooling = age < retryAt;
        stop.disabled = cooling; root.classList.toggle('is-cooling', cooling);
        symbol.textContent = cooling ? ((retryAt - age) / 1000).toFixed(1) : '■';
      };
      meterArea.append(meter);
      body.append(meterArea, stop);
      hint.textContent = 'Stop inside the green';
      movingDot.style.left = `${position}%`;
      tickers.push(() => {
        position = (Math.sin(age / 420 - Math.PI / 2) + 1) * 50;
        movingDot.style.left = `${position}%`;
        renderCooldown();
      });
    } else if (type === 'hold') {
      let holding = false;
      let heldSince = 0;
      let pointer = null;
      let heldKey = null;
      const hold = button('mg-hold-button', 'Press and hold for one second');
      hold.innerHTML = svg('<circle class="mg-hold-track" cx="50" cy="50" r="39" stroke="currentColor" stroke-width="3"/><circle class="mg-hold-progress" cx="50" cy="50" r="39" stroke="currentColor" stroke-width="4" stroke-linecap="round" pathLength="100"/><circle cx="50" cy="50" r="29" fill="currentColor"/><circle cx="50" cy="50" r="5" fill="#fff9ef"/>');
      const ring = hold.querySelector('.mg-hold-progress');
      const begin = () => {
        if (holding) return;
        holding = true;
        heldSince = age;
        hold.classList.add('is-held');
        hint.textContent = 'Keep holding…';
        feedback();
      };
      const release = () => {
        holding = false;
        pointer = null;
        heldKey = null;
        hold.classList.remove('is-held');
        ring.style.strokeDashoffset = '100';
        hint.textContent = 'Hold for 1 second';
      };
      listen(hold, 'pointerdown', event => {
        if (holding || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault();
        pointer = event.pointerId;
        hold.setPointerCapture(event.pointerId);
        begin();
      });
      const releasePointer = event => {
        if (pointer !== null && event.pointerId === pointer) release();
      };
      listen(hold, 'pointerup', releasePointer);
      listen(hold, 'pointercancel', releasePointer);
      listen(hold, 'lostpointercapture', releasePointer);
      listen(hold, 'keydown', event => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && !holding) {
          event.preventDefault();
          heldKey = event.key;
          begin();
        }
      });
      listen(hold, 'keyup', event => {
        if (event.key === heldKey) {
          event.preventDefault();
          release();
        }
      });
      listen(hold, 'blur', release);
      body.append(hold);
      hint.textContent = 'Hold for 1 second';
      tickers.push(() => {
        if (!holding) return;
        const held = age - heldSince;
        ring.style.strokeDashoffset = String(100 - Math.min(held / 1000, 1) * 100);
        if (held >= 1000) finish();
      });
    } else if (type === 'shapes') {
      const names = ['circle', 'triangle', 'square'];
      const slots = node('div', 'mg-shape-slots');
      const pieces = node('div', 'mg-shape-options');
      const targets = [];
      let selected = null;
      let matched = 0;
      let drag = null;
      const targetAt = (x, y) => targets.find(target => {
        const rect = target.element.getBoundingClientRect();
        return !target.element.disabled && x >= rect.left - 6 && x <= rect.right + 6 && y >= rect.top - 6 && y <= rect.bottom + 6;
      });
      const pick = item => {
        if (item.element.disabled) return;
        if (selected) selected.element.classList.remove('is-selected');
        selected = item;
        item.element.classList.add('is-selected');
        hint.textContent = `Place the ${item.name}`;
      };
      const place = target => {
        if (!selected || target.element.disabled) return false;
        if (selected.name !== target.name) {
          error();
          hint.textContent = 'Find the same outline';
          return false;
        }
        feedback();
        selected.element.disabled = true;
        selected.element.classList.remove('is-selected');
        selected.element.classList.add('is-placed');
        target.element.classList.add('is-filled', `mg-shape-color-${names.indexOf(target.name)}`);
        target.element.disabled = true;
        target.element.setAttribute('aria-label', `${target.name} placed`);
        selected = null;
        matched++;
        hint.textContent = `${matched} / 3 fitted`;
        if (matched === 3) finish();
        return true;
      };
      names.forEach(name => {
        const target = { name };
        target.element = button('mg-shape-slot', `Place in ${name} slot`, () => place(target));
        target.element.innerHTML = svg(shapePaths[name], '10 8 80 80');
        targets.push(target);
        slots.append(target.element);
      });
      (demo ? ['square', 'circle', 'triangle'] : shuffle(names)).forEach(name => {
        let ignoreClick = false;
        const item = { name };
        const shape = button(`mg-shape-button mg-shape-color-${names.indexOf(name)}`, `Pick up ${name}`, () => {
          if (ignoreClick) { ignoreClick = false; return; }
          pick(item);
        });
        item.element = shape;
        shape.innerHTML = svg(shapePaths[name], '10 8 80 80');
        listen(shape, 'pointerdown', event => {
          if (drag || shape.disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
          event.preventDefault();
          pick(item);
          ignoreClick = false;
          drag = { item, pointer: event.pointerId, x: event.clientX, y: event.clientY };
          shape.setPointerCapture(event.pointerId);
          shape.classList.add('is-dragging');
          feedback();
        });
        listen(shape, 'pointermove', event => {
          if (!drag || drag.item !== item || drag.pointer !== event.pointerId) return;
          shape.style.transform = `translate(${event.clientX - drag.x}px, ${event.clientY - drag.y}px)`;
          const hovered = targetAt(event.clientX, event.clientY);
          targets.forEach(target => target.element.classList.toggle('is-hovered', target === hovered && target.name === name));
        });
        const release = (event, cancelled) => {
          if (!drag || drag.item !== item || drag.pointer !== event.pointerId) return;
          drag = null;
          ignoreClick = true;
          const droppedTransform = shape.style.transform;
          shape.style.transform = '';
          shape.classList.remove('is-dragging');
          targets.forEach(target => target.element.classList.remove('is-hovered'));
          if (shape.hasPointerCapture?.(event.pointerId)) shape.releasePointerCapture(event.pointerId);
          if (cancelled) return;
          const target = targetAt(event.clientX, event.clientY);
          // Fade the source at the drop point rather than animating it home
          // underneath the newly filled outline.
          if (target && place(target)) shape.style.transform = droppedTransform;
        };
        listen(shape, 'pointerup', event => release(event, false));
        listen(shape, 'pointercancel', event => release(event, true));
        listen(shape, 'lostpointercapture', event => release(event, true));
        pieces.append(shape);
      });
      body.append(slots, pieces);
      hint.textContent = 'Drag shapes to their slots';
    } else if (type === 'wires') {
      const circuit = node('div', 'mg-wires-board');
      const letters = demo ? ['K', 'W', 'E'] : shuffle('ABCDEFGHJKLMNPQRSTUVWXYZ').slice(0, 3);
      const digits = demo ? ['7', '0', '3'] : shuffle('0123456789').slice(0, 3);
      const order = demo ? [2, 0, 1] : shuffle([0, 1, 2]);
      // Keep at least one crossing so tracing remains part of the challenge.
      if (order.every((value, index) => value === index)) [order[0], order[2]] = [order[2], order[0]];
      const requested = demo ? 1 : integer(0, 2);
      const instruction = `Cut wire ${letters[requested]}–${digits[order[requested]]}`;
      const prompt = node('div', 'mg-wire-prompt', `${letters[requested]}–${digits[order[requested]]}`);
      prompt.setAttribute('aria-label', instruction);
      letters.forEach((letter, index) => {
        const wire = button(`mg-cut-wire mg-wire-color-${index}`, `Cut wire ${letter}–${digits[order[index]]}`, () => {
          if (index !== requested) {
            error();
            hint.textContent = 'Trace the labelled wire';
            return;
          }
          feedback();
          wire.classList.add('is-cut');
          hint.textContent = 'Snip!';
          finish();
        });
        const from = 16 + index * 31;
        const to = 16 + order[index] * 31;
        const path = `M21 ${from} C53 ${from} 77 ${to} 109 ${to}`;
        wire.innerHTML = svg(`<path class="mg-wire-hit" d="${path}" stroke="transparent" stroke-width="22"/><path class="mg-wire-stroke" d="${path}" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><rect class="mg-wire-terminal" x="0" y="${from - 15}" width="27" height="30" rx="5" fill="#fff9ec"/><rect class="mg-wire-terminal" x="103" y="${to - 15}" width="27" height="30" rx="5" fill="#fff9ec"/><text x="13" y="${from + 5}" text-anchor="middle" fill="currentColor">${letter}</text><text x="117" y="${to + 5}" text-anchor="middle" fill="currentColor">${digits[order[index]]}</text>`, '0 0 130 94');
        circuit.append(wire);
      });
      body.append(prompt, circuit);
      hint.textContent = 'Tap the wire to snip';
    } else {
      body.textContent = '…';
      hint.textContent = 'A little mystery';
    }

    return {
      tick(ageMs, deltaMs = 0) {
        if (destroyed || complete || demo) return;
        age = Math.max(0, ageMs);
        if (errorUntil && age >= errorUntil) {
          errorUntil = 0;
          root.classList.remove('mg-error');
        }
        tickers.forEach(ticker => ticker(Math.max(0, Math.min(deltaMs, 100))));
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        listeners.forEach(remove => remove());
        root.remove();
      },
    };
  }

  window.LittleRushGames = { catalog, mount, register };
})();
