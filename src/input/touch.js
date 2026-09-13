// Labelled on-screen touch controls for movement (d-pad) and held fire.
// Releases held state on pointerup, pointercancel, and window blur.
// Sized/laid out for a 390px-wide viewport via styles.css.

// handlers: { onMove(dx, dy), onFireStart(), onFireEnd() }
export function attachTouchControls(root, handlers) {
  // Track active pointer IDs per direction/fire control (rather than a
  // single boolean) so that if two pointers land on the same control,
  // releasing one of them (pointerup/pointercancel) doesn't clear state
  // that the other pointer is still relying on — only when the *last*
  // active pointer for a control releases does that control turn off.
  const activePointers = { up: new Set(), down: new Set(), left: new Set(), right: new Set() };
  const firePointers = new Set();

  const held = {
    get up() { return activePointers.up.size > 0; },
    get down() { return activePointers.down.size > 0; },
    get left() { return activePointers.left.size > 0; },
    get right() { return activePointers.right.size > 0; },
  };
  const cleanups = [];

  function updateMove() {
    const dx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    const dy = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    handlers.onMove(dx, dy);
  }

  function bindDirectional(button, key) {
    if (!button) return;
    const pointers = activePointers[key];
    const start = (e) => {
      e.preventDefault();
      if (button.setPointerCapture) {
        try { button.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      pointers.add(e.pointerId);
      updateMove();
    };
    const end = (e) => {
      if (e) {
        e.preventDefault();
        pointers.delete(e.pointerId);
      } else {
        pointers.clear();
      }
      updateMove();
    };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
    cleanups.push(() => {
      button.removeEventListener('pointerdown', start);
      button.removeEventListener('pointerup', end);
      button.removeEventListener('pointercancel', end);
      button.removeEventListener('lostpointercapture', end);
    });
  }

  function bindFire(button) {
    if (!button) return;
    const start = (e) => {
      e.preventDefault();
      if (button.setPointerCapture) {
        try { button.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      const wasEmpty = firePointers.size === 0;
      firePointers.add(e.pointerId);
      if (wasEmpty) handlers.onFireStart();
    };
    const end = (e) => {
      if (e) {
        e.preventDefault();
        firePointers.delete(e.pointerId);
      } else {
        firePointers.clear();
      }
      if (firePointers.size === 0) handlers.onFireEnd();
    };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
    cleanups.push(() => {
      button.removeEventListener('pointerdown', start);
      button.removeEventListener('pointerup', end);
      button.removeEventListener('pointercancel', end);
      button.removeEventListener('lostpointercapture', end);
    });
  }

  bindDirectional(root.querySelector('[data-touch="up"]'), 'up');
  bindDirectional(root.querySelector('[data-touch="down"]'), 'down');
  bindDirectional(root.querySelector('[data-touch="left"]'), 'left');
  bindDirectional(root.querySelector('[data-touch="right"]'), 'right');
  bindFire(root.querySelector('[data-touch="fire"]'));

  function onBlur() {
    activePointers.up.clear();
    activePointers.down.clear();
    activePointers.left.clear();
    activePointers.right.clear();
    firePointers.clear();
    updateMove();
    handlers.onFireEnd();
  }
  window.addEventListener('blur', onBlur);
  cleanups.push(() => window.removeEventListener('blur', onBlur));

  return function detach() {
    cleanups.forEach((fn) => fn());
  };
}
