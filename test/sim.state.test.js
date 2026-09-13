import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  start,
  pause,
  resume,
  restart,
  update,
  STATES,
} from '../src/sim/game.js';

test('game begins in READY state and update is a no-op', () => {
  const state = createGame();
  const before = JSON.stringify(state.player);
  update(state, 0.5);
  assert.equal(state.state, STATES.READY);
  assert.equal(JSON.stringify(state.player), before);
});

test('start transitions to PLAYING and spawns a wave', () => {
  const state = createGame(() => 0.5);
  start(state);
  assert.equal(state.state, STATES.PLAYING);
  assert.ok(state.enemies.length > 0);
});

// Serializes every simulation field relevant to timing/progress, excluding
// the injected rng function (which is not JSON-serializable and never
// changes identity anyway), so a regression in any one of cooldown,
// invulnerability, projectiles, input, or waveTimer handling during pause
// is caught, not just enemies/score.
function snapshot(state) {
  const { rng, ...rest } = state;
  return JSON.stringify(rest);
}

test('pause freezes simulation: no progress on any field while paused', () => {
  const state = createGame(() => 0.5);
  start(state);
  // Seed every piece of timing/progress state so a regression in any one
  // of them (not just enemies/score) is caught by the frozen-snapshot
  // comparison below.
  state.projectiles.push({ x: 1, y: 2, z: -3, alive: true });
  state.player.cooldown = 0.1;
  state.player.invulnerable = 0.5;
  state.input.dx = 1;
  state.input.dy = -1;
  state.input.fire = true;
  state.waveTimer = 3;

  pause(state);
  const before = snapshot(state);
  update(state, 1); // large dt while paused should have zero effect
  assert.equal(state.state, STATES.PAUSED);
  assert.equal(snapshot(state), before);
});

test('resume continues without a catch-up jump for a huge elapsed pause', () => {
  const state = createGame(() => 0.5);
  start(state);
  const zBefore = state.enemies.map((e) => e.z);
  pause(state);
  // Simulate a large amount of "real" time passing while paused. main.js
  // would normally not call update while paused, but if a caller ever did
  // pass a huge elapsed dt right after resume (e.g. a stale timestamp),
  // update() must defensively cap it at MAX_DELTA rather than letting the
  // simulation jump forward by the full elapsed time.
  resume(state);
  update(state, 10); // huge dt: would blow enemies far past the player if uncapped
  const zAfter = state.enemies.map((e) => e.z);
  for (let i = 0; i < zBefore.length; i++) {
    const delta = Math.abs(zAfter[i] - zBefore[i]);
    // A single capped step (MAX_DELTA seconds) at wave-1 enemy speed moves
    // the enemy by at most speed * MAX_DELTA. An uncapped 10s step would
    // move it by speed * 10, which is far larger; assert we stayed small.
    assert.ok(delta < 1, `expected capped movement, got delta=${delta}`);
  }
});

test('shield exhaustion transitions to GAME_OVER', () => {
  const state = createGame(() => 0.5);
  start(state);
  state.shields = 1;
  // Place an enemy directly on the player to guarantee a hit this frame.
  state.enemies = [{ x: state.player.x, y: state.player.y, z: state.player.z, speed: 0, alive: true }];
  update(state, 0.016);
  assert.equal(state.state, STATES.GAME_OVER);
  assert.equal(state.shields, 0);
});

test('update is a no-op once GAME_OVER', () => {
  const state = createGame(() => 0.5);
  start(state);
  state.shields = 1;
  state.enemies = [{ x: state.player.x, y: state.player.y, z: state.player.z, speed: 0, alive: true }];
  update(state, 0.016);
  assert.equal(state.state, STATES.GAME_OVER);
  const scoreBefore = state.score;
  update(state, 1);
  assert.equal(state.score, scoreBefore);
});

test('restart returns to READY with a full reset (score, shields, wave, entities, timing)', () => {
  const state = createGame(() => 0.5);
  start(state);
  state.score = 42;
  state.shields = 0;
  state.wave = 7;
  state.projectiles.push({ x: 0, y: 0, z: 0, alive: true });
  state.waveTimer = 5;
  state.player.x = 3;
  state.player.cooldown = 0.2;
  state.player.invulnerable = 0.8;
  state.input.dx = 1;
  state.input.fire = true;

  restart(state);

  assert.equal(state.state, STATES.READY);
  assert.equal(state.score, 0);
  assert.equal(state.shields, 3);
  assert.equal(state.wave, 0);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.projectiles.length, 0);
  assert.equal(state.waveTimer, 0);
  assert.equal(state.player.x, 0);
  assert.equal(state.player.cooldown, 0);
  assert.equal(state.player.invulnerable, 0);
  assert.equal(state.input.dx, 0);
  assert.equal(state.input.fire, false);

  // update() is a no-op in READY; start() begins wave 1.
  update(state, 1);
  assert.equal(state.state, STATES.READY);
  start(state);
  assert.equal(state.state, STATES.PLAYING);
  assert.equal(state.wave, 1);
  assert.ok(state.enemies.length > 0);
});
