// Assembles src/ into the single standalone deliverable: iron_arena.html
// Usage: node tools/build.mjs   (no dependencies)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const css = readFileSync(join(src, 'style.css'), 'utf8');
const js = readdirSync(join(src, 'js')).filter(f => f.endsWith('.js')).sort()
  .map(f => `// ───────────────────────── ${f} ─────────────────────────\n` + readFileSync(join(src, 'js', f), 'utf8')).join('\n');
let html = readFileSync(join(src, 'index.html'), 'utf8');
html = html.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
writeFileSync(join(root, 'iron_arena.html'), html);
console.log(`iron_arena.html  ${(html.length / 1024).toFixed(0)} KB, ${html.split('\n').length} lines`);
