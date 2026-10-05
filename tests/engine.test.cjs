const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../engine.js');

const make = options => new Engine({ types: ['press', 'switch', 'sequence'], random: () => 0, ...options });
const populated = snapshot => snapshot.tiles.filter(Boolean);

test('Zen starts full, never expires, and counts completions without points', () => {
  const e = make({zen: true, firstSpawnDelayMs: 650, scoringMode: 'fast'});
  const initial = e.start(0);
  assert.equal(populated(initial).length, 8); assert.equal(initial.nextSpawnInMs, null);
  assert.ok(initial.tiles.every(tile => tile.deadline === null && tile.remainingMs === null));
  const later = e.tick(86400000);
  assert.equal(later.status, 'running'); assert.equal(later.expiredTileId, null);
  assert.equal(later.tiles[0].ageMs, 86400000);
  for (let i = 0; i < 20; i++) {
    const tile = e.tiles[i % 8];
    assert.equal(e.complete(tile.id, 86400000 + i), true);
    assert.equal(populated(e.snapshot()).length, 8);
    assert.notEqual(e.tiles[i % 8].id, tile.id);
    assert.equal(e.complete(tile.id, 86400000 + i), false);
  }
  assert.equal(e.score, 20); assert.equal(e.points, 0);
});

test('Zen retains completed poses then replaces them without an empty slot, even across pause', () => {
  const e = make({zen: true}); const tile = e.start(0).tiles[0];
  e.complete(tile.id, 500, 720);
  assert.equal(e.tick(1000).tiles[0].id, tile.id);
  e.pause(1000); e.resume(9000);
  const before = e.tick(9219); assert.equal(before.tiles[0].id, tile.id);
  assert.equal(before.tiles[0].releaseInMs, 1); assert.equal(before.tiles[0].deadline, null);
  const after = e.tick(9220); assert.notEqual(after.tiles[0].id, tile.id);
  assert.equal(after.tiles[0].ageMs, 0); assert.equal(populated(after).length, 8);
  assert.equal(after.score, 1);
  e.zen = false; const normal = e.start(10000);
  assert.equal(populated(normal).length, 1); assert.equal(normal.score, 0);
  assert.equal(normal.tiles.find(Boolean).remainingMs, 25000);
});

test('Zen respects availability and can refill when a type unlocks', () => {
  let unlocked = false;
  const e = make({zen: true, types: ['one'], isTypeAvailable: () => unlocked});
  assert.equal(populated(e.start(0)).length, 0);
  unlocked = true; assert.equal(populated(e.tick(100)).length, 8);
  e.enqueueType('one'); const tile = e.tiles[0]; e.complete(tile.id, 200);
  assert.equal(e.tiles[0].type, 'one'); assert.equal(populated(e.snapshot(200)).length, 8);
});

test('scoring rewards the selected timing, uses actual expiry, and never pays twice', () => {
  for (const lifetime of [15000,25000,30000]) for (const mode of ['fast','late']) {
    const e = make({types:['one'], tileLifetimeMs:lifetime, spawnIntervalMs:lifetime*2, scoringMode:mode});
    const tile=populated(e.start(0))[0];
    assert.equal(e.complete(tile.id,lifetime*.2,720),true);
    assert.equal(e.snapshot(lifetime*.2).points,mode==='fast'?80:20);
    assert.equal(e.complete(tile.id,lifetime*.2+1,720),false);
    assert.equal(e.score,1);
    assert.equal(e.snapshot(lifetime*.2+1).points,mode==='fast'?80:20);
    e.start(lifetime*3);assert.equal(e.points,0);
  }
});

test('a last-moment clear keeps its settled state beyond its original deadline', () => {
  const e=make({types:['one'],spawnIntervalMs:30000,scoringMode:'late'});
  const tile=populated(e.start(0))[0];
  assert.equal(e.complete(tile.id,24999,720),true);
  assert.equal(e.points,100);
  assert.equal(e.tick(25001).status,'running');
  assert.equal(populated(e.snapshot(25001))[0].releaseInMs,718);
  assert.equal(populated(e.tick(25718)).length,1);
  assert.equal(populated(e.tick(25719)).length,0);
  e.start(30000);assert.equal(e.complete(populated(e.snapshot(30000))[0].id,55000,720),false);assert.equal(e.points,0);
});

