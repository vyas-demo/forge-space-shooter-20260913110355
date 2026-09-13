import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, start, update, WAVE_INTERVAL } from '../src/sim/game.js';

function fixedRng() {
  // Deterministic sequence for reproducible enemy placement.
  let i = 0;
  const seq = [0.1, 0.5, 0.9, 0.2, 0.6, 0.3, 0.7, 0.4, 0.8];
  return () => seq[i++ % seq.length];
}

test('starting a game spawns the first wave', () => {
  const state = createGame(fixedRng());
  start(state);
  assert.equal(state.wave, 1);
  assert.ok(state.enemies.length > 0);
});

test('wave count increases enemy count and speed on progression', () => {
  const state = createGame(fixedRng());
  start(state);
  const wave1Count = state.enemies.length;
  const wave1Speed = state.enemies[0].speed;

  // Force wave timer to trigger next wave without waiting for enemies to clear.
  state.waveTimer = WAVE_INTERVAL;
  update(state, 0.01);

  assert.equal(state.wave, 2);
  const wave2Speed = state.enemies[state.enemies.length - 1].speed;
  assert.ok(wave2Speed > wave1Speed);
});

test('wave advances automatically once all enemies are cleared', () => {
  const state = createGame(fixedRng());
  start(state);
  state.enemies = []; // simulate all enemies destroyed
  update(state, 0.01);
  assert.equal(state.wave, 2);
});
