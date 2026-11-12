/* ════════════════════════════════════════════════════════════════
   EVOLUTION — Living Terrain (web version, mirrors main.gd)
   Conway B3/S23, 3 species, age-height + terrain memory.
   Cellular Instability: towers explode at age 40 (radius-4 craters,
   chain reactions, debris seeding); oscillators (periods 2-6)
   detonate after 12 cycles.
   Gardener economy: harvest biomass orbs at blast sites, spend on
   seed tools (4-9), complete contracts. Free-fly + F/G painting.
   ════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer } from '../lib/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/postprocessing/UnrealBloomPass.js';

/* ─────────────────────────── CONFIG ─────────────────────────── */
const GRID = 48, TOTAL = GRID * GRID, SPACING = 1.15;
const MAX_AGE = 65, HISTORY_LIMIT = 1.0;
const PALETTE = [new THREE.Color(0.15, 0.93, 1.0), new THREE.Color(1.0, 0.24, 0.72), new THREE.Color(0.54, 1.0, 0.38)];
const ORANGE = new THREE.Color(1.0, 0.52, 0.26);
const REDHOT = new THREE.Color(1.0, 0.16, 0.04);
const GHOST_A = new THREE.Color(0.06, 0.14, 0.26), GHOST_B = new THREE.Color(0.19, 0.26, 0.42);

/* Cellular Instability (mirrors main.gd) */
const TOWER_LIFESPAN = 40, OSCILLATOR_CYCLES = 12, EXPLOSION_RADIUS = 4;
const MAX_EXPLOSIONS_PER_GEN = 3, EXPLOSION_COOLDOWN = 12;
const OSCILLATOR_MAX_CELLS = 64, MAX_DEBRIS_SEEDS = 12;
const VISUAL_INTERVAL = 1 / 20;

/* Gardener economy (mirrors main.gd) */
const ORB_VALUE = 5, ORB_TTL = 20.0, STASIS_RADIUS = 5, STASIS_GENS = 30, STARTING_BIOMASS = 20;
const R_PENTOMINO_ROWS = ['.XX', 'XX.', '.X.'];
const GLIDER_ROWS = ['.O.', '..O', 'OOO'];
const PULSAR_ROWS = [
  '..OOO...OOO..',
  '.............',
  'O....O.O....O',
  'O....O.O....O',
  'O....O.O....O',
  '..OOO...OOO..',
  '.............',
  '..OOO...OOO..',
  'O....O.O....O',
  'O....O.O....O',
  'O....O.O....O',
  '.............',
  '..OOO...OOO..',
];
const GUN_ROWS = [
  '........................O...........',
  '......................O.O...........',
  '............OO......OO............OO',
  '...........O...O....OO............OO',
  'OO........O.....O...OO..............',
  'OO........O...O.OO....O.O...........',
  '..........O.....O.......O...........',
  '...........O...O....................',
  '............OO......................',
];
const TOOLS = {
  '4': { name: 'R-pentomino', cost: 5, rows: R_PENTOMINO_ROWS },
  '5': { name: 'Glider', cost: 10, rows: GLIDER_ROWS },
  '6': { name: 'Pulsar', cost: 25, rows: PULSAR_ROWS, centered: true },
  '7': { name: 'Seed Rain', cost: 20, kind: 'rain' },
  '8': { name: 'Stasis Field', cost: 15, kind: 'stasis' },
  '9': { name: 'Glider Gun', cost: 60, rows: GUN_ROWS },
};
const CONTRACTS = [
  { id: 'collect', text: 'Harvest 15 biomass from blast sites', target: 15, reward: 10 },
  { id: 'paint', text: 'Seed 25 cells with the brush (F)', target: 25, reward: 15 },
  { id: 'explode', text: 'Witness 3 detonations', target: 3, reward: 20 },
  { id: 'balance', text: 'Grow 40+ living cells of all 3 species', target: 3, reward: 25 },
  { id: 'tools', text: 'Use 3 different seed tools', target: 3, reward: 25 },
  { id: 'journal', text: 'Discover 6 lifeforms (J for journal)', target: 6, reward: 30 },
  { id: 'pop', text: 'Grow the population to 400', target: 400, reward: 30 },
  { id: 'gen300', text: 'Sustain the world to generation 300', target: 300, reward: 40 },
  { id: 'master', text: 'MASTER GARDENER: gen 600, 300 alive, 100 biomass', target: 3, reward: 100 },
];

/* Field journal: named lifeforms, matched by shape signature (all 4 rotations + mirrors) */
const JOURNAL = [
  { name: 'Block', rows: ['OO', 'OO'], desc: 'still life' },
  { name: 'Tub', rows: ['.O.', 'O.O', '.O.'], desc: 'still life' },
  { name: 'Boat', rows: ['OO.', 'O.O'], desc: 'still life' },
  { name: 'Beehive', rows: ['.OO.', 'O..O', '.OO.'], desc: 'still life' },
  { name: 'Loaf', rows: ['.OO.', 'O..O', '.O.O', '.O..'], desc: 'still life' },
  { name: 'Blinker', rows: ['OOO'], desc: 'oscillator, period 2' },
  { name: 'Toad', rows: ['.OOO', 'OOO.'], desc: 'oscillator, period 2' },
  { name: 'Beacon', rows: ['OO..', 'OO..', '..OO', '..OO'], desc: 'oscillator, period 2' },
  { name: 'Glider', rows: ['.O.', '..O', 'OOO'], desc: 'spaceship, c/4 diagonal' },
  { name: 'Lightweight Ship', rows: ['.O..O', 'O....', 'O...O', 'OOOO.'], desc: 'spaceship, c/2 orthogonal' },
  { name: 'Pulsar', rows: PULSAR_ROWS, desc: 'oscillator, period 3' },
  { name: 'Glider Gun', rows: GUN_ROWS, desc: 'Gosper gun — endless gliders' },
];
const SIG_MAP = (() => {
  const pts = rows => { const a = []; for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] !== '.') a.push([c, r]); return a; };
  const sig = p => { const mx = Math.min(...p.map(q => q[0])), mz = Math.min(...p.map(q => q[1])); return p.map(q => [q[0] - mx, q[1] - mz]).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(q => q.join(',')).join(';'); };
  const rot = rows => { const R = rows.length, C = rows[0].length; const out = Array.from({ length: C }, () => Array(R).fill('.')); for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) out[c][R - 1 - r] = rows[r][c]; return out.map(a => a.join('')); };
  const mir = rows => rows.map(r => r.split('').reverse().join(''));
  const map = new Map();
  for (const p of JOURNAL) {
    const variants = [p.rows];
    for (let i = 0; i < 3; i++) variants.push(rot(variants[variants.length - 1]));
    variants.push(mir(p.rows));
    for (let i = 0; i < 3; i++) variants.push(rot(variants[variants.length - 1]));
    const seen = new Set();
    for (const v of variants) {
      const key = v.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const s = sig(pts(v));
      if (!map.has(s)) map.set(s, p.name);
    }
  }
  return map;
})();

const $ = id => document.getElementById(id);
const canvas = $('game-canvas');