test('paused time changes neither awarded points nor the completion beat', () => {
  const e=make({types:['one'],spawnIntervalMs:50000,scoringMode:'fast'});
  const tile=populated(e.start(0))[0];e.pause(5000);e.resume(25000);
  e.complete(tile.id,25000,720);assert.equal(e.points,80);
  e.pause(25100);assert.equal(populated(e.snapshot(90000))[0].releaseInMs,620);
  e.resume(90000);assert.equal(populated(e.tick(90619)).length,1);assert.equal(populated(e.tick(90620)).length,0);
});

test('starts with one tile; adds a tile every 2.5 seconds into an empty slot', () => {
  const engine = make();
  assert.equal(engine.snapshot(0).status, 'idle');
  const first = engine.start(1000);
  assert.equal(first.tiles.length, 8);
  assert.equal(populated(first).length, 1);
  assert.equal(Engine.SPAWN_INTERVAL_MS, 2500);
  assert.equal(Engine.TILE_LIFETIME_MS, 25000);
  assert.equal(first.nextSpawnInMs, 2500);
  assert.equal(populated(first)[0].remainingMs, 25000);
  assert.equal(populated(engine.tick(3499)).length, 1);
  const next = engine.tick(3500);
  assert.equal(populated(next).length, 2);
  assert.equal(new Set(populated(next).map(tile => tile.slot)).size, 2);
  assert.notEqual(populated(next)[0].type, populated(next)[1].type);
  const catchup = engine.tick(16000);
  assert.equal(populated(catchup).length, 7);
  assert.deepEqual(populated(catchup).map(tile => tile.startedAt), [1000, 3500, 6000, 8500, 11000, 13500, 16000]);
});

test('random slot choice spans the board and never overwrites an occupied tile', () => {
  const engine = make({ random: () => 0.99999 });
  engine.start(0);
  engine.tick(2500);
  assert.equal(engine.tiles[7].startedAt, 0);
  assert.equal(engine.tiles[6].startedAt, 2500);
});

test('completing a tile frees it once and preserves the 2.5-second spawn rhythm', () => {
  const engine = make();
  const id = populated(engine.start(0))[0].id;
  assert.equal(engine.complete(id, 1400), true);
  assert.equal(engine.complete(id, 1500), false);
  assert.equal(engine.complete('unknown', 1500), false);
  assert.equal(engine.score, 1);
  assert.equal(populated(engine.snapshot(2499)).length, 0);
  assert.equal(populated(engine.tick(2500)).length, 1);
});

test('expiry ends the whole run at exactly twenty-five seconds, before catch-up spawning', () => {
  let endings = 0;
  let spawns = 0;
  const engine = make({ onEnd: () => endings++, onSpawn: () => spawns++ });
  const id = populated(engine.start(0))[0].id;
  const ended = engine.tick(99999);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.elapsedMs, 25000);
  assert.equal(ended.expiredTileId, id);
  assert.equal(spawns, 1);
  assert.equal(engine.complete(id, 99999), false);
  engine.tick(100000);
  assert.equal(endings, 1);
});

test('completion strictly before deadline succeeds; at deadline it fails', () => {
  const early = make();
  const earlyId = populated(early.start(0))[0].id;
  assert.equal(early.complete(earlyId, 24999), true);
  assert.equal(early.status, 'running');
  const late = make();
  const lateId = populated(late.start(0))[0].id;
  assert.equal(late.complete(lateId, 25000), false);
  assert.equal(late.status, 'ended');
  assert.equal(late.score, 0);
});

test('pause freezes all clocks and resume preserves remaining lifetime and spawn delay', () => {
  const engine = make();
  const id = populated(engine.start(1000))[0].id;
  assert.equal(engine.pause(2000), true);
  const paused = engine.snapshot(100000);
  assert.equal(paused.elapsedMs, 1000);
  assert.equal(paused.nextSpawnInMs, 1500);
  assert.equal(populated(paused)[0].remainingMs, 24000);
  assert.equal(engine.complete(id, 100000), false);
  assert.equal(engine.pause(100000), false);
  assert.equal(engine.resume(100000), true);
  const resumed = engine.snapshot(100000);
  assert.equal(resumed.elapsedMs, 1000);
  assert.equal(resumed.nextSpawnInMs, 1500);
  assert.equal(populated(resumed)[0].remainingMs, 24000);
  assert.equal(populated(engine.tick(101499)).length, 1);
  assert.equal(populated(engine.tick(101500)).length, 2);
  assert.equal(engine.tick(124000).status, 'ended');
  assert.equal(engine.snapshot(999999).elapsedMs, 25000);
});

