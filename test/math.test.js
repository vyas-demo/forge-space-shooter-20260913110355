import test from 'node:test';
import assert from 'node:assert/strict';
import * as vec3 from '../src/math/vec3.js';
import * as mat4 from '../src/math/mat4.js';
import { resolveSafePath, hasTraversalSegment } from '../scripts/serve.js';

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
