// Dependency-free static site build: copies index.html, styles.css, src/**,
// and .nojekyll into dist/ for GitHub Pages hosting.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const ENTRIES = ['index.html', 'styles.css', 'src', '.nojekyll'];

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

async function build() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  for (const entry of ENTRIES) {
    const src = path.join(rootDir, entry);
    try {
      await fs.access(src);
    } catch {
      continue; // e.g. .nojekyll optional in some checkouts
    }
    await copyRecursive(src, path.join(distDir, entry));
  }

  console.log(`Build complete: ${distDir}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
