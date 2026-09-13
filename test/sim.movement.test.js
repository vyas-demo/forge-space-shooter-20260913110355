import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, movePlayer, PLAYFIELD } from '../src/sim/entities.js';

test('player moves within bounds according to input and speed', () => {
  const player = createPlayer();
  movePlayer(player, 1, 0, 0.1);
  assert.ok(player.x > 0);
  assert.equal(player.y, 0);
});

test('player movement clamps at the right/top bound', () => {
  const player = createPlayer();
  movePlayer(player, 1, 1, 100); // huge dt to blow past bounds
  assert.equal(player.x, PLAYFIELD.maxX);
  assert.equal(player.y, PLAYFIELD.maxY);
});

test('player movement clamps at the left/bottom bound', () => {
  const player = createPlayer();
  movePlayer(player, -1, -1, 100);
  assert.equal(player.x, PLAYFIELD.minX);
  assert.equal(player.y, PLAYFIELD.minY);
});

test('zero input keeps player stationary', () => {
  const player = createPlayer();
  player.x = 2;
  player.y = -1;
  movePlayer(player, 0, 0, 1);
  assert.equal(player.x, 2);
  assert.equal(player.y, -1);
});
