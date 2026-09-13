# Void Runner — 3D WebGL Space Shooter

A small, original 3D space shooter rendered with real WebGL — no frameworks,
no CDNs, no external assets or audio, no backend. The simulation/math core is
DOM-free and independently unit-tested; rendering and input are thin layers
wired together in `src/main.js`.

## Local commands

```bash
npm test    # runs the deterministic test suite (node --test)
npm run build  # copies the static site into dist/ for hosting
npm start   # serves dist/ (if built) or the source tree at http://127.0.0.1:4173
```

`npm start` respects the `PORT` environment variable (defaults to `4173`) and
always binds to `127.0.0.1`. It validates request paths and returns `HTTP 400`
for malformed URL encoding or path-traversal attempts without crashing.

## Controls

- **Move:** `W`/`A`/`S`/`D` or Arrow keys (bounded to the visible playfield).
- **Fire:** `Space` (held) or the on-screen **FIRE** button, subject to a
  cooldown between shots.
- **Start / Resume / Restart from Game Over:** `Enter` or the overlay button.
- **Pause / Resume:** `P` or the **Pause** button.
- **Restart:** `R` or the **Restart** button — fully resets score, shields,
  wave, enemies, projectiles, and timing, and returns to the **Ready**
  screen (press Start/Enter to begin wave 1 again).
- **Touch:** labelled on-screen directional pad and a held **FIRE** button,
  sized for a 390px-wide viewport. Touch input releases on `pointerup`,
  `pointercancel`, `lostpointercapture`, or window blur.

## Scoring & damage rules

- Each enemy destroyed by a projectile increments the score by exactly **1**
  (an enemy can only be destroyed once, even if multiple projectiles overlap
  it in the same frame).
- Colliding with the player, or an enemy passing the player's depth without
  colliding (a "miss"), each cost **1 shield** and grant a brief
  invulnerability window during which further enemy collisions/misses deal
  no additional damage.
- Reaching **0 shields** ends the run with a Game Over screen.
- Enemy waves spawn from depth with increasing count and speed as the wave
  number rises; a new wave spawns once the current wave is cleared or a wave
  timer elapses.

## Pause & restart behavior

- Pausing freezes the simulation entirely — no entity movement, cooldown
  countdown, or scoring occurs while paused. The Pause button relabels
  itself **Resume** while paused.
- Resuming continues from where you left off; the simulation delta time is
  capped each frame so a long real-world pause never causes a large
  "catch-up" jump.
- Restarting (from any state) resets score, shields, wave counter, player
  position, enemies, projectiles, and timers, and returns to the **Ready**
  state — press Start/Enter to begin a fresh wave 1.

## Accessibility & compatibility

- If WebGL is unavailable, an explicit fallback message is shown instead of a
  blank canvas (attempts WebGL1, then WebGL2 as a last resort, before falling
  back to the message — the shaders are authored in GLSL ES 1.00, which
  WebGL1 contexts accept directly).
- Non-essential visual effects (e.g. starfield density) respect
  `prefers-reduced-motion`.
- Layout has no horizontal overflow at 390px or 1440px viewport widths, and
  game keys (`WASD`/arrows/space/etc.) do not scroll the document.

## GitHub Pages setup (release operator only)

These steps are performed by the release operator — using their own
authenticated GitHub credentials — after this story merges. They are **not**
part of this story's acceptance and are not executed from the sandbox.

1. Ensure the default branch contains `index.html`, `styles.css`, `src/**`,
   and `.nojekyll` at the repository root (already the case here).
2. Enable GitHub Pages for the repository with the source set to the `main`
   branch, root (`/`) folder, via the GitHub REST API:

   ```bash
   gh api \
     --method POST \
     -H "Accept: application/vnd.github+json" \
     /repos/OWNER/REPOSITORY_NAME/pages \
     -f "source[branch]=main" \
     -f "source[path]=/"
   ```

   (If Pages is already enabled and only the source needs to change, use
   `--method PUT` against the same endpoint instead of `POST`.)

3. Poll the build status until it reports built successfully:

   ```bash
   gh api /repos/OWNER/REPOSITORY_NAME/pages/builds/latest
   ```

   Look for `"status": "built"` in the response before treating the
   deployment as live.

4. Confirm the published site loads at
   `https://vyas-demo.github.io/REPOSITORY_NAME/` and that all ES module
   imports resolve correctly (they use relative paths throughout).
