// Builds the CrazyGames upload from the standalone game:  node tools/build.mjs && node tools/build_crazygames.mjs
//   crazygames/game/                  the folder to upload: a single self-contained index.html (plus licences)
//   crazygames/iron-arena-crazygames.zip   the same folder as a zip
// Differences from iron_arena.html: three.js and the fonts are embedded (no requests at run time), the CrazyGames
// SDK v3 is loaded in <head>, and pause also sits on Backspace because Esc leaves fullscreen on the portal.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'crazygames'), game = join(out, 'game');
let html = readFileSync(join(root, 'iron_arena.html'), 'utf8');

// Everything is embedded in index.html: portals may serve the page from a URL that is not the upload folder
// (or block outside hosts), so the game must not need to fetch anything at run time.
// fonts: data-URI @font-face instead of Google Fonts
const faces = [['Barlow Condensed', 'barlow-condensed', [[500, 'normal'], [600, 'normal'], [700, 'normal'], [800, 'normal'], [700, 'italic'], [800, 'italic']]], ['Barlow', 'barlow', [[400, 'normal'], [500, 'normal'], [600, 'normal']]]];
const fontCss = faces.flatMap(([fam, file, ws]) => ws.map(([w, st]) => `@font-face{font-family:"${fam}";font-style:${st};font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(join(root, 'vendor/fonts', `${file}-latin-${w}-${st}.woff2`)).toString('base64')}) format("woff2")}`)).join('\n');
const before = html.length;
html = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '').replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/, '');
if (html.length === before) throw new Error('font links not found');
html = html.replace('<style>\n', () => '<style>\n' + fontCss + '\n');
// portal SDK, then the engine as a plain script that defines window.__THREE__ before the game module runs
const three = readFileSync(join(root, 'vendor/three.iife.min.js'), 'utf8');
if (/<\/script/i.test(three)) throw new Error('engine source contains </script');
const head = `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n<script>window.IA_BUILD = 'crazygames';</script>\n<script>/* three.js r160, MIT licence: see THIRD-PARTY-LICENSES.txt */\n${three}\n</script>\n`;
html = html.replace('<title>IRON ARENA</title>\n', () => '<title>IRON ARENA</title>\n' + head);
if (!html.includes('crazygames-sdk-v3') || !html.includes('var __THREE__=')) throw new Error('head insert failed');

rmSync(game, { recursive: true, force: true }); rmSync(join(out, 'iron-arena-crazygames.zip'), { force: true });   // only the build outputs; videos/ and SUBMISSION.md stay
mkdirSync(game, { recursive: true });
writeFileSync(join(game, 'index.html'), html);
writeFileSync(join(game, 'THIRD-PARTY-LICENSES.txt'), `IRON ARENA bundles the following third-party software. Everything else in this build is original.\n\n== three.js r160 (embedded in index.html) ==\n${readFileSync(join(root, 'vendor/three-LICENSE.txt'), 'utf8')}\n\n== Barlow and Barlow Condensed fonts (embedded in index.html) ==\n${readFileSync(join(root, 'vendor/fonts/OFL-Barlow.txt'), 'utf8')}\n`);
const zip = join(out, 'iron-arena-crazygames.zip');
execFileSync('zip', ['-r', '-9', '-q', '-X', zip, '.'], { cwd: game });
let total = 0, files = 0; const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f), s = statSync(p); if (s.isDirectory()) walk(p); else { total += s.size; files++; } } }; walk(game);
console.log(`crazygames/game: ${files} files, ${(total / 1024).toFixed(0)} KB · zip ${(statSync(zip).size / 1024).toFixed(0)} KB`);
