/* ════════════════════════════════════════════════════════════════
   EVOLUTION EXPLORER — Fly Through Living Pillars
   Pillars grown by Conway's Game of Life.
   Height = how long cells have lived. Old pillars explode.
   Stagnant / repeating patterns explode too.
   ════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* ─────────────────────────── CONFIG ─────────────────────────── */
const W = 24;                 // Life grid width (pillars across)
const CHUNK_D = 14;           // rows per chunk
const N_CHUNKS = 5;           // active chunks
const SPACING = 2.2;          // metres between pillars
const MAX_AGE = 24;           // cells explode at this age
const BASE_H = 1.2, H_PER_AGE = 0.42;
const LIFE_INTERVAL = 0.55;   // seconds per Life generation (per chunk)
const MAX_INSTANCES = W * CHUNK_D * N_CHUNKS;

const RULES = {
  classic:  { name: 'Conway B3/S23',          birth: [3],       survive: [2, 3] },
  highlife: { name: 'HighLife B36/S23',       birth: [3, 6],    survive: [2, 3] },
  daynight: { name: 'Day & Night B3678/S34678', birth: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8] },
};
let ruleKey = 'classic';
let birthSet = new Set(RULES.classic.birth), surviveSet = new Set(RULES.classic.survive);

const $ = id => document.getElementById(id);
const canvas = $('game-canvas');
const els = {
  score: $('stat-score'), dist: $('stat-dist'), dna: $('stat-dna'),
  speed: $('stat-speed'), combo: $('stat-combo'), lifeInfo: $('life-info'),
  hint: $('bottom-hint'), toasts: $('toasts'), warn: $('warn-banner'),
  shield: $('shield-ind'),
};

/* ─────────────────────────── AUDIO ──────────────────────────── */
const AudioSys = {
  ctx: null, master: null, muted: false, engineOsc: null, engineGain: null, engineFilter: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
    } catch (e) { /* no audio */ }
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; },
  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineOsc.connect(this.engineFilter); this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  },
  setEngine(speedNorm, on) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(48 + speedNorm * 55, t, 0.1);
    this.engineGain.gain.setTargetAtTime(on ? 0.045 + speedNorm * 0.03 : 0.0, t, 0.15);
  },
  tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  pickup(combo) { this.tone(520 + Math.min(combo, 12) * 55, 0.14, 'sine', 0.14, 900 + combo * 40); },
  nearMiss() { this.tone(300, 0.18, 'triangle', 0.10, 900); },
  explosion(big = false) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, dur = big ? 0.8 : 0.4;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(big ? 1200 : 800, t);
    f.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(big ? 0.5 : 0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    this.tone(big ? 110 : 90, dur * 0.8, 'sine', big ? 0.35 : 0.2, 32);
  },
  crash() { this.explosion(true); this.tone(400, 0.7, 'sawtooth', 0.2, 40); },
  speedup() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.12, null, i * 0.08)); },
  shieldUp() { this.tone(880, 0.2, 'sine', 0.13); this.tone(1174, 0.3, 'sine', 0.13, null, 0.12); },
  click() { this.tone(700, 0.05, 'square', 0.05, 500); },
};

/* ─────────────────────────── THREE SETUP ────────────────────── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
scene.fog = new THREE.FogExp2(0x05060f, 0.0085);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 700);
scene.add(new THREE.AmbientLight(0x8899ff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(20, 40, -10); scene.add(sun);
const pCyan = new THREE.PointLight(0x22d3ee, 700, 120, 1.6); scene.add(pCyan);
const pMag = new THREE.PointLight(0xe879f9, 700, 120, 1.6); scene.add(pMag);

/* Ground + grid (follow player) */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 500),
  new THREE.MeshStandardMaterial({ color: 0x0a0d24, roughness: 1, metalness: 0 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const gridHelper = new THREE.GridHelper(400, 182, 0x22d3ee, 0x27335e);
gridHelper.material.transparent = true; gridHelper.material.opacity = 0.32;
gridHelper.position.y = 0.02; scene.add(gridHelper);

/* Corridor walls (speed sensation) */
for (const side of [-1, 1]) {
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 18),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  wall.rotation.y = Math.PI / 2;
  wall.position.set(side * 27.5, 9, 0);
  wall.name = side < 0 ? 'wallL' : 'wallR';
  scene.add(wall);
}

/* Stars (follow player) */
const starGroup = new THREE.Group(); scene.add(starGroup);
{
  const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 320;
    pos[i * 3 + 1] = -8 + Math.random() * 80;
    pos[i * 3 + 2] = -30 + Math.random() * 260;
    c.setHSL(Math.random() < 0.3 ? 0.85 : 0.52, 0.8, 0.55 + Math.random() * 0.4);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  starGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));
}

