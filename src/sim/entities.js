// Player/enemy/projectile factories and movement/collision/shooting logic.
// DOM-free, pure functions where practical, mutating plain-object entities.

import { clamp, distance, sweptMinDistance } from '../math/vec3.js';

export const PLAYFIELD = {
  minX: -8,
  maxX: 8,
  minY: -5,
  maxY: 5,
};

export const PLAYER_SPEED = 10; // units per second
export const SHOT_COOLDOWN = 0.25; // seconds between shots
export const PROJECTILE_SPEED = 24; // units per second, travels toward -z (depth)
export const PROJECTILE_MAX_Z = -40; // despawn once past this depth
export const ENEMY_SPAWN_Z = -60;
export const ENEMY_HIT_RADIUS = 1.2;
export const PLAYER_HIT_RADIUS = 1.0;
export const INVULNERABILITY_DURATION = 1.0; // seconds after taking damage

export function createPlayer() {
  return {
    x: 0,
    y: 0,
    z: 0,
    cooldown: 0,
    invulnerable: 0,
  };
}

export function createEnemy(x, y, speed) {
  return {
    x,
    y,
    z: ENEMY_SPAWN_Z,
    speed,
    alive: true,
  };
}

export function createProjectile(x, y, z) {
  return { x, y, z, alive: true };
}

// Moves the player by (dx, dy) direction (each in [-1, 1]) scaled by speed*dt,
// clamped to the visible playfield bounds in the camera-facing X/Y plane.
export function movePlayer(player, dx, dy, dt) {
  player.x = clamp(player.x + dx * PLAYER_SPEED * dt, PLAYFIELD.minX, PLAYFIELD.maxX);
  player.y = clamp(player.y + dy * PLAYER_SPEED * dt, PLAYFIELD.minY, PLAYFIELD.maxY);
}

// Attempts to fire; returns a new projectile if cooldown allows, else null.
// Mutates player.cooldown.
export function tryFire(player) {
  if (player.cooldown > 0) return null;
  player.cooldown = SHOT_COOLDOWN;
  return createProjectile(player.x, player.y, player.z);
}

export function updateCooldown(player, dt) {
  if (player.cooldown > 0) {
    player.cooldown = Math.max(0, player.cooldown - dt);
  }
  if (player.invulnerable > 0) {
    player.invulnerable = Math.max(0, player.invulnerable - dt);
  }
}

// Advances projectiles toward -z, marking (but not yet removing) those past
// PROJECTILE_MAX_Z as despawned. Records pre-move position (prevX/prevY/prevZ)
// so collision detection can use a swept (continuous) check over the full
// motion segment before any out-of-range entities are filtered out. Callers
// must run collision detection against the returned array *before* dropping
// despawned entries (see detectProjectileHits / game.update), otherwise a
// projectile that both crosses the despawn depth and passes through an enemy
// within the same step would be discarded before the hit is ever checked.
export function updateProjectiles(projectiles, dt) {
  for (const p of projectiles) {
    p.prevX = p.x;
    p.prevY = p.y;
    p.prevZ = p.z;
    p.z -= PROJECTILE_SPEED * dt;
    if (p.z < PROJECTILE_MAX_Z) {
      p.despawned = true;
    }
  }
  return projectiles;
}

// Advances enemies toward +z (the player). Records pre-move position for
// swept collision detection (see updateProjectiles). Does not filter; callers
// run collision detection first, then drop dead/despawned entities.
export function updateEnemies(enemies, dt) {
  for (const e of enemies) {
    e.prevX = e.x;
    e.prevY = e.y;
    e.prevZ = e.z;
    e.z += e.speed * dt;
  }
  return enemies;
}

