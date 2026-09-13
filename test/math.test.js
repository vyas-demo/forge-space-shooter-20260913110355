import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import * as vec3 from '../src/math/vec3.js';
import * as mat4 from '../src/math/mat4.js';
import { resolveSafePath, hasTraversalSegment, server, resolvePort } from '../scripts/serve.js';
import { createContext, createRenderer, isWebGL2 } from '../src/render/renderer.js';
import {
  MESH_VERTEX_SHADER, MESH_VERTEX_SHADER_GL2, POINT_VERTEX_SHADER, POINT_VERTEX_SHADER_GL2,
} from '../src/render/shaders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('vec3.add/sub/scale', () => {
  const a = vec3.create(1, 2, 3);
  const b = vec3.create(4, 5, 6);
  assert.deepEqual(vec3.add(a, b), { x: 5, y: 7, z: 9 });
  assert.deepEqual(vec3.sub(b, a), { x: 3, y: 3, z: 3 });
  assert.deepEqual(vec3.scale(a, 2), { x: 2, y: 4, z: 6 });
});

test('vec3.length and normalize', () => {
  const a = vec3.create(3, 4, 0);
  assert.equal(vec3.length(a), 5);
  const n = vec3.normalize(a);
  assert.ok(Math.abs(vec3.length(n) - 1) < 1e-9);
});

test('vec3.normalize of zero vector returns zero', () => {
  assert.deepEqual(vec3.normalize(vec3.create(0, 0, 0)), { x: 0, y: 0, z: 0 });
});

test('vec3.distance', () => {
  const a = vec3.create(0, 0, 0);
  const b = vec3.create(0, 3, 4);
  assert.equal(vec3.distance(a, b), 5);
});

test('vec3.clamp', () => {
  assert.equal(vec3.clamp(5, 0, 10), 5);
  assert.equal(vec3.clamp(-5, 0, 10), 0);
  assert.equal(vec3.clamp(15, 0, 10), 10);
});

test('mat4.identity multiplied by itself is identity', () => {
  const id = mat4.identity();
  const result = mat4.multiply(id, id);
  for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(result[i] - id[i]) < 1e-9);
  }
});

