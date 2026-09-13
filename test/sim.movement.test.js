import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, movePlayer, PLAYFIELD } from '../src/sim/entities.js';
import { attachKeyboard } from '../src/input/keyboard.js';
import { attachTouchControls } from '../src/input/touch.js';

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

// --- Input adapter regressions -------------------------------------------
// These guard against keyboard/touch adapters losing held-direction state
// when a player uses multiple aliases (WASD + arrows) or multiple input
// sources (keyboard + touch) simultaneously.

function dispatchKeyEvent(target, type, code, opts = {}) {
  const evt = new Event(type);
  evt.code = code;
  evt.repeat = !!opts.repeat;
  target.dispatchEvent(evt);
}

test('keyboard: releasing one alias (ArrowUp) keeps moving while the other alias (KeyW) is still held', () => {
  global.window = new EventTarget();
  try {
    const moves = [];
    const target = new EventTarget();
    attachKeyboard(target, {
      onMove: (dx, dy) => moves.push({ dx, dy }),
      onFireStart() {},
      onFireEnd() {},
      onStart() {},
      onPause() {},
      onRestart() {},
    });

    dispatchKeyEvent(target, 'keydown', 'KeyW');
    dispatchKeyEvent(target, 'keydown', 'ArrowUp');
    // release ArrowUp; KeyW is still held so dy must remain 1
    dispatchKeyEvent(target, 'keyup', 'ArrowUp');
    assert.equal(moves[moves.length - 1].dy, 1);

    // now release KeyW too; movement must stop
    dispatchKeyEvent(target, 'keyup', 'KeyW');
    assert.equal(moves[moves.length - 1].dy, 0);
  } finally {
    delete global.window;
  }
});

test('keyboard: all four directions independently support alias combinations', () => {
  global.window = new EventTarget();
  try {
    const moves = [];
    const target = new EventTarget();
    attachKeyboard(target, {
      onMove: (dx, dy) => moves.push({ dx, dy }),
      onFireStart() {},
      onFireEnd() {},
      onStart() {},
      onPause() {},
      onRestart() {},
    });

    const down = (code) => dispatchKeyEvent(target, 'keydown', code);
    const up = (code) => dispatchKeyEvent(target, 'keyup', code);

    down('KeyD');
    down('ArrowRight');
    up('KeyD'); // ArrowRight still held
    assert.equal(moves[moves.length - 1].dx, 1);
    up('ArrowRight');
    assert.equal(moves[moves.length - 1].dx, 0);

    down('KeyA');
    down('ArrowLeft');
    up('ArrowLeft'); // KeyA still held
    assert.equal(moves[moves.length - 1].dx, -1);
    up('KeyA');
    assert.equal(moves[moves.length - 1].dx, 0);
  } finally {
    delete global.window;
  }
});

test('keyboard: blur clears all held keys regardless of aliases', () => {
  const windowTarget = new EventTarget();
  global.window = windowTarget;
  try {
    const moves = [];
    const target = new EventTarget();
    attachKeyboard(target, {
      onMove: (dx, dy) => moves.push({ dx, dy }),
      onFireStart() {},
      onFireEnd() {},
      onStart() {},
      onPause() {},
      onRestart() {},
    });
    dispatchKeyEvent(target, 'keydown', 'KeyW');
    dispatchKeyEvent(target, 'keydown', 'ArrowUp');
    windowTarget.dispatchEvent(new Event('blur'));
    assert.equal(moves[moves.length - 1].dy, 0);
  } finally {
    delete global.window;
  }
});

test('keyboard: Enter/P/R suppress repeat but movement keys are unaffected by repeat flag', () => {
  global.window = new EventTarget();
  try {
    let starts = 0;
    let pauses = 0;
    let restarts = 0;
    const target = new EventTarget();
    attachKeyboard(target, {
      onMove() {},
      onFireStart() {},
      onFireEnd() {},
      onStart: () => starts++,
      onPause: () => pauses++,
      onRestart: () => restarts++,
    });
    const down = (code, repeat) => dispatchKeyEvent(target, 'keydown', code, { repeat });
    down('Enter', false);
    down('Enter', true);
    down('KeyP', false);
    down('KeyP', true);
    down('KeyR', false);
    down('KeyR', true);
    assert.equal(starts, 1);
    assert.equal(pauses, 1);
    assert.equal(restarts, 1);
  } finally {
    delete global.window;
  }
});

test('touch: releasing fire button while a directional key is held does not affect movement, and pointercancel releases direction', () => {
  global.window = new EventTarget();
  try {
    const moves = [];
    const fires = [];
    function makeButton() {
      const el = new EventTarget();
      el.setPointerCapture = () => {};
      return el;
    }
    const up = makeButton();
    const down = makeButton();
    const left = makeButton();
    const right = makeButton();
    const fire = makeButton();
    const root = {
      querySelector(sel) {
        if (sel.includes('up')) return up;
        if (sel.includes('down')) return down;
        if (sel.includes('left')) return left;
        if (sel.includes('right')) return right;
        if (sel.includes('fire')) return fire;
        return null;
      },
    };
    attachTouchControls(root, {
      onMove: (dx, dy) => moves.push({ dx, dy }),
      onFireStart: () => fires.push('start'),
      onFireEnd: () => fires.push('end'),
    });

    const ptr = (el, type) => {
      const evt = new Event(type);
      evt.pointerId = 1;
      el.dispatchEvent(evt);
    };

    ptr(right, 'pointerdown');
    assert.equal(moves[moves.length - 1].dx, 1);

    ptr(fire, 'pointerdown');
    ptr(fire, 'pointerup'); // release fire while right still held
    assert.equal(moves[moves.length - 1].dx, 1); // movement retained
    assert.deepEqual(fires, ['start', 'end']);

    ptr(right, 'pointercancel');
    assert.equal(moves[moves.length - 1].dx, 0);
  } finally {
    delete global.window;
  }
});
