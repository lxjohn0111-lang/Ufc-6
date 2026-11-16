// Builds the CrazyGames upload from the standalone game:  node tools/build.mjs && node tools/build_crazygames.mjs
//   crazygames/game/                  the folder to upload (index.html at its root, every path relative)
//   crazygames/iron-arena-crazygames.zip   the same folder as a zip
// Differences from iron_arena.html: three.js and the fonts are bundled (no CDN requests), the CrazyGames
// SDK v3 is loaded in <head>, and pause also sits on Backspace because Esc leaves fullscreen on the portal.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'crazygames'), game = join(out, 'game');
let html = readFileSync(join(root, 'iron_arena.html'), 'utf8');

// fonts: local @font-face instead of Google Fonts
const faces = [['Barlow Condensed', 'barlow-condensed', [[500, 'normal'], [600, 'normal'], [700, 'normal'], [800, 'normal'], [700, 'italic'], [800, 'italic']]], ['Barlow', 'barlow', [[400, 'normal'], [500, 'normal'], [600, 'normal']]]];
const fontCss = faces.flatMap(([fam, file, ws]) => ws.map(([w, st]) => `@font-face{font-family:"${fam}";font-style:${st};font-weight:${w};font-display:swap;src:url(fonts/${file}-latin-${w}-${st}.woff2) format("woff2")}`)).join('\n');
const before = html.length;
html = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '').replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/, '');
if (html.length === before) throw new Error('font links not found');
html = html.replace('<style>\n', '<style>\n' + fontCss + '\n');
// portal SDK + local engine, before the game module runs
const head = `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n<script>window.IA_BUILD = 'crazygames'; window.IA_THREE = new URL('lib/three.module.min.js', location.href).href;</script>\n`;
html = html.replace('<title>IRON ARENA</title>\n', '<title>IRON ARENA</title>\n' + head);
if (!html.includes('crazygames-sdk-v3')) throw new Error('head insert failed');
if (/fonts\.googleapis|cdn\.jsdelivr|unpkg\.com/.test(html.replace(/const THREE_URLS[^\n]*\n(\s+`[^`]*`,?\n)+/, ''))) console.warn('note: CDN URLs remain only as the unused fallback list');

rmSync(game, { recursive: true, force: true }); rmSync(join(out, 'iron-arena-crazygames.zip'), { force: true });   // only the build outputs; videos/ and SUBMISSION.md stay
mkdirSync(join(game, 'lib'), { recursive: true }); mkdirSync(join(game, 'fonts'), { recursive: true });
writeFileSync(join(game, 'index.html'), html);
copyFileSync(join(root, 'vendor/three.module.min.js'), join(game, 'lib/three.module.min.js'));
for (const f of readdirSync(join(root, 'vendor/fonts'))) if (f.endsWith('.woff2')) copyFileSync(join(root, 'vendor/fonts', f), join(game, 'fonts', f));
writeFileSync(join(game, 'THIRD-PARTY-LICENSES.txt'), `IRON ARENA bundles the following third-party software. Everything else in this build is original.\n\n== three.js r160 (lib/three.module.min.js) ==\n${readFileSync(join(root, 'vendor/three-LICENSE.txt'), 'utf8')}\n\n== Barlow and Barlow Condensed fonts (fonts/*.woff2) ==\n${readFileSync(join(root, 'vendor/fonts/OFL-Barlow.txt'), 'utf8')}\n`);
const zip = join(out, 'iron-arena-crazygames.zip');
execFileSync('zip', ['-r', '-9', '-q', '-X', zip, '.'], { cwd: game });
let total = 0, files = 0; const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f), s = statSync(p); if (s.isDirectory()) walk(p); else { total += s.size; files++; } } }; walk(game);
console.log(`crazygames/game: ${files} files, ${(total / 1024).toFixed(0)} KB · zip ${(statSync(zip).size / 1024).toFixed(0)} KB`);