test('mat4.translation transforms a point correctly', () => {
  const m = mat4.translation(1, 2, 3);
  const p = mat4.transformPoint(m, { x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(p.x - 1) < 1e-9);
  assert.ok(Math.abs(p.y - 2) < 1e-9);
  assert.ok(Math.abs(p.z - 3) < 1e-9);
});

test('mat4.perspective projects a centered point near origin', () => {
  const proj = mat4.perspective(Math.PI / 2, 1, 0.1, 100);
  // A point directly in front of camera on the view axis (-z) should project near x=0,y=0.
  const p = mat4.transformPoint(proj, { x: 0, y: 0, z: -10 });
  assert.ok(Math.abs(p.x) < 1e-6);
  assert.ok(Math.abs(p.y) < 1e-6);
});

test('mat4.lookAt produces a valid view matrix moving eye to origin', () => {
  const view = mat4.lookAt({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  const p = mat4.transformPoint(view, { x: 0, y: 0, z: 10 });
  assert.ok(Math.abs(p.x) < 1e-6);
  assert.ok(Math.abs(p.y) < 1e-6);
  assert.ok(Math.abs(p.z) < 1e-6);
});

test('serve: hasTraversalSegment rejects backslash-separated traversal', () => {
  assert.equal(hasTraversalSegment('/..\\secret'), true);
  assert.equal(hasTraversalSegment('/../secret'), true);
  assert.equal(hasTraversalSegment('/a/b/index.html'), false);
});

test('serve: resolveSafePath rejects encoded-backslash traversal (400, not a crash)', () => {
  // '/%2e%2e%5csecret' decodes to '/..\\secret' — a traversal attempt using
  // an encoded backslash separator that must be rejected after decoding.
  assert.equal(resolveSafePath('/%2e%2e%5csecret'), null);
});

test('serve: resolveSafePath rejects raw-encoded-backslash traversal', () => {
  assert.equal(resolveSafePath('/..%5csecret'), null);
});

test('serve: resolveSafePath rejects malformed percent-encoding without throwing', () => {
  assert.doesNotThrow(() => {
    assert.equal(resolveSafePath('/%ff%fe'), null);
  });
});

test('serve: resolveSafePath still resolves a normal request after rejections', () => {
  const resolved = resolveSafePath('/');
  assert.ok(resolved.endsWith('index.html'));
});

// --- Minimal mock WebGL context to validate dialect selection without a browser ---

function createMockGl({ webgl2 }) {
  const compiledSources = [];
  const drawMeshCalls = [];
  let currentColor = null;
  const gl = {
    VERTEX_SHADER: 'VERTEX_SHADER',
    FRAGMENT_SHADER: 'FRAGMENT_SHADER',
    COMPILE_STATUS: 'COMPILE_STATUS',
    LINK_STATUS: 'LINK_STATUS',
    ARRAY_BUFFER: 'ARRAY_BUFFER',
    ELEMENT_ARRAY_BUFFER: 'ELEMENT_ARRAY_BUFFER',
    STATIC_DRAW: 'STATIC_DRAW',
    DEPTH_TEST: 'DEPTH_TEST',
    COLOR_BUFFER_BIT: 1,
    DEPTH_BUFFER_BIT: 2,
    TRIANGLES: 'TRIANGLES',
    POINTS: 'POINTS',
    UNSIGNED_SHORT: 'UNSIGNED_SHORT',
    FLOAT: 'FLOAT',
    TRANSFORM_FEEDBACK: webgl2 ? 0x8e22 : undefined,
    createShader: (type) => ({ type }),
    shaderSource: (shader, source) => {
      shader.source = source;
      compiledSources.push(source);
    },
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: () => {},
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    getAttribLocation: () => 0,
    getUniformLocation: (program, name) => ({ name }),
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    bufferSubData: () => {},
    enable: () => {},
    clearColor: () => {},
    clear: () => {},
    viewport: () => {},
    useProgram: (program) => { gl.__currentProgram = program; },
    uniformMatrix4fv: () => {},
    uniform3f: (loc, r, g, b) => {
      currentColor = [r, g, b];
      if (gl.__isMeshDraw) drawMeshCalls.push({ color: [r, g, b] });
    },
    uniform1f: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    drawElements: () => {
      gl.__isMeshDraw = true;
      if (currentColor) drawMeshCalls.push({ color: currentColor });
    },
    drawArrays: () => {},
  };
  if (webgl2) {
    gl.createVertexArray = () => ({});
  }
  gl.__compiledSources = compiledSources;
  gl.__drawMeshCalls = drawMeshCalls;
  return gl;
}

test('isWebGL2 identifies a WebGL2-shaped context and rejects a WebGL1-shaped one', () => {
  assert.equal(isWebGL2(createMockGl({ webgl2: true })), true);
  assert.equal(isWebGL2(createMockGl({ webgl2: false })), false);
});

test('createContext requests webgl2 before webgl1 fallbacks', () => {
  const calls = [];
  const canvas = {
    getContext(type) {
      calls.push(type);
      return type === 'webgl2' ? { fake: 'gl2' } : null;
    },
  };
  const gl = createContext(canvas);
  assert.deepEqual(calls, ['webgl2']);
  assert.deepEqual(gl, { fake: 'gl2' });
});

test('createContext falls back to webgl/experimental-webgl when webgl2 is unavailable', () => {
  const canvas = {
    getContext(type) {
      if (type === 'webgl2') return null;
      if (type === 'webgl') return { fake: 'gl1' };
      return null;
    },
  };
  const gl = createContext(canvas);
  assert.deepEqual(gl, { fake: 'gl1' });
});

test('createRenderer compiles GLSL ES 3.00 (#version 300 es) shaders on a WebGL2-shaped context', () => {
  const gl = createMockGl({ webgl2: true });
  createRenderer(gl, { reducedMotion: true });
  assert.ok(gl.__compiledSources.includes(MESH_VERTEX_SHADER_GL2));
  assert.ok(gl.__compiledSources.includes(POINT_VERTEX_SHADER_GL2));
  assert.ok(!gl.__compiledSources.includes(MESH_VERTEX_SHADER));
  assert.ok(!gl.__compiledSources.includes(POINT_VERTEX_SHADER));
});

test('createRenderer compiles GLSL ES 1.00 shaders on a WebGL1-shaped context', () => {
  const gl = createMockGl({ webgl2: false });
  createRenderer(gl, { reducedMotion: true });
  assert.ok(gl.__compiledSources.includes(MESH_VERTEX_SHADER));
  assert.ok(gl.__compiledSources.includes(POINT_VERTEX_SHADER));
  assert.ok(!gl.__compiledSources.includes(MESH_VERTEX_SHADER_GL2));
  assert.ok(!gl.__compiledSources.includes(POINT_VERTEX_SHADER_GL2));
});

// --- Process-level tests for scripts/serve.js direct-run detection ---
// These launch the server as a real child process from a directory whose
// path contains a space, verifying the fileURLToPath/path.resolve-based
// guard binds correctly regardless of characters that would be percent-
// encoded in a file:// URL (e.g. spaces), which a naive string-concatenation
// comparison against process.argv[1] would fail to match.

// Waits for the child server to log its actual bound port (assigned by the
// OS when launched with PORT=0, avoiding any parent-side reserve/release
// TOCTOU race on a fixed port number) and resolves with that port number.
function waitForServerReady(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('server did not start: ' + output)), timeoutMs);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/Serving .* at http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}: ${output}`));
    });
  });
}

// Sends a raw HTTP GET with an unnormalized request-target string, bypassing
// the URL parser's own '../'/'%2e%2e/' normalization so the exact bytes
// reach the server, exercising resolveSafePath()'s own traversal rejection.
function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    socket.on('data', (chunk) => { data += chunk.toString(); });
    socket.on('end', () => {
      const statusLine = data.split('\r\n')[0] || '';
      const match = statusLine.match(/HTTP\/1\.\d (\d+)/);
      resolve({ status: match ? Number(match[1]) : 0, raw: data });
    });
    socket.on('error', reject);
  });
}

test('scripts/serve.js binds when launched from a path containing spaces (200/400/200)', async (t) => {
  const spacedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge space shooter '));
  t.after(() => fs.rmSync(spacedDir, { recursive: true, force: true }));

  const scriptsDir = path.join(spacedDir, 'scripts');
  fs.mkdirSync(scriptsDir);
  fs.copyFileSync(
    path.resolve(__dirname, '..', 'scripts', 'serve.js'),
    path.join(scriptsDir, 'serve.js'),
  );
  fs.writeFileSync(path.join(spacedDir, 'index.html'), '<!doctype html><html></html>');

  const port = 39217;
  const child = spawn(process.execPath, [path.join(scriptsDir, 'serve.js')], {
    cwd: spacedDir,
    env: { ...process.env, PORT: '0' },
  });
  t.after(() => child.kill());

  const boundPort = await waitForServerReady(child);

  const ok = await fetch(`http://127.0.0.1:${boundPort}/index.html`);
  assert.equal(ok.status, 200);

  const malformed = await fetch(`http://127.0.0.1:${boundPort}/%ff%fe`);
  assert.equal(malformed.status, 400);

  // Note: fetch()'s URL parser normalizes '../' and even percent-encoded
  // '%2e%2e/' segments before the request is sent, so neither form reaches
  // our server as raw request-line bytes via fetch. Issue a raw HTTP
  // request line instead so the traversal attempt travels over the wire
  // unmodified, exercising resolveSafePath()'s own rejection logic.
  const traversal = await rawGet(boundPort, '/%2e%2e/%2e%2e/etc/passwd');
  assert.equal(traversal.status, 400);

  const healthyFollowup = await fetch(`http://127.0.0.1:${boundPort}/index.html`);
  assert.equal(healthyFollowup.status, 200);
});