/* ─────────────────────────── STATE ──────────────────────────── */
let cells = new Uint8Array(TOTAL), nextCells = new Uint8Array(TOTAL);
let ages = new Uint16Array(TOTAL), history = new Float32Array(TOTAL), heights = new Float32Array(TOTAL);
let cooldowns = new Int32Array(TOTAL), warnings = new Int32Array(TOTAL);
let generations = 0, population = 0, running = true, memoryEnabled = true;
let generationInterval = 0.35, heightScale = 1.0, accumulated = 0, visualElapsed = 0;
let overview = false, brushSpecies = 1, started = false;
let snapshots = [], tracks = new Map(), queue = [], blasts = [];
let explosionsTotal = 0, lastExplosion = 'NONE', lastToastAt = 0;
let shake = 0;

/* Gardener economy */
let biomass = 0, biomassCollectedTotal = 0, paintedCells = 0, maxPopulation = 0;
let toolsUsed = new Set(), contractIndex = 0, lastOrbToastAt = 0;
let discoveries = new Set();

/* Day/night + bloom */
let dayNightEnabled = true, dayTime = 0, worldBrightness = 1;
const DAY_LENGTH = 150;
const BASE_BG = new THREE.Color(0.009, 0.014, 0.034);
const BASE_FLOOR = new THREE.Color(0.025, 0.045, 0.085);
let bloomEnabled = true;
let starsMat = null;

/* v5: replay history, daily challenge, minimap */
const HISTORY_MAX = 100;
let historyFrames = [], historyMode = false, historyView = 0, wasRunningBeforeHistory = true;
let rngState = null; // null = free random; int = deterministic (daily)
let dailyMode = false, dailyScored = false;
let minimapOn = true, minimapTimer = 0;
const MM_COLORS = ['#26e3ff', '#ff3db8', '#8aff61'];

/* ─────────────────────────── AUDIO (light) ──────────────────── */
const AudioSys = {
  ctx: null, master: null, muted: false, lastPop: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    } catch (e) { }
  },
  tone(freq0, freq1, dur, gain, type = 'sine', delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq0, t);
    if (freq1 !== freq0) o.frequency.exponentialRampToValueAtTime(freq1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  pop(big = false) {
    const now = performance.now(); if (now - this.lastPop < 90) return; this.lastPop = now;
    this.tone(big ? 220 : 380, 60, big ? 0.5 : 0.22, big ? 0.22 : 0.10);
  },
  blip() { this.tone(880, 1420, 0.09, 0.08); },
  buy() { this.tone(520, 660, 0.08, 0.09); this.tone(660, 880, 0.09, 0.09, 'sine', 0.07); },
  fanfare() { this.tone(523, 523, 0.16, 0.12); this.tone(784, 784, 0.28, 0.12, 'sine', 0.14); },
  err() { this.tone(150, 110, 0.14, 0.10, 'sawtooth'); },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.4; },
};

/* ─────────────────────────── THREE SETUP ────────────────────── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0.009, 0.014, 0.034);
scene.fog = new THREE.FogExp2(0x05060f, 0.006);

const camera = new THREE.PerspectiveCamera(78, 1, 0.1, 650);
camera.rotation.order = 'YXZ';
camera.position.set(0, 16, 32);
let yaw = 0, pitch = -0.30;

/* Bloom post-processing (toggle B) */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.7, 0.45);
composer.addPass(bloomPass);

scene.add(new THREE.AmbientLight(new THREE.Color(0.25, 0.33, 0.52), 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-30, 50, 20); scene.add(sun);

/* Floor */
const floorMesh = new THREE.Mesh(
  new THREE.BoxGeometry(GRID * SPACING + 2, 0.25, GRID * SPACING + 2),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(0.025, 0.045, 0.085), metalness: 0.5, roughness: 0.52 }));
floorMesh.position.y = -0.20; scene.add(floorMesh);

/* Stars */
{
  const N = 700, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 400; pos[i * 3 + 1] = Math.random() * 160; pos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    c.setHSL(Math.random() < 0.3 ? 0.85 : 0.52, 0.8, 0.55 + Math.random() * 0.4);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  starsMat = new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.Points(g, starsMat));
}

/* Pillars — unshaded (flat neon, mirrors Godot) */
const pillarGeo = new THREE.BoxGeometry(0.91, 1, 0.91);
const pillarMat = new THREE.MeshBasicMaterial({});
const pillarsMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, TOTAL);
pillarsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pillarsMesh.frustumCulled = false;
scene.add(pillarsMesh);
{ const c = new THREE.Color(0xffffff); for (let i = 0; i < TOTAL; i++) pillarsMesh.setColorAt(i, c); }

/* Particles */
const P_MAX = 2000;
const pPos = new Float32Array(P_MAX * 3), pCol = new Float32Array(P_MAX * 3);
const pVel = new Float32Array(P_MAX * 3), pLife = new Float32Array(P_MAX), pMaxLife = new Float32Array(P_MAX);
const pBaseCol = new Float32Array(P_MAX * 3);
let pCursor = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
particles.frustumCulled = false; scene.add(particles);
for (let i = 0; i < P_MAX; i++) pPos[i * 3 + 1] = -9999;
const _pc = new THREE.Color();
function spawnParticles(wx, wy, wz, color, count, speed = 6, life = 0.8) {
  _pc.copy(color);
  for (let n = 0; n < count; n++) {
    const i = pCursor; pCursor = (pCursor + 1) % P_MAX;
    pPos[i * 3] = wx; pPos[i * 3 + 1] = wy; pPos[i * 3 + 2] = wz;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = speed * (0.4 + Math.random() * 0.9);
    pVel[i * 3] = sp * Math.sin(ph) * Math.cos(th); pVel[i * 3 + 1] = sp * Math.cos(ph) + 1.0; pVel[i * 3 + 2] = sp * Math.sin(ph) * Math.sin(th);
    pBaseCol[i * 3] = _pc.r; pBaseCol[i * 3 + 1] = _pc.g; pBaseCol[i * 3 + 2] = _pc.b;
    pLife[i] = 0; pMaxLife[i] = life * (0.6 + Math.random() * 0.8);
  }
}
function updateParticles(dt) {
  for (let i = 0; i < P_MAX; i++) {
    if (pLife[i] >= pMaxLife[i]) { if (pPos[i * 3 + 1] !== -9999) { pPos[i * 3 + 1] = -9999; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; } continue; }
    pLife[i] += dt;
    const f = Math.max(0, 1 - pLife[i] / pMaxLife[i]);
    pVel[i * 3 + 1] -= 3.0 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    pCol[i * 3] = pBaseCol[i * 3] * f; pCol[i * 3 + 1] = pBaseCol[i * 3 + 1] * f; pCol[i * 3 + 2] = pBaseCol[i * 3 + 2] * f;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

/* Blast rings (expanding spheres, mirrors Godot blast nodes) */
const blastPool = [];
{
  const geo = new THREE.SphereGeometry(1, 24, 12);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.55, 0.15), transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; scene.add(m);
    blastPool.push({ mesh: m, ttl: 0 });
  }
}
function spawnBlastRing(wx, wz) {
  const b = blastPool.find(b => b.ttl <= 0); if (!b) return;
  b.ttl = 0.65;
  b.mesh.visible = true;
  b.mesh.position.set(wx, 3, wz);
  b.mesh.scale.set(1, 1, 1);
}
function updateBlasts(dt) {
  for (const b of blastPool) {
    if (b.ttl <= 0) continue;
    b.ttl -= dt;
    if (b.ttl <= 0) { b.mesh.visible = false; b.mesh.material.opacity = 0; continue; }
    const life = 1 - b.ttl / 0.65, s = 1 + life * 12;
    b.mesh.scale.set(s, s * 0.7, s);
    b.mesh.material.opacity = 0.55 * (b.ttl / 0.65);
  }
}
const cellWorld = (x, z) => ({ x: (x - (GRID - 1) / 2) * SPACING, z: (z - (GRID - 1) / 2) * SPACING });

