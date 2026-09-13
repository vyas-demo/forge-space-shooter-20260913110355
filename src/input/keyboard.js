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
// Returns { detach, reset, snapshot }:
//   - reset() clears all held-key state (as if every key were released) and
//     notifies handlers accordingly, without removing the event listeners.
//   - snapshot() returns the current { dx, dy, fire } derived purely from
//     physically-held keys, independent of any caller-side shadow state.
export function attachKeyboard(target, handlers) {
  // Tracks physical key codes currently held so that releasing one alias
  // (e.g. ArrowUp) does not stop movement while another alias (e.g. KeyW)
  // for the same direction is still pressed. A code is only ever added here
  // from a non-repeat keydown (or a repeat keydown for a code already
  // tracked), so calling reset() and then receiving auto-repeat keydowns for
  // a physically-still-held key (no intervening keyup) will NOT resurrect
  // that key's held state until a fresh non-repeat keydown/keyup cycle.
  const pressed = new Set();

  function anyHeld(keySet) {
    for (const code of keySet) {
      if (pressed.has(code)) return true;
    }
    return false;
  }

  function computeSnapshot() {
    const dx = (anyHeld(RIGHT_KEYS) ? 1 : 0) - (anyHeld(LEFT_KEYS) ? 1 : 0);
    const dy = (anyHeld(UP_KEYS) ? 1 : 0) - (anyHeld(DOWN_KEYS) ? 1 : 0);
    return { dx, dy, fire: pressed.has('Space') };
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
    if (MOVE_KEYS.has(e.code) || e.code === 'Space') {
      // Ignore auto-repeat for a key not currently tracked as pressed. This
      // is what prevents a key that was physically held across a reset()
      // (e.g. Restart) from reactivating via the browser's repeat keydown
      // stream instead of requiring a fresh keyup/keydown cycle.
      if (e.repeat && !pressed.has(e.code)) return;
      pressed.add(e.code);
      if (MOVE_KEYS.has(e.code)) {
        updateMove();
      } else {
        handlers.onFireStart();
      }
      return;
    }
    switch (e.code) {
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
      pressed.delete(e.code);
      handlers.onFireEnd();
    }
  }

  function clearAll() {
    pressed.clear();
    updateMove();
    handlers.onFireEnd();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearAll);

  return {
    detach() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearAll);
    },
    reset: clearAll,
    snapshot: computeSnapshot,
  };
}
