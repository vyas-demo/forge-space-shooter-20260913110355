// Labelled on-screen touch controls for movement (d-pad) and held fire.
// Releases held state on pointerup, pointercancel, and window blur.
// Sized/laid out for a 390px-wide viewport via styles.css.

// handlers: { onMove(dx, dy), onFireStart(), onFireEnd() }
export function attachTouchControls(root, handlers) {
  const held = { up: false, down: false, left: false, right: false };
  const cleanups = [];

  function updateMove() {
    const dx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    const dy = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    handlers.onMove(dx, dy);
  }

  function bindDirectional(button, key) {
    if (!button) return;
    const start = (e) => { e.preventDefault(); held[key] = true; updateMove(); };
    const end = (e) => { if (e) e.preventDefault(); held[key] = false; updateMove(); };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    cleanups.push(() => {
      button.removeEventListener('pointerdown', start);
      button.removeEventListener('pointerup', end);
      button.removeEventListener('pointercancel', end);
    });
  }

  function bindFire(button) {
    if (!button) return;
    const start = (e) => { e.preventDefault(); handlers.onFireStart(); };
    const end = (e) => { if (e) e.preventDefault(); handlers.onFireEnd(); };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    cleanups.push(() => {
      button.removeEventListener('pointerdown', start);
      button.removeEventListener('pointerup', end);
      button.removeEventListener('pointercancel', end);
    });
  }

  bindDirectional(root.querySelector('[data-touch="up"]'), 'up');
  bindDirectional(root.querySelector('[data-touch="down"]'), 'down');
  bindDirectional(root.querySelector('[data-touch="left"]'), 'left');
  bindDirectional(root.querySelector('[data-touch="right"]'), 'right');
  bindFire(root.querySelector('[data-touch="fire"]'));

  function onBlur() {
    held.up = held.down = held.left = held.right = false;
    updateMove();
    handlers.onFireEnd();
  }
  window.addEventListener('blur', onBlur);
  cleanups.push(() => window.removeEventListener('blur', onBlur));

  return function detach() {
    cleanups.forEach((fn) => fn());
  };
}