/* Pillars — one InstancedMesh for every chunk */
const pillarGeo = new THREE.BoxGeometry(1.7, 1, 1.7);
const pillarMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.18 });
const pillarsMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, MAX_INSTANCES);
pillarsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pillarsMesh.count = 0; pillarsMesh.frustumCulled = false;
scene.add(pillarsMesh);
{ const c = new THREE.Color(0xffffff); for (let i = 0; i < MAX_INSTANCES; i++) pillarsMesh.setColorAt(i, c); }

/* Ship */
const ship = new THREE.Group(); scene.add(ship);
{
  const bodyGeo = new THREE.ConeGeometry(0.55, 2.4, 6);
  bodyGeo.rotateX(Math.PI / 2); // tip points +Z (forward)
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0e7490, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6 }));
  ship.add(body);
  const wingGeo = new THREE.BoxGeometry(2.2, 0.12, 0.9);
  const wings = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0xe879f9, emissive: 0x86198f, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.5 }));
  wings.position.z = -0.7; ship.add(wings);
  const shipLight = new THREE.PointLight(0x22d3ee, 120, 34, 1.8);
  shipLight.position.set(0, 0.5, -1); ship.add(shipLight);
  // glow sprite
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const grad = cx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(120,240,255,0.9)'); grad.addColorStop(0.4, 'rgba(34,211,238,0.35)'); grad.addColorStop(1, 'rgba(34,211,238,0)');
  cx.fillStyle = grad; cx.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(3.2, 3.2, 1); ship.add(glow);
}

/* Particles */
const P_MAX = 1600;
const pPos = new Float32Array(P_MAX * 3), pCol = new Float32Array(P_MAX * 3);
const pVel = new Float32Array(P_MAX * 3), pLife = new Float32Array(P_MAX), pMaxLife = new Float32Array(P_MAX);
const pBaseCol = new Float32Array(P_MAX * 3);
let pCursor = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
particles.frustumCulled = false; scene.add(particles);
for (let i = 0; i < P_MAX; i++) pPos[i * 3 + 1] = -9999;
const _pc = new THREE.Color();
function spawnParticles(wx, wy, wz, colorHex, count, speed = 5, life = 0.8) {
  _pc.set(colorHex);
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

/* DNA orbs */
const orbs = [];
{
  const orbGeo = new THREE.SphereGeometry(0.55, 14, 14);
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 2.2, roughness: 0.2 }));
    m.visible = false; scene.add(m);
    orbs.push({ mesh: m, active: false, shield: false, phase: Math.random() * 6.28 });
  }
}
function spawnOrb(shield = false) {
  const o = orbs.find(o => !o.active); if (!o) return;
  // find an empty-ish spot ahead
  for (let tries = 0; tries < 12; tries++) {
    const ch = chunks[Math.floor(Math.random() * chunks.length)];
    if (!ch) return;
    const gx = Math.floor(Math.random() * W), gz = Math.floor(Math.random() * CHUNK_D);
    const wx = gx * SPACING - (W / 2) * SPACING + SPACING / 2;
    const wz = ch.zStart + gz * SPACING + SPACING / 2;
    if (wz < playerZ + 18 || wz > playerZ + 130) continue;
    o.active = true; o.shield = shield;
    o.mesh.visible = true;
    o.mesh.material.color.set(shield ? 0xfbbf24 : 0x22d3ee);
    o.mesh.material.emissive.set(shield ? 0xfbbf24 : 0x22d3ee);
    o.mesh.position.set(wx, 2.5 + Math.random() * 7, wz);
    o.baseY = o.mesh.position.y;
    return;
  }
}

