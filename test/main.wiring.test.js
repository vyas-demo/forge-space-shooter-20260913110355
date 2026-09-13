// Exercises src/main.js's control-wiring logic (Start/Pause/Restart plus
// keyboard/touch input reapplication) using a minimal fake DOM so it runs
// under node:test without a browser. A no-op WebGL-like context stub lets
// main.js's real runGame() path execute (createContext/createRenderer
// succeed), so the same production wiring code (doStart/doRestart/
// applyCombinedInput) is exercised rather than a reimplementation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { STATES } from '../src/sim/game.js';

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
}

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this.listeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }
  dispatch(type, evt = {}) {
    const arr = this.listeners.get(type) || [];
    for (const fn of [...arr]) fn(evt);
  }
}

class FakeElement extends FakeEventTarget {
  constructor(id) {
    super();
    this.id = id;
    this.classList = new FakeClassList();
    this.textContent = '';
    this.disabled = false;
    this.width = 300;
    this.height = 300;
  }
  querySelector(sel) {
    if (sel === 'p') return this._p || (this._p = new FakeElement('p'));
    const match = sel.match(/\[data-touch="(\w+)"\]/);
    if (match && this.touchButtons) return this.touchButtons[match[1]] || null;
    return null;
  }
  getBoundingClientRect() { return { width: 300, height: 300 }; }
  getContext() { return makeFakeGL(); }
}

function makeFakeGL() {
  const noop = () => {};
  return {
    createShader: () => ({}), shaderSource: noop, compileShader: noop,
    getShaderParameter: () => true, getShaderInfoLog: () => '', deleteShader: noop,
    createProgram: () => ({}), attachShader: noop, linkProgram: noop,
    getProgramParameter: () => true, getProgramInfoLog: () => '', useProgram: noop,
    createBuffer: () => ({}), bindBuffer: noop, bufferData: noop,
    getAttribLocation: () => 0, enableVertexAttribArray: noop, vertexAttribPointer: noop,
    getUniformLocation: () => ({}), uniformMatrix4fv: noop, uniform3fv: noop,
    uniform1f: noop, uniform4fv: noop, enable: noop, disable: noop, depthFunc: noop,
    clearColor: noop, clear: noop, viewport: noop, drawArrays: noop, drawElements: noop,
    ARRAY_BUFFER: 1, ELEMENT_ARRAY_BUFFER: 2, STATIC_DRAW: 3, FLOAT: 4,
    DEPTH_TEST: 5, LEQUAL: 6, COLOR_BUFFER_BIT: 7, DEPTH_BUFFER_BIT: 8,
    TRIANGLES: 9, POINTS: 10, UNSIGNED_SHORT: 11, VERTEX_SHADER: 12,
    FRAGMENT_SHADER: 13, COMPILE_STATUS: 14, LINK_STATUS: 15, CULL_FACE: 16, BACK: 17,
  };
}

let runCounter = 0;

async function setupHarness() {
  runCounter += 1;
  const elements = {};
  const ids = [
    'game-canvas', 'fallback', 'overlay', 'overlay-message', 'btn-start',
    'btn-pause', 'btn-restart', 'hud-score', 'hud-shields', 'hud-wave',
    'hud-state', 'touch-controls',
  ];
  for (const id of ids) elements[id] = new FakeElement(id);

  const touchButtons = {};
  for (const key of ['up', 'down', 'left', 'right', 'fire']) {
    touchButtons[key] = new FakeElement(`touch-${key}`);
  }
  elements['touch-controls'].touchButtons = touchButtons;

  const fakeWindow = new FakeEventTarget();
  fakeWindow.matchMedia = () => ({ matches: false });
  fakeWindow.devicePixelRatio = 1;

  const rafQueue = [];
  fakeWindow.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };

  global.window = fakeWindow;
  global.document = { getElementById: (id) => elements[id] || null };
  global.performance = { now: () => 0 };
  global.requestAnimationFrame = fakeWindow.requestAnimationFrame;

  const mainModule = await import(`../src/main.js?run=${runCounter}`);

  return { elements, window: fakeWindow, touchButtons, mainModule };
}

test('holding a keyboard direction at Ready is reapplied immediately on Start', async () => {
  const { elements, window, mainModule } = await setupHarness();

  // Hold "D" (move right) while still at Ready, before clicking Start.
  window.dispatch('keydown', { code: 'KeyD', preventDefault() {} });

  elements['btn-start'].dispatch('click');

  assert.equal(mainModule.__getDebugStateForTest().state, 'playing');
  const state = mainModule.__getDebugStateForTest();
  // The held "D" input must be reflected in the simulation input on the very
  // first Playing frame, without requiring a second keydown.
  assert.equal(state.input.dx, 1);
});

test('touch fire held at Ready fires immediately on the first Playing frame without a second pointerdown', async () => {
  const { elements, touchButtons, mainModule } = await setupHarness();

  touchButtons.fire.dispatch('pointerdown', { pointerId: 1, preventDefault() {} });
  elements['btn-start'].dispatch('click');

  assert.equal(mainModule.__getDebugStateForTest().state, 'playing');
  const state = mainModule.__getDebugStateForTest();
  assert.equal(state.input.fire, true);
});

test('Restart clears keyboard and touch holds so no residual input carries into the next Ready/Start cycle', async () => {
  const { elements, window, touchButtons, mainModule } = await setupHarness();

  window.dispatch('keydown', { code: 'KeyW', preventDefault() {} });
  touchButtons.right.dispatch('pointerdown', { pointerId: 2, preventDefault() {} });
  elements['btn-start'].dispatch('click');
  assert.equal(mainModule.__getDebugStateForTest().state, 'playing');
  let state = mainModule.__getDebugStateForTest();
  assert.equal(state.input.dy, 1);
  assert.equal(state.input.dx, 1);

  elements['btn-restart'].dispatch('click');
  assert.equal(mainModule.__getDebugStateForTest().state, 'ready');

  // Starting again (without re-pressing anything) should not carry forward
  // the previously-held keyboard/touch state, since Restart explicitly
  // clears both input sources.
  elements['btn-start'].dispatch('click');
  assert.equal(mainModule.__getDebugStateForTest().state, 'playing');
  state = mainModule.__getDebugStateForTest();
  assert.equal(state.input.dx, 0);
  assert.equal(state.input.dy, 0);
  assert.equal(state.input.fire, false);
});

test('pause/resume via button re-wires overlay and pause-button state across transitions', async () => {
  const { elements, mainModule } = await setupHarness();

  elements['btn-start'].dispatch('click');
  assert.equal(mainModule.__getDebugStateForTest().state, 'playing');

  elements['btn-pause'].dispatch('click');
  assert.equal(mainModule.__getDebugStateForTest().state, 'paused');
  assert.equal(elements['btn-pause'].textContent, 'Resume');

  elements['btn-pause'].dispatch('click');
  assert.equal(mainModule.__getDebugStateForTest().state, 'playing');
  assert.equal(elements['btn-pause'].textContent, 'Pause');
});
