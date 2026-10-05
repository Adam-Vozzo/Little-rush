(() => {
  'use strict';
  const butterflyArt = `<svg viewBox="0 0 80 70" aria-hidden="true"><g class="butterfly-left"><path d="M39 34C28 8 5 8 7 29c1 13 18 16 30 13C19 38 11 49 20 58c10 8 18-3 20-17" fill="#d599b1" stroke="#725c78" stroke-width="1.4"/><path d="M32 33C23 19 13 20 16 30c2 6 10 8 16 3" fill="#f2dbce"/><circle cx="25" cy="49" r="4" fill="#f6e8c2"/></g><g class="butterfly-right"><path d="M41 34C52 8 75 8 73 29c-1 13-18 16-30 13 18-4 26 7 17 16-10 8-18-3-20-17" fill="#b9afd8" stroke="#725c78" stroke-width="1.4"/><path d="M48 33c9-14 19-13 16-3-2 6-10 8-16 3" fill="#f2dbce"/><circle cx="55" cy="49" r="4" fill="#f6e8c2"/></g><path d="M40 26v23" stroke="#52654e" stroke-width="4" stroke-linecap="round"/><path d="m39 26-6-8m8 8 6-8" stroke="#52654e" stroke-width="1.5" stroke-linecap="round"/><circle cx="40" cy="26" r="3.5" fill="#52654e"/></svg>`;
  const flowerArt = `<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M40 38Q46 56 40 74" fill="none" stroke="#638d58" stroke-width="4" stroke-linecap="round"/><path d="M43 65Q24 68 22 51Q38 50 43 65M43 59Q59 61 63 46Q49 45 43 59" fill="#81aa68"/><g class="flower-petals" transform="translate(40 31)" fill="#e888a4">${[0,72,144,216,288].map(angle => `<ellipse cy="-13" rx="10" ry="14" transform="rotate(${angle})"/>`).join('')}</g><circle cx="40" cy="31" r="11" fill="#f2cc69"/><g fill="#805a43"><circle cx="36" cy="30" r="1.3"/><circle cx="44" cy="30" r="1.3"/></g><path d="M37 35Q40 38 43 35" fill="none" stroke="#805a43" stroke-width="1.4" stroke-linecap="round"/></svg>`;

  class Habitat {
    constructor(container) {
      this.container = container;
      this.layer = document.createElement('div');
      this.layer.className = 'butterfly-layer';
      this.layer.dataset.butterfly = 'locked';
      this.button = document.createElement('button');
      this.button.type = 'button';
      this.button.className = 'board-butterfly';
      this.button.setAttribute('aria-label', 'Butterfly. Select a flower in a Feed tile to feed it.');
      this.button.innerHTML = butterflyArt + '<span class="butterfly-message" aria-hidden="true">feed me</span>';
      this.button.tabIndex = -1;
      this.button.hidden = true;
      this.layer.append(this.button);
      container.append(this.layer);
      this.active = false;
      this.running = false;
      this.offer = null;
      this.elapsed = 0;
      this.position = {x: 0, y: 0};
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
      this.button.addEventListener('click', () => this.accept());
    }
    hatch(slot, elapsed) {
      if (this.active) return false;
      this.active = true;
      this.hatchedAt = elapsed;
      this.elapsed = elapsed;
      this.layer.dataset.butterfly = 'flying';
      this.button.hidden = false;
      const board = this.container.getBoundingClientRect();
      this.origin = {x: board.width * (slot % 2 ? .75 : .25), y: board.height * ((Math.floor(slot / 2) + .5) / 4)};
      this.position = {...this.origin};
      this.update(elapsed, true);
      return true;
    }
    update(elapsed, running) {
      this.elapsed = elapsed;
      if (!running && this.running) this.cancelOffer();
      this.running = running;
      this.layer.classList.toggle('butterfly-paused', !running);
      this.button.disabled = !running;
      if (!this.active || !running) return;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      const flight = Math.max(0, elapsed - this.hatchedAt);
      const t = flight / 1000;
      const inset = 30;
      const x = inset + Math.max(0, width - inset * 2) * (.5 + .43 * Math.sin(t * .34));
      const y = inset + Math.max(0, height - inset * 2) * (.5 + .42 * Math.sin(t * .23 + 1.8));
      const blend = Math.min(1, flight / 1600);
      this.position = this.reducedMotion ? {x: width - inset, y: height * .44} : {
        x: this.origin.x * (1 - blend) + x * blend,
        y: this.origin.y * (1 - blend) + y * blend
      };
      this.button.style.left = `${this.position.x}px`;
      this.button.style.top = `${this.position.y}px`;
      this.button.classList.toggle('butterfly-happy', elapsed < (this.happyUntil || 0));
    }
    offerNectar(owner, onAccept, onCancel) {
      if (!this.active || !this.running) return false;
      this.cancelOffer();
      this.offer = {owner, onAccept, onCancel};
      this.layer.classList.add('carrying-nectar');
      this.button.setAttribute('aria-label', 'Feed the butterfly');
      this.button.tabIndex = 0;
      return true;
    }
    cancelOffer(owner) {
      if (!this.offer || (owner && this.offer.owner !== owner)) return;
      const previous = this.offer;
      this.offer = null;
      this.layer.classList.remove('carrying-nectar');
      this.button.tabIndex = -1;
      this.button.setAttribute('aria-label', 'Butterfly. Select a flower in a Feed tile to feed it.');
      previous.onCancel();
    }
    hitTest(x, y) {
      const rect = this.button.getBoundingClientRect();
      return x >= rect.left - 10 && x <= rect.right + 10 && y >= rect.top - 10 && y <= rect.bottom + 10;
    }
    drop(owner, x, y) {
      if (!this.offer || this.offer.owner !== owner) return false;
      if (this.hitTest(x, y)) return this.accept();
      this.cancelOffer(owner);
      return false;
    }
    accept() {
      if (!this.active || !this.running || !this.offer) return false;
      const previous = this.offer;
      this.offer = null;
      this.layer.classList.remove('carrying-nectar');
      this.button.tabIndex = -1;
      this.button.setAttribute('aria-label', 'Happy butterfly');
      previous.onAccept();
      return true;
    }
    celebrate(elapsed) { this.happyUntil = elapsed + 1500; }
    reset() {
      this.cancelOffer();
      this.active = false;
      this.running = false;
      this.button.hidden = true;
      this.button.disabled = true;
      this.button.classList.remove('butterfly-happy');
      this.layer.dataset.butterfly = 'locked';
      this.happyUntil = 0;
    }
  }
  window.LittleRushButterfly = {Habitat};

  window.LittleRushGames.register([{id:'feed', title:'FEED BUTTERFLY', color:'peach'}], (container, type, options = {}) => {
    const {demo = false, onComplete = () => {}, onFeedback = () => {}, butterfly} = options;
    const root = document.createElement('div');
    root.className = 'mg mg-feed';
    root.innerHTML = `<div class="mg-body"><button type="button" class="nectar-button" aria-label="Flower. Drag to the butterfly, or press Enter to select.">${flowerArt}</button></div><div class="mg-hint">Drag to the butterfly</div>`;
    container.append(root);
    const button = root.querySelector('button');
    const hint = root.querySelector('.mg-hint');
    const owner = {};
    const listeners = [];
    let destroyed = false;
    let complete = false;
    let pointer = null;
    let ghost = null;
    function cleanDrag() {
      const held = pointer;
      pointer = null;
      if (held !== null && button.hasPointerCapture?.(held)) button.releasePointerCapture(held);
      ghost?.remove(); ghost = null;
      root.classList.remove('nectar-selected');
    }
    function cancel() { cleanDrag(); if (!destroyed && !complete) hint.textContent = 'Drag to the butterfly'; }
    function finish() {
      if (destroyed || complete || demo) return;
      complete = true;
      cleanDrag();
      onFeedback('tap');
      onComplete({kind:'feed'});
    }
    function select() {
      if (!butterfly?.offerNectar(owner, finish, cancel)) { hint.textContent = 'Hatch a butterfly first'; return false; }
      root.classList.add('nectar-selected');
      hint.textContent = 'Bring it to the butterfly';
      return true;
    }
    function listen(name, callback) {
      if (demo) return;
      const guarded = event => { if (!complete && !destroyed) callback(event); };
      button.addEventListener(name, guarded);
      listeners.push(() => button.removeEventListener(name, guarded));
    }
    function moveGhost(event) {
      if (ghost) { ghost.style.left = `${event.clientX}px`; ghost.style.top = `${event.clientY}px`; }
    }
    listen('pointerdown', event => {
      if (pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      if (!select()) return;
      pointer = event.pointerId;
      button.setPointerCapture(pointer);
      ghost = document.createElement('div');
      ghost.className = 'nectar-ghost';
      ghost.innerHTML = flowerArt;
      // A practice tile lives in the dialog's top layer, above the document.
      (container.closest?.('dialog') || document.body).append(ghost);
      moveGhost(event);
    });
    listen('pointermove', event => { if (pointer === event.pointerId) { event.preventDefault(); moveGhost(event); } });
    listen('pointerup', event => {
      if (pointer !== event.pointerId) return;
      event.preventDefault();
      butterfly.drop(owner, event.clientX, event.clientY);
      cleanDrag();
    });
    for (const name of ['pointercancel', 'lostpointercapture']) listen(name, event => {
      if (pointer === event.pointerId) { butterfly?.cancelOffer(owner); cleanDrag(); }
    });
    listen('click', event => {
      if (event.detail === 0 && select()) {
        hint.textContent = 'Press Enter on the butterfly';
        butterfly.button.focus({preventScroll:true});
      }
    });
    listen('keydown', event => { if (event.key === 'Escape') { butterfly?.cancelOffer(owner); cleanDrag(); } });
    if (demo) { button.tabIndex = -1; root.classList.add('mg-demo'); }
    return {
      tick() {},
      destroy() {
        if (destroyed) return;
        destroyed = true;
        butterfly?.cancelOffer(owner);
        cleanDrag();
        listeners.forEach(remove => remove());
        root.remove();
      }
    };
  });
})();
