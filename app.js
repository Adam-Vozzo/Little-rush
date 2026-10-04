(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const catalog = window.LittleRushGames.catalog;
  const lifetime = window.LittleRushEngine.TILE_LIFETIME_MS;
  const spawnInterval = window.LittleRushEngine.SPAWN_INTERVAL_MS;
  const board = $('game-board');
  const dialog = $('game-dialog');
  const habitat = new window.LittleRushButterfly.Habitat(board.parentElement);
  const cells = [];
  const views = new Map();
  const flashes = new Map();
  let lastFrame = performance.now();
  let modalKind = '';
  let bestMs = Number(readSaved('little-rush-best-v3', '0')) || 0;
  let soundEnabled = readSaved('little-rush-sound', 'off') === 'on';
  let audioContext;
  let playingDemo = true;
  let lastShownTime = '';
  let lastShownScore = -1;
  let bestAtStart = bestMs;
  let hatchIntroduced = false;

  function readSaved(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* Private/file mode can disable storage. */ } }
  function timeText(ms, tenths = false) {
    const seconds = Math.floor(ms / 1000);
    const main = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    return tenths ? `${main}<span>.${Math.floor(ms / 100) % 10}</span>` : main;
  }
  function initAudio() {
    if (!soundEnabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio && !audioContext) audioContext = new Audio();
      if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  function tone(frequency, delay = 0, duration = .09, volume = .035) {
    if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const at = audioContext.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + .007);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function feedback(kind) {
    if (kind === 'error') tone(180, 0, .08, .025);
    else tone(540, 0, .035, .02);
  }
  function announce(text) { $('announcer').textContent = text; }

  const engine = new window.LittleRushEngine({
    types: catalog.map(game => game.id),
    initialType: 'press',
    isTypeAvailable(type, state) {
      if (type === 'press') return !hatchIntroduced;
      if (type === 'feed') return habitat.active && !state.tiles.some(tile => tile?.type === 'feed');
      return true;
    },
    onSpawn(tile) {
      if (tile.type === 'press') hatchIntroduced = true;
      tone(680, 0, .07, .022);
      const meta = catalog.find(game => game.id === tile.type);
      announce(`${meta.title} appeared in row ${Math.floor(tile.slot / 2) + 1}, column ${tile.slot % 2 + 1}. ${lifetime / 1000} seconds.`);
    },
    onComplete(tile, state) {
      if (tile.type === 'press' && habitat.hatch(tile.slot, state.elapsedMs)) {
        engine.enqueueType('feed');
        announce('A butterfly hatched. Feed challenges are now unlocked.');
      }
      if (tile.type === 'feed') habitat.celebrate(state.elapsedMs);
      flashes.set(tile.slot, performance.now() + (tile.type === 'break' ? 700 : 420));
      tone(660, 0, .11);
      tone(880, .07, .16, .025);
      announce(`${state.score} cleared.`);
    },
    onEnd(tile, state) {
      updateBest(state.elapsedMs);
      tone(330, 0, .18, .03);
      tone(247, .13, .25, .025);
      showResult(tile, state);
    }
  });

  function updateBest(ms) {
    if (ms > bestMs) { bestMs = ms; save('little-rush-best-v3', bestMs); }
    $('best-time').textContent = timeText(bestMs);
  }
  function destroyViews() { for (const view of views.values()) view.api.destroy(); views.clear(); }
  function timerMarkup() {
    return `<div class="tile-timer" role="img" aria-label="${lifetime / 1000} seconds remaining"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="timer-track" cx="12" cy="12" r="9"/><circle class="timer-arc" cx="12" cy="12" r="9"/></svg><span>${lifetime / 1000}</span></div>`;
  }
  function emptyCell(cell, slot) {
    cell.className = 'tile empty';
    cell.removeAttribute('data-game');
    cell.removeAttribute('data-tile-id');
    cell.setAttribute('aria-label', `Empty slot ${slot + 1}`);
    cell.innerHTML = `<span class="empty-mark" aria-hidden="true">+</span><span class="slot-number" aria-hidden="true">0${slot + 1}</span>`;
    cell.dataset.view = 'empty';
  }
  for (let slot = 0; slot < 8; slot++) {
    const cell = document.createElement('section');
    cell.className = 'tile empty';
    board.append(cell);
    cells.push(cell);
  }
  function mountTile(cell, game, tile, demo) {
    cell.className = `tile ${game.color} ${demo ? 'demo' : 'new-tile'}`;
    cell.dataset.game = game.id;
    cell.dataset.view = demo ? `demo-${game.id}` : tile.id;
    if (!demo) cell.dataset.tileId = tile.id;
    else cell.removeAttribute('data-tile-id');
    cell.setAttribute('aria-label', `${game.title} ${demo ? 'preview' : 'micro-game'}`);
    cell.innerHTML = `<header class="tile-header"><span class="tile-title">${game.title}</span>${timerMarkup()}</header><div class="microgame"></div>`;
    const timer = cell.querySelector('.tile-timer');
    const arc = cell.querySelector('.timer-arc');
    if (demo) {
      arc.style.strokeDashoffset = String(56.5487 * (.1 + (tile.slot % 4) * .16));
      timer.setAttribute('aria-label', 'Countdown preview');
    }
    const api = window.LittleRushGames.mount(cell.querySelector('.microgame'), game.id, {
      demo,
      butterfly: habitat,
      onComplete: () => {
        // Let the next frame reconcile tiles; a tick can complete a game while
        // the current board snapshot is still being rendered.
        if (!demo) engine.complete(tile.id, performance.now());
      },
      onFeedback: feedback
    });
    const view = {api, id: tile.id, type: game.id, cell, timer, arc, number: timer.querySelector('span'), lastSeconds: -1};
    views.set(tile.slot, view);
  }
  function showHome() {
    closeDialog();
    if (engine.status === 'running') engine.pause(performance.now());
    destroyViews();
    habitat.reset();
    hatchIntroduced = false;
    flashes.clear();
    playingDemo = true;
    document.body.classList.remove('is-running');
    board.removeAttribute('inert');
    const previewOrder = ['press', 'wires', 'switch', 'shapes', 'maze', 'level', 'break', 'connect'];
    cells.forEach((cell, slot) => {
      const game = catalog.find(item => item.id === previewOrder[slot]) || catalog[slot % catalog.length];
      mountTile(cell, game, {id: `demo-${slot}`, slot}, true);
    });
    $('run-time').innerHTML = timeText(0, true);
    $('score').textContent = '00';
    $('best-time').textContent = timeText(bestMs);
    lastShownTime = ''; lastShownScore = -1;
    $('pause-button').disabled = true;
    $('start-button').hidden = false;
    $('start-note').hidden = false;
    $('play-note').hidden = true;
    $('spawn-track').hidden = true;
    $('next-label').textContent = 'Eight squares. Endless little possibilities.';
    $('next-count').textContent = '';
  }
  function startRun() {
    closeDialog();
    initAudio();
    destroyViews();
    habitat.reset();
    hatchIntroduced = false;
    flashes.clear();
    playingDemo = false;
    bestAtStart = bestMs;
    cells.forEach(emptyCell);
    board.removeAttribute('inert');
    document.body.classList.add('is-running');
    $('pause-button').disabled = false;
    $('start-button').hidden = true;
    $('start-note').hidden = true;
    $('play-note').hidden = false;
    $('spawn-track').hidden = false;
    $('next-label').textContent = 'Next little challenge';
    lastFrame = performance.now();
    engine.start(lastFrame);
    render(engine.snapshot(lastFrame), lastFrame, 0);
    $('pause-button').focus({preventScroll:true});
  }
  function render(state, now, delta) {
    if (playingDemo) return;
    habitat.update(state.elapsedMs, state.status === 'running');
    const formatted = timeText(state.elapsedMs, true);
    if (formatted !== lastShownTime) { $('run-time').innerHTML = formatted; lastShownTime = formatted; }
    if (state.score !== lastShownScore) { $('score').textContent = String(state.score).padStart(2, '0'); lastShownScore = state.score; }
    const boardFull = state.tiles.every(Boolean);
    $('next-label').textContent = boardFull ? 'Grid full · clear a tile' : 'Next little challenge';
    $('next-count').textContent = state.status === 'ended' ? '' : boardFull ? '8 / 8' : `${(state.nextSpawnInMs / 1000).toFixed(1)}s`;
    $('spawn-fill').style.width = `${boardFull ? 100 : 100 * (1 - state.nextSpawnInMs / spawnInterval)}%`;
    cells.forEach((cell, slot) => {
      const tile = state.tiles[slot];
      let view = views.get(slot);
      if (!tile && view?.type === 'break' && (flashes.get(slot) || 0) > now) {
        cell.classList.remove('urgent');
        cell.classList.add('geode-cleared');
        cell.setAttribute('aria-label', 'Geode opened. Challenge cleared.');
        view.timer.hidden = true;
        return;
      }
      if (view && (!tile || view.id !== tile.id)) { view.api.destroy(); views.delete(slot); view = null; }
      if (!tile) {
        if ((flashes.get(slot) || 0) > now) {
          if (cell.dataset.view !== 'completed') {
            cell.className = 'tile completed'; cell.dataset.view = 'completed';
            cell.removeAttribute('data-game'); cell.removeAttribute('data-tile-id');
            cell.setAttribute('aria-label', 'Challenge cleared');
            cell.innerHTML = '<div class="complete-flash"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m7 16 6 6L26 9"/></svg><span>nicely done.</span></div>';
          }
        } else if (cell.dataset.view !== 'empty') emptyCell(cell, slot);
        return;
      }
      if (!view) { mountTile(cell, catalog.find(game => game.id === tile.type), tile, false); view = views.get(slot); }
      view.arc.style.strokeDashoffset = String(56.5487 * (1 - tile.remainingMs / lifetime));
      const seconds = Math.ceil(tile.remainingMs / 1000);
      if (view.lastSeconds !== seconds) {
        view.number.textContent = seconds;
        view.timer.setAttribute('aria-label', `${seconds} seconds remaining`);
        view.lastSeconds = seconds;
      }
      cell.classList.toggle('urgent', tile.remainingMs <= 4000);
      cell.classList.toggle('expired', tile.id === state.expiredTileId);
      if (state.status === 'running') view.api.tick(lifetime - tile.remainingMs, delta);
    });
    $('pause-button').disabled = state.status !== 'running';
  }
  function frame(now) {
    const delta = Math.min(100, Math.max(0, now - lastFrame));
    lastFrame = now;
    if (!playingDemo) {
      const state = engine.tick(now);
      render(state, now, delta);
    }
    requestAnimationFrame(frame);
  }
  function openDialog(kind, content) {
    modalKind = kind;
    habitat.update(engine.snapshot(performance.now()).elapsedMs, false);
    board.setAttribute('inert', '');
    $('dialog-content').innerHTML = content;
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() {
    if (dialog.open) dialog.close();
    modalKind = '';
    board.removeAttribute('inert');
  }
  function resumeRun() {
    closeDialog();
    initAudio();
    lastFrame = performance.now();
    engine.resume(lastFrame);
    render(engine.snapshot(lastFrame), lastFrame, 0);
  }
  function pauseRun() {
    if (playingDemo || engine.status !== 'running') return;
    if (!engine.pause(performance.now())) return;
    updateBest(engine.snapshot(performance.now()).elapsedMs);
    openDialog('pause', '<div class="dialog-icon" aria-hidden="true">Ⅱ</div><div class="dialog-eyebrow">A LITTLE BREATHER</div><h2 id="dialog-title">Take your time.</h2><p>Everything is right where you left it.<br>Your timers are paused.</p><button class="primary-button" data-action="resume">Back to the rush <span aria-hidden="true">↗</span></button><button class="secondary-button" data-action="restart">Start a fresh run</button><button class="quiet-button" data-action="home">Back to the beginning</button>');
  }
  function showHelp() {
    const resume = engine.status === 'running' && !playingDemo;
    if (resume && !engine.pause(performance.now())) return;
    openDialog('help', `<div class="dialog-eyebrow">A SMALL GUIDE TO THE RUSH</div><h2 id="dialog-title">Keep the grid happy.</h2><div class="help-steps"><div class="help-step"><span>2.5</span><p><strong>A new game every 2.5 seconds.</strong>It lands in a random empty square; a full grid waits.</p></div><div class="help-step"><span>25</span><p><strong>25 seconds to clear each tile.</strong>Follow its prompt. The little ring is its timer.</p></div><div class="help-step"><span>01</span><p><strong>One missed tile ends your run.</strong>Switch between tiles in any order.</p></div></div><p class="help-note">The first Break is a hatch: wait for the chrysalis, then tap.<br>Drag nectar from Feed tiles to your new butterfly.<br>Only the clock ends a run. Pause any time.</p><button class="primary-button" data-action="${resume ? 'resume' : 'close'}">Got it. Let’s go <span aria-hidden="true">↗</span></button>`);
  }
  function showResult(tile, state) {
    const game = catalog.find(item => item.id === tile.type);
    const record = state.elapsedMs > bestAtStart;
    openDialog('result', `<div class="dialog-icon" aria-hidden="true" style="background:var(--peach)">✳</div><div class="dialog-eyebrow">${record ? 'A NEW PERSONAL BEST' : 'A LITTLE CHAOS, WELL PLAYED'}</div><h2 id="dialog-title">That was a rush.</h2><p>The ${game.title.toLowerCase()} tile ran out of time.<br>There’s always one more round.</p><div class="result-stats"><div class="result-stat"><strong>${timeText(state.elapsedMs)}</strong><span>TIME SURVIVED</span></div><div class="result-stat"><strong>${state.score}</strong><span>GAMES CLEARED</span></div></div><button class="primary-button" data-action="restart">One more round <span aria-hidden="true">↗</span></button><button class="quiet-button" data-action="home">Back to the beginning</button>`);
    announce(`Run over. ${timeText(state.elapsedMs)} survived. ${state.score} games cleared.`);
  }
  $('start-button').addEventListener('click', startRun);
  $('pause-button').addEventListener('click', pauseRun);
  $('desktop-help').addEventListener('click', showHelp);
  $('mobile-help').addEventListener('click', showHelp);
  $('sound-button').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    save('little-rush-sound', soundEnabled ? 'on' : 'off');
    syncSound(); initAudio(); if (soundEnabled) tone(660, 0, .1);
  });
  function syncSound() {
    $('sound-button').classList.toggle('sound-on', soundEnabled);
    $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
    $('sound-button').setAttribute('aria-label', `Turn sound ${soundEnabled ? 'off' : 'on'}`);
  }
  $('dialog-content').addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'resume') resumeRun();
    if (action === 'restart') startRun();
    if (action === 'home') showHome();
    if (action === 'close') closeDialog();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (modalKind === 'pause' || (modalKind === 'help' && !playingDemo && engine.status === 'paused')) resumeRun();
    else if (modalKind === 'help') closeDialog();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dialog.open && !playingDemo && engine.status === 'running') { event.preventDefault(); pauseRun(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
  window.addEventListener('blur', () => { if (!dialog.open) pauseRun(); });
  window.addEventListener('pagehide', () => {
    if (!playingDemo) updateBest(engine.snapshot(performance.now()).elapsedMs);
  });
  syncSound();
  showHome();
  requestAnimationFrame(frame);
})();
