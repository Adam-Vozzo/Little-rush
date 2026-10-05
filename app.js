(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const catalog = window.LittleRushGames.catalog;
  const difficulties = { zen: { spawn: 2500, expiry: 25000 }, calm: { spawn: 3000, expiry: 30000 }, normal: { spawn: 2500, expiry: 25000 }, extreme: { spawn: 1500, expiry: 15000 } };
  let difficulty = readSaved('little-rush-difficulty', 'normal');
  if (!Object.hasOwn(difficulties, difficulty)) difficulty = 'normal';
  let lifetime = difficulties[difficulty].expiry;
  const previews = [];
  const completionDelay = type => type === 'break' ? 880 : ['roll', 'connect', 'match', 'bubbles', 'jewels', 'pegs', 'telescope', 'board', 'golf'].includes(type) ? 720 : 480;
  const savedGameplay = readJSON('little-rush-gameplay-v1', {});
  let timeBasedPoints = savedGameplay?.timeBasedPoints === true;
  let pointsPreference = savedGameplay?.pointsPreference === 'late' ? 'late' : 'fast';
  const board = $('game-board');
  const dialog = $('game-dialog');
  const habitat = new window.LittleRushButterfly.Habitat(board.parentElement);
  const cells = [], views = new Map();
  let lastFrame = performance.now(), modalKind = '', atHome = true;
  let lastShownTime = '', lastShownScore = -1, hatchIntroduced = false;
  let soundEnabled = readSaved('little-rush-sound', 'off') === 'on', audioContext;
  let selectedTheme = readSaved('little-rush-theme-v1', 'flat') === 'holofoil' ? 'holofoil' : 'flat';
  let tweaksTab = 'games';
  const positive = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const savedRecords = readJSON('little-rush-records-v1', {});
  const records = {
    allTime: { timeMs: Math.max(positive(savedRecords?.allTime?.timeMs), positive(readSaved('little-rush-best-v3', '0'))), score: positive(savedRecords?.allTime?.score) },
    daily: { date: String(savedRecords?.daily?.date || ''), timeMs: positive(savedRecords?.daily?.timeMs), score: positive(savedRecords?.daily?.score) }
  };
  const savedDisabled = readJSON('little-rush-disabled-games-v1', []);
  let disabledGames = new Set(Array.isArray(savedDisabled) ? savedDisabled.filter(id => catalog.some(game => game.id === id)) : []);
  if (disabledGames.has('press')) disabledGames.add('feed');
  let bestAtStart = records.allTime.timeMs, scoreAtStart = records.allTime.score;
  function readSaved(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
  function readJSON(key, fallback) { try { return JSON.parse(readSaved(key, 'null')) ?? fallback; } catch { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* Records are optional in private mode. */ } }
  function localDay() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function refreshDay() {
    const date = localDay();
    if (records.daily.date === date) return;
    records.daily = { date, timeMs: 0, score: 0 };
    save('little-rush-records-v1', JSON.stringify(records));
  }
  function timeText(ms, tenths = false) {
    const seconds = Math.floor(ms / 1000);
    const main = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    return tenths ? `${main}<span>.${Math.floor(ms / 100) % 10}</span>` : main;
  }
  function renderRecords() {
    refreshDay();
    $('alltime-time').textContent = timeText(records.allTime.timeMs);
    $('alltime-score').textContent = records.allTime.score;
    $('today-time').textContent = timeText(records.daily.timeMs);
    $('today-score').textContent = records.daily.score;
  }
  function updateRecords(state) {
    if (state.zen) return;
    refreshDay();
    for (const record of [records.allTime, records.daily]) {
      record.timeMs = Math.max(record.timeMs, positive(state.elapsedMs));
      record.score = Math.max(record.score, positive(state.score));
    }
    save('little-rush-records-v1', JSON.stringify(records));
    save('little-rush-best-v3', records.allTime.timeMs);
    renderRecords();
  }
  function canStart() { return catalog.some(game => game.id !== 'press' && !(difficulty === 'zen' && game.id === 'feed') && !disabledGames.has(game.id) && (game.id !== 'feed' || !disabledGames.has('press'))); }
  const unavailableMessage = () => difficulty === 'zen' ? 'Enable a game besides Hatch and Feed in Tweaks to fill the board.' : 'Enable a repeatable micro-game in Tweaks to play.';
  function syncStart() {
    const unavailable = unavailableMessage();
    $('start-button').disabled = !canStart();
    $('start-button').setAttribute('aria-label', canStart() ? "Let's play" : unavailable);
    $('home-note').textContent = canStart() ? difficulty === 'zen' ? 'No rush. Just a count of games completed.' : 'Personal records, saved on this device.' : unavailable;
  }
  function initAudio() {
    if (!soundEnabled) return;
    try { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio && !audioContext) audioContext = new Audio(); if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  function tone(frequency, delay = 0, duration = .09, volume = .035) {
    if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), at = audioContext.currentTime + delay;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .007); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(at); oscillator.stop(at + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function feedback(kind) { tone(kind === 'error' ? 180 : 540, 0, kind === 'error' ? .08 : .035, .025); }
  function announce(text) { $('announcer').textContent = text; }
  const engine = new window.LittleRushEngine({
    types: catalog.map(game => game.id), firstSpawnDelayMs: 650,
    isTypeAvailable(type, state) {
      if (disabledGames.has(type)) return false;
      if (type === 'press') return !hatchIntroduced;
      if (engine.zen) return type !== 'feed' || habitat.active;
      if (type === 'feed') return habitat.active && !state.tiles.some(tile => tile?.type === 'feed');
      return true;
    },
    onSpawn(tile) {
      if (tile.type === 'press') hatchIntroduced = true;
      if (!engine.zen) tone(680, 0, .07, .022);
      const game = catalog.find(item => item.id === tile.type);
      announce(`${game.title} appeared in row ${Math.floor(tile.slot / 2) + 1}, column ${tile.slot % 2 + 1}. ${engine.zen ? 'Take your time.' : lifetime / 1000 + ' seconds.'}`);
    },
    onComplete(tile, state) {
      if (tile.type === 'press' && habitat.hatch(tile.slot, state.elapsedMs) && !disabledGames.has('feed')) engine.enqueueType('feed');
      if (tile.type === 'feed') habitat.celebrate(state.elapsedMs);
      if (tile.points) {
        const reward = document.createElement('span'); reward.className = 'tile-points'; reward.textContent = `+${tile.points}`;
        cells[tile.slot].append(reward);
      }
      tone(660, 0, .11); tone(880, .07, .16, .025); announce(usesPoints() ? `${tile.points} points. Total ${state.points}.` : `${state.score} cleared.`);
    },
    onEnd(tile, state) { updateRecords(state); tone(330, 0, .18, .03); tone(247, .13, .25, .025); showResult(tile, state); }
  });
  function usesPoints() { return timeBasedPoints && !engine.zen; }
  function destroyViews() { for (const view of views.values()) view.api.destroy(); views.clear(); }
  function piePath(fraction) {
    if (fraction >= .999999) return 'M12 2A10 10 0 1 1 12 22A10 10 0 1 1 12 2Z';
    if (fraction <= 0) return '';
    const angle = fraction * Math.PI * 2 - Math.PI / 2;
    return `M12 12L12 2A10 10 0 ${fraction > .5 ? 1 : 0} 1 ${(12 + 10 * Math.cos(angle)).toFixed(3)} ${(12 + 10 * Math.sin(angle)).toFixed(3)}Z`;
  }
  function timerMarkup() { return engine.zen ? '' : `<div class="tile-timer" role="img" aria-label="${lifetime / 1000} seconds remaining"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="timer-track" cx="12" cy="12" r="10"/><path class="timer-fill" d="${piePath(1)}"/></svg></div>`; }
  function emptyCell(cell, slot) {
    cell.className = 'tile empty'; cell.removeAttribute('data-game'); cell.removeAttribute('data-tile-id');
    cell.setAttribute('aria-label', `Empty slot ${slot + 1}`); cell.innerHTML = '<span class="empty-mark" aria-hidden="true">+</span>'; cell.dataset.view = 'empty';
  }
  for (let slot = 0; slot < 8; slot++) { const cell = document.createElement('section'); board.append(cell); cells.push(cell); emptyCell(cell, slot); }
  function mountTile(cell, game, tile) {
    cell.className = `tile ${game.color} new-tile`; cell.dataset.game = game.id; cell.dataset.view = tile.id; cell.dataset.tileId = tile.id;
    cell.setAttribute('aria-label', `${game.title} micro-game`);
    cell.innerHTML = `<header class="tile-header"><span class="tile-title">${game.title}</span>${timerMarkup()}</header><div class="microgame"></div>`;
    const timer = cell.querySelector('.tile-timer'), fill = cell.querySelector('.timer-fill');
    const api = window.LittleRushGames.mount(cell.querySelector('.microgame'), game.id, {
      butterfly: habitat, onComplete: () => engine.complete(tile.id, performance.now(), completionDelay(game.id)), onFeedback: feedback
    });
    views.set(tile.slot, { api, id: tile.id, type: game.id, timer, fill, lastSeconds: -1 });
  }
  function showHome() {
    if (!atHome) { if (engine.status === 'running') engine.pause(performance.now()); updateRecords(engine.snapshot(performance.now())); }
    closeDialog(); destroyViews(); habitat.reset(); hatchIntroduced = false; atHome = true;
    document.body.classList.remove('is-running'); cells.forEach(emptyCell);
    $('home-screen').hidden = false; $('play-screen').hidden = true; $('pause-button').disabled = true;
    renderRecords(); syncStart();
  }
  function startRun() {
    if (!canStart()) return;
    if (!atHome) updateRecords(engine.snapshot(performance.now()));
    closeDialog(); initAudio(); destroyViews(); habitat.reset(); hatchIntroduced = false; atHome = false;
    bestAtStart = records.allTime.timeMs; scoreAtStart = records.allTime.score;
    cells.forEach(emptyCell); document.body.classList.add('is-running');
    $('home-screen').hidden = true; $('play-screen').hidden = false; $('pause-button').disabled = false;
    engine.types = catalog.filter(game => !disabledGames.has(game.id)).map(game => game.id);
    engine.initialType = null;
    engine.zen = difficulty === 'zen';
    engine.spawnIntervalMs = difficulties[difficulty].spawn;
    engine.tileLifetimeMs = lifetime = difficulties[difficulty].expiry;
    engine.scoringMode = usesPoints() ? pointsPreference : 'off';
    $('hud-score').setAttribute('aria-label', usesPoints() ? 'Points scored' : 'Challenges cleared');
    $('hud-score').classList.toggle('shows-points', usesPoints());
    $('run-time').classList.toggle('is-zen', engine.zen);
    $('run-time').setAttribute('role', engine.zen ? 'status' : 'timer');
    $('run-time').setAttribute('aria-label', engine.zen ? 'Zen mode. No time limit.' : 'Run time');
    lastShownTime = ''; lastShownScore = -1; lastFrame = performance.now();
    engine.start(lastFrame); render(engine.snapshot(lastFrame), lastFrame, 0);
    $('pause-button').focus({ preventScroll: true });
  }
  function render(state, now, delta) {
    if (atHome) return;
    habitat.update(state.elapsedMs, state.status === 'running');
    const formatted = state.zen ? 'zen' : timeText(state.elapsedMs, true);
    if (formatted !== lastShownTime) { $('run-time').innerHTML = formatted; lastShownTime = formatted; }
    const shownScore = usesPoints() ? state.points : state.score;
    if (shownScore !== lastShownScore) { $('score').textContent = String(shownScore); $('score').setAttribute('aria-label', usesPoints() ? `${state.points} points` : `${state.score} cleared`); lastShownScore = shownScore; }
    cells.forEach((cell, slot) => {
      const tile = state.tiles[slot]; let view = views.get(slot);
      if (view && (!tile || view.id !== tile.id)) { view.api.destroy(); views.delete(slot); view = null; }
      if (!tile) { if (cell.dataset.view !== 'empty') emptyCell(cell, slot); return; }
      if (!view) { mountTile(cell, catalog.find(game => game.id === tile.type), tile); view = views.get(slot); }
      if (tile.completedAt !== undefined) {
        cell.classList.remove('urgent'); cell.classList.add('is-solved');
        cell.classList.toggle('is-clearing', !state.zen && tile.releaseInMs <= 170);
        cell.setAttribute('aria-label', 'Challenge cleared'); if (view.timer) view.timer.hidden = true;
        return;
      }
      view.fill?.setAttribute('d', piePath(tile.remainingMs / lifetime));
      const seconds = Math.ceil(tile.remainingMs / 1000);
      if (seconds !== view.lastSeconds) { view.timer?.setAttribute('aria-label', `${seconds} seconds remaining`); view.lastSeconds = seconds; }
      cell.classList.toggle('urgent', !state.zen && tile.remainingMs <= 4000); cell.classList.toggle('expired', tile.id === state.expiredTileId);
      if (state.status === 'running') view.api.tick(tile.ageMs, delta);
    });
    $('pause-button').disabled = state.status !== 'running';
  }
  function frame(now) {
    const delta = Math.min(100, Math.max(0, now - lastFrame)); lastFrame = now;
    if (!atHome) render(engine.tick(now), now, delta);
    else if (records.daily.date !== localDay()) renderRecords();
    previews.forEach(preview => preview.tick(delta, modalKind === 'tweaks' && tweaksTab === 'games' && !document.hidden));
    requestAnimationFrame(frame);
  }
  function openDialog(kind, content) {
    views.forEach(view => view.api.suspend?.());
    previews.splice(0).forEach(api => api.destroy());
    dialog.classList.toggle('tweaks-dialog', kind === 'tweaks');
    modalKind = kind; habitat.update(engine.snapshot(performance.now()).elapsedMs, false); board.setAttribute('inert', '');
    $('dialog-content').innerHTML = content; if (!dialog.open) dialog.showModal();
  }
  function closeDialog() { previews.splice(0).forEach(api => api.destroy()); if (dialog.open) dialog.close(); modalKind = ''; board.removeAttribute('inert'); }
  function resumeRun() { closeDialog(); initAudio(); lastFrame = performance.now(); engine.resume(lastFrame); render(engine.snapshot(lastFrame), lastFrame, 0); }
  function showPauseMenu() {
    openDialog('pause', `<div class="dialog-eyebrow">A LITTLE BREATHER</div><h2 id="dialog-title">Paused.</h2><p>The rush can wait.</p><button class="primary-button" data-action="resume">Keep playing</button><div class="pause-options"><button class="menu-option" data-action="sound" aria-pressed="${soundEnabled}">Sound ${soundEnabled ? 'on' : 'off'}</button><button class="menu-option" data-action="help">How to play</button></div><button class="secondary-button" data-action="restart">Start again</button><button class="quiet-button" data-action="home">Title screen</button>`);
  }
  function pauseRun() {
    if (atHome || engine.status !== 'running' || !engine.pause(performance.now())) return;
    updateRecords(engine.snapshot(performance.now())); showPauseMenu();
  }
  function showHelp() {
    if (engine.zen) {
      openDialog('help', '<div class="dialog-eyebrow">ZEN MODE</div><h2 id="dialog-title">Take your time.</h2><ul class="help-steps"><li>Eight games, always ready to play.</li><li>No expiry timers and no points. Your counter records games completed.</li><li>Each completed game makes room for a fresh one.</li><li>Timed-run records stay separate. Pause or return to the title whenever you like.</li></ul><button class="primary-button" data-action="back-pause">Back to pause</button>');
      return;
    }
    openDialog('help', '<div class="dialog-eyebrow">HOW TO PLAY</div><h2 id="dialog-title">Keep up.</h2><ul class="help-steps"><li>A new tile every 2.5 seconds.</li><li>Clear each within 25 seconds. Its filled circle counts down.</li><li>One empty circle ends the run.</li><li>Switch between tiles in any order.</li><li>Wait for the chrysalis, then tap. Drag nectar to the butterfly.</li></ul><div class="category-key"><span><i style="background:var(--butter)"></i>Numbers</span><span><i style="background:var(--lavender)"></i>Memory</span><span><i style="background:var(--blue)"></i>Spatial</span><span><i style="background:var(--sage)"></i>Precision</span><span><i style="background:var(--peach)"></i>Nature & time</span></div><button class="primary-button" data-action="back-pause">Back to pause</button>'.replace('2.5 seconds', (engine.spawnIntervalMs / 1000) + ' seconds').replace('25 seconds', (lifetime / 1000) + ' seconds'));
  }
  function showResult(tile, state) {
    const game = catalog.find(item => item.id === tile.type), record = state.elapsedMs > bestAtStart || state.score > scoreAtStart;
    openDialog('result', `<div class="dialog-eyebrow">${record ? 'A NEW PERSONAL BEST' : 'ONE LITTLE TILE TOO LATE'}</div><h2 id="dialog-title">That was a rush.</h2><p>${game.title.toLowerCase()} ran out of time.</p><div class="result-stats"><div class="result-stat"><strong>${timeText(state.elapsedMs)}</strong><span>TIME</span></div><div class="result-stat"><strong>${timeBasedPoints ? state.points : state.score}</strong><span>${timeBasedPoints ? 'POINTS' : 'CLEARED'}</span></div></div><button class="primary-button" data-action="restart">One more round</button><button class="quiet-button" data-action="home">Title screen</button>`);
    announce(`Run over. ${timeText(state.elapsedMs)} survived. ${state.score} games cleared.`);
  }
  function saveTweaks() { save('little-rush-disabled-games-v1', JSON.stringify([...disabledGames])); syncStart(); }
  function saveGameplay() { save('little-rush-gameplay-v1', JSON.stringify({ timeBasedPoints, pointsPreference })); }
  function showTweaks(tab = tweaksTab) {
    tweaksTab = tab;
    const toggles = catalog.map(game => `<article class="game-option"><div class="tile ${game.color} game-preview" aria-label="Practice ${game.title}"><header class="tile-header"><span class="tile-title">${game.title}</span></header><div class="microgame" data-preview="${game.id}"></div></div><label class="game-toggle"><span>${game.title}</span><input type="checkbox" role="switch" data-game-toggle="${game.id}" aria-label="Allow ${game.title}" ${disabledGames.has(game.id) ? '' : 'checked'} ${game.id === 'feed' && disabledGames.has('press') ? 'disabled' : ''}></label></article>`).join('');
    const tabs = `<div class="tweaks-tabs" role="tablist" aria-label="Tweaks sections"><button id="games-tab" role="tab" data-action="games-tab" aria-controls="games-panel" aria-selected="${tab === 'games'}" tabindex="${tab === 'games' ? 0 : -1}">Micro-games</button><button id="styles-tab" role="tab" data-action="styles-tab" aria-controls="styles-panel" aria-selected="${tab === 'styles'}" tabindex="${tab === 'styles' ? 0 : -1}">Styles</button><button id="gameplay-tab" role="tab" data-action="gameplay-tab" aria-controls="gameplay-panel" aria-selected="${tab === 'gameplay'}" tabindex="${tab === 'gameplay' ? 0 : -1}">Gameplay</button></div>`;
    const gamesPanel = `<section id="games-panel" role="tabpanel" aria-labelledby="games-tab" ${tab === 'games' ? '' : 'hidden'}><p class="tweaks-note">Try any game here. Completed games refresh automatically.</p><div class="tweak-presets"><button data-action="all-on">All on</button><button data-action="all-off">All off</button></div><div class="game-toggles">${toggles}</div><p class="tweak-status">${canStart() ? 'Feed needs Wait & Hatch. Choices are saved.' : unavailableMessage()}</p></section>`;
    const stylesPanel = `<section id="styles-panel" role="tabpanel" aria-labelledby="styles-tab" ${tab === 'styles' ? '' : 'hidden'}><p class="tweaks-note">A new feel for the whole game.</p><div class="theme-options" role="group" aria-label="Game style">${['flat', 'holofoil'].map(name => `<button class="theme-option ${name === selectedTheme ? 'is-selected' : ''}" data-action="theme-${name}" aria-pressed="${name === selectedTheme}"><span class="theme-preview theme-preview-${name}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="theme-description"><strong>${name === 'flat' ? 'Flat' : 'Holofoil'}</strong><small>${name === 'flat' ? 'Soft colours. Simple little squares.' : 'Prismatic foil. A little shimmer.'}</small></span><span class="theme-check" aria-hidden="true">${name === selectedTheme ? '✓' : ''}</span></button>`).join('')}</div><p class="tweak-status">Style changes apply immediately and are saved.</p></section>`;
    const gameplayPanel = `<section id="gameplay-panel" role="tabpanel" aria-labelledby="gameplay-tab" ${tab === 'gameplay' ? '' : 'hidden'}><p class="tweaks-note">Choose what a clear is worth.</p><div class="gameplay-setting"><label class="game-toggle points-toggle"><span>Time-based points</span><input type="checkbox" role="switch" id="time-based-points" aria-label="Time-based points" ${timeBasedPoints ? 'checked' : ''}></label><p>Replace the cleared counter with points earned from each tile. Up to 100 points per clear.</p><fieldset class="points-options" ${timeBasedPoints ? '' : 'disabled'}><legend>Reward timing</legend><label><input type="radio" name="points-preference" value="fast" ${pointsPreference === 'fast' ? 'checked' : ''}><span><strong>Faster clears</strong><small>More time left means more points.</small></span></label><label><input type="radio" name="points-preference" value="late" ${pointsPreference === 'late' ? 'checked' : ''}><span><strong>Closer to expiry</strong><small>Less time left means more points. Clear before the circle empties.</small></span></label></fieldset></div><p class="tweak-status">Applies to your next timed run. Zen always counts completions.</p></section>`;
    openDialog('tweaks', `<div class="dialog-eyebrow">MAKE IT YOURS</div><h2 id="dialog-title">Tweaks</h2>${tabs}${gamesPanel}${stylesPanel}${gameplayPanel}<button class="primary-button" data-action="close">Done</button>`);
    if (tab === 'games') $('dialog-content').querySelectorAll('[data-preview]').forEach(container => previews.push(window.LittleRushPreviews.create(container, container.dataset.preview, { settleMs: completionDelay(container.dataset.preview), onFeedback: kind => { initAudio(); feedback(kind); } })));
  }
  function syncDifficulty() {
    document.querySelectorAll('[data-difficulty]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.difficulty === difficulty)));
    const mode = difficulties[difficulty];
    $('difficulty-detail').textContent = difficulty === 'zen' ? 'A full board · no time limits · count your clears' : `A game every ${mode.spawn / 1000}s · ${mode.expiry / 1000}s to clear`;
    syncStart();
  }
  $('difficulty-options').addEventListener('click', event => {
    const name = event.target.closest('[data-difficulty]')?.dataset.difficulty;
    if (!Object.hasOwn(difficulties, name)) return;
    difficulty = name; save('little-rush-difficulty', name); syncDifficulty();
  });
  $('start-button').addEventListener('click', startRun); $('pause-button').addEventListener('click', pauseRun); $('tweaks-button').addEventListener('click', () => {
    showTweaks(); $('dialog-content').querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
  });
  $('dialog-content').addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'resume') resumeRun();
    if (action === 'restart') startRun();
    if (action === 'home') showHome();
    if (action === 'close') closeDialog();
    if (action === 'help') showHelp();
    if (action === 'back-pause') showPauseMenu();
    if (['games-tab', 'styles-tab', 'gameplay-tab'].includes(action)) { showTweaks(action.replace('-tab', '')); $('dialog-content').querySelector(`[data-action="${action}"]`)?.focus({ preventScroll: true }); }
    if (action === 'theme-flat' || action === 'theme-holofoil') {
      selectedTheme = action === 'theme-holofoil' ? 'holofoil' : 'flat'; save('little-rush-theme-v1', selectedTheme);
      window.LittleRushTheme?.setTheme(selectedTheme); showTweaks('styles');
      $('dialog-content').querySelector(`[data-action="${action}"]`)?.focus({ preventScroll: true });
    }
    if (action === 'sound') { soundEnabled = !soundEnabled; save('little-rush-sound', soundEnabled ? 'on' : 'off'); initAudio(); if (soundEnabled) tone(660, 0, .1); showPauseMenu(); }
    if (action === 'all-on' || action === 'all-off') { disabledGames = new Set(action === 'all-on' ? [] : catalog.map(game => game.id)); saveTweaks(); showTweaks(); }
  });
  $('dialog-content').addEventListener('change', event => {
    if (modalKind === 'tweaks' && event.target.id === 'time-based-points') {
      timeBasedPoints = event.target.checked; saveGameplay();
      $('dialog-content').querySelector('.points-options').disabled = !timeBasedPoints; return;
    }
    if (modalKind === 'tweaks' && event.target.name === 'points-preference' && ['fast','late'].includes(event.target.value)) {
      pointsPreference = event.target.value; saveGameplay(); return;
    }
    const id = event.target.dataset.gameToggle;
    if (!catalog.some(game => game.id === id) || modalKind !== 'tweaks') return;
    if (id === 'feed' && disabledGames.has('press')) return;
    if (event.target.checked) disabledGames.delete(id); else disabledGames.add(id);
    if (disabledGames.has('press')) disabledGames.add('feed');
    saveTweaks();
    const feedToggle = $('dialog-content').querySelector('[data-game-toggle="feed"]');
    if (feedToggle) { feedToggle.disabled = disabledGames.has('press'); feedToggle.checked = !disabledGames.has('feed'); }
    const status = $('dialog-content').querySelector('.tweak-status');
    if (status) status.textContent = canStart() ? 'Feed needs Wait & Hatch. Choices are saved.' : unavailableMessage();
  });
  $('dialog-content').addEventListener('keydown', event => {
    if (event.target.getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = ['games', 'styles', 'gameplay'];
    const tab = event.key === 'Home' ? 'games' : event.key === 'End' ? 'gameplay' : tabs[(tabs.indexOf(tweaksTab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
    showTweaks(tab); $('dialog-content').querySelector(`[data-action="${tab}-tab"]`)?.focus({ preventScroll: true });
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (modalKind === 'pause') resumeRun(); else if (modalKind === 'help') showPauseMenu(); else if (modalKind === 'tweaks') closeDialog(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !dialog.open && !atHome && engine.status === 'running') { event.preventDefault(); pauseRun(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); else if (atHome) renderRecords(); });
  window.addEventListener('blur', () => { previews.forEach(preview => preview.tick(0, false)); if (!dialog.open) pauseRun(); });
  window.addEventListener('pagehide', () => { if (!atHome) { if (engine.status === 'running') engine.pause(performance.now()); updateRecords(engine.snapshot(performance.now())); } });
  window.LittleRushTheme?.setTheme(selectedTheme);
  syncDifficulty(); showHome(); requestAnimationFrame(frame);
})();