/* ─────────────────────────── LIFE CHUNKS ────────────────────── */
const PATTERNS_2D = {
  glider: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  acorn: [[1, 0], [3, 0], [0, 1], [3, 1], [4, 1], [5, 1], [6, 1]],
  rpent: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
  lwss: [[1, 0], [3, 0], [0, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2]],
};
function makeChunk(zStart) {
  const ch = {
    zStart,
    grid: new Uint8Array(W * CHUNK_D),
    next: new Uint8Array(W * CHUNK_D),
    age: new Uint16Array(W * CHUNK_D),
    heights: new Float32Array(W * CHUNK_D),
    targets: new Float32Array(W * CHUNK_D),
    nearCd: new Float32Array(W * CHUNK_D),
    gen: 0, pop: 0, oldest: 0, timer: Math.random() * LIFE_INTERVAL,
    hashes: [],
  };
  seedChunk(ch);
  return ch;
}
function seedChunk(ch) {
  ch.grid.fill(0); ch.age.fill(0); ch.gen = 0; ch.hashes = [];
  const density = 0.20 + Math.random() * 0.07;
  for (let i = 0; i < ch.grid.length; i++) {
    if (Math.random() < density) { ch.grid[i] = 1; ch.age[i] = Math.floor(Math.random() * 4); }
  }
  // stamp 1-2 patterns for interesting structures
  const keys = Object.keys(PATTERNS_2D);
  const nPat = 1 + Math.floor(Math.random() * 2);
  for (let p = 0; p < nPat; p++) {
    const pat = PATTERNS_2D[keys[Math.floor(Math.random() * keys.length)]];
    const ox = 2 + Math.floor(Math.random() * (W - 9)), oz = 2 + Math.floor(Math.random() * (CHUNK_D - 5));
    for (const [px, pz] of pat) {
      const x = (ox + px) % W, z = oz + pz;
      if (z < CHUNK_D) { const i = z * W + x; ch.grid[i] = 1; ch.age[i] = 0; }
    }
  }
  refreshTargets(ch);
  ch.heights.set(ch.targets); // new chunks appear at full height (far away, fogged)
  recountChunk(ch);
}
function refreshTargets(ch) {
  for (let i = 0; i < ch.grid.length; i++) {
    ch.targets[i] = ch.grid[i] ? BASE_H + ch.age[i] * H_PER_AGE : 0;
  }
}
function recountChunk(ch) {
  let pop = 0, oldest = 0;
  for (let i = 0; i < ch.grid.length; i++) if (ch.grid[i]) { pop++; if (ch.age[i] > oldest) oldest = ch.age[i]; }
  ch.pop = pop; ch.oldest = oldest;
}
function hashGrid(grid) {
  let h = 2166136261;
  for (let i = 0; i < grid.length; i++) { h ^= grid[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function cellWorld(ch, gx, gz) {
  return { x: gx * SPACING - (W / 2) * SPACING + SPACING / 2, z: ch.zStart + gz * SPACING + SPACING / 2 };
}
function explodeCell(ch, gx, gz, big = false) {
  const i = gz * W + gx;
  ch.grid[i] = 0; ch.age[i] = 0; ch.targets[i] = 0;
  const w = cellWorld(ch, gx, gz);
  spawnParticles(w.x, BASE_H + ch.heights[i] * 0.5, w.z, ch.age[i] >= MAX_AGE - 3 ? 0xffffff : 0xe879f9, big ? 10 : 5, big ? 7 : 4.5, 0.8);
}
function stepLife(ch) {
  const { grid, next, age } = ch;
  let explosions = 0;
  for (let gz = 0; gz < CHUNK_D; gz++) for (let gx = 0; gx < W; gx++) {
    const i = gz * W + gx;
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = (gx + dx + W) % W, nz = gz + dz;
      if (nz < 0 || nz >= CHUNK_D) continue;
      if (grid[nz * W + nx]) n++;
    }
    const alive = grid[i];
    next[i] = alive ? (surviveSet.has(n) ? 1 : 0) : (birthSet.has(n) ? 1 : 0);
  }
  // apply + ages + age-explosions
  for (let gz = 0; gz < CHUNK_D; gz++) for (let gx = 0; gx < W; gx++) {
    const i = gz * W + gx;
    if (next[i]) {
      if (!grid[i]) age[i] = 0; else age[i]++;
      if (age[i] >= MAX_AGE) { next[i] = 0; explosions++; }
    } else age[i] = 0;
  }
  // swap
  const tmp = ch.grid; ch.grid = ch.next; ch.next = tmp;
  ch.gen++;
  refreshTargets(ch);
  recountChunk(ch);

  /* Stagnation / repeat detection */
  const h = hashGrid(ch.grid);
  const repeated = ch.hashes.includes(h);
  ch.hashes.push(h); if (ch.hashes.length > 4) ch.hashes.shift();
  if (repeated && ch.gen > 6 && ch.pop > 8) {
    // stagnant or oscillating pattern: everything older than 4 explodes
    let count = 0;
    for (let gz = 0; gz < CHUNK_D; gz++) for (let gx = 0; gx < W; gx++) {
      const i = gz * W + gx;
      if (ch.grid[i] && ch.age[i] >= 4) { explodeCell(ch, gx, gz, true); count++; }
    }
    if (count > 0) {
      refreshTargets(ch); recountChunk(ch);
      bonusScore += Math.min(200, count * 10);
      showWarn();
      AudioSys.explosion(false);
      if (state === 'playing') toast(`💥 <b>Stagnation!</b> ${count} pillars exploded — pattern was repeating.`, false, 3200);
    }
    ch.hashes = [];
  }
  /* Extinct chunk? Reseed so the world never goes empty */
  if (ch.pop === 0) seedChunk(ch);
}

/* Age-explosion particles need the dying positions: patch stepLife by wrapping.
   We re-implement the age-death particle spawn by tracking deaths in stepLife2. */
const _origStep = stepLife;
// (stepLife above already handles logic; particles for age deaths are added here via a lightweight wrapper)
function stepLifeWithFx(ch) {
  // snapshot old ages/heights to find age deaths after step
  const before = new Uint8Array(ch.grid);
  const beforeAge = new Uint16Array(ch.age);
  _origStep(ch);
  // find cells that were alive+old before and are dead now with age>=MAX_AGE-1 before
  let fx = 0;
  for (let gz = 0; gz < CHUNK_D && fx < 10; gz++) for (let gx = 0; gx < W && fx < 10; gx++) {
    const i = gz * W + gx;
    if (before[i] && beforeAge[i] >= MAX_AGE - 1 && !ch.grid[i]) {
      const w = cellWorld(ch, gx, gz);
      spawnParticles(w.x, BASE_H + beforeAge[i] * H_PER_AGE * 0.5, w.z, 0xffffff, 6, 5, 0.8);
      fx++;
    }
  }
  if (fx > 0) { bonusScore += fx * 10; if (fx >= 3) AudioSys.explosion(false); }
}

/* ─────────────────────────── GAME STATE ─────────────────────── */
let state = 'menu'; // menu | playing | paused | gameover
let chunks = [];
let playerZ = 0, shipX = 0, shipY = 6, targetX = 0, targetY = 6;
let speed = 12, baseSpeed = 14, distance = 0, score = 0, bonusScore = 0;
let dna = 0, combo = 0, comboTimer = 0, shield = false, invuln = 0;
let shake = 0, boostHeld = false, nextShieldAt = 700, lastSpeedLevel = 0;
let best = 0; try { best = +localStorage.getItem('ee_best') || 0; } catch (e) { }
if (best > 0) $('best-line').textContent = `🏆 Best score: ${best.toLocaleString()}`;

function resetWorld() {
  chunks = [];
  let z = -28;
  for (let i = 0; i < N_CHUNKS; i++) { chunks.push(makeChunk(z)); z += CHUNK_D * SPACING; }
  playerZ = 0; shipX = 0; shipY = 6; targetX = 0; targetY = 6;
  distance = 0; bonusScore = 0; dna = 0; combo = 0; comboTimer = 0;
  shield = false; invuln = 0; shake = 0; nextShieldAt = 700; lastSpeedLevel = 0;
  baseSpeed = 14; speed = 12;
  for (const o of orbs) { o.active = false; o.mesh.visible = false; }
  ship.visible = true;
  els.shield.classList.add('hidden');
}
function updateChunks() {
  // remove behind, add ahead
  while (chunks.length && chunks[0].zStart + CHUNK_D * SPACING < playerZ - 30) chunks.shift();
  while (chunks.length < N_CHUNKS) {
    const last = chunks[chunks.length - 1];
    chunks.push(makeChunk(last.zStart + CHUNK_D * SPACING));
  }
  for (const ch of chunks) {
    ch.timer += lastDt;
    if (ch.timer >= LIFE_INTERVAL) { ch.timer = 0; stepLifeWithFx(ch); }
  }
}

/* ─────────────────────────── RENDERING ──────────────────────── */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
function ageColor(a, out, now) {
  if (a >= MAX_AGE - 3) { // white-hot, about to explode (pulsing)
    const pulse = 0.75 + 0.25 * Math.sin(now * 10 + a);
    out.setHSL(0.0, 0.3, 0.85 * pulse + 0.1);
  } else if (a === 0) out.setHSL(0.52, 1.0, 0.72);
  else if (a === 1) out.setHSL(0.46, 0.95, 0.60);
  else if (a <= 3) out.setHSL(0.30, 0.9, 0.55);
  else if (a <= 7) out.setHSL(0.10, 0.95, 0.55);
  else if (a <= 14) out.setHSL(0.86, 0.9, 0.60);
  else out.setHSL(0.74, 0.85, 0.66);
  return out;
}
function renderPillars(dt, now) {
  let n = 0;
  const growK = Math.min(1, dt * 5.5);
  for (const ch of chunks) {
    for (let gz = 0; gz < CHUNK_D; gz++) for (let gx = 0; gx < W; gx++) {
      const i = gz * W + gx;
      ch.heights[i] += (ch.targets[i] - ch.heights[i]) * growK;
      const h = ch.heights[i];
      if (h < 0.06) continue;
      const w = cellWorld(ch, gx, gz);
      _p.set(w.x, h / 2, w.z); _s.set(1, h, 1);
      _m.compose(_p, _q, _s);
      pillarsMesh.setMatrixAt(n, _m);
      ageColor(ch.age[i], _c, now);
      pillarsMesh.setColorAt(n, _c);
      n++;
    }
  }
  pillarsMesh.count = n;
  pillarsMesh.instanceMatrix.needsUpdate = true;
  if (pillarsMesh.instanceColor) pillarsMesh.instanceColor.needsUpdate = true;
}
function updateShipAndCamera(dt, now) {
  // ship follows target with banking
  const prevX = shipX, prevY = shipY;
  const k = 1 - Math.pow(0.0005, dt);
  shipX += (targetX - shipX) * k;
  shipY += (targetY - shipY) * k;
  ship.position.set(shipX, shipY, playerZ);
  const vx = (shipX - prevX) / Math.max(dt, 0.001), vy = (shipY - prevY) / Math.max(dt, 0.001);
  ship.rotation.z = THREE.MathUtils.clamp(-vx * 0.028, -0.7, 0.7);
  ship.rotation.x = THREE.MathUtils.clamp(vy * 0.02, -0.45, 0.45);
  // engine trail
  if (state === 'playing' || state === 'menu') {
    spawnParticles(shipX, shipY, playerZ - 1.2, 0x22d3ee, 1, 0.6, 0.45);
  }
  // camera chase
  const camK = 1 - Math.pow(0.001, dt);
  camera.position.x += (shipX * 0.62 - camera.position.x) * camK;
  camera.position.y += (shipY + 3.4 - camera.position.y) * camK;
  camera.position.z += (playerZ - 9.5 - camera.position.z) * camK;
  if (shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake *= Math.pow(0.001, dt);
  }
  camera.lookAt(shipX * 0.85, shipY + 0.4, playerZ + 14);
  const targetFov = 62 + (speed - 14) * 0.5 + (boostHeld && state === 'playing' ? 9 : 0);
  if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  // followers
  ground.position.z = playerZ + 90;
  gridHelper.position.z = Math.round(playerZ / SPACING) * SPACING + 60;
  starGroup.position.z = playerZ;
  for (const nm of ['wallL', 'wallR']) { const w = scene.getObjectByName(nm); if (w) w.position.z = playerZ + 90; }
  const t = now * 0.22;
  pCyan.position.set(shipX + Math.cos(t) * 26, 12, playerZ + 30 + Math.sin(t) * 26);
  pMag.position.set(shipX + Math.cos(t + Math.PI) * 26, 9, playerZ + 30 + Math.sin(t + Math.PI) * 26);
}

/* ─────────────────────────── COLLISION & PICKUPS ────────────── */
function checkCollisions() {
  if (state !== 'playing' || invuln > 0) return;
  // ground
  if (shipY < 1.0) return crash('You flew into the ground!');
  for (const ch of chunks) {
    if (ch.zStart > playerZ + 4 || ch.zStart + CHUNK_D * SPACING < playerZ - 4) continue;
    for (let gz = 0; gz < CHUNK_D; gz++) for (let gx = 0; gx < W; gx++) {
      const i = gz * W + gx;
      const h = ch.targets[i];
      if (h < 1) continue;
      const w = cellWorld(ch, gx, gz);
      const dx = Math.abs(shipX - w.x), dz = Math.abs(playerZ - w.z);
      if (dx < 1.15 && dz < 1.15 && shipY < h - 0.3) {
        return crash('You hit a pillar!');
      }
      // near miss: close but not hitting
      if (ch.nearCd[i] <= 0 && dx < 2.3 && dz < 2.3 && shipY < h + 1.6 && shipY >= h - 0.3) {
        ch.nearCd[i] = 2.5;
        combo++; comboTimer = 4;
        dna += 2; bonusScore += 100 * Math.max(1, combo);
        AudioSys.nearMiss();
        spawnParticles(shipX, shipY, playerZ, 0xfbbf24, 8, 3, 0.5);
      }
    }
  }
}
function checkOrbs(dt) {
  for (const o of orbs) {
    if (!o.active) continue;
    o.mesh.rotation.y += dt * 2.4;
    o.mesh.position.y = o.baseY + Math.sin(performance.now() / 400 + o.phase) * 0.4;
    if (state !== 'playing') continue;
    const d = o.mesh.position.distanceTo(ship.position);
    if (d < 1.9) {
      o.active = false; o.mesh.visible = false;
      if (o.shield) {
        shield = true; els.shield.classList.remove('hidden');
        toast('🛡️ <b>Shield!</b> Survive one crash.', true, 3000);
        AudioSys.shieldUp();
      } else {
        combo++; comboTimer = 4;
        dna += 1; bonusScore += 50 * Math.max(1, combo);
        AudioSys.pickup(combo);
        spawnParticles(o.mesh.position.x, o.mesh.position.y, o.mesh.position.z, 0x22d3ee, 10, 3.5, 0.6);
      }
    }
  }
}
function crash(msg) {
  if (shield) {
    shield = false; invuln = 2.5; els.shield.classList.add('hidden');
    shake = 1.6;
    spawnParticles(shipX, shipY, playerZ, 0xfbbf24, 50, 8, 1.0);
    AudioSys.explosion(true);
    toast(`🛡️ Shield saved you! <b>${msg}</b>`, true, 3200);
    return;
  }
  state = 'gameover';
  ship.visible = false;
  shake = 2.2;
  spawnParticles(shipX, shipY, playerZ, 0x22d3ee, 70, 9, 1.2);
  spawnParticles(shipX, shipY, playerZ, 0xe879f9, 40, 7, 1.0);
  AudioSys.crash();
  AudioSys.setEngine(0, false);
  const finalScore = Math.floor(distance * 2 + bonusScore);
  if (finalScore > best) { best = finalScore; try { localStorage.setItem('ee_best', best); } catch (e) { } }
  $('final-score').textContent = finalScore.toLocaleString();
  $('final-dist').textContent = Math.floor(distance) + 'm';
  $('final-dna').textContent = dna;
  $('final-best').textContent = best.toLocaleString();
  setTimeout(() => {
    $('hud').classList.add('hidden');
    $('gameover-screen').classList.remove('hidden');
  }, 1100);
}

/* ─────────────────────────── INPUT ──────────────────────────── */
const keys = new Set();
let mouseActive = false;
window.addEventListener('mousemove', e => {
  if (state !== 'playing') return;
  mouseActive = true;
  targetX = ((e.clientX / window.innerWidth) * 2 - 1) * 24;
  targetY = 1.5 + (1 - e.clientY / window.innerHeight) * 13.5;
});
window.addEventListener('touchmove', e => {
  if (state !== 'playing' || !e.touches.length) return;
  const t = e.touches[0];
  targetX = ((t.clientX / window.innerWidth) * 2 - 1) * 24;
  targetY = 1.5 + (1 - t.clientY / window.innerHeight) * 13.5;
  e.preventDefault();
}, { passive: false });
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  if (k === 'shift') boostHeld = true;
  if (k === 'p' || k === 'escape') togglePause();
  if (k === 'm') toggleSound();
  if (k === 'enter' && state === 'menu') startGame();
  if (k === 'enter' && state === 'gameover') restart();
});
window.addEventListener('keyup', e => {
  keys.delete(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'shift') boostHeld = false;
});
$('boost-btn').addEventListener('pointerdown', e => { e.preventDefault(); boostHeld = true; });
$('boost-btn').addEventListener('pointerup', () => boostHeld = false);
$('boost-btn').addEventListener('pointerleave', () => boostHeld = false);
function keyboardSteer(dt) {
  let mx = 0, my = 0;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (keys.has('w') || keys.has('arrowup')) my += 1;
  if (keys.has('s') || keys.has('arrowdown')) my -= 1;
  if (mx || my) {
    mouseActive = false;
    targetX = THREE.MathUtils.clamp(targetX + mx * 30 * dt, -24, 24);
    targetY = THREE.MathUtils.clamp(targetY + my * 20 * dt, 1.2, 15);
  }
}

