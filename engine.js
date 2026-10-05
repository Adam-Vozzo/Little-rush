(function (root, factory) {
  const Engine = factory();
  if (typeof module === "object" && module.exports) module.exports = Engine;
  if (root) root.LittleRushEngine = Engine;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SLOT_COUNT = 8;
  const SPAWN_INTERVAL_MS = 2500;
  const TILE_LIFETIME_MS = 25000;
  const clock = () => typeof performance !== "undefined" ? performance.now() : Date.now();

  /**
   * Timer-free run state. Use the same monotonic clock for every method.
   * onChange(snapshot), onSpawn(tile, snapshot), onComplete(tile, snapshot),
   * and onEnd(expiredTile, snapshot) are optional callbacks.
   * Snapshots and callback tiles are copies; snapshot() never advances play.
   * initialType requests the first game of each run, subject to availability.
   * isTypeAvailable(type, snapshot) can dynamically lock a game or prevent
   * duplicates. A spawn is skipped when no catalog type is currently available.
   * enqueueType(type) prefers a known type at a future regular spawn. Unavailable
   * or consecutive-repeat preferences remain queued while other eligible types
   * spawn; the first eligible preference is consumed. start() clears the queue.
   * Full boards skip that spawn without overwriting tiles or consuming queued
   * preferences. Clearing a slot makes room at the next regular spawn time.
   */
  class LittleRushEngine {
    constructor({ types = [], random = Math.random, initialType = null,
      spawnIntervalMs = SPAWN_INTERVAL_MS, tileLifetimeMs = TILE_LIFETIME_MS, firstSpawnDelayMs = 0, scoringMode = 'off',
      isTypeAvailable = () => true, onChange, onSpawn, onComplete, onEnd } = {}) {
      this.types = [...new Set(types.filter(type => typeof type === "string" && type.length))];
      if (!this.types.length) throw new TypeError("At least one micro-game type is required.");
      if (typeof random !== "function") throw new TypeError("random must be a function.");
      if (typeof isTypeAvailable !== "function") throw new TypeError("isTypeAvailable must be a function.");
      this.random = random;
      this.initialType = initialType;
      this.spawnIntervalMs = spawnIntervalMs;
      this.tileLifetimeMs = tileLifetimeMs;
      this.firstSpawnDelayMs = firstSpawnDelayMs;
      this.scoringMode = scoringMode;
      this.points = 0;
      this.isTypeAvailable = isTypeAvailable;
      this.onChange = onChange;
      this.onSpawn = onSpawn;
      this.onComplete = onComplete;
      this.onEnd = onEnd;
      this.status = "idle";
      this.score = 0;
      this.tiles = Array(SLOT_COUNT).fill(null);
      this.expiredTileId = null;
      this._serial = 0;
      this._startedAt = 0;
      this._lastNow = 0;
      this._nextSpawnAt = 0;
      this._pausedAt = null;
      this._endedAt = null;
      this._previousType = null;
      this._queuedTypes = [];
    }

    start(now = clock()) {
      now = this._time(now);
      if (![this.spawnIntervalMs, this.tileLifetimeMs].every(value => Number.isFinite(value) && value > 0)
        || !Number.isFinite(this.firstSpawnDelayMs) || this.firstSpawnDelayMs < 0) throw new TypeError('Invalid game timing.');
      this.status = "running";
      this.score = 0;
      this.points = 0;
      this.tiles = Array(SLOT_COUNT).fill(null);
      this.expiredTileId = null;
      this._startedAt = this._lastNow = now;
      this._nextSpawnAt = now + (this.firstSpawnDelayMs || this.spawnIntervalMs);
      this._pausedAt = this._endedAt = null;
      this._previousType = null;
      this._queuedTypes = [];
      if (!this.firstSpawnDelayMs) this._spawn(now, now, this.initialType);
      this._changed(now);
      return this.snapshot(now);
    }

    enqueueType(type) {
      if (!this.types.includes(type)) return false;
      this._queuedTypes.push(type);
      return true;
    }

    tick(now = clock()) {
      if (this.status !== "running") return this.snapshot(now);
      now = this._advanceTime(now);
      // An already-missed deadline always wins over a delayed animation frame.
      const overdue = this._earliestTile();
      if (overdue && overdue.deadline <= now) {
        this._end(overdue);
        return this.snapshot(now);
      }

      let changed = false;
      while (this._nextSpawnAt <= now) {
        const earliest = this._earliestTile();
        // Also enforce deadlines for tiles created during a long catch-up.
        if (earliest && earliest.deadline <= this._nextSpawnAt) {
          this._end(earliest);
          return this.snapshot(now);
        }
        const spawnAt = this._nextSpawnAt;
        this._nextSpawnAt += this.spawnIntervalMs;
        this._releaseCompleted(spawnAt);
        changed = this._spawn(spawnAt, now) || changed;
      }

      changed = this._releaseCompleted(now) || changed;

      const expired = this._earliestTile();
      if (expired && expired.deadline <= now) {
        this._end(expired);
      } else if (changed) {
        this._changed(now);
      }
      return this.snapshot(now);
    }

    complete(id, now = clock(), settleMs = 0) {
      if (this.status !== "running") return false;
      now = this._advanceTime(now);
      this.tick(now);
      if (this.status !== "running") return false;
      const slot = this.tiles.findIndex(tile => tile && tile.id === id);
      if (slot < 0) return false;
      const tile = this.tiles[slot];
      if (tile.completedAt !== undefined) return false;
      const remaining = Math.max(0, Math.min(1, (tile.deadline - now) / (tile.deadline - tile.startedAt)));
      tile.points = this.scoringMode === 'off' ? 0 : Math.max(1, Math.round(100 * (this.scoringMode === 'late' ? 1 - remaining : remaining)));
      this.points += tile.points;
      if (settleMs > 0 && Number.isFinite(settleMs)) {
        tile.completedAt = now;
        tile.releaseAt = now + settleMs;
      } else this.tiles[slot] = null;
      this.score += 1;
      this._emit("onComplete", { ...tile }, this.snapshot(now));
      this._changed(now);
      return true;
    }

    pause(now = clock()) {
      if (this.status !== "running") return false;
      now = this._advanceTime(now);
      this.tick(now);
      if (this.status !== "running") return false;
      this.status = "paused";
      this._pausedAt = now;
      this._changed(now);
      return true;
    }

    resume(now = clock()) {
      if (this.status !== "paused") return false;
      now = this._advanceTime(now);
      const pauseDuration = now - this._pausedAt;
      this._startedAt += pauseDuration;
      this._nextSpawnAt += pauseDuration;
      for (const tile of this.tiles) {
        if (!tile) continue;
        tile.startedAt += pauseDuration;
        tile.deadline += pauseDuration;
        if (tile.completedAt !== undefined) { tile.completedAt += pauseDuration; tile.releaseAt += pauseDuration; }
      }
      this._pausedAt = null;
      this.status = "running";
      this._changed(now);
      return true;
    }

    snapshot(now = clock()) {
      now = this._time(now);
      const effectiveNow = this.status === "paused" ? this._pausedAt
        : this.status === "ended" ? this._endedAt
        : Math.max(now, this._lastNow);
      return {
        status: this.status,
        score: this.score,
        points: this.points,
        elapsedMs: this.status === "idle" ? 0 : Math.max(0, effectiveNow - this._startedAt),
        nextSpawnInMs: this.status === "idle" || this.status === "ended" ? 0
          : Math.max(0, this._nextSpawnAt - effectiveNow),
        tiles: this.tiles.map(tile => tile ? {
          ...tile,
          releaseInMs: tile.releaseAt === undefined ? null : Math.max(0, tile.releaseAt - effectiveNow),
          remainingMs: Math.max(0, tile.deadline - effectiveNow)
        } : null),
        expiredTileId: this.expiredTileId
      };
    }

    _time(value) {
      if (!Number.isFinite(value)) throw new TypeError("Time must be a finite number.");
      return value;
    }

    _advanceTime(now) {
      this._lastNow = Math.max(this._time(now), this._lastNow);
      return this._lastNow;
    }

    _pick(items) {
      const value = this.random();
      const safe = Number.isFinite(value) ? Math.max(0, Math.min(value, 1 - Number.EPSILON)) : 0;
      return items[Math.floor(safe * items.length)];
    }

    _spawn(at, now, preferredType = null) {
      const emptySlots = this.tiles.flatMap((tile, slot) => tile ? [] : [slot]);
      if (!emptySlots.length) return false;
      const snapshot = this.snapshot(now);
      const available = this.types.filter(type => this.isTypeAvailable(type, snapshot));
      if (!available.length) return false;
      const alternatives = available.filter(type => type !== this._previousType);
      const choices = alternatives.length ? alternatives : available;
      const slot = this._pick(emptySlots);
      const queuedIndex = this._queuedTypes.findIndex(type => choices.includes(type));
      const type = choices.includes(preferredType) ? preferredType
        : queuedIndex >= 0 ? this._queuedTypes.splice(queuedIndex, 1)[0]
        : this._pick(choices);
      const tile = { id: `tile-${++this._serial}`, type, slot, startedAt: at, deadline: at + this.tileLifetimeMs };
      this.tiles[slot] = tile;
      this._previousType = type;
      this._emit("onSpawn", { ...tile }, this.snapshot(now));
      return true;
    }

    _earliestTile() {
      let earliest = null;
      for (const tile of this.tiles) {
        if (tile && tile.completedAt === undefined && (!earliest || tile.deadline < earliest.deadline)) earliest = tile;
      }
      return earliest;
    }

    _releaseCompleted(now) {
      let changed = false;
      this.tiles.forEach((tile, slot) => {
        if (tile?.releaseAt <= now) { this.tiles[slot] = null; changed = true; }
      });
      return changed;
    }

    _end(tile) {
      this.status = "ended";
      this.expiredTileId = tile.id;
      this._endedAt = tile.deadline;
      this._emit("onEnd", { ...tile }, this.snapshot(tile.deadline));
      this._changed(tile.deadline);
    }

    _changed(now) {
      this._emit("onChange", this.snapshot(now));
    }

    _emit(name, ...args) {
      if (typeof this[name] === "function") this[name](...args);
    }
  }

  LittleRushEngine.SLOT_COUNT = SLOT_COUNT;
  LittleRushEngine.SPAWN_INTERVAL_MS = SPAWN_INTERVAL_MS;
  LittleRushEngine.TILE_LIFETIME_MS = TILE_LIFETIME_MS;
  return LittleRushEngine;
});