test('scripts/serve.js binds when launched via a symlinked directory (direct-run detection survives realpath differences)', async (t) => {
  // Reproduces the macOS /var -> /private/var style temp-dir alias (and the
  // general case of a symlinked entrypoint/directory) on any platform: the
  // script is copied into a real directory, then launched via a symlink
  // pointing at that directory, so fileURLToPath(import.meta.url) and
  // path.resolve(process.argv[1]) are lexically different paths that must
  // still be recognized as the same file once canonicalized with realpath.
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-real-'));
  t.after(() => fs.rmSync(realDir, { recursive: true, force: true }));

  const scriptsDir = path.join(realDir, 'scripts');
  fs.mkdirSync(scriptsDir);
  fs.copyFileSync(
    path.resolve(__dirname, '..', 'scripts', 'serve.js'),
    path.join(scriptsDir, 'serve.js'),
  );
  fs.writeFileSync(path.join(realDir, 'index.html'), '<!doctype html><html></html>');

  const linkDir = path.join(os.tmpdir(), `forge-link-${process.pid}-${Date.now()}`);
  fs.symlinkSync(realDir, linkDir, 'dir');
  t.after(() => fs.rmSync(linkDir, { force: true }));

  const port = 39218;
  const child = spawn(process.execPath, [path.join(linkDir, 'scripts', 'serve.js')], {
    cwd: linkDir,
    env: { ...process.env, PORT: '0' },
  });
  t.after(() => child.kill());

  const boundPort = await waitForServerReady(child);

  const ok = await fetch(`http://127.0.0.1:${boundPort}/index.html`);
  assert.equal(ok.status, 200);
});

