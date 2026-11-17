// Token Radar: a token-radar-01 entry for Node 22, standard library only.
//
// Pipeline, in order:
//   1. Read the sealed snapshot (the /input mount, or --input <snapshot.json|directory>).
//   2. Score every pre-token protocol with the peer-multiple model in lib/model.ts.
//   3. Refuse a board the gate would refuse, before writing anything.
//   4. Write board.json and data.js, copy dashboard/ and screenshots/, then dossier.json.
//
// The dashboard is a static page with no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read the data.js this program writes beside them, so the
// page a reader opens shows exactly the board this run scored. The dossier is written last because
// the scorer rebuilds it from /output and compares the bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The directory this file lives in, so dashboard/ and screenshots/ are found beside it. */
const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): text_max_bytes shapes the dossier, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const DASHBOARD_LIMIT = { max_files: 400, max_bytes: 4_194_304 };
const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
/** How many screenshots the hand-in needs: the board, a detail view and a filtered view. */
const REQUIRED_SHOTS = 3;

/** Write a message to stderr and leave with `code` (1 for a bad board, 2 for a bad invocation). */
function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/**
 * The value of `--name <value>` or `--name=<value>` in the arguments, or `fallback` when the flag
 * is absent. A flag with no value after it is read as absent, not as an empty value.
 */
function readFlag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

/** The short usage text --help prints. */
function usage(): string {
  return [
    'token radar: rank pre-token protocols by implied launch value',
    '  node main.ts [--input <snapshot.json|directory>] [--output <directory>]',
    '  --input defaults to /input, --output to $MAKEFUN_OUTPUT_DIR or /output',
    '  --help prints this and exits',
    '  outputs: board.json, data.js, dashboard/, screenshots/ and dossier.json',
    '',
  ].join('\n');
}

if (process.argv.includes('--help')) {
  process.stdout.write(usage());
  process.exit(0);
}

const inputArg = readFlag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(
    `no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`,
    2,
  );
}
const outputDir = readFlag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) fail(`the model wrote a board the gate refuses: ${problem}`, 1);

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

/**
 * Copy one directory's regular files into `to`, skipping names that start with a dot, and return
 * the names copied, in directory order. A missing source directory copies nothing.
 */
function copyPlainFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyPlainFiles(join(here, 'dashboard'), join(outputDir, 'dashboard'));
const shots = copyPlainFiles(join(here, 'screenshots'), join(outputDir, 'screenshots'));

/** Refuse a hand-in whose screenshots are too few or badly named, naming the first fault found. */
function checkShots(names: string[]): void {
  if (names.length < REQUIRED_SHOTS) {
    fail(
      `screenshots/ holds ${names.length} image${names.length === 1 ? '' : 's'}: hand in ${REQUIRED_SHOTS}, the board, a detail view and a filtered view`,
      1,
    );
  }
  for (const name of names) {
    if (!SCREENSHOT_NAME.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
  }
}

checkShots(shots);

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_LIMIT, dashboard: DASHBOARD_LIMIT }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outputDir, 'board.json')}, ${join(outputDir, 'data.js')}, ${join(outputDir, 'dashboard')} (3 files), ${join(outputDir, 'screenshots')} (${shots.length} images) and ${join(outputDir, 'dossier.json')}\n`,
);
