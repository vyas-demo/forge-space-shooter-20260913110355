import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlayer,
  createEnemy,
  createProjectile,
  detectProjectileHits,
  detectPlayerHits,
} from '../src/sim/entities.js';
import { createGame, start, update, STATES } from '../src/sim/game.js';

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

test('enemy that passes the player depth without colliding still damages a shield (miss)', () => {
  const player = createPlayer();
  player.x = -8;
  player.y = -5;
  const enemy = { x: 8, y: 5, z: 6, speed: 4, alive: true };
  const hits = detectPlayerHits(player, [enemy]);
  assert.equal(hits, 1);
  assert.equal(enemy.alive, false);
  assert.ok(player.invulnerable > 0);
});

test('a far-away enemy that has not reached the miss depth does not damage the player', () => {
  const player = createPlayer();
  player.x = -8;
  player.y = -5;
  const enemy = { x: 8, y: 5, z: 5, speed: 4, alive: true };
  const hits = detectPlayerHits(player, [enemy]);
  assert.equal(hits, 0);
  assert.equal(enemy.alive, true);
});

test('simultaneous collision and miss in the same frame only registers one hit, both enemies removed', () => {
  const player = createPlayer();
  const collidingEnemy = createEnemy(0, 0, 5);
  collidingEnemy.z = 0; // co-located: direct collision
  const missingEnemy = { x: 8, y: 5, z: 6, speed: 4, alive: true }; // passed depth
  const hits = detectPlayerHits(player, [collidingEnemy, missingEnemy]);
  assert.equal(hits, 1);
  assert.equal(collidingEnemy.alive, false);
  assert.equal(missingEnemy.alive, false);
});

test('game.score increments exactly once when a projectile destroys an enemy through the game loop', () => {
  const game = createGame(() => 0.5);
  start(game);
  const scoreBefore = game.score;
  // Replace state with a single projectile co-located with a single enemy
  // so the frame is guaranteed to register exactly one hit.
  game.enemies = [createEnemy(0, 0, 5)];
  game.enemies[0].z = 0;
  game.projectiles = [createProjectile(0, 0, 0)];
  update(game, 0.016);
  assert.equal(game.score, scoreBefore + 1);
  assert.equal(game.enemies.some((e) => !e.alive), false); // dead enemy filtered out
  assert.equal(game.projectiles.some((p) => !p.alive), false); // dead projectile filtered out

  // A subsequent frame with no new hits must not change the score again.
  const scoreAfterFirstHit = game.score;
  update(game, 0.016);
  assert.equal(game.score, scoreAfterFirstHit);
});

test('repeated misses eventually exhaust shields via the game loop (game over)', () => {
  const game = createGame(() => 0.5);
  start(game);
  game.shields = 3;
  game.player.x = -8;
  game.player.y = -5;
  game.enemies = [{ x: 8, y: 5, z: 5.99, speed: 4, alive: true }];
  update(game, 0.016);
  assert.equal(game.shields, 2);
  assert.equal(game.state, STATES.PLAYING);

  // Wait out invulnerability before the next miss.
  game.player.invulnerable = 0;
  game.enemies = [{ x: 8, y: 5, z: 5.99, speed: 4, alive: true }];
  update(game, 0.016);
  assert.equal(game.shields, 1);

  game.player.invulnerable = 0;
  game.enemies = [{ x: 8, y: 5, z: 5.99, speed: 4, alive: true }];
  update(game, 0.016);
  assert.equal(game.shields, 0);
  assert.equal(game.state, STATES.GAME_OVER);
});

test('fast-closing projectile and enemy crossing within one step still registers a hit (swept collision)', () => {
  // Reproduces the F2 regression: at high wave speeds, endpoint-only
  // distance checks could miss a crossing within a single capped frame.
  const enemy = createEnemy(0, 0, 16);
  enemy.z = -11.3;
  const proj = createProjectile(0, 0, -10);
  const dt = 1 / 15;

  // Manually step both forward exactly as game.update / entities.js would,
  // recording previous positions for the swept check.
  enemy.prevX = enemy.x; enemy.prevY = enemy.y; enemy.prevZ = enemy.z;
  enemy.z += enemy.speed * dt;
  proj.prevX = proj.x; proj.prevY = proj.y; proj.prevZ = proj.z;
  proj.z -= 24 * dt; // PROJECTILE_SPEED

  const { destroyedCount } = detectProjectileHits([proj], [enemy]);
  assert.equal(destroyedCount, 1);
  assert.equal(enemy.alive, false);
});

test('near-miss that never comes within the hit radius does not register', () => {
  const enemy = createEnemy(0, 5, 16); // far in Y, will not converge
  enemy.z = -11.3;
  const proj = createProjectile(0, 0, -10);
  const dt = 1 / 15;
  enemy.prevX = enemy.x; enemy.prevY = enemy.y; enemy.prevZ = enemy.z;
  enemy.z += enemy.speed * dt;
  proj.prevX = proj.x; proj.prevY = proj.y; proj.prevZ = proj.z;
  proj.z -= 24 * dt;

  const { destroyedCount } = detectProjectileHits([proj], [enemy]);
  assert.equal(destroyedCount, 0);
  assert.equal(enemy.alive, true);
});

test('wave 20 style crossing resolves through the full game loop with exactly one score increment', () => {
  const game = createGame(() => 0.5);
  start(game);
  game.enemies = [createEnemy(0, 0, 16)];
  game.enemies[0].z = -11.3;
  game.projectiles = [createProjectile(0, 0, -10)];
  const scoreBefore = game.score;
  update(game, 1 / 15);
  assert.equal(game.score, scoreBefore + 1);
});
