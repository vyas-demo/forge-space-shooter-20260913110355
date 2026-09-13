// node:test coverage for scripts/serve.js path-boundary validation:
// malformed percent-encoding and path-traversal requests return HTTP 400
// without crashing the process, and a symlink created inside the served
// root pointing outside the canonical root is rejected with 400 while a
// legitimate subsequent request still succeeds.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

import { resolveSafePath, hasTraversalSegment, server } from '../scripts/serve.js';

test('hasTraversalSegment detects .. components with either separator', () => {
  assert.equal(hasTraversalSegment('/a/../b'), true);
  assert.equal(hasTraversalSegment('/a/..\\b'), true);
  assert.equal(hasTraversalSegment('/a/b/c'), false);
});

test('resolveSafePath rejects raw traversal segments', () => {
  assert.equal(resolveSafePath('/../etc/passwd'), null);
  assert.equal(resolveSafePath('/a/../../b'), null);
});

test('resolveSafePath rejects malformed percent-encoding', () => {
  assert.equal(resolveSafePath('/%E0%A4%A'), null);
});

test('resolveSafePath normalizes root to index.html', () => {
  const resolved = resolveSafePath('/');
  assert.ok(resolved.endsWith(path.join('index.html')));
});

// The server object exported from scripts/serve.js is a live http.Server
// that is never .listen()-ed by the module itself (only under isDirectRun).
// These tests bind it to an ephemeral port to exercise the full
// request-handling path end to end, including the fs.realpath-based
// symlink containment check added to close the disclosure gap where an
// in-root symlink could point outside serveRoot.
function listenEphemeral(srv) {
  return new Promise((resolve, reject) => {
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
    srv.once('error', reject);
  });
}

function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: requestPath }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
  });
}

test('server returns 400 for malformed encoding and traversal, 200 for a legitimate path, without crashing', async (t) => {
  const port = await listenEphemeral(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const malformed = await get(port, '/%E0%A4%A');
  assert.equal(malformed.status, 400);

  const traversal = await get(port, '/../../../../etc/passwd');
  assert.equal(traversal.status, 400);

  // Server must still serve a legitimate request after the bad ones above
  // (i.e. it must not have crashed or entered a bad state).
  const ok = await get(port, '/index.html');
  assert.equal(ok.status, 200);
});

test('a symlink inside the served root pointing outside it is rejected with 400, and legitimate requests still succeed afterward', async (t) => {
  // Build a throwaway served root containing a symlink that escapes it, and
  // point a second server instance at that root by re-requiring the module
  // with an overridden root isn't possible (serveRoot is computed once at
  // module load from this file's location), so instead this test creates
  // the escaping symlink *inside the real serveRoot* (repo root or dist/)
  // pointing at a file outside it, exercising the exact code path the
  // running `server` instance uses.
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-outside-'));
  const secretFile = path.join(outsideDir, 'secret.txt');
  fs.writeFileSync(secretFile, 'top secret contents');

  // Determine the real served root the module is using by resolving a known
  // in-root file via resolveSafePath.
  const knownFile = resolveSafePath('/index.html');
  const servedRoot = path.dirname(knownFile);

  const linkName = `__test-escape-symlink-${process.pid}`;
  const linkPath = path.join(servedRoot, linkName);
  fs.rmSync(linkPath, { force: true });
  try {
    fs.symlinkSync(secretFile, linkPath);
  } catch (err) {
    // Symlink creation can require elevated privileges on some platforms
    // (notably Windows without developer mode). Skip in that case rather
    // than failing the whole suite for an environment limitation.
    t.skip(`symlink creation unavailable: ${err.message}`);
    return;
  }

  t.after(() => { fs.rmSync(linkPath, { force: true }); fs.rmSync(outsideDir, { recursive: true, force: true }); });

  const port = await listenEphemeral(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const escaped = await get(port, `/${linkName}`);
  assert.equal(escaped.status, 400);

  // The server must remain healthy and continue serving legitimate content.
  const ok = await get(port, '/index.html');
  assert.equal(ok.status, 200);
});