test('a late pause cannot rescue an expired run', () => {
  const engine = make();
  engine.start(0);
  assert.equal(engine.pause(25000), false);
  assert.equal(engine.status, 'ended');
  assert.equal(engine.resume(26000), false);
});

test('large jumps after clearing the board still expire catch-up tiles on schedule', () => {
  const engine = make();
  const id = populated(engine.start(0))[0].id;
  engine.complete(id, 100);
  const ended = engine.tick(1000000);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.elapsedMs, 27500);
  assert.equal(populated(ended).length, 8);
  assert.equal(populated(ended).find(tile => tile.id === ended.expiredTileId).startedAt, 2500);
});

test('restart resets the run but old completion IDs cannot complete a fresh tile', () => {
  const engine = make();
  const oldId = populated(engine.start(0))[0].id;
  engine.complete(oldId, 100);
  engine.tick(30000);
  const fresh = engine.start(50000);
  assert.equal(fresh.status, 'running');
  assert.equal(fresh.score, 0);
  assert.equal(fresh.elapsedMs, 0);
  assert.equal(fresh.expiredTileId, null);
  assert.notEqual(populated(fresh)[0].id, oldId);
  assert.equal(engine.complete(oldId, 50001), false);
  assert.equal(populated(engine.snapshot(50001)).length, 1);
});

test('snapshots cannot mutate the live board; out-of-order times never rewind it', () => {
  const engine = make();
  const initial = engine.start(0);
  const originalId = populated(initial)[0].id;
  initial.tiles[0].id = 'altered';
  initial.tiles[1] = { id: 'injected' };
  engine.tick(1000);
  assert.equal(populated(engine.snapshot(0))[0].id, originalId);
  assert.equal(populated(engine.snapshot(0)).length, 1);
  assert.equal(engine.snapshot(0).elapsedMs, 1000);
});

test('single-type games work and malformed empty type catalogs are rejected', () => {
  assert.throws(() => new Engine({ types: [] }), TypeError);
  const engine = make({ types: ['press'] });
  engine.start(0);
  assert.deepEqual(populated(engine.tick(2500)).map(tile => tile.type), ['press', 'press']);
});

test('initialType controls the first spawn of every run and falls back when unknown or locked', () => {
  const forced = make({ initialType: 'sequence' });
  assert.equal(populated(forced.start(0))[0].type, 'sequence');
  assert.equal(populated(forced.start(5000))[0].type, 'sequence');
  const unknown = make({ initialType: 'missing' });
  assert.equal(populated(unknown.start(0))[0].type, 'press');
  const locked = make({ initialType: 'sequence', isTypeAvailable: type => type !== 'sequence' });
  assert.equal(populated(locked.start(0))[0].type, 'press');
});

test('availability gates feed until a butterfly exists and prevents active duplicate feeding games', () => {
  let hasButterfly = false;
  const engine = make({
    types: ['press', 'feed'],
    initialType: 'press',
    isTypeAvailable: (type, snapshot) => type !== 'feed' ||
      (hasButterfly && !snapshot.tiles.some(tile => tile && tile.type === 'feed')),
    onComplete: tile => {
      if (tile.type === 'press') {
        hasButterfly = true;
        engine.enqueueType('feed');
      }
    }
  });
  const first = populated(engine.start(0))[0];
  assert.equal(populated(engine.tick(2500))[1].type, 'press');
  assert.equal(engine.complete(first.id, 3000), true);
  const firstFeed = populated(engine.tick(5000)).find(tile => tile.type === 'feed');
  assert.ok(firstFeed);
  engine.tick(10000);
  assert.equal(populated(engine.snapshot(10000)).filter(tile => tile.type === 'feed').length, 1);
  assert.equal(engine.complete(firstFeed.id, 10100), true);
  assert.equal(populated(engine.tick(12500)).filter(tile => tile.type === 'feed').length, 1);
});

test('queued preferences wait for the regular spawn, reject unknown types, and select the first eligible one', () => {
  let feedAvailable = false;
  const engine = make({
    types: ['press', 'switch', 'sequence', 'feed'],
    isTypeAvailable: type => type !== 'feed' || feedAvailable
  });
  engine.start(0);
  assert.equal(engine.enqueueType('unknown'), false);
  assert.equal(engine.enqueueType('feed'), true);
  assert.equal(engine.enqueueType('sequence'), true);
  assert.equal(engine.enqueueType('switch'), true);
  assert.equal(populated(engine.tick(2499)).length, 1);
  assert.equal(populated(engine.tick(2500)).at(-1).type, 'sequence');
  feedAvailable = true;
  assert.equal(populated(engine.tick(5000)).at(-1).type, 'feed');
  assert.equal(populated(engine.tick(7500)).at(-1).type, 'switch');
});

