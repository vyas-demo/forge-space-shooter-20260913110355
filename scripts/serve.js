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

const PORT = Number(process.env.PORT) || 4173;
const HOST = '127.0.0.1';

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
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
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
// resolveSafePath() without binding a port.
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, HOST, () => {
    console.log(`Serving ${serveRoot} at http://${HOST}:${PORT}/`);
  });
}

export { resolveSafePath, hasTraversalSegment, server };
