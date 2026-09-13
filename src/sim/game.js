// DOM-free simulation core: state machine, wave progression, capped delta
// timestep, and the top-level update loop tying entities.js together.

import {
  createPlayer,
  createEnemy,
  movePlayer,
  tryFire,
  updateCooldown,
  updateProjectiles,
  updateEnemies,
  detectProjectileHits,
  detectPlayerHits,
  PLAYFIELD,
} from './entities.js';

export const STATES = {
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'game_over',
};

export const MAX_DELTA = 1 / 15; // cap simulation delta to avoid catch-up jumps
export const STARTING_SHIELDS = 3;
export const WAVE_INTERVAL = 8; // seconds between wave spawns
export const BASE_ENEMIES_PER_WAVE = 3;
export const BASE_ENEMY_SPEED = 4;

// Default RNG is Math.random; tests inject a deterministic function.
export function createGame(rng = Math.random) {
  return {
    rng,
    state: STATES.READY,
    score: 0,
    shields: STARTING_SHIELDS,
    wave: 0,
    player: createPlayer(),
    enemies: [],
    projectiles: [],
    waveTimer: 0,
    input: { dx: 0, dy: 0, fire: false },
  };
}

export function start(game) {
  resetRun(game);
  game.state = STATES.PLAYING;
}

export function pause(game) {
  if (game.state === STATES.PLAYING) {
    game.state = STATES.PAUSED;
  }
}

export function resume(game) {
  if (game.state === STATES.PAUSED) {
    game.state = STATES.PLAYING;
  }
}

export function restart(game) {
  resetRun(game);
  game.state = STATES.PLAYING;
}

function resetRun(game) {
  game.score = 0;
  game.shields = STARTING_SHIELDS;
  game.wave = 0;
  game.player = createPlayer();
  game.enemies = [];
  game.projectiles = [];
  game.waveTimer = 0;
  game.input = { dx: 0, dy: 0, fire: false };
  spawnWave(game);
}

function spawnWave(game) {
  game.wave += 1;
  const count = BASE_ENEMIES_PER_WAVE + Math.floor(game.wave / 2);
  const speed = BASE_ENEMY_SPEED + game.wave * 0.6;
  for (let i = 0; i < count; i++) {
    const x = (game.rng() * 2 - 1) * PLAYFIELD.maxX;
    const y = (game.rng() * 2 - 1) * PLAYFIELD.maxY;
    game.enemies.push(createEnemy(x, y, speed));
  }
}

// Advances the simulation by dt seconds (already capped by caller/main.js,
// but capped again here defensively). No-op unless state is PLAYING.
export function update(game, dt) {
  if (game.state !== STATES.PLAYING) return;
  const step = Math.min(dt, MAX_DELTA);

  movePlayer(game.player, game.input.dx, game.input.dy, step);
  updateCooldown(game.player, step);

  if (game.input.fire) {
    const proj = tryFire(game.player);
    if (proj) game.projectiles.push(proj);
  }

  game.projectiles = updateProjectiles(game.projectiles, step);
  game.enemies = updateEnemies(game.enemies, step);

  const { destroyedCount } = detectProjectileHits(game.projectiles, game.enemies);
  game.score += destroyedCount;
  game.projectiles = game.projectiles.filter((p) => p.alive);
  game.enemies = game.enemies.filter((e) => e.alive);

  const hits = detectPlayerHits(game.player, game.enemies);
  if (hits > 0) {
    game.shields -= hits;
  }
  game.enemies = game.enemies.filter((e) => e.alive);

  // Enemies that pass the player's depth without colliding are removed
  // (missed the player entirely, e.g. traveled past bounds).
  game.enemies = game.enemies.filter((e) => e.z < 6);

  if (game.shields <= 0) {
    game.shields = 0;
    game.state = STATES.GAME_OVER;
    return;
  }

  game.waveTimer += step;
  if (game.waveTimer >= WAVE_INTERVAL || game.enemies.length === 0) {
    game.waveTimer = 0;
    spawnWave(game);
  }
}
