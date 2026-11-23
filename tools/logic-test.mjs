// Logic self-test: extracts the simulation core from ../js/main.js verbatim
// (real shipped code, real declaration order within the assembled module) and
// verifies the world/rule engine, the Replicator, and determinism.
// Run: node tools/logic-test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const sharedSeeds = JSON.parse(readFileSync(new URL('./fixtures/world-seeds.json', import.meta.url), 'utf8'));

function extractFn(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`fn not found: ${name}`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced: ${name}`);
}
function extractDecl(name) {
  const m = src.match(new RegExp(`^(?:const|let) ${name} = `, 'm'));
  if (!m) throw new Error(`decl not found: ${name}`);
  let i = src.indexOf('=', m.index), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if ('[{('.includes(c)) depth++;
    else if (']})'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return src.slice(m.index, i + 1);
  }
  throw new Error(`no terminator: ${name}`);
}

const v8Block = src.slice(src.indexOf('/* ── v8 New Worlds'), src.indexOf('/* ── Pilot progression'));
const decls = ['R_PENTOMINO_ROWS', 'GLIDER_ROWS', 'PULSAR_ROWS', 'GUN_ROWS', 'LWSS_ROWS', 'ACORN_ROWS',
  'SIMKIN_ROWS', 'REPLICATOR_ROWS', 'DOMINATOR', 'harmony', 'fires', 'pollenGens', 'auroraTtl',
  'eventCountdown', 'meteor', 'pilot', 'TOOL_CATALOG', 'memoryGain', 'towerLifespan', 'orbCount',
  'orbValue', 'collectRadius']
  .map(extractDecl).join('\n');
const fns = ['rnd', 'rndRange', 'seedWorld', 'stepSimulation', 'updateInstability', 'detonate', 'spreadFire',
  'triggerWildfire', 'triggerRandomEvent', 'douseFires', 'inStasis', 'updateStasis', 'refreshPopulation',
  'addXP', 'xpForNext', 'checkLevelUnlocks', 'seedRainAt', 'dailyDateString', 'dailySeedHash', 'startDaily',
  'unlockedTools', 'cycleTool'].map(extractFn).join('\n\n');

const harness = `
/* ═══ STUB ENVIRONMENT ═══ */
const GRID = 64, TOTAL = GRID * GRID, MAX_AGE = 65, HISTORY_LIMIT = 3.0;
const EXPLOSION_RADIUS = 4, EXPLOSION_COOLDOWN = 12, MAX_EXPLOSIONS_PER_GEN = 3;
const MAX_DEBRIS_SEEDS = 12, HISTORY_MAX = 100, ORB_VALUE = 5, STASIS_RADIUS = 5, STASIS_GENS = 30;
const TOWER_LIFESPAN = 40, OSCILLATOR_MAX_CELLS = 64;
let cells = new Uint8Array(TOTAL), nextCells = new Uint8Array(TOTAL), ages = new Uint16Array(TOTAL);
let history = new Float32Array(TOTAL), heights = new Float32Array(TOTAL);
let cooldowns = new Uint8Array(TOTAL), warnings = new Uint8Array(TOTAL);
let snapshots = [], tracks = new Map(), queue = [], blasts = [], historyFrames = [], stasisBubbles = [];
let generations = 0, explosionsTotal = 0, lastExplosion = 'NONE', dailyMode = false, dailyScored = false;
let population = 0, maxPopulation = 0, biomass = 20, historyMode = false, running = true;
let rngState = null, shake = 0, lastToastAt = 0, lastRecordToastAt = 0, firesOut = 0;
const toasts = [], orbLog = [];
const AudioSys = { pop() {}, blip() {}, fanfare() {}, buy() {}, err() {} };
const THREE = { Color: class {}, Vector3: class {} };
const camera = { position: { distanceTo: () => 10 } };
const performance = { now: () => Date.now() };
function toast() {} function savePilot() {} function refreshUpgradeModal() {} function refreshToolCatalog() {} function selectTool() {}
function refreshWorldButtons() {} function checkContract() {} function findOscillators() {}
function scoreDaily() { dailyScored = true; }
function cellWorld(cx, cz) { return { x: cx, z: cz }; }
function spawnBlastRing() {} function spawnParticles() {} function spawnOrbs(c, z, n) { orbLog.push(n); }
function idxOf(x, z) { return z * GRID + x; }
function triggerMeteor() {}
`;

const tests = `
/* ═══ TESTS ═══ */
let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : ' — ' + e)); };
const pop = () => { let p = 0; for (const v of cells) if (v) p++; return p; };
const setActive = id => { activeWorld = WORLDS_BY_ID[id]; };

// T1 worlds + parsed masks
check('T1 four worlds, masks parsed', WORLDS.length === 4 && WORLDS.every(w => Number.isInteger(w.birthMask) && Number.isInteger(w.surviveMask)));

