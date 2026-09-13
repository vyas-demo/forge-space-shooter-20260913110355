// Player/enemy/projectile factories and movement/collision/shooting logic.
// DOM-free, pure functions where practical, mutating plain-object entities.

import { clamp, distance } from '../math/vec3.js';

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

// Advances projectiles toward -z; removes (marks dead) those past PROJECTILE_MAX_Z.
export function updateProjectiles(projectiles, dt) {
  for (const p of projectiles) {
    p.z -= PROJECTILE_SPEED * dt;
    if (p.z < PROJECTILE_MAX_Z) {
      p.alive = false;
    }
  }
  return projectiles.filter((p) => p.alive);
}

// Advances enemies toward +z (the player); returns list still alive.
export function updateEnemies(enemies, dt) {
  for (const e of enemies) {
    e.z += e.speed * dt;
  }
  return enemies.filter((e) => e.alive);
}

// Detects projectile/enemy collisions. Each enemy can only be destroyed once
// (single score increment). Returns { destroyedCount, hitProjectiles: Set }.
export function detectProjectileHits(projectiles, enemies) {
  let destroyedCount = 0;
  const hitProjectiles = new Set();
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    for (const proj of projectiles) {
      if (!proj.alive || hitProjectiles.has(proj)) continue;
      const d = distance(enemy, proj);
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

// Detects enemies reaching/colliding with the player. Applies one shield hit
// per enemy collision (each colliding enemy is destroyed once), respecting
// the player's invulnerability window. Returns number of hits registered.
export function detectPlayerHits(player, enemies) {
  if (player.invulnerable > 0) {
    // Still remove enemies that reached the player, but no additional damage.
    let removed = 0;
    for (const enemy of enemies) {
      if (enemy.alive && distance(enemy, player) <= PLAYER_HIT_RADIUS + ENEMY_HIT_RADIUS) {
        enemy.alive = false;
        removed += 1;
      }
    }
    return 0;
  }
  let hits = 0;
  for (const enemy of enemies) {
    if (enemy.alive && distance(enemy, player) <= PLAYER_HIT_RADIUS + ENEMY_HIT_RADIUS) {
      enemy.alive = false;
      hits += 1;
      player.invulnerable = INVULNERABILITY_DURATION;
      break; // only one hit registers per frame; invulnerability then guards further hits
    }
  }
  return hits;
}
