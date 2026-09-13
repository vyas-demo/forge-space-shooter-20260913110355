// Keyboard input: WASD/arrows, Space, Enter, P, R.
// Prevents default on game keys to stop document scrolling.

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
const GAME_KEYS = new Set([...MOVE_KEYS, 'Space', 'Enter', 'KeyP', 'KeyR']);

// handlers: { onMove(dx, dy), onFireStart(), onFireEnd(), onStart(), onPause(), onRestart() }
export function attachKeyboard(target, handlers) {
  const held = { up: false, down: false, left: false, right: false };

  function updateMove() {
    const dx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    const dy = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    handlers.onMove(dx, dy);
  }

  function onKeyDown(e) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault();
    }
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        held.up = true; updateMove(); break;
      case 'KeyS':
      case 'ArrowDown':
        held.down = true; updateMove(); break;
      case 'KeyA':
      case 'ArrowLeft':
        held.left = true; updateMove(); break;
      case 'KeyD':
      case 'ArrowRight':
        held.right = true; updateMove(); break;
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
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        held.up = false; updateMove(); break;
      case 'KeyS':
      case 'ArrowDown':
        held.down = false; updateMove(); break;
      case 'KeyA':
      case 'ArrowLeft':
        held.left = false; updateMove(); break;
      case 'KeyD':
      case 'ArrowRight':
        held.right = false; updateMove(); break;
      case 'Space':
        handlers.onFireEnd(); break;
      default:
        break;
    }
  }

  function onBlur() {
    held.up = held.down = held.left = held.right = false;
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