// T2 glider moves one diagonal step per 4 gens in Life AND HighLife
function glider(id) {
  setActive(id); cells.fill(0); ages.fill(0);
  const G = ['.O.', '..O', 'OOO'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (G[r][c] === 'O') cells[idxOf(30 + c, 30 + r)] = 1;
  const bx = 31 + 32 + 30 + 31 + 32, bz = 30 + 31 + 32 + 32 + 32;
  for (let g = 0; g < 4; g++) stepSimulation();
  let n = 0, sx = 0, sz = 0;
  for (let z = 28; z < 36; z++) for (let x = 28; x < 36; x++) if (cells[idxOf(x, z)]) { n++; sx += x; sz += z; }
  return { n, dx: sx - bx, dz: sz - bz };
}
const gl = glider('life'), gh = glider('highlife');
check('T2 glider (+5,+5) in Life', gl.n === 5 && gl.dx === 5 && gl.dz === 5, JSON.stringify(gl));
check('T2 glider identical in HighLife', gh.n === 5 && gh.dx === 5 && gh.dz === 5, JSON.stringify(gh));

// T3 replicator clones under HighLife (12 → ~24 @12 → ~48 @36)
setActive('highlife'); cells.fill(0); ages.fill(0);
for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (REPLICATOR_ROWS[r][c] === 'O') cells[idxOf(28 + c, 28 + r)] = 1;
const m = {};
for (let g = 0; g <= 36; g++) { if (g === 0 || g === 12 || g === 36) m[g] = pop(); if (g < 36) stepSimulation(); }
check('T3 replicator clones 12→24→48', m[0] === 12 && m[12] >= 20 && m[36] >= 40, JSON.stringify(m));

// T4 same pattern under plain Life ≠ clean cloning
setActive('life'); cells.fill(0); ages.fill(0);
for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (REPLICATOR_ROWS[r][c] === 'O') cells[idxOf(28 + c, 28 + r)] = 1;
for (let g = 0; g < 36; g++) stepSimulation();
check('T4 under Life the same pattern evolves differently', pop() !== 48, 'pop ' + pop());

// T5 world-gen shapes
function density(id, seed) { setActive(id); rngState = seed; seedWorld(); return pop() / TOTAL; }
const dLife = density('life', 2026), dDN = density('daynight', 2026), dCr = density('crystal', 2026), dHL = density('highlife', 2026);
check('T5 life/highlife 8-18%', dLife > 0.08 && dLife < 0.18 && dHL > 0.08 && dHL < 0.18, (dLife * 100).toFixed(1) + '%/' + (dHL * 100).toFixed(1) + '%');
check('T5 daynight soup 40-50%', dDN > 0.40 && dDN < 0.50, (dDN * 100).toFixed(1) + '%');
check('T5 crystal starts <2%', dCr < 0.02, (dCr * 100).toFixed(1) + '%');

// T6 determinism per world
setActive('highlife'); rngState = 987654321; seedWorld();
const a = new Uint8Array(cells);
rngState = 987654321; seedWorld();
let same = true;
for (let i = 0; i < TOTAL; i++) if (a[i] !== cells[i]) { same = false; break; }
check('T6 same seed + world → identical world', same);

// Cross-runtime seed fixtures compare the complete board, not just population.
const sharedSeeds = ${JSON.stringify(sharedSeeds)};
for (const [id, expected] of Object.entries(sharedSeeds.worlds)) {
  setActive(id); rngState = sharedSeeds.seed; seedWorld();
  let hash = 2166136261;
  for (const cell of cells) hash = Math.imul(hash ^ cell, 16777619) >>> 0;
  check('shared seed fixture: ' + id, pop() === expected.population && hash === expected.cell_hash,
        'population ' + pop() + ', hash ' + hash);
}

for (const [date, expected] of Object.entries(sharedSeeds.dates))
  check('shared daily hash fixture: ' + date, dailySeedHash(date) === expected);

// T7 tower lifespans per world
setActive('crystal'); const t60 = towerLifespan();
setActive('life'); const t40 = towerLifespan();
check('T7 tower lifespan 60 crystal / 40 life', t60 === 60 && t40 === 40, t60 + '/' + t40);

// T8 crystals grow + get mined
setActive('crystal'); rngState = 777; seedWorld();
const start = pop();
for (let g = 0; g < 150; g++) stepSimulation();
check('T8 crystals grow >10x and detonations mine', pop() > start * 10 && explosionsTotal > 0, 'start ' + start + ' end ' + pop() + ' expl ' + explosionsTotal);

console.log('');
console.log('════ LOGIC RESULT: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
`;

const dir = mkdtempSync(join(tmpdir(), 'evo-logic-'));
writeFileSync(join(dir, 'assembled.mjs'),
  harness + '\n/* ═══ REAL v8 WORLDS BLOCK (verbatim) ═══ */\n' + v8Block +
  '\n/* ═══ REAL SHIPPED CODE ═══ */\n' + decls + '\n\n' + fns + '\n' + tests);
await import(join(dir, 'assembled.mjs'));
