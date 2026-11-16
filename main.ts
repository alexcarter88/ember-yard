// Ember Yard's hand-in program. Node 22, standard library only.
//
// The game is game/ beside this file: plain static files the browser loads
// as ES modules, three.js arriving through the import map. The screenshots
// are screenshots/ beside it. This program stages both under the output
// directory and writes dossier.json there — the summary the judge reads —
// using the vendored make.fun library. The grader runs that same library
// again over what is handed in and expects the dossier to match byte for
// byte, so the caps below are the scorer's own caps.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath as urlToPath } from 'node:url';
import { buildDossier as makeDossier } from './vendor/makefun-threejs.ts';

const repo = urlToPath(new URL('.', import.meta.url));
const dest = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

fs.mkdirSync(dest, { recursive: true });
for (const name of ['game', 'screenshots']) {
  const from = path.join(repo, name);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(dest, name), { recursive: true });
}

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};
fs.writeFileSync(path.join(dest, 'dossier.json'), makeDossier(dest, caps));
