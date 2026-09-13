// Bootstraps the app: detects WebGL support, wires input/sim/render, and
// drives the requestAnimationFrame loop with delta-time capping.

import * as game from './sim/game.js';
import { createContext, createRenderer } from './render/renderer.js';
import { attachKeyboard } from './input/keyboard.js';
import { attachTouchControls } from './input/touch.js';

const canvas = document.getElementById('game-canvas');
const fallback = document.getElementById('fallback');
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnRestart = document.getElementById('btn-restart');
const hudScore = document.getElementById('hud-score');
const hudShields = document.getElementById('hud-shields');
const hudWave = document.getElementById('hud-wave');
const hudState = document.getElementById('hud-state');
const touchControlsRoot = document.getElementById('touch-controls');

const reducedMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

// Exposes the last-created simulation state for test harnesses only (see
// test/main.wiring.test.js). Unused in the browser; browsers ignore unused
// named exports from a module entry point, so this has no runtime effect.
let __debugState = null;
export function __getDebugStateForTest() {
  return __debugState;
}

let gl;
let contextError = null;
try {
  gl = createContext(canvas);
} catch (err) {
  gl = null;
  contextError = err;
}

if (!gl) {
  fallback.classList.remove('hidden');
  if (contextError) {
    fallback.querySelector('p').textContent =
      'WebGL initialization failed in this browser: ' + contextError.message;
  }
  overlay.classList.add('hidden');
} else {
  runGame(gl);
}

function runGame(gl) {
  const state = game.createGame();
  __debugState = state;
  let renderer;
  try {
    renderer = createRenderer(gl, { reducedMotion });
  } catch (err) {
    fallback.classList.remove('hidden');
    fallback.querySelector('p').textContent =
      'WebGL initialization failed in this browser: ' + err.message;
    overlay.classList.add('hidden');
    return;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function updateHud() {
    hudScore.textContent = `Score: ${state.score}`;
    hudShields.textContent = `Shields: ${state.shields}`;
    hudWave.textContent = `Wave: ${state.wave}`;
    const label = {
      [game.STATES.READY]: 'Ready',
      [game.STATES.PLAYING]: 'Playing',
      [game.STATES.PAUSED]: 'Paused',
      [game.STATES.GAME_OVER]: 'Game Over',
    }[state.state];
    hudState.textContent = label;
  }

  function syncOverlay() {
    if (state.state === game.STATES.READY) {
      overlay.classList.remove('hidden');
      overlayMessage.textContent = 'Defend against incoming waves. WASD/Arrows to move, Space to fire.';
      btnStart.textContent = 'Start';
    } else if (state.state === game.STATES.PAUSED) {
      overlay.classList.remove('hidden');
      overlayMessage.textContent = 'Paused.';
      btnStart.textContent = 'Resume';
    } else if (state.state === game.STATES.GAME_OVER) {
      overlay.classList.remove('hidden');
      overlayMessage.textContent = `Game Over. Final score: ${state.score}`;
      btnStart.textContent = 'Restart';
    } else {
      overlay.classList.add('hidden');
    }
  }

  function doStart() {
    if (state.state === game.STATES.READY) {
      game.start(state);
      // game.start() resets state.input to zero. Reapply whatever the
      // keyboard/touch adapters currently report as held so a
      // direction/fire input already active at Ready takes effect on the
      // very first Playing frame without requiring a second
      // keydown/pointerdown.
      applyCombinedInput();
    } else if (state.state === game.STATES.PAUSED) {
      game.resume(state);
    } else if (state.state === game.STATES.GAME_OVER) {
      game.restart(state);
    }
    syncOverlay();
    syncPauseButton();
  }

  function doPause() {
    if (state.state === game.STATES.PLAYING) {
      game.pause(state);
    } else if (state.state === game.STATES.PAUSED) {
      game.resume(state);
    }
    syncOverlay();
    syncPauseButton();
  }

  function syncPauseButton() {
    btnPause.textContent = state.state === game.STATES.PAUSED ? 'Resume' : 'Pause';
    btnPause.disabled = state.state !== game.STATES.PLAYING && state.state !== game.STATES.PAUSED;
  }

  // Keyboard and touch are independent input sources. Each contributes its
  // own movement vector and fire flag; the combined state applied to the
  // simulation is the union so that, e.g., releasing touch-fire while Space
  // is held keeps firing, and releasing one direction on one source keeps
  // movement from the other source.
  const keyboardInput = { dx: 0, dy: 0, fire: false };
  const touchInput = { dx: 0, dy: 0, fire: false };

  function doRestart() {
    game.restart(state);
    renderer.resetStarfield();
    // Clear both input sources' contributions so restart never carries
    // forward stale held-key/touch state into the fresh run.
    keyboardInput.dx = 0; keyboardInput.dy = 0; keyboardInput.fire = false;
    touchInput.dx = 0; touchInput.dy = 0; touchInput.fire = false;
    applyCombinedInput();
    syncOverlay();
    syncPauseButton();
  }

  btnStart.addEventListener('click', doStart);
  btnPause.addEventListener('click', doPause);
  btnRestart.addEventListener('click', doRestart);

  function applyCombinedInput() {
    let dx = keyboardInput.dx + touchInput.dx;
    let dy = keyboardInput.dy + touchInput.dy;
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));
    state.input.dx = dx;
    state.input.dy = dy;
    state.input.fire = keyboardInput.fire || touchInput.fire;
  }

  attachKeyboard(window, {
    onMove: (dx, dy) => { keyboardInput.dx = dx; keyboardInput.dy = dy; applyCombinedInput(); },
    onFireStart: () => { keyboardInput.fire = true; applyCombinedInput(); },
    onFireEnd: () => { keyboardInput.fire = false; applyCombinedInput(); },
    onStart: doStart,
    onPause: doPause,
    onRestart: doRestart,
  });

  attachTouchControls(touchControlsRoot, {
    onMove: (dx, dy) => { touchInput.dx = dx; touchInput.dy = dy; applyCombinedInput(); },
    onFireStart: () => { touchInput.fire = true; applyCombinedInput(); },
    onFireEnd: () => { touchInput.fire = false; applyCombinedInput(); },
  });

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, game.MAX_DELTA);
    lastTime = now;
    game.update(state, dt);
    updateHud();
    syncOverlay();
    syncPauseButton();
    renderer.render(state, canvas.width, canvas.height, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((now) => {
    lastTime = now;
    requestAnimationFrame(frame);
  });

  updateHud();
  syncOverlay();
  syncPauseButton();
}
