(function () {
  'use strict';

  const MAX_FPS = 30, DPR_LIMIT = 1.5, PIXEL_LIMIT = 512;
  const tintByCategory = {
    sage: [.78, .91, .83], peach: [.96, .82, .82], butter: [.96, .90, .71],
    lavender: [.87, .84, .97], blue: [.78, .90, .95],
  };
  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = vec2(a_position.x * .5 + .5, .5 - a_position.y * .5);
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec2 v_uv;
    uniform vec2 u_pixels;
    uniform vec2 u_pointer;
    uniform vec3 u_tint;
    uniform float u_time;
    uniform float u_seed;

    float grain(vec2 p) {
      p = fract(p * vec2(.1031, .11369));
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 uv = v_uv;
      vec2 focus = mix(vec2(.32, .24), u_pointer, .67);
      float angle = dot(uv, vec2(.83, -.58));
      float phase = angle * 1.35 + u_seed * .19;
      phase += (u_pointer.x - .5) * .21 + (u_pointer.y - .5) * .12;
      phase += u_time * .017;
      vec3 rainbow = .5 + .5 * cos(6.283185 * (phase + vec3(0.0, .333, .667)));
      float bands = pow(.5 + .5 * sin(angle * 21.0 + phase * 3.0), 10.0);
      float secondary = pow(.5 + .5 * sin(angle * 41.0 - phase * 2.0), 20.0);
      float broad = exp(-dot((uv - focus) * vec2(1.2, .85), (uv - focus) * vec2(1.2, .85)) * 5.5);
      float etched = sin((uv.x * .7 + uv.y) * 420.0 + u_seed) * .018;
      float dust = grain(floor(uv * u_pixels));
      float fleck = pow(grain(floor(uv * 123.0 + u_seed * 17.0)), 44.0);
      vec3 pearl = mix(u_tint * .83 + .1, rainbow * .64 + .34, .73);
      pearl += bands * .19 + secondary * .07 + broad * .13;
      pearl += (dust - .5) * .09 + etched + fleck * (.08 + broad * .24);
      pearl -= (1.0 - broad) * .055;
      gl_FragColor = vec4(clamp(pearl, 0.0, 1.0), .70);
    }
  `;

  let theme = 'flat', runtime = null, readyListener = null;
  let totalFrames = 0, totalDraws = 0;
  const root = document.documentElement;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const hash = value => {
    let result = 2166136261;
    for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return (result >>> 0) / 4294967295 * 19;
  };

  function makeRenderer(onLost) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power',
    });
    if (!gl) return null;
    let disposed = false, program = null, buffer = null;
    const shaders = [];
    const release = () => {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lost);
      try {
        shaders.forEach(shader => gl.deleteShader(shader));
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch { /* A lost driver context already released its resources. */ }
      canvas.width = canvas.height = 1;
    };
    const lost = event => {
      event.preventDefault();
      if (!disposed) onLost();
    };
    canvas.addEventListener('webglcontextlost', lost);
    try {
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('shader-unavailable');
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader-compile');
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      if (!program) throw new Error('program-unavailable');
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('shader-link');
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error('buffer-unavailable');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      const uniforms = Object.fromEntries(['pixels', 'pointer', 'tint', 'time', 'seed'].map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
      return {
        canvas, gl, release,
        size(width, height) {
          if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
          gl.viewport(0, 0, width, height);
        },
        draw(entry, seconds, pointer) {
          gl.uniform2f(uniforms.pixels, entry.canvas.width, entry.canvas.height);
          gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
          gl.uniform3f(uniforms.tint, ...entry.tint);
          gl.uniform1f(uniforms.time, seconds); gl.uniform1f(uniforms.seed, entry.seed);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          // GPU canvas-to-canvas compositing: no readPixels, data URL, or CPU pixel buffer.
          entry.context.globalCompositeOperation = 'copy';
          entry.context.drawImage(canvas, 0, 0, entry.canvas.width, entry.canvas.height);
        },
      };
    } catch {
      release();
      return null;
    }
  }

  function start() {
    if (runtime || theme !== 'holofoil' || !document.body) return;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const state = runtime = {
      entries: new Map(), renderer: null, failed: false, disposed: false,
      raf: 0, queued: false, dirty: true, lastDraw: null, seconds: 0,
      reduced: !!motion?.matches, paused: false, pointer: null,
      mutation: null, resize: null, removers: [], reason: '',
    };
    root.dataset.foilRenderer = 'css';

    const listen = (target, name, callback, options) => {
      target.addEventListener(name, callback, options);
      state.removers.push(() => target.removeEventListener(name, callback, options));
    };
    const stopFrame = () => {
      if (state.raf) window.cancelAnimationFrame(state.raf);
      state.raf = 0; state.lastDraw = null;
    };
    const removeEntry = (tile, entry) => {
      state.resize?.unobserve(tile);
      entry.canvas.remove(); entry.canvas.width = entry.canvas.height = 1;
      tile.removeAttribute('data-foil-ready'); state.entries.delete(tile);
    };
    const fallBack = reason => {
      if (state.disposed) return;
      state.failed = true; state.reason = reason; stopFrame();
      const renderer = state.renderer; state.renderer = null;
      for (const [tile, entry] of state.entries) removeEntry(tile, entry);
      renderer?.release(); root.dataset.foilRenderer = 'css';
    };
    const paused = () => !!document.hidden || !!document.querySelector('dialog[open]');

    function requestFrame() {
      if (state.disposed || state.failed || state.raf || state.paused || !state.renderer || !state.entries.size || state.reduced && !state.dirty) return;
      state.raf = window.requestAnimationFrame(frame);
    }
    function frame(now) {
      state.raf = 0;
      if (state.disposed || state.failed || !state.renderer || !state.entries.size) return;
      state.paused = paused();
      if (state.paused) { state.lastDraw = null; return; }
      if (state.lastDraw !== null && now - state.lastDraw < 1000 / MAX_FPS - .2) { requestFrame(); return; }
      const elapsed = state.lastDraw === null ? 0 : Math.min(100, now - state.lastDraw);
      state.lastDraw = now;
      if (!state.reduced) state.seconds += elapsed / 1000;
      let width = 1, height = 1;
      for (const entry of state.entries.values()) { width = Math.max(width, entry.canvas.width); height = Math.max(height, entry.canvas.height); }
      try {
        state.renderer.size(width, height);
        for (const entry of state.entries.values()) {
          let targetX = .32, targetY = .24;
          if (!state.reduced && state.pointer) {
            targetX = clamp((state.pointer[0] - entry.rect.left) / entry.rect.width, -.5, 1.5);
            targetY = clamp((state.pointer[1] - entry.rect.top) / entry.rect.height, -.5, 1.5);
          }
          if (state.reduced) { entry.focus[0] = .32; entry.focus[1] = .24; }
          else { entry.focus[0] += (targetX - entry.focus[0]) * .24; entry.focus[1] += (targetY - entry.focus[1]) * .24; }
          state.renderer.draw(entry, state.reduced ? 0 : state.seconds, entry.focus);
          if (!entry.ready) { entry.tile.setAttribute('data-foil-ready', ''); entry.ready = true; }
          totalDraws++;
        }
        totalFrames++; state.dirty = false;
      } catch { fallBack('draw-failed'); return; }
      requestFrame();
    }

    function sync() {
      state.queued = false;
      if (state.disposed) return;
      state.paused = paused();
      if (state.paused) stopFrame();
      if (state.failed) return;
      const candidates = [...document.querySelectorAll('.tile:not(.empty):not(.completed)')]
        .filter(tile => tile.clientWidth > 0 && tile.clientHeight > 0 && tile.getClientRects().length);
      const keep = new Set(candidates);
      for (const [tile, entry] of state.entries) {
        if (!keep.has(tile) || entry.canvas.parentNode !== tile) removeEntry(tile, entry);
      }
      // The title screen is entirely CSS; allocate a WebGL context only when cards exist.
      if (candidates.length && !state.renderer) {
        try { state.renderer = makeRenderer(() => fallBack('context-lost')); } catch { state.renderer = null; }
        if (!state.renderer) { fallBack('webgl-unavailable'); return; }
        root.dataset.foilRenderer = 'webgl';
      }
      const ratio = Math.min(DPR_LIMIT, Math.max(.75, window.devicePixelRatio || 1));
      for (const tile of candidates) {
        let entry = state.entries.get(tile);
        if (!entry) {
          const canvas = document.createElement('canvas');
          canvas.className = 'lr-foil-canvas'; canvas.setAttribute('aria-hidden', 'true');
          const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
          if (!context) { fallBack('canvas-unavailable'); return; }
          entry = { tile, canvas, context, rect: null, tint: tintByCategory.blue, seed: 0, focus: [.32, .24] };
          tile.prepend(canvas); state.entries.set(tile, entry); state.resize?.observe(tile);
        }
        const width = Math.min(PIXEL_LIMIT, Math.max(1, Math.ceil(tile.clientWidth * ratio)));
        const height = Math.min(PIXEL_LIMIT, Math.max(1, Math.ceil(tile.clientHeight * ratio)));
        if (entry.canvas.width !== width || entry.canvas.height !== height) { entry.canvas.width = width; entry.canvas.height = height; }
        entry.rect = tile.getBoundingClientRect();
        const category = Object.keys(tintByCategory).find(color => tile.classList.contains(color));
        entry.tint = tintByCategory[category] || tintByCategory.blue;
        entry.seed = hash(tile.dataset.tileId || tile.dataset.game || tile.dataset.view || candidates.indexOf(tile));
      }
      state.dirty = true;
      if (!state.entries.size) stopFrame();
      else requestFrame();
    }
    const requestSync = () => {
      if (state.disposed || state.queued) return;
      state.queued = true; Promise.resolve().then(sync);
    };
    if (window.ResizeObserver) state.resize = new ResizeObserver(requestSync);
    if (window.MutationObserver) {
      state.mutation = new MutationObserver(records => {
        const relevant = records.some(record => {
          const target = record.target;
          if (record.type === 'attributes') return target.matches?.('.tile, dialog, #play-screen') || target === document.body;
          if (!target.matches?.('.tile, #game-board')) return false;
          return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && !node.classList.contains('lr-foil-canvas'));
        });
        if (relevant) requestSync();
      });
      state.mutation.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'data-game', 'data-tile-id'] });
    }
    listen(document, 'visibilitychange', requestSync);
    listen(window, 'resize', requestSync, { passive: true });
    listen(window, 'scroll', requestSync, { passive: true, capture: true });
    listen(document, 'animationend', event => { if (event.target.matches?.('.tile')) requestSync(); });
    listen(document, 'pointermove', event => {
      if (state.reduced) return;
      state.pointer = [event.clientX, event.clientY];
      if (!state.paused) requestFrame();
    }, { passive: true });
    listen(document, 'pointerleave', () => { state.pointer = null; });
    const motionChanged = event => {
      state.reduced = !!event.matches; state.dirty = true; state.lastDraw = null;
      stopFrame(); requestSync();
    };
    if (motion?.addEventListener) { motion.addEventListener('change', motionChanged); state.removers.push(() => motion.removeEventListener('change', motionChanged)); }
    else if (motion?.addListener) { motion.addListener(motionChanged); state.removers.push(() => motion.removeListener(motionChanged)); }
    state.dispose = () => {
      if (state.disposed) return;
      state.disposed = true; stopFrame(); state.mutation?.disconnect(); state.resize?.disconnect();
      state.removers.forEach(remove => remove());
      for (const [tile, entry] of state.entries) removeEntry(tile, entry);
      state.renderer?.release(); state.renderer = null;
    };
    state.refresh = requestSync;
    sync();
  }

  function setTheme(name) {
    const next = name === 'holofoil' ? 'holofoil' : 'flat';
    if (next === theme && (next === 'flat' || runtime)) { runtime?.refresh(); return theme; }
    theme = next; root.dataset.theme = theme;
    if (readyListener) { document.removeEventListener('DOMContentLoaded', readyListener); readyListener = null; }
    if (theme === 'flat') {
      runtime?.dispose(); runtime = null; delete root.dataset.foilRenderer;
    } else if (document.body) start();
    else {
      readyListener = () => { readyListener = null; start(); };
      document.addEventListener('DOMContentLoaded', readyListener, { once: true });
    }
    return theme;
  }

  window.LittleRushTheme = {
    setTheme,
    getTheme: () => theme,
    refresh: () => runtime?.refresh(),
    destroy: () => setTheme('flat'),
    getDiagnostics: () => ({
      theme, renderer: runtime?.failed ? 'css-fallback' : runtime?.renderer ? 'webgl' : theme === 'holofoil' ? 'idle' : 'off',
      contexts: runtime?.renderer ? 1 : 0, canvasCount: runtime?.entries.size || 0,
      rafPending: !!runtime?.raf, paused: !!runtime?.paused, reducedMotion: !!runtime?.reduced,
      frames: totalFrames, draws: totalDraws, maxFps: MAX_FPS, dprCap: DPR_LIMIT, pixelLimit: PIXEL_LIMIT,
      reason: runtime?.reason || '',
    }),
  };
  root.dataset.theme = 'flat';
})();