/* Biomass orbs (harvestables) */
const orbPool = [];
{
  const geo = new THREE.SphereGeometry(0.30, 16, 8);
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    m.visible = false; scene.add(m);
    orbPool.push({ mesh: m, active: false, ttl: 0, value: ORB_VALUE, base: new THREE.Vector3(), phase: 0 });
  }
}
function spawnOrbs(cx, cz, count) {
  const w = cellWorld(cx, cz);
  for (let k = 0; k < count; k++) {
    const o = orbPool.find(o => !o.active); if (!o) return;
    const angle = Math.random() * Math.PI * 2, dist = 1 + Math.random() * (EXPLOSION_RADIUS - 1);
    o.base.set(w.x + Math.cos(angle) * dist * SPACING, 2.2, w.z + Math.sin(angle) * dist * SPACING);
    o.active = true; o.ttl = ORB_TTL; o.phase = Math.random() * Math.PI * 2;
    o.mesh.visible = true; o.mesh.position.copy(o.base); o.mesh.scale.set(1, 1, 1);
  }
}
function updateOrbs(dt, time) {
  for (const o of orbPool) {
    if (!o.active) continue;
    o.ttl -= dt;
    o.mesh.position.set(o.base.x, o.base.y + Math.sin(o.phase + time * 0.002) * 0.35, o.base.z);
    if (o.ttl < 4) {
      const s = Math.min(1, Math.max(0.33, o.ttl / 4));
      o.mesh.scale.set(s, s, s);
    }
    if (camera.position.distanceTo(o.base) < 2.6) {
      biomass += o.value; biomassCollectedTotal += o.value;
      AudioSys.blip();
      const now = performance.now();
      if (now - lastOrbToastAt > 1200) { lastOrbToastAt = now; toast(`⚡ <b>+${o.value} biomass</b>`, 1500, 'gold'); }
      o.active = false; o.mesh.visible = false;
      continue;
    }
    if (o.ttl <= 0) { o.active = false; o.mesh.visible = false; }
  }
}

/* Stasis bubbles (freeze aging) */
const stasisBubbles = [];
const stasisGeo = new THREE.SphereGeometry(STASIS_RADIUS * SPACING, 28, 14);
function makeStasisBubble(x, z) {
  const w = cellWorld(x, z);
  const m = new THREE.Mesh(stasisGeo, new THREE.MeshBasicMaterial({ color: 0x4de3ff, transparent: true, opacity: 0.14, depthWrite: false }));
  m.position.set(w.x, 2.5, w.z);
  scene.add(m);
  stasisBubbles.push({ x, z, gens: STASIS_GENS, mesh: m });
}
function inStasis(x, z) {
  for (const b of stasisBubbles) {
    const dx = x - b.x, dz = z - b.z;
    if (dx * dx + dz * dz <= STASIS_RADIUS * STASIS_RADIUS) return true;
  }
  return false;
}
function updateStasis() {
  for (let i = stasisBubbles.length - 1; i >= 0; i--) {
    const b = stasisBubbles[i];
    b.gens--;
    if (b.gens <= 0) { scene.remove(b.mesh); b.mesh.material.dispose(); stasisBubbles.splice(i, 1); }
  }
}

/* ─────────────────────────── SIMULATION ─────────────────────── */
const idxOf = (x, z) => z * GRID + x;
function rnd() {
  if (rngState === null) return Math.random();
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 4294967296;
}
function rndRange(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }
function refreshPopulation() {
  let p = 0; for (let i = 0; i < TOTAL; i++) if (cells[i]) p++;
  population = p;
  if (p > maxPopulation) maxPopulation = p;
}
function seedWorld() {
  cells.fill(0); ages.fill(0); history.fill(0); heights.fill(0);
  cooldowns.fill(0); warnings.fill(0);
  snapshots = []; tracks = new Map(); queue = []; blasts = [];
  explosionsTotal = 0; lastExplosion = 'NONE';
  historyFrames = [];
  if (historyMode) { historyMode = false; running = wasRunningBeforeHistory; $('replay-bar').classList.add('hidden'); }
  for (let k = 0; k < 17; k++) {
    const cx = rndRange(6, GRID - 7);
    const cz = rndRange(6, GRID - 7);
    const radius = rndRange(4, 9);
    const species = rndRange(1, 3);
    for (let z = Math.max(0, cz - radius); z <= Math.min(GRID - 1, cz + radius); z++)
      for (let x = Math.max(0, cx - radius); x <= Math.min(GRID - 1, cx + radius); x++) {
        if (Math.hypot(x - cx, z - cz) < radius && rnd() < 0.37) cells[idxOf(x, z)] = species;
      }
  }
  generations = 0;
  refreshPopulation();
}
function stepSimulation() {
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const i = idxOf(x, z);
    let neighbours = 0; const votes = [0, 0, 0];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) continue;
      const nb = cells[idxOf(nx, nz)];
      if (nb > 0) { neighbours++; votes[nb - 1]++; }
    }
    const living = cells[i];
    if (living !== 0 && (neighbours === 2 || neighbours === 3)) nextCells[i] = living;
    else if (living === 0 && neighbours === 3) {
      let winner = 0;
      for (let s = 1; s < 3; s++) if (votes[s] > votes[winner]) winner = s;
      nextCells[i] = winner + 1;
    } else nextCells[i] = 0;
  }
  for (let i = 0; i < TOTAL; i++) {
    const old = cells[i], current = nextCells[i];
    cells[i] = current;
    const frozen = inStasis(i % GRID, Math.floor(i / GRID));
    if (current !== 0) {
      ages[i] = old !== 0 ? (frozen ? ages[i] : Math.min(MAX_AGE, ages[i] + 1)) : 1;
      if (!frozen) history[i] = Math.min(HISTORY_LIMIT, history[i] + 0.065);
    } else {
      ages[i] = 0;
      if (!frozen) history[i] = Math.max(0, history[i] - 0.012);
    }
  }
  generations++;
  updateInstability();
  updateStasis();
  refreshPopulation();
  checkContract();
  /* Replay history ring buffer */
  historyFrames.push({ c: new Uint8Array(cells), a: new Uint16Array(ages), h: new Float32Array(heights) });
  if (historyFrames.length > HISTORY_MAX) historyFrames.shift();
  if (dailyMode && !dailyScored && generations === 300) scoreDaily();
}