/* ─────────────────────────── UI ─────────────────────────────── */
function toast(html, gold = false, dur = 3200) {
  const t = document.createElement('div');
  t.className = 'toast' + (gold ? ' gold' : ''); t.innerHTML = html;
  els.toasts.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, dur);
}
let warnTimer = null;
function showWarn() {
  els.warn.classList.remove('hidden');
  clearTimeout(warnTimer);
  warnTimer = setTimeout(() => els.warn.classList.add('hidden'), 2600);
}
function updateHUD() {
  els.score.textContent = Math.floor(distance * 2 + bonusScore).toLocaleString();
  els.dist.textContent = Math.floor(distance) + 'm';
  els.dna.textContent = dna;
  els.speed.textContent = Math.round(speed);
  els.combo.textContent = '×' + Math.max(1, combo);
  let gen = 0, pop = 0, oldest = 0;
  for (const ch of chunks) { gen += ch.gen; pop += ch.pop; oldest = Math.max(oldest, ch.oldest); }
  els.lifeInfo.textContent = `Life (${RULES[ruleKey].name}): Gen ${gen} · Pop ${pop} · Oldest ${oldest}`;
}
function toggleSound() {
  AudioSys.init();
  AudioSys.setMuted(!AudioSys.muted);
  $('sound-btn').textContent = AudioSys.muted ? '🔇' : '🔊';
}
function togglePause() {
  if (state === 'playing') { state = 'paused'; $('pause-overlay').classList.remove('hidden'); AudioSys.setEngine(0, false); }
  else if (state === 'paused') { state = 'playing'; $('pause-overlay').classList.add('hidden'); }
}
function startGame() {
  AudioSys.init();
  resetWorld();
  state = 'playing';
  $('start-screen').classList.add('hidden');
  $('gameover-screen').classList.add('hidden');
  $('pause-overlay').classList.add('hidden');
  $('hud').classList.remove('hidden');
  toast('🚀 <b>Good luck!</b> Young pillars are short — old ones will kill you.', true, 4500);
  updateHUD();
}
function restart() { startGame(); }
function toMenu() {
  state = 'menu';
  resetWorld();
  $('gameover-screen').classList.add('hidden');
  $('pause-overlay').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('start-screen').classList.remove('hidden');
  AudioSys.setEngine(0, false);
}
$('play-btn').addEventListener('click', startGame);
$('restart-btn').addEventListener('click', restart);
$('menu-btn').addEventListener('click', toMenu);
$('resume-btn').addEventListener('click', togglePause);
$('quit-btn').addEventListener('click', toMenu);
$('pause-btn').addEventListener('click', togglePause);
$('sound-btn').addEventListener('click', toggleSound);
document.querySelectorAll('.rule-btn').forEach(b => b.addEventListener('click', () => {
  ruleKey = b.dataset.rule;
  birthSet = new Set(RULES[ruleKey].birth); surviveSet = new Set(RULES[ruleKey].survive);
  document.querySelectorAll('.rule-btn').forEach(x => x.classList.toggle('active', x === b));
  AudioSys.init(); AudioSys.click();
}));

