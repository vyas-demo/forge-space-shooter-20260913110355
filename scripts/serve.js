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
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.split('?')[0]);
  } catch {
    return null; // malformed percent-encoding
  }

  if (pathname.includes('\0')) return null;

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

server.listen(PORT, HOST, () => {
  console.log(`Serving ${serveRoot} at http://${HOST}:${PORT}/`);
});