/* ── Cellular Instability (mirrors main.gd) ── */
function updateInstability() {
  for (let i = 0; i < TOTAL; i++) {
    if (cooldowns[i] > 0) cooldowns[i]--;
    if (cells[i] !== 0 && ages[i] >= TOWER_LIFESPAN && cooldowns[i] === 0 && !inStasis(i % GRID, Math.floor(i / GRID))) {
      queue.push([i % GRID, Math.floor(i / GRID)]);
      cooldowns[i] = EXPLOSION_COOLDOWN;
    }
    if (cells[i] !== 0 && ages[i] >= TOWER_LIFESPAN - 8) warnings[i] = 8;
    else if (warnings[i] > 0) warnings[i]--;
  }
  snapshots.push(new Uint8Array(cells));
  if (snapshots.length > 7) snapshots.shift();
  if (snapshots.length >= 3) findOscillators();
  let processed = 0;
  while (queue.length && processed < MAX_EXPLOSIONS_PER_GEN) {
    const [cx, cz] = queue.shift();
    if (cx < 0 || cx >= GRID || cz < 0 || cz >= GRID) continue;
    detonate(cx, cz);
    processed++;
  }
}
function componentSignature(component) {
  let mx = GRID, mz = GRID;
  for (const id of component) { mx = Math.min(mx, id % GRID); mz = Math.min(mz, Math.floor(id / GRID)); }
  return component.map(id => [(id % GRID) - mx, Math.floor(id / GRID) - mz])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(p => p.join(',')).join(';');
}
function findOscillators() {
  const seen = new Uint8Array(TOTAL);
  const updated = new Map();
  for (let start = 0; start < TOTAL; start++) {
    if (cells[start] === 0 || seen[start]) continue;
    const component = [];
    const frontier = [start];
    seen[start] = 1;
    let head = 0;
    while (head < frontier.length) {
      const cur = frontier[head++];
      component.push(cur);
      const x = cur % GRID, z = Math.floor(cur / GRID);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) continue;
        const ni = idxOf(nx, nz);
        if (cells[ni] !== 0 && !seen[ni]) { seen[ni] = 1; frontier.push(ni); }
      }
    }
    if (component.length < 2 || component.length > OSCILLATOR_MAX_CELLS) continue;
    /* Field journal discovery */
    const jsig = componentSignature(component);
    const jname = SIG_MAP.get(jsig);
    if (jname && !discoveries.has(jname)) {
      discoveries.add(jname);
      biomass += 10; biomassCollectedTotal += 10;
      AudioSys.fanfare();
      toast(`🔬 <b>DISCOVERED: ${jname}</b> (+10 ⚡)`, 4000, 'gold');
      refreshJournal();
    }
    let minX = GRID, minZ = GRID, maxX = 0, maxZ = 0;
    for (const id of component) {
      minX = Math.min(minX, id % GRID); maxX = Math.max(maxX, id % GRID);
      minZ = Math.min(minZ, Math.floor(id / GRID)); maxZ = Math.max(maxZ, Math.floor(id / GRID));
    }
    minX = Math.max(0, minX - 1); minZ = Math.max(0, minZ - 1);
    maxX = Math.min(GRID - 1, maxX + 1); maxZ = Math.min(GRID - 1, maxZ + 1);
    const key = `${Math.floor((minX + maxX) / 2)}:${Math.floor((minZ + maxZ) / 2)}`;
    let period = 0;
    for (let lag = 2; lag <= Math.min(6, snapshots.length - 1); lag++) {
      const prev = snapshots[snapshots.length - 1 - lag];
      let identical = true;
      outer: for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
        if ((prev[idxOf(x, z)] !== 0) !== (cells[idxOf(x, z)] !== 0)) { identical = false; break outer; }
      }
      if (identical) {
        const prior = snapshots[snapshots.length - 2];
        let changed = false;
        for (const id of component) if ((prior[id] !== 0) !== (cells[id] !== 0)) { changed = true; break; }
        if (changed) { period = lag; break; }
      }
    }
    if (period === 0) continue;
    let track = tracks.get(key) || { ticks: 0, period };
    if (track.period !== period) track = { ticks: 0, period };
    track.ticks++;
    updated.set(key, track);
    if (track.ticks >= OSCILLATOR_CYCLES * period) {
      const cx = Math.floor((minX + maxX) / 2), cz = Math.floor((minZ + maxZ) / 2);
      const ci = idxOf(cx, cz);
      if (cooldowns[ci] === 0 && !inStasis(cx, cz)) {
        queue.push([cx, cz]);
        cooldowns[ci] = EXPLOSION_COOLDOWN;
      }
      updated.delete(key);
    }
  }
  tracks = updated;
}
function detonate(cx, cz) {
  const source = idxOf(cx, cz);
  let species = cells[source];
  if (species === 0) species = 1 + Math.floor(Math.random() * 3);
  let destroyed = 0;
  for (let z = Math.max(0, cz - EXPLOSION_RADIUS); z <= Math.min(GRID - 1, cz + EXPLOSION_RADIUS); z++)
    for (let x = Math.max(0, cx - EXPLOSION_RADIUS); x <= Math.min(GRID - 1, cx + EXPLOSION_RADIUS); x++) {
      if (Math.hypot(x - cx, z - cz) > EXPLOSION_RADIUS) continue;
      const i = idxOf(x, z);
      if (cells[i] !== 0) {
        destroyed++;
        if (ages[i] >= TOWER_LIFESPAN - 6 && i !== source && cooldowns[i] === 0 && !inStasis(x, z)) queue.push([x, z]);
      }
      cells[i] = 0; ages[i] = 0; warnings[i] = 0;
      history[i] = Math.max(history[i], 0.45);
      cooldowns[i] = EXPLOSION_COOLDOWN;
    }
  const glider = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
  for (let s = 0; s < MAX_DEBRIS_SEEDS; s++) {
    const angle = rnd() * Math.PI * 2;
    const dist = (EXPLOSION_RADIUS + 1) + rnd() * (EXPLOSION_RADIUS * 1.5);
    const px = cx + Math.round(Math.cos(angle) * dist);
    const pz = cz + Math.round(Math.sin(angle) * dist);
    const kind = s % 3;
    let offsets = [[0, 0]];
    if (kind === 0) offsets = glider;
    else if (kind === 1) offsets = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (const [ox, oz] of offsets) {
      const x = px + ox, z = pz + oz;
      if (x < 0 || x >= GRID || z < 0 || z >= GRID) continue;
      const i = idxOf(x, z);
      cells[i] = rnd() < 0.7 ? species : rndRange(1, 3);
      ages[i] = 1;
      cooldowns[i] = EXPLOSION_COOLDOWN;
    }
  }
  const w = cellWorld(cx, cz);
  blasts.push({ x: cx, z: cz, ttl: 0.65 });
  spawnBlastRing(w.x, w.z);
  spawnParticles(w.x, 3, w.z, new THREE.Color(1.0, 0.55, 0.15), 26, 7, 0.8);
  spawnOrbs(cx, cz, 3);
  const dist = camera.position.distanceTo(new THREE.Vector3(w.x, 3, w.z));
  shake = Math.min(1.1, Math.max(0.15, 16 / (1 + dist * 0.14)));
  explosionsTotal++;
  lastExplosion = `(${cx},${cz}) cleared ${destroyed}`;
  snapshots = []; tracks = new Map();
  AudioSys.pop(true);
  const now = performance.now();
  if (now - lastToastAt > 2200) { lastToastAt = now; toast(`💥 Explosion ${lastExplosion} at generation ${generations}`, 2600); }
}

