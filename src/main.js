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

const gl = createContext(canvas);

if (!gl) {
  fallback.classList.remove('hidden');
  overlay.classList.add('hidden');
} else {
  runGame(gl);
}

function runGame(gl) {
  const state = game.createGame();
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

  function doRestart() {
    game.restart(state);
    renderer.resetStarfield();
    syncOverlay();
    syncPauseButton();
  }

  btnStart.addEventListener('click', doStart);
  btnPause.addEventListener('click', doPause);
  btnRestart.addEventListener('click', doRestart);

  attachKeyboard(window, {
    onMove: (dx, dy) => { state.input.dx = dx; state.input.dy = dy; },
    onFireStart: () => { state.input.fire = true; },
    onFireEnd: () => { state.input.fire = false; },
    onStart: doStart,
    onPause: doPause,
    onRestart: doRestart,
  });

  attachTouchControls(touchControlsRoot, {
    onMove: (dx, dy) => { state.input.dx = dx; state.input.dy = dy; },
    onFireStart: () => { state.input.fire = true; },
    onFireEnd: () => { state.input.fire = false; },
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
