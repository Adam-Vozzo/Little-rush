(() => {
  'use strict';

  // Practice has its own clock and habitat. It never touches a run or its records.
  function create(container, type, {onFeedback = () => {}, settleMs = 650} = {}) {
    const tile = container.parentElement;
    let api, habitat, age = 0, resetAt = null, disposed = false, visible = true, generation = 0;
    const observer = window.IntersectionObserver ? new window.IntersectionObserver(entries => {
      if (disposed) return;
      visible = entries[0].isIntersecting;
      if (!visible) { api?.suspend?.(); habitat?.update(age, false); }
    }) : null;
    observer?.observe(tile);
    // Focusing or touching a newly scrolled-in tile can beat the observer's
    // next frame. Wake it before the game's own first input is handled.
    const wake = () => {
      if (disposed || document.hidden) return;
      visible = true; habitat?.update(age, true);
    };
    container.addEventListener('pointerdown', wake, true);
    container.addEventListener('focusin', wake);

    function reset() {
      const round = ++generation;
      api?.destroy(); habitat?.reset(); habitat?.layer.remove(); habitat = null;
      age = 0; resetAt = null; tile.classList.remove('is-solved');
      if (type === 'feed') {
        habitat = new window.LittleRushButterfly.Habitat(container);
        habitat.hatch(0, 0);
      }
      api = window.LittleRushGames.mount(container, type, {
        butterfly: habitat, onFeedback,
        onComplete() {
          if (disposed || round !== generation || resetAt !== null) return;
          resetAt = age + settleMs;
          tile.classList.add('is-solved');
          habitat?.celebrate(age);
        }
      });
    }
    reset();
    return {
      tick(delta, active = true) {
        if (disposed) return;
        if (!active || !visible) { api.suspend?.(); habitat?.update(age, false); return; }
        const step = Math.max(0, Math.min(delta, 100));
        age += step;
        if (resetAt !== null && age >= resetAt) reset();
        else if (resetAt === null) api.tick(age, step);
        habitat?.update(age, true);
      },
      destroy() {
        if (disposed) return;
        disposed = true; observer?.disconnect(); api.destroy();
        container.removeEventListener('pointerdown', wake, true);
        container.removeEventListener('focusin', wake);
        habitat?.reset(); habitat?.layer.remove();
        tile.classList.remove('is-solved');
      }
    };
  }
  window.LittleRushPreviews = {create};
})();