/* ─────────────────────────── VISUALS ────────────────────────── */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
function updateVisuals(dt) {
  if (historyMode) {
    /* Replay: render a stored frame (dimmed to distinguish from live) */
    const f = historyFrames[historyView];
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      const i = idxOf(x, z);
      const living = f.c[i];
      const h = Math.max(0.025, f.h[i]);
      _p.set((x - (GRID - 1) / 2) * SPACING, h * 0.5, (z - (GRID - 1) / 2) * SPACING);
      _s.set(1, h, 1);
      _m.compose(_p, _q, _s);
      pillarsMesh.setMatrixAt(i, _m);
      if (living > 0) _c.copy(PALETTE[living - 1]).lerp(ORANGE, (f.a[i] / MAX_AGE) * 0.55).multiplyScalar(0.8);
      else _c.setRGB(0.048, 0.112, 0.208);
      pillarsMesh.setColorAt(i, _c);
    }
    pillarsMesh.instanceMatrix.needsUpdate = true;
    if (pillarsMesh.instanceColor) pillarsMesh.instanceColor.needsUpdate = true;
    return;
  }
  const k = Math.min(1, dt * 5.5);
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const i = idxOf(x, z);
    const living = cells[i];
    const ageFactor = ages[i] / MAX_AGE;
    const mem = memoryEnabled ? history[i] : 0;
    const target = living !== 0
      ? (1.4 + 12.0 * Math.sqrt(ageFactor) + 11.0 * mem) * heightScale
      : (8.0 * mem * heightScale);
    heights[i] += (target - heights[i]) * k;
    const h = Math.max(0.025, heights[i]);
    _p.set((x - (GRID - 1) / 2) * SPACING, h * 0.5, (z - (GRID - 1) / 2) * SPACING);
    _s.set(1, h, 1);
    _m.compose(_p, _q, _s);
    pillarsMesh.setMatrixAt(i, _m);
    if (living > 0) {
      _c.copy(PALETTE[living - 1]).lerp(ORANGE, ageFactor * 0.55);
      if (ages[i] >= TOWER_LIFESPAN - 8) _c.lerp(REDHOT, 0.65 + 0.35 * Math.sin(generations * 2.0));
    } else _c.copy(GHOST_A).lerp(GHOST_B, mem);
    _c.multiplyScalar(worldBrightness);
    pillarsMesh.setColorAt(i, _c);
  }
  pillarsMesh.instanceMatrix.needsUpdate = true;
  if (pillarsMesh.instanceColor) pillarsMesh.instanceColor.needsUpdate = true;
}

/* ─────────────────────────── FLIGHT & PAINTING ──────────────── */
const keys = new Set();
function updateFlight(dt) {
  const look = 1.65;
  if (keys.has('arrowleft')) yaw += look * dt;
  if (keys.has('arrowright')) yaw -= look * dt;
  if (keys.has('arrowup')) pitch -= look * dt;
  if (keys.has('arrowdown')) pitch += look * dt;
  pitch = THREE.MathUtils.clamp(pitch, -1.48, 1.48);
  const move = new THREE.Vector3();
  const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  if (keys.has('w')) move.add(fwd);
  if (keys.has('s')) move.sub(fwd);
  if (keys.has('d')) move.add(right);
  if (keys.has('a')) move.sub(right);
  if (keys.has(' ')) move.y += 1;
  if (keys.has('control')) move.y -= 1;
  if (move.lengthSq() > 0) {
    const sp = keys.has('shift') ? 42 : 15;
    camera.position.addScaledVector(move.normalize(), sp * dt);
    camera.position.y = Math.max(0.8, camera.position.y);
  }
}
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function aimCell() {
  const ndc = new THREE.Vector2(0, 0);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  const x = Math.round(hit.x / SPACING + (GRID - 1) / 2);
  const z = Math.round(hit.z / SPACING + (GRID - 1) / 2);
  if (x < 0 || x >= GRID || z < 0 || z >= GRID) return null;
  return { x, z };
}
function paintAt(clientX, clientY, alive) {
  if (historyMode) return;
  const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
  const x = Math.round(hit.x / SPACING + (GRID - 1) / 2);
  const z = Math.round(hit.z / SPACING + (GRID - 1) / 2);
  if (x < 0 || x >= GRID || z < 0 || z >= GRID) return;
  const i = idxOf(x, z);
  cells[i] = alive ? brushSpecies : 0;
  ages[i] = alive ? 1 : 0;
  if (alive) paintedCells++;
  refreshPopulation();
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  AudioSys.init();
  if (!started) return;
  paintAt(e.clientX, e.clientY, e.button === 0);
});

/* ── Tools (mirrors main.gd use_tool) ── */
function placePattern(rows, ox, oz, species) {
  let placed = 0;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    if (rows[r][c] !== 'O') continue;
    const x = ox + c, z = oz + r;
    if (x < 0 || x >= GRID || z < 0 || z >= GRID) continue;
    const i = idxOf(x, z);
    cells[i] = species; ages[i] = 1; placed++;
  }
  refreshPopulation();
  return placed;
}
function useTool(key) {
  if (historyMode) { AudioSys.err(); toast('⏳ Exit replay (H) before using tools', 2200, 'err'); return; }
  const tool = TOOLS[key];
  if (biomass < tool.cost) {
    AudioSys.err();
    toast(`❌ Not enough biomass for <b>${tool.name}</b> — need ${tool.cost} ⚡`, 2200, 'err');
    return;
  }
  const target = aimCell();
  if (!target) {
    AudioSys.err();
    toast(`❌ Aim at the ground to place <b>${tool.name}</b>`, 2200, 'err');
    return;
  }
  if (tool.kind === 'stasis') {
    if (stasisBubbles.length >= 4) {
      AudioSys.err();
      toast('❌ Too many stasis fields active', 2200, 'err');
      return;
    }
    makeStasisBubble(target.x, target.z);
  } else if (tool.kind === 'rain') {
    for (let k = 0; k < 40; k++) {
      const angle = rnd() * Math.PI * 2, dist = rnd() * 6;
      const x = Math.max(0, Math.min(GRID - 1, target.x + Math.round(Math.cos(angle) * dist)));
      const z = Math.max(0, Math.min(GRID - 1, target.z + Math.round(Math.sin(angle) * dist)));
      const i = idxOf(x, z);
      cells[i] = rnd() < 0.75 ? brushSpecies : rndRange(1, 3);
      ages[i] = 1;
    }
    refreshPopulation();
  } else {
    const ox = tool.centered ? target.x - 6 : target.x;
    const oz = tool.centered ? target.z - 6 : target.z;
    placePattern(tool.rows, ox, oz, brushSpecies);
  }
  biomass -= tool.cost;
  toolsUsed.add(key);
  AudioSys.buy();
  toast(`🌱 <b>${tool.name}</b> placed (-${tool.cost} ⚡)`, 2000, 'gold');
}

