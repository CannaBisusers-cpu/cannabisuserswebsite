#!/usr/bin/env node
// Simple repository secret scanner for CI / pre-commit
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const IGNORES = ['.git', 'node_modules', 'dist', 'build', '.netlify'];
const patterns = [
  /TWITCH_OAUTH/i,
  /TWITCH_CLIENT_ID/i,
  /Bearer\s+[A-Za-z0-9._\-]{10,}/i
];

const hits = [];

function isBinary(buffer) {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function scanDir(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    if (IGNORES.includes(it.name)) continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      scanDir(full);
    } else if (it.isFile()) {
      try {
        const buf = fs.readFileSync(full);
        if (isBinary(buf)) continue;
        const text = buf.toString('utf8');
        patterns.forEach(p => {
          if (p.test(text)) hits.push({ file: full, pattern: p.toString() });
        });
      } catch (e) {
        // ignore read errors
      }
    }
  }
}

scanDir(ROOT);
if (hits.length) {
  console.error('Secret scan found potential secrets:');
  hits.forEach(h => console.error(` - ${h.file} matches ${h.pattern}`));
  process.exitCode = 1;
} else {
  console.log('Secret scan: no obvious secrets found.');
}
