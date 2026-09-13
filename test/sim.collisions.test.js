import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlayer,
  createEnemy,
  createProjectile,
  detectProjectileHits,
  detectPlayerHits,
} from '../src/sim/entities.js';

test('projectile hitting enemy destroys it and increments destroyedCount once', () => {
  const enemy = createEnemy(0, 0, 5);
  enemy.z = 0;
  const proj = createProjectile(0, 0, 0);
  const { destroyedCount } = detectProjectileHits([proj], [enemy]);
  assert.equal(destroyedCount, 1);
  assert.equal(enemy.alive, false);
  assert.equal(proj.alive, false);
});

test('a single enemy can only be destroyed once even with multiple overlapping projectiles', () => {
  const enemy = createEnemy(0, 0, 5);
  enemy.z = 0;
  const proj1 = createProjectile(0, 0, 0);
  const proj2 = createProjectile(0, 0, 0);
  const { destroyedCount } = detectProjectileHits([proj1, proj2], [enemy]);
  assert.equal(destroyedCount, 1);
  // exactly one projectile should be consumed
  const aliveProjectiles = [proj1, proj2].filter((p) => p.alive);
  assert.equal(aliveProjectiles.length, 1);
});

test('projectile far from enemy does not register a hit', () => {
  const enemy = createEnemy(10, 10, 5);
  enemy.z = 0;
  const proj = createProjectile(0, 0, 0);
  const { destroyedCount } = detectProjectileHits([proj], [enemy]);
  assert.equal(destroyedCount, 0);
  assert.equal(enemy.alive, true);
});

test('enemy colliding with player reduces shields via a registered hit', () => {
  const player = createPlayer();
  const enemy = createEnemy(0, 0, 5);
  enemy.z = 0; // co-located with player
  const hits = detectPlayerHits(player, [enemy]);
  assert.equal(hits, 1);
  assert.equal(enemy.alive, false);
  assert.ok(player.invulnerable > 0);
});

test('player invulnerability window prevents duplicate hits', () => {
  const player = createPlayer();
  const enemy1 = createEnemy(0, 0, 5);
  enemy1.z = 0;
  detectPlayerHits(player, [enemy1]); // sets invulnerability

  const enemy2 = createEnemy(0, 0, 5);
  enemy2.z = 0;
  const hits = detectPlayerHits(player, [enemy2]);
  assert.equal(hits, 0); // no additional damage while invulnerable
});