/* ── Contracts (mirrors main.gd) ── */
function speciesCounts() {
  const counts = [0, 0, 0];
  for (let i = 0; i < TOTAL; i++) if (cells[i]) counts[cells[i] - 1]++;
  return counts;
}
function contractDone(c) {
  switch (c.id) {
    case 'collect': return biomassCollectedTotal >= c.target;
    case 'paint': return paintedCells >= c.target;
    case 'explode': return explosionsTotal >= c.target;
    case 'balance': return speciesCounts().filter(n => n >= 40).length >= c.target;
    case 'tools': return toolsUsed.size >= c.target;
    case 'journal': return discoveries.size >= c.target;
    case 'pop': return maxPopulation >= c.target;
    case 'gen300': return generations >= c.target;
    case 'master':
      return (generations >= 600 ? 1 : 0) + (maxPopulation >= 300 ? 1 : 0) + (biomassCollectedTotal >= 100 ? 1 : 0) >= c.target;
  }
  return false;
}
function contractProgress(c) {
  switch (c.id) {
    case 'collect': return `${Math.min(biomassCollectedTotal, c.target)}/${c.target}⚡`;
    case 'paint': return `${Math.min(paintedCells, c.target)}/${c.target}`;
    case 'explode': return `${Math.min(explosionsTotal, c.target)}/${c.target}`;
    case 'balance': return `${speciesCounts().filter(n => n >= 40).length}/3 species`;
    case 'tools': return `${Math.min(toolsUsed.size, c.target)}/${c.target}`;
    case 'journal': return `${Math.min(discoveries.size, c.target)}/${c.target}`;
    case 'pop': return `${Math.min(maxPopulation, c.target)}/${c.target}`;
    case 'gen300': return `${Math.min(generations, c.target)}/${c.target}`;
    case 'master':
      return `${(generations >= 600 ? 1 : 0) + (maxPopulation >= 300 ? 1 : 0) + (biomassCollectedTotal >= 100 ? 1 : 0)}/3 goals`;
  }
  return '';
}
function checkContract() {
  if (contractIndex >= CONTRACTS.length) return;
  const c = CONTRACTS[contractIndex];
  if (!contractDone(c)) return;
  biomass += c.reward;
  contractIndex++;
  AudioSys.fanfare();
  toast(`✔ <b>CONTRACT COMPLETE</b><br>${c.text} (+${c.reward} ⚡)`, 4200, 'gold');
  if (contractIndex >= CONTRACTS.length) {
    toast('🏆 <b>MASTER GARDENER</b> — the terrain is yours. Sandbox continues.', 6000, 'gold');
  }
}
function contractHudText() {
  if (contractIndex >= CONTRACTS.length) return 'ALL COMPLETE 🏆';
  const c = CONTRACTS[contractIndex];
  return `${contractIndex + 1}/${CONTRACTS.length} ${c.text} [${contractProgress(c)}] reward ${c.reward}⚡`;
}

/* ─────────────────────────── INPUT ──────────────────────────── */
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  if (!started) return;
  if (historyMode) {
    if (k === ',') scrubHistory(e.shiftKey ? -10 : -1);
    else if (k === '.') scrubHistory(e.shiftKey ? 10 : 1);
    else if (k === 'h') toggleHistory();
    return;
  }
  if (k === 'escape' || k === 'p') running = !running;
  else if (k === 'n') { if (!running) stepSimulation(); }
  else if (k === 'r') { dailyMode = false; rngState = null; seedWorld(); }
  else if (k === 'c') {
    cells.fill(0); ages.fill(0); history.fill(0); generations = 0; population = 0;
    snapshots = []; tracks = new Map(); queue = []; cooldowns.fill(0);
    historyFrames = [];
  }
  else if (k === 'm') memoryEnabled = !memoryEnabled;
  else if (k === 'v') toggleOverview();
  else if (k === '[') generationInterval = Math.min(2.0, generationInterval * 1.25);
  else if (k === ']') generationInterval = Math.max(0.20, generationInterval / 1.25);
  else if (k === '-') heightScale = Math.max(0.2, heightScale - 0.2);
  else if (k === '=' || k === '+') heightScale = Math.min(4.0, heightScale + 0.2);
  else if (k === '1' || k === '2' || k === '3') brushSpecies = +k;
  else if (k === 'f') paintAt(window.innerWidth / 2, window.innerHeight / 2, true);
  else if (k === 'g') paintAt(window.innerWidth / 2, window.innerHeight / 2, false);
  else if (TOOLS[k]) useTool(k);
  else if (k === 'b') { bloomEnabled = !bloomEnabled; toast(`✨ Bloom ${bloomEnabled ? 'ON' : 'OFF'}`, 1500); }
  else if (k === 't') { dayNightEnabled = !dayNightEnabled; toast(`🌗 Day/night cycle ${dayNightEnabled ? 'ON' : 'OFF'}`, 1500); }
  else if (k === 'j') { $('journal').classList.toggle('hidden'); refreshJournal(); }
  else if (k === 's') openSaveModal();
  else if (k === 'l') openLoadModal();
  else if (k === 'h') toggleHistory();
  else if (k === 'k') { minimapOn = !minimapOn; $('minimap').classList.toggle('hidden', !minimapOn); }
  else if (k === 'd') startDaily();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function toggleOverview() {
  overview = !overview;
  if (overview) { camera.position.set(0, 85, 60); yaw = 0; pitch = -0.95; }
  else { camera.position.set(0, 16, 32); yaw = 0; pitch = -0.30; }
}

