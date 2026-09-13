import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlayer,
  tryFire,
  updateCooldown,
  updateProjectiles,
  SHOT_COOLDOWN,
  PROJECTILE_MAX_Z,
} from '../src/sim/entities.js';

test('tryFire produces a projectile and sets cooldown', () => {
  const player = createPlayer();
  const proj = tryFire(player);
  assert.ok(proj);
  assert.equal(player.cooldown, SHOT_COOLDOWN);
});

test('tryFire returns null while cooldown is active', () => {
  const player = createPlayer();
  const first = tryFire(player);
  assert.ok(first);
  const second = tryFire(player);
  assert.equal(second, null);
});

test('cooldown decreases over time and allows firing again after elapsing', () => {
  const player = createPlayer();
  tryFire(player);
  updateCooldown(player, SHOT_COOLDOWN); // exactly enough time
  const again = tryFire(player);
  assert.ok(again);
});

test('cooldown does not go negative', () => {
  const player = createPlayer();
  tryFire(player);
  updateCooldown(player, 1000);
  assert.equal(player.cooldown, 0);
});

test('projectiles travel toward -z each update', () => {
  const proj = { x: 0, y: 0, z: 0, alive: true };
  const remaining = updateProjectiles([proj], 0.5);
  assert.equal(remaining.length, 1);
  assert.ok(remaining[0].z < 0);
});

test('projectiles past PROJECTILE_MAX_Z are marked despawned for cleanup after collision checks', () => {
  // updateProjectiles no longer removes despawned projectiles immediately:
  // it marks them so that game.update can run collision detection over the
  // full pre-despawn motion segment before filtering them out. This avoids
  // dropping a projectile that both crosses the despawn depth and passes
  // through an enemy within the same simulation step.
  const proj = { x: 0, y: 0, z: PROJECTILE_MAX_Z + 1, alive: true };
  const remaining = updateProjectiles([proj], 10);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].despawned, true);
});