/* ─────────────────────────── MAIN LOOP ──────────────────────── */
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let lastT = performance.now(), lastDt = 0.016, orbTimer = 0, hudTimer = 0, menuTime = 0;
function loop() {
  requestAnimationFrame(loop);
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - lastT) / 1000); lastT = nowMs; lastDt = dt;
  const now = nowMs / 1000;

  if (state === 'menu') {
    menuTime += dt;
    speed = 12;
    playerZ += speed * dt;
    targetX = Math.sin(menuTime * 0.45) * 11;
    targetY = 6 + Math.sin(menuTime * 0.7) * 2.2;
    updateChunks();
    AudioSys.setEngine(0.2, false);
  } else if (state === 'playing') {
    keyboardSteer(dt);
    targetX = THREE.MathUtils.clamp(targetX, -24, 24);
    targetY = THREE.MathUtils.clamp(targetY, 1.2, 15);
    baseSpeed = Math.min(32, 14 + Math.floor(distance / 400) * 0.7);
    speed = baseSpeed * (boostHeld ? 1.55 : 1);
    playerZ += speed * dt;
    distance += speed * dt;
    if (invuln > 0) invuln -= dt;
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }
    // speed level ups
    const lvl = Math.floor(distance / 400);
    if (lvl > lastSpeedLevel) { lastSpeedLevel = lvl; toast(`⚡ <b>Speed up!</b> ${Math.round(baseSpeed)} u/s`, true, 2600); AudioSys.speedup(); }
    if (distance >= nextShieldAt) { nextShieldAt += 700; spawnOrb(true); }
    orbTimer += dt; if (orbTimer > 0.7) { orbTimer = 0; spawnOrb(false); }
    updateChunks();
    checkCollisions();
    AudioSys.setEngine((speed - 12) / 24, true);
    hudTimer += dt; if (hudTimer > 0.15) { hudTimer = 0; updateHUD(); }
  } else if (state === 'gameover') {
    // drift forward slowly, world keeps living behind the overlay
    playerZ += 2 * dt;
    updateChunks();
  }
  // paused: freeze everything except render

  if (state !== 'paused') {
    renderPillars(dt, now);
    updateShipAndCamera(dt, now);
    updateParticles(dt);
    checkOrbs(dt);
    // decay near-miss cooldowns
    for (const ch of chunks) for (let i = 0; i < ch.nearCd.length; i++) if (ch.nearCd[i] > 0) ch.nearCd[i] -= dt;
  }
  renderer.render(scene, camera);
}

/* ─────────────────────────── BOOT ───────────────────────────── */
resetWorld();
camera.position.set(0, 9.4, -9.5);
loop();