/* ─────────────────────────── UI ─────────────────────────────── */
function toast(html, dur = 3000, cls = '') {
  const t = document.createElement('div');
  t.className = 'toast' + (cls ? ' ' + cls : ''); t.innerHTML = html;
  $('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, dur);
}
function updateHUD() {
  const mode = historyMode ? 'REPLAY' : (overview ? 'OVERVIEW' : (dailyMode ? 'DAILY CHALLENGE' : 'FLIGHT'));
  let t =
    `EVOLUTION  /  LIVING TERRAIN\nGeneration ${generations}     Alive ${population}     ${mode}\n${running ? 'RUNNING' : 'PAUSED'}   |   ${(1 / generationInterval).toFixed(1)} gen/sec   |   Height ${heightScale.toFixed(1)}x   |   Memory ${memoryEnabled ? 'ON' : 'OFF'}   |   Brush ${brushSpecies}\nExplosions ${explosionsTotal}  |  Last ${lastExplosion}\n⚡ Biomass ${biomass}   |   🔬 ${discoveries.size}/${JOURNAL.length}   |   Contract ${contractHudText()}`;
  if (historyMode) t += `\n⏳ REPLAY ${historyView + 1}/${historyFrames.length}  —  , / . scrub (Shift ×10)  —  H to return`;
  $('stats').textContent = t;
}

/* ── Replay history ── */
function toggleHistory() {
  if (!historyMode && historyFrames.length < 2) { toast('⏳ Not enough history yet — let it run', 1800); return; }
  historyMode = !historyMode;
  if (historyMode) {
    wasRunningBeforeHistory = running;
    running = false;
    historyView = historyFrames.length - 1;
    $('replay-bar').classList.remove('hidden');
    syncReplayBar();
    toast('⏳ <b>REPLAY</b> — , / . or the slider · H to return', 3200);
  } else {
    running = wasRunningBeforeHistory;
    $('replay-bar').classList.add('hidden');
  }
}
function scrubHistory(delta) {
  historyView = Math.max(0, Math.min(historyFrames.length - 1, historyView + delta));
  syncReplayBar();
}
function syncReplayBar() {
  const rb = $('replay-slider');
  rb.max = Math.max(0, historyFrames.length - 1);
  rb.value = historyView;
  $('replay-label').textContent = `gen ${generations - (historyFrames.length - 1 - historyView)} / ${generations}`;
}
$('replay-slider').addEventListener('input', e => { if (historyMode) { historyView = +e.target.value; syncReplayBar(); } });

/* ── Daily challenge ── */
function dailyDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dailySeedHash() {
  const s = dailyDateString();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}
function startDaily() {
  dailyMode = true; dailyScored = false;
  rngState = dailySeedHash();
  seedWorld();
  AudioSys.fanfare();
  toast(`📅 <b>DAILY CHALLENGE ${dailyDateString()}</b><br>Same seed for everyone — score lands at generation 300`, 5200, 'gold');
}
function scoreDaily() {
  dailyScored = true;
  const score = population * 3 + biomass + discoveries.size * 25 + explosionsTotal * 5;
  let best = 0;
  try {
    const key = 'evolution-daily-' + dailyDateString();
    best = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    if (score > best) localStorage.setItem(key, String(score));
  } catch (e) { }
  AudioSys.fanfare();
  toast(`🏁 <b>DAILY SCORE @ gen 300</b><br>Alive ${population} · ⚡${biomass} · 🔬${discoveries.size} · 💥${explosionsTotal}<br><b>Score ${score}</b>${score > best ? ' — new personal best!' : ` (best ${best})`}`, 8000, 'gold');
}

/* ── Minimap ── */
const minimapCanvas = $('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const _fwd = new THREE.Vector3();
function drawMinimap() {
  const S = minimapCanvas.width / GRID;
  const ctx = minimapCtx;
  ctx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  ctx.fillStyle = 'rgba(4,7,18,0.85)';
  ctx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  const src = historyMode ? historyFrames[historyView].c : cells;
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const i = idxOf(x, z);
    const v = src[i];
    if (v > 0) ctx.fillStyle = MM_COLORS[v - 1];
    else if (history[i] > 0.05) ctx.fillStyle = `rgba(52,86,140,${(history[i] * 0.55).toFixed(2)})`;
    else continue;
    ctx.fillRect(x * S, z * S, S, S);
  }
  ctx.strokeStyle = 'rgba(77,227,255,0.85)';
  ctx.lineWidth = 1.5;
  for (const b of stasisBubbles) {
    ctx.beginPath();
    ctx.arc((b.x + 0.5) * S, (b.z + 0.5) * S, STASIS_RADIUS * S, 0, Math.PI * 2);
    ctx.stroke();
  }
  const px = (camera.position.x / SPACING + (GRID - 1) / 2 + 0.5) * S;
  const pz = (camera.position.z / SPACING + (GRID - 1) / 2 + 0.5) * S;
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const fl = Math.hypot(_fwd.x, _fwd.z) || 1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, pz);
  ctx.lineTo(px + (_fwd.x / fl) * 10, pz + (_fwd.z / fl) * 10);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, pz, 3, 0, Math.PI * 2);
  ctx.fill();
}
function refreshJournal() {
  const el = $('journal');
  if (!el) return;
  let html = `<h3>🔬 FIELD JOURNAL &nbsp;${discoveries.size}/${JOURNAL.length}</h3>`;
  for (const p of JOURNAL) html += `<div class="${discoveries.has(p.name) ? 'j-found' : 'j-missing'}">${discoveries.has(p.name) ? '✔' : '·'} ${p.name}<span>${p.desc}</span></div>`;
  el.innerHTML = html;
}

/* ── Day/night cycle ── */
function updateDayNight(dt) {
  if (dayNightEnabled) {
    dayTime += dt;
    const phase = (dayTime / DAY_LENGTH) % 1;
    worldBrightness = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2 - Math.PI * 0.5));
  } else worldBrightness = 1;
  scene.background.copy(BASE_BG).multiplyScalar(worldBrightness);
  scene.fog.color.copy(scene.background);
  floorMesh.material.color.copy(BASE_FLOOR).multiplyScalar(worldBrightness);
  sun.intensity = 1.6 * worldBrightness;
  if (starsMat) starsMat.opacity = 0.35 + (1.05 - worldBrightness);
}

/* ── Ambient drone (health of the world sets the key) ── */
const Drone = {
  nodes: null, nextUpdate: 0,
  start() {
    if (this.nodes || !AudioSys.ctx) return;
    const ctx = AudioSys.ctx;
    const gain = ctx.createGain(); gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 220;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.5;
    o1.connect(filter); o2.connect(filter); filter.connect(gain); gain.connect(AudioSys.master);
    o1.start(); o2.start();
    this.nodes = { gain, filter, o1, o2 };
  },
  update() {
    if (!this.nodes || !AudioSys.ctx) return;
    const now = performance.now();
    if (now < this.nextUpdate) return;
    this.nextUpdate = now + 1500;
    const health = Math.min(1, population / 600);
    const root = 48 + 36 * health;
    const t = AudioSys.ctx.currentTime;
    this.nodes.o1.frequency.linearRampToValueAtTime(root, t + 1.2);
    this.nodes.o2.frequency.linearRampToValueAtTime(root * 1.5, t + 1.2);
    this.nodes.filter.frequency.linearRampToValueAtTime(160 + 240 * health, t + 1.2);
  },
};