// Detects projectile/enemy collisions. Each enemy can only be destroyed once
// (single score increment). Uses a swept (continuous) distance check between
// each entity's previous and current position when available, so that fast
// relative motion within a single simulation step (e.g. late-wave enemy
// speeds combined with the capped max delta) cannot pass through a
// projectile without registering a hit. Falls back to the endpoint distance
// when no previous position has been recorded yet (e.g. the very first
// frame after spawning). Returns { destroyedCount, hitProjectiles: Set }.
export function detectProjectileHits(projectiles, enemies) {
  let destroyedCount = 0;
  const hitProjectiles = new Set();

  // Pre-compute, per projectile, the fraction of this step's motion (tEnd in
  // [0, 1]) during which the projectile is still within its valid travel
  // range (i.e. before crossing PROJECTILE_MAX_Z). A projectile that
  // despawns mid-step must not be treated as if it existed for the full
  // step: both its own and the enemy's positions are interpolated to tEnd
  // before the swept check, so a collision that would only occur after the
  // projectile has already expired is correctly excluded. Projectiles that
  // were already expired at the *start* of the step (prevZ already past the
  // despawn depth) are skipped entirely.
  const projInfo = new Map();
  for (const proj of projectiles) {
    if (!proj.alive) continue;
    const projPrev = proj.prevX !== undefined
      ? { x: proj.prevX, y: proj.prevY, z: proj.prevZ }
      : proj;
    if (projPrev.z < PROJECTILE_MAX_Z) continue; // already expired at step start

    const dz = proj.z - projPrev.z;
    let tEnd = 1;
    if (dz !== 0) {
      tEnd = clamp((PROJECTILE_MAX_Z - projPrev.z) / dz, 0, 1);
    } else if (proj.z < PROJECTILE_MAX_Z) {
      tEnd = 0;
    }
    const projEnd = {
      x: projPrev.x + (proj.x - projPrev.x) * tEnd,
      y: projPrev.y + (proj.y - projPrev.y) * tEnd,
      z: projPrev.z + dz * tEnd,
    };
    projInfo.set(proj, { projPrev, projEnd, tEnd });
  }

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const enemyPrev = enemy.prevX !== undefined
      ? { x: enemy.prevX, y: enemy.prevY, z: enemy.prevZ }
      : enemy;
    for (const proj of projectiles) {
      if (!proj.alive || hitProjectiles.has(proj)) continue;
      const info = projInfo.get(proj);
      if (!info) continue; // already expired at step start
      const { projPrev, projEnd, tEnd } = info;
      const enemyEnd = {
        x: enemyPrev.x + (enemy.x - enemyPrev.x) * tEnd,
        y: enemyPrev.y + (enemy.y - enemyPrev.y) * tEnd,
        z: enemyPrev.z + (enemy.z - enemyPrev.z) * tEnd,
      };
      const d = sweptMinDistance(enemyPrev, enemyEnd, projPrev, projEnd);
      if (d <= ENEMY_HIT_RADIUS) {
        enemy.alive = false;
        proj.alive = false;
        hitProjectiles.add(proj);
        destroyedCount += 1;
        break;
      }
    }
  }
  return { destroyedCount, hitProjectiles };
}

// Depth beyond which an enemy that reached the player without a direct
// collision is treated as a miss that still damages the player (it has
// passed through the player's plane).
export const PLAYER_MISS_Z = 5.9;

// Detects enemies reaching/colliding with the player, either via direct
// collision (distance-based) or by passing the player's depth uncollided
// (a "miss" that still counts as a hit — the enemy got past the player).
// Applies one shield hit per qualifying enemy (each such enemy is removed),
// respecting the player's invulnerability window. Returns number of hits
// registered (shield damage applied); enemies are always removed once they
// qualify, whether or not damage was applied due to invulnerability.
export function detectPlayerHits(player, enemies, missZ = PLAYER_MISS_Z) {
  const qualifying = [];
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const collided = distance(enemy, player) <= PLAYER_HIT_RADIUS + ENEMY_HIT_RADIUS;
    const missed = enemy.z >= missZ;
    if (collided || missed) {
      qualifying.push(enemy);
    }
  }

  if (qualifying.length === 0) return 0;

  if (player.invulnerable > 0) {
    // Still remove enemies that reached/passed the player, but no additional
    // damage while the invulnerability window is active.
    for (const enemy of qualifying) {
      enemy.alive = false;
    }
    return 0;
  }

  // Only the first qualifying enemy registers a hit this frame; the
  // resulting invulnerability window then covers any remaining ones (which
  // are still removed, matching single-hit-per-frame semantics).
  let hits = 0;
  for (let i = 0; i < qualifying.length; i++) {
    qualifying[i].alive = false;
    if (i === 0) {
      hits += 1;
      player.invulnerable = INVULNERABILITY_DURATION;
    }
  }
  return hits;
}
