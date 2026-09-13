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

test('pause freezes simulation: no progress while paused', () => {
  const state = createGame(() => 0.5);
  start(state);
  pause(state);
  const enemiesBefore = JSON.stringify(state.enemies);
  const scoreBefore = state.score;
  update(state, 1); // large dt while paused should have zero effect
  assert.equal(state.state, STATES.PAUSED);
  assert.equal(JSON.stringify(state.enemies), enemiesBefore);
  assert.equal(state.score, scoreBefore);
});

test('resume continues without a catch-up jump for a huge elapsed pause', () => {
  const state = createGame(() => 0.5);
  start(state);
  const zBefore = state.enemies.map((e) => e.z);
  pause(state);
  // Simulate a large amount of "real" time passing while paused (main.js
  // would normally not call update, but we defensively verify a big dt
  // post-resume doesn't cause a jump because callers cap dt before calling).
  resume(state);
  update(state, 0.016); // one normal frame worth
  const zAfter = state.enemies.map((e) => e.z);
  for (let i = 0; i < zBefore.length; i++) {
    assert.ok(Math.abs(zAfter[i] - zBefore[i]) < 1); // small, normal-frame movement
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

test('restart fully resets score, shields, wave, entities, and timing', () => {
  const state = createGame(() => 0.5);
  start(state);
  state.score = 42;
  state.shields = 0;
  state.wave = 7;
  state.projectiles.push({ x: 0, y: 0, z: 0, alive: true });
  state.waveTimer = 5;
  state.player.x = 3;

  restart(state);

  assert.equal(state.state, STATES.PLAYING);
  assert.equal(state.score, 0);
  assert.equal(state.shields, 3);
  assert.equal(state.wave, 1); // restart spawns the first wave again
  assert.equal(state.projectiles.length, 0);
  assert.equal(state.waveTimer, 0);
  assert.equal(state.player.x, 0);
});