/* ── Ecosystem save/share (EVO1 run-length codes) ── */
function encodeEcosystem() {
  const rowsRLE = [];
  for (let z = 0; z < GRID; z++) {
    let s = '', run = 0, val = -1;
    for (let x = 0; x < GRID; x++) {
      const v = cells[idxOf(x, z)];
      if (v === val) run++;
      else { if (val >= 0) s += '.abc'[val] + run; val = v; run = 1; }
    }
    s += '.abc'[val] + run;
    rowsRLE.push(s);
  }
  return `EVO1;${GRID};` + rowsRLE.join('/');
}
function decodeEcosystem(code) {
  const parts = code.trim().split(';');
  if (parts.length !== 3 || parts[0] !== 'EVO1') return null;
  if (parseInt(parts[1], 10) !== GRID) return null;
  const rows = parts[2].split('/');
  if (rows.length !== GRID) return null;
  const out = new Uint8Array(TOTAL);
  for (let z = 0; z < GRID; z++) {
    let x = 0;
    const row = rows[z];
    for (let p = 0; p < row.length;) {
      const v = '.abc'.indexOf(row[p]);
      if (v < 0) return null;
      p++;
      let num = '';
      while (p < row.length && row[p] >= '0' && row[p] <= '9') { num += row[p]; p++; }
      const n = parseInt(num, 10);
      if (!n || x + n > GRID) return null;
      for (let k = 0; k < n; k++) out[idxOf(x++, z)] = v;
    }
    if (x !== GRID) return null;
  }
  return out;
}
function openSaveModal() { $('save-area').value = encodeEcosystem(); $('save-modal').classList.remove('hidden'); $('save-area').select(); }
function openLoadModal() { $('load-area').value = ''; $('load-modal').classList.remove('hidden'); $('load-area').focus(); }
function loadFromModal() {
  const arr = decodeEcosystem($('load-area').value);
  if (!arr) { AudioSys.err(); toast('❌ Invalid ecosystem code (expected EVO1)', 2500, 'err'); return; }
  cells = arr; ages.fill(0); history.fill(0);
  for (let i = 0; i < TOTAL; i++) if (cells[i]) ages[i] = 1;
  snapshots = []; tracks = new Map(); queue = []; cooldowns.fill(0); warnings.fill(0);
  refreshPopulation();
  $('load-modal').classList.add('hidden');
  AudioSys.buy();
  toast('🧬 Ecosystem loaded from code', 2200, 'gold');
}
$('save-copy-btn').addEventListener('click', async () => {
  const ta = $('save-area');
  try { await navigator.clipboard.writeText(ta.value); toast('📋 Copied to clipboard', 1800); }
  catch (e) { ta.select(); try { document.execCommand('copy'); toast('📋 Copied', 1800); } catch (e2) { toast('📋 Select the code and press Ctrl+C', 2600); } }
});
$('save-close-btn').addEventListener('click', () => $('save-modal').classList.add('hidden'));
$('load-go-btn').addEventListener('click', loadFromModal);
$('load-close-btn').addEventListener('click', () => $('load-modal').classList.add('hidden'));
$('sound-btn').addEventListener('click', () => {
  AudioSys.init();
  AudioSys.setMuted(!AudioSys.muted);
  $('sound-btn').textContent = AudioSys.muted ? '🔇' : '🔊';
});
function startGame() {
  if (started) return;
  AudioSys.init();
  Drone.start();
  started = true;
  $('start-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  refreshJournal();
  toast('🧬 Welcome, Gardener. Harvest gold orbs at blast sites to earn ⚡ biomass.', 4500);
  toast('Contracts pay bonuses. Tools are on keys 4–9 (aim at the ground).', 4500);
  toast('🔬 J journal · S/L save & share ecosystems · B bloom · T day/night', 5000);
  if (gamepadIndex !== null) toast('🎮 Controller: sticks fly · RT/LT rise/fall · LB boost · A/B paint', 5000);
}
$('play-btn').addEventListener('click', startGame);

/* ─────────────────────────── GAMEPAD (Xbox layout — ROG Ally X etc.) ── */
let gamepadIndex = null, prevPadButtons = [], padTool = 0;
const TOOL_KEYS = ['4', '5', '6', '7', '8', '9'];
function padPressed(gp, i) {
  return !!(gp.buttons[i] && gp.buttons[i].pressed) && !(prevPadButtons[i] && prevPadButtons[i].pressed);
}
window.addEventListener('gamepadconnected', e => {
  gamepadIndex = e.gamepad.index;
  prevPadButtons = [];
  AudioSys.init();
  toast('🎮 <b>Controller connected</b><br>Sticks fly · RT/LT rise/fall · LB boost · A/B paint · RB cycles tools, R3 places', 5500);
  if (!started) startGame();
});
window.addEventListener('gamepaddisconnected', e => {
  if (e.gamepad.index === gamepadIndex) { gamepadIndex = null; toast('🎮 Controller disconnected', 2500); }
});
function pollGamepad(dt) {
  if (gamepadIndex === null) return;
  const gp = navigator.getGamepads()[gamepadIndex];
  if (!gp) return;
  if (!started) {
    if (padPressed(gp, 0) || padPressed(gp, 9)) startGame();
    prevPadButtons = gp.buttons.map(b => ({ pressed: b.pressed }));
    return;
  }
  /* Analog sticks with deadzone */
  const DZ = 0.12;
  let lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
  let lm = Math.hypot(lx, ly);
  if (lm > 1) { lx /= lm; ly /= lm; lm = 1; }
  const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
  if (Math.hypot(rx, ry) > DZ) {
    yaw -= rx * 2.6 * dt;
    pitch = THREE.MathUtils.clamp(pitch - ry * 2.2 * dt, -1.48, 1.48);
  }
  /* Left stick = fly, analog triggers = rise / fall */
  const move = new THREE.Vector3();
  const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  if (lm > DZ) { move.addScaledVector(fwd, -ly); move.addScaledVector(right, lx); }
  const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
  const lt = gp.buttons[6] ? gp.buttons[6].value : 0;
  if (rt > 0.04) move.y += rt;
  if (lt > 0.04) move.y -= lt;
  const boost = !!(gp.buttons[4] && gp.buttons[4].pressed);
  const mag = Math.min(1, move.length());
  if (mag > 0.001) {
    camera.position.addScaledVector(move.normalize(), (boost ? 42 : 15) * mag * dt);
    camera.position.y = Math.max(0.8, camera.position.y);
  }
  /* Buttons */
  if (padPressed(gp, 0)) paintAt(window.innerWidth / 2, window.innerHeight / 2, true);
  if (padPressed(gp, 1)) paintAt(window.innerWidth / 2, window.innerHeight / 2, false);
  if (padPressed(gp, 2)) { brushSpecies = brushSpecies % 3 + 1; toast(`🎨 Brush species ${brushSpecies}`, 1400); }
  if (padPressed(gp, 3)) toggleOverview();
  if (padPressed(gp, 5)) {
    padTool = (padTool + 1) % TOOL_KEYS.length;
    const t = TOOLS[TOOL_KEYS[padTool]];
    toast(`🧰 <b>${t.name}</b> (${t.cost}⚡) — R3 to place at screen centre`, 2400);
  }
  if (padPressed(gp, 11)) useTool(TOOL_KEYS[padTool]);
  if (padPressed(gp, 9)) { if (historyMode) toggleHistory(); else running = !running; }
  if (padPressed(gp, 8)) { AudioSys.setMuted(!AudioSys.muted); $('sound-btn').textContent = AudioSys.muted ? '🔇' : '🔊'; }
  if (padPressed(gp, 12)) toggleHistory();
  if (padPressed(gp, 13)) startDaily();
  if (padPressed(gp, 14)) { minimapOn = !minimapOn; $('minimap').classList.toggle('hidden', !minimapOn); }
  if (padPressed(gp, 15)) { $('journal').classList.toggle('hidden'); refreshJournal(); }
  prevPadButtons = gp.buttons.map(b => ({ pressed: b.pressed }));
}

/* ─────────────────────────── MAIN LOOP ──────────────────────── */
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let lastT = performance.now(), hudTimer = 0;
function loop() {
  requestAnimationFrame(loop);
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - lastT) / 1000); lastT = nowMs;
  if (running && !historyMode) {
    accumulated += dt;
    let steps = 0;
    while (accumulated >= generationInterval && steps < 4) {
      stepSimulation();
      accumulated -= generationInterval;
      steps++;
    }
    if (steps === 4) accumulated = 0;
  }
  visualElapsed += dt;
  if (visualElapsed >= VISUAL_INTERVAL) {
    updateVisuals(Math.min(0.1, visualElapsed));
    visualElapsed = 0;
  }
  if (started) updateFlight(dt);
  pollGamepad(dt);
  camera.rotation.set(pitch, yaw, 0);
  if (shake > 0.002) {
    camera.rotation.x += (Math.random() - 0.5) * shake * 0.05;
    camera.rotation.y += (Math.random() - 0.5) * shake * 0.06;
    shake = Math.max(0, shake - dt * 1.6);
  }
  updateParticles(dt);
  updateBlasts(dt);
  updateOrbs(dt, nowMs);
  updateDayNight(dt);
  Drone.update();
  for (let b = blasts.length - 1; b >= 0; b--) {
    blasts[b].ttl -= dt;
    if (blasts[b].ttl <= 0) blasts.splice(b, 1);
  }
  minimapTimer += dt;
  if (minimapTimer > 0.25) { minimapTimer = 0; if (started && minimapOn) drawMinimap(); }
  hudTimer += dt; if (hudTimer > 0.12) { hudTimer = 0; if (started) updateHUD(); }
  if (bloomEnabled) composer.render(); else renderer.render(scene, camera);
}

/* ─────────────────────────── BOOT ───────────────────────────── */
seedWorld();
biomass = STARTING_BIOMASS;
loop();
