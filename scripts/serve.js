// Dependency-free static file server bound to 127.0.0.1. Serves dist/ when
// present, else the source tree. Validates request paths and responds 400
// on malformed percent-encoding or path-traversal attempts without crashing.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const serveRoot = fs.existsSync(distDir) ? distDir : rootDir;

const HOST = '127.0.0.1';

// Resolves the port to bind from the PORT env var. Binding is deferred to
// the isDirectRun block below so importing this module (e.g. from tests)
// never attempts to parse or bind a port. PORT=0 asks the OS for an
// ephemeral free port instead of reserving one in advance (avoiding a
// TOCTOU race between checking and binding a port); the actually-assigned
// port is read back from server.address().port once listening starts. An
// explicitly-set but invalid PORT (non-integer, negative, or out of range)
// fails fast with a clear error rather than silently falling back.
function resolvePort() {
  if (process.env.PORT === undefined) return 4173;
  const parsed = Number(process.env.PORT);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid PORT env var: ${JSON.stringify(process.env.PORT)}`);
  }
  return parsed;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Resolves a request URL to a safe absolute path within serveRoot.
// Returns null if the path is malformed or attempts traversal.
function resolveSafePath(requestUrl) {
  const rawPathname = requestUrl.split('?')[0];

  // Reject traversal components before any decoding/normalization, since
  // path.normalize() would otherwise silently collapse '..' segments and
  // hide a traversal attempt behind what looks like a 404.
  if (hasTraversalSegment(rawPathname)) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return null; // malformed percent-encoding
  }

  if (pathname.includes('\0')) return null;
  if (hasTraversalSegment(pathname)) return null;

  let normalized = path.normalize(pathname);
  if (normalized === '/' || normalized === '') {
    normalized = '/index.html';
  }

  const resolved = path.resolve(serveRoot, '.' + normalized);
  const relative = path.relative(serveRoot, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null; // traversal attempt escaping serveRoot
  }

  return resolved;
}

// Returns true if any path segment is exactly '..' (a traversal component).
// Splits on both forward and backslash separators — some platforms treat
// backslashes as path separators, and an encoded backslash (%5c) surviving
// decodeURIComponent must still be classified as a traversal component
// rather than silently resolved away.
function hasTraversalSegment(p) {
  return p.split(/[/\\]/).some((segment) => segment === '..');
}

const server = http.createServer((req, res) => {
  try {
    const safePath = resolveSafePath(req.url);
    if (!safePath) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    fs.stat(safePath, (err, stat) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const filePath = stat.isDirectory() ? path.join(safePath, 'index.html') : safePath;

      // The lexical path-boundary check in resolveSafePath() only rejects
      // '..' segments; it does not (and cannot, without touching the
      // filesystem) detect a symlink located inside serveRoot whose target
      // points outside it. fs.stat/fs.readFile follow symlinks, so without
      // this extra check a request for an in-root symlink could disclose an
      // arbitrary file elsewhere on disk. Canonicalize both the served root
      // and the resolved file path with fs.realpath and re-verify
      // containment before reading, rejecting escapes with 400.
      fs.realpath(serveRoot, (rootErr, realRoot) => {
        if (rootErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
          return;
        }
        fs.realpath(filePath, (pathErr, realPath) => {
          if (pathErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
          }
          const relative = path.relative(realRoot, realPath);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Bad Request');
            return;
          }

          const ext = path.extname(realPath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';

          fs.readFile(realPath, (readErr, data) => {
            if (readErr) {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('Not Found');
              return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
          });
        });
      });
    });
  } catch (err) {
    // Defensive: never crash the process on a bad request.
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
  }
});

// Only start listening when this module is run directly (e.g. `npm start`),
// not when imported by tests, so test/serve tests can exercise
// resolveSafePath() without binding a port. Both sides are compared as
// filesystem paths (via fileURLToPath / path.resolve) rather than string-
// concatenating a file:// URL, since import.meta.url percent-encodes
// characters such as spaces while process.argv[1] does not, and the naive
// comparison also breaks on Windows drive-letter paths. Both paths are
// additionally canonicalized with fs.realpathSync so that OS-level symlinks
// (e.g. macOS's /var -> /private/var temp-directory alias, or an explicit
// symlinked entrypoint/directory) don't cause a false "not direct" result.
// realpathSync requires the path to exist on disk; any failure other than
// ENOENT (missing file) is a genuine, unexpected error and is rethrown
// rather than silently swallowed.
function realpathOrLexical(p) {
  try {
    return fs.realpathSync(p);
  } catch (err) {
    if (err && err.code === 'ENOENT') return p;
    throw err;
  }
}

const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  const modulePath = realpathOrLexical(fileURLToPath(import.meta.url));
  const entryPath = realpathOrLexical(path.resolve(process.argv[1]));
  return modulePath === entryPath;
})();

if (isDirectRun) {
  const PORT = resolvePort();
  server.listen(PORT, HOST, () => {
    const { port } = server.address();
    console.log(`Serving ${serveRoot} at http://${HOST}:${port}/`);
  });
}

export { resolveSafePath, hasTraversalSegment, server, resolvePort };