test('scripts/serve.js does not bind a port when imported (not run directly)', async () => {
  // Importing the module (done at the top of this file) must not have
  // started listening; assert the exported server's own listening state
  // directly, rather than racing to bind a fixed host port ourselves
  // (which is flaky under concurrent/shared test runners).
  assert.equal(server.listening, false);
});

test('scripts/serve.js defaults to port 4173 when PORT is unset', () => {
  const originalPort = process.env.PORT;
  delete process.env.PORT;
  try {
    assert.equal(resolvePort(), 4173);
  } finally {
    if (originalPort !== undefined) process.env.PORT = originalPort;
  }
});

test('scripts/serve.js rejects an invalid PORT env var', () => {
  const originalPort = process.env.PORT;
  process.env.PORT = 'not-a-port';
  try {
    assert.throws(() => resolvePort());
  } finally {
    if (originalPort !== undefined) process.env.PORT = originalPort;
    else delete process.env.PORT;
  }
});

test('createRenderer with reducedMotion never hides the player mesh for invulnerability blinking, across timer values that normally alternate', () => {
  const gl = createMockGl({ webgl2: true });
  const renderer = createRenderer(gl, { reducedMotion: true });

  const baseState = {
    state: 'playing',
    player: { x: 0, y: 0, z: 0, invulnerable: 0 },
    enemies: [],
    projectiles: [],
  };

  // Values chosen so Math.floor(invulnerable * 10) % 2 alternates between
  // 0 and 1 (the exact condition the non-reduced-motion blink uses), to
  // prove reduced-motion draws the mesh on every one of them rather than
  // skipping every other value.
  const invulnerableValues = [0.31, 0.42, 0.53, 0.64, 0.75, 0.86, 1.0, 1.21];
  for (const invulnerable of invulnerableValues) {
    gl.__drawMeshCalls.length = 0;
    gl.__isMeshDraw = false;
    const state = { ...baseState, player: { ...baseState.player, invulnerable } };
    renderer.render(state, 300, 300, 1 / 60);
    const meshDrawCount = gl.__drawMeshCalls.length;
    assert.ok(
      meshDrawCount >= 1,
      `expected the player mesh to be drawn (reducedMotion must not blink it) at invulnerable=${invulnerable}, got ${meshDrawCount} mesh draw(s)`
    );
  }
});

test('createRenderer without reducedMotion still blinks the player mesh (sanity check for the mock harness)', () => {
  const gl = createMockGl({ webgl2: true });
  const renderer = createRenderer(gl, { reducedMotion: false });

  const state = {
    state: 'playing',
    player: { x: 0, y: 0, z: 0, invulnerable: 0 },
    enemies: [],
    projectiles: [],
  };

  // Find an invulnerable value where floor(inv*10)%2 === 0 (should hide)
  // and one where it's 1 (should show), confirming the mock/harness can
  // observe the pre-existing blink behavior at all (guards against a
  // vacuously-passing reduced-motion test above).
  let sawHidden = false;
  let sawShown = false;
  for (const invulnerable of [0.31, 0.42, 0.53, 0.64, 0.75, 0.86, 1.0, 1.21]) {
    gl.__drawMeshCalls.length = 0;
    gl.__isMeshDraw = false;
    renderer.render({ ...state, player: { ...state.player, invulnerable } }, 300, 300, 1 / 60);
    if (gl.__drawMeshCalls.length === 0) sawHidden = true;
    else sawShown = true;
  }
  assert.ok(sawHidden && sawShown, 'expected blink behavior to alternate visibility without reducedMotion');
});