test('queued consecutive repeats wait when another available game can spawn', () => {
  const engine = make();
  engine.start(0);
  engine.enqueueType('press');
  assert.equal(populated(engine.tick(2500)).at(-1).type, 'switch');
  assert.equal(populated(engine.tick(5000)).at(-1).type, 'press');
});

test('the only available type may repeat and a fully locked catalog skips spawns until unlocked', () => {
  let available = false;
  const engine = make({ isTypeAvailable: type => available && type === 'sequence' });
  assert.equal(populated(engine.start(0)).length, 0);
  engine.enqueueType('sequence');
  assert.equal(populated(engine.tick(2500)).length, 0);
  available = true;
  assert.equal(populated(engine.tick(4999)).length, 0);
  assert.deepEqual(populated(engine.tick(7500)).map(tile => tile.type), ['sequence', 'sequence']);
  assert.deepEqual(populated(engine.snapshot(7500)).map(tile => tile.startedAt), [5000, 7500]);
});

test('restart clears queued preferences while preserving the requested first game', () => {
  const engine = make({ initialType: 'press' });
  engine.enqueueType('sequence');
  engine.start(0);
  assert.equal(populated(engine.tick(2500)).at(-1).type, 'switch');
  engine.enqueueType('sequence');
  const restarted = engine.start(10000);
  assert.equal(populated(restarted)[0].type, 'press');
  assert.equal(populated(engine.tick(12500)).at(-1).type, 'switch');
});

test('availability callbacks receive detached snapshots and invalid callbacks are rejected', () => {
  assert.throws(() => make({ isTypeAvailable: true }), TypeError);
  let calls = 0;
  const engine = make({ isTypeAvailable: (type, snapshot) => {
    calls++;
    if (snapshot.tiles[0]) snapshot.tiles[0].id = 'tampered';
    return true;
  } });
  const first = populated(engine.start(0))[0];
  engine.tick(2500);
  assert.equal(engine.tiles[0].id, first.id);
  assert.equal(calls, 6);
});

test('a full board skips scheduled spawns without overwrites or failure until the first 25-second deadline', () => {
  let spawns = 0;
  const engine = make({ onSpawn: () => spawns++ });
  engine.start(0);
  const full = engine.tick(17500);
  const originalTiles = engine.tiles.map(tile => ({ ...tile }));
  assert.equal(populated(full).length, 8);
  assert.equal(full.status, 'running');
  assert.equal(originalTiles[0].deadline, 25000);
  assert.equal(spawns, 8);
  for (const time of [20000, 22500, 24999]) {
    const skipped = engine.tick(time);
    assert.equal(skipped.status, 'running');
    assert.deepEqual(engine.tiles, originalTiles);
    assert.equal(spawns, 8);
  }
  const ended = engine.tick(25000);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.elapsedMs, 25000);
  assert.equal(ended.expiredTileId, originalTiles[0].id);
  assert.equal(spawns, 8);
});

test('clearing a full-board slot waits for the next 2.5-second opportunity and retains queued preferences', () => {
  let spawns = 0;
  const engine = make({ onSpawn: () => spawns++ });
  engine.start(0);
  engine.tick(17500);
  const originalTiles = engine.tiles.map(tile => ({ ...tile }));
  assert.equal(engine.enqueueType('sequence'), true);
  engine.tick(20000);
  const clearedSlot = 2;
  assert.equal(engine.complete(originalTiles[clearedSlot].id, 20100), true);
  assert.equal(populated(engine.snapshot(20100)).length, 7);
  assert.equal(populated(engine.tick(22499)).length, 7);
  assert.equal(spawns, 8);
  const replenished = engine.tick(22500);
  assert.equal(populated(replenished).length, 8);
  assert.equal(spawns, 9);
  const replacement = engine.tiles[clearedSlot];
  assert.equal(replacement.type, 'sequence');
  assert.equal(replacement.startedAt, 22500);
  assert.equal(replacement.deadline, 47500);
  assert.notEqual(replacement.id, originalTiles[clearedSlot].id);
  originalTiles.forEach((tile, slot) => {
    if (slot !== clearedSlot) assert.deepEqual(engine.tiles[slot], tile);
  });
  assert.equal(engine.tick(25000).expiredTileId, originalTiles[0].id);
});
