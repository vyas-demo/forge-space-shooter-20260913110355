// Keyboard input: WASD/arrows, Space, Enter, P, R.
// Prevents default on game keys to stop document scrolling.

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
const GAME_KEYS = new Set([...MOVE_KEYS, 'Space', 'Enter', 'KeyP', 'KeyR']);

const UP_KEYS = new Set(['KeyW', 'ArrowUp']);
const DOWN_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);

// handlers: { onMove(dx, dy), onFireStart(), onFireEnd(), onStart(), onPause(), onRestart() }
export function attachKeyboard(target, handlers) {
  // Tracks physical key codes currently held so that releasing one alias
  // (e.g. ArrowUp) does not stop movement while another alias (e.g. KeyW)
  // for the same direction is still pressed.
  const pressed = new Set();

  function anyHeld(keySet) {
    for (const code of keySet) {
      if (pressed.has(code)) return true;
    }
    return false;
  }

  function updateMove() {
    const dx = (anyHeld(RIGHT_KEYS) ? 1 : 0) - (anyHeld(LEFT_KEYS) ? 1 : 0);
    const dy = (anyHeld(UP_KEYS) ? 1 : 0) - (anyHeld(DOWN_KEYS) ? 1 : 0);
    handlers.onMove(dx, dy);
  }

  function onKeyDown(e) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault();
    }
    if (MOVE_KEYS.has(e.code)) {
      pressed.add(e.code);
      updateMove();
      return;
    }
    switch (e.code) {
      case 'Space':
        handlers.onFireStart(); break;
      case 'Enter':
        if (!e.repeat) handlers.onStart();
        break;
      case 'KeyP':
        if (!e.repeat) handlers.onPause();
        break;
      case 'KeyR':
        if (!e.repeat) handlers.onRestart();
        break;
      default:
        break;
    }
  }

  function onKeyUp(e) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault();
    }
    if (MOVE_KEYS.has(e.code)) {
      pressed.delete(e.code);
      updateMove();
      return;
    }
    if (e.code === 'Space') {
      handlers.onFireEnd();
    }
  }

  function onBlur() {
    pressed.clear();
    updateMove();
    handlers.onFireEnd();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return function detach() {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
