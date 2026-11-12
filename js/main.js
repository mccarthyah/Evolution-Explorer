/* ════════════════════════════════════════════════════════════════
   EVOLUTION EXPLORER — 3D Conway's Game of Life
   Seed life · Grow worlds · Bend evolution
   ════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* ─────────────────────────── CONFIG ─────────────────────────── */
const GX = 32, GY = 32, GZ = 14;          // grid dimensions (x, y-up, z)
const CELL = 1;
const MAX_CELLS = GX * GY * GZ;
const idx = (x, y, z) => (y * GZ + z) * GX + x;

const RULES = {
  stable:    { name: 'Stable 5766',   survive: [5, 6],    birth: [6, 7] },
  explosive: { name: 'Explosive 4555', survive: [4, 5],    birth: [5, 6] },
  maze:      { name: 'Maze 4565',      survive: [4, 5, 6], birth: [5] },
  chaos:     { name: 'Chaos 345456',   survive: [3, 4, 5], birth: [4, 5, 6] },
};
const LEVEL_THRESHOLDS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6000, 8000];

/* ─────────────────────────── STATE ──────────────────────────── */
let grid = new Uint8Array(MAX_CELLS);
let nextGrid = new Uint8Array(MAX_CELLS);
let age = new Uint16Array(MAX_CELLS);
let birthTime = new Float32Array(MAX_CELLS);
let generation = 0, population = 0, births = 0, deaths = 0;
let running = true, speed = 6;            // generations per second
let wrap = true, showParticles = true;
let ruleKey = 'stable';
let surviveSet = new Set(RULES.stable.survive), birthSet = new Set(RULES.stable.birth);
let brushSize = 2, tool = 'paint', selectedPattern = 'glider';
let dna = 0, level = 1, stampCount = 0;
let extinctSeen = false, phoenixArmed = false, extinctToastShown = false;
let stableCounter = 0, lastPop = 0;
let selectedWorld = 'soup';
let started = false;                       // start screen dismissed?
let shake = 0;
const popHistory = [];

/* ─────────────────────────── DOM ────────────────────────────── */
const $ = id => document.getElementById(id);
const canvas = $('game-canvas');
const els = {
  gen: $('stat-gen'), pop: $('stat-pop'), dna: $('stat-dna'), level: $('stat-level'),
  xpFill: $('xp-fill'), ruleName: $('rule-name'), births: $('stat-births'),
  deaths: $('stat-deaths'), fps: $('stat-fps'), brushVal: $('brush-val'),
  speedVal: $('speed-val'), densityVal: $('density-val'), hint: $('bottom-hint'),
  brushCursor: $('brush-cursor'), toasts: $('toasts'), questList: $('quest-list'),
  chart: $('pop-chart'),
};
const chartCtx = els.chart.getContext('2d');

/* ─────────────────────────── AUDIO ──────────────────────────── */
const AudioSys = {
  ctx: null, master: null, muted: false, lastPop: 0, ambientStarted: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    } catch (e) { /* audio unavailable */ }
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; },
  tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  pop() {
    const now = performance.now(); if (now - this.lastPop < 70) return; this.lastPop = now;
    this.tone(420 + Math.random() * 520, 0.09, 'sine', 0.10, 180);
  },
  explosion() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, dur = 0.45;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    this.tone(90, 0.4, 'sine', 0.3, 35);
  },
  zap() { this.tone(1300, 0.16, 'sawtooth', 0.08, 90); },
  click() { this.tone(700, 0.05, 'square', 0.05, 500); },
  quest() { this.tone(660, 0.12, 'sine', 0.12); this.tone(880, 0.2, 'sine', 0.12, null, 0.1); },
  levelUp() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.13, null, i * 0.09)); },
  startAmbient() {
    if (this.ambientStarted || !this.ctx) return; this.ambientStarted = true;
    const g = this.ctx.createGain(); g.gain.value = 0.028; g.connect(this.master);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.connect(g);
    [110, 164.8, 220].forEach(fr => { const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr; o.connect(f); o.start(); });
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.012; lfo.connect(lg); lg.connect(g.gain); lfo.start();
  },
};

/* ─────────────────────────── THREE SETUP ────────────────────── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
scene.fog = new THREE.FogExp2(0x05060f, 0.0075);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);

/* Camera rig (spherical orbit with damping) */
const cam = {
  target: new THREE.Vector3(0, 0, 0), desiredTarget: new THREE.Vector3(0, 0, 0),
  radius: 46, desiredRadius: 46, theta: 0.75, desiredTheta: 0.75,
  phi: 1.02, desiredPhi: 1.02, autoOrbit: true,
};
function updateCamera(dt) {
  if (cam.autoOrbit) cam.desiredTheta += dt * 0.12;
  const k = 1 - Math.pow(0.0001, dt); // smooth damping
  cam.theta += (cam.desiredTheta - cam.theta) * k;
  cam.phi += (cam.desiredPhi - cam.phi) * k;
  cam.radius += (cam.desiredRadius - cam.radius) * k;
  cam.target.lerp(cam.desiredTarget, k);
  cam.phi = THREE.MathUtils.clamp(cam.phi, 0.12, Math.PI - 0.12);
  cam.radius = THREE.MathUtils.clamp(cam.radius, 7, 110);
  const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
  camera.position.set(
    cam.target.x + cam.radius * sp * Math.sin(cam.theta),
    cam.target.y + cam.radius * cp,
    cam.target.z + cam.radius * sp * Math.cos(cam.theta));
  if (shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake *= Math.pow(0.001, dt);
  }
  camera.lookAt(cam.target);
}

/* Lights */
scene.add(new THREE.AmbientLight(0x8899ff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(24, 38, 14); scene.add(sun);
const pCyan = new THREE.PointLight(0x22d3ee, 900, 140, 1.6); scene.add(pCyan);
const pMag = new THREE.PointLight(0xe879f9, 900, 140, 1.6); scene.add(pMag);

/* Floor grid + bounding volume */
const floorGrid = new THREE.GridHelper(GX, GX, 0x22d3ee, 0x27335e);
floorGrid.position.y = -GY / 2 - 0.01;
floorGrid.material.transparent = true; floorGrid.material.opacity = 0.4;
scene.add(floorGrid);
const bbox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(GX, GY, GZ)),
  new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.22 }));
scene.add(bbox);
const hitBox = new THREE.Mesh(new THREE.BoxGeometry(GX, GY, GZ), new THREE.MeshBasicMaterial({ visible: false }));
scene.add(hitBox);

/* Starfield */
{
  const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const r = 130 + Math.random() * 160, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.cos(ph); pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    c.setHSL(Math.random() < 0.3 ? 0.85 : 0.52, 0.8, 0.55 + Math.random() * 0.4);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  stars.name = 'stars'; scene.add(stars);
}

/* Cells — one InstancedMesh for the whole world */
const cellGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const cellMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.15 });
const cellsMesh = new THREE.InstancedMesh(cellGeo, cellMat, MAX_CELLS);
cellsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cellsMesh.count = 0; cellsMesh.frustumCulled = false;
scene.add(cellsMesh);
{ const c = new THREE.Color(0xffffff); for (let i = 0; i < MAX_CELLS; i++) cellsMesh.setColorAt(i, c); }

/* Particles (birth bursts / explosions) */
const P_MAX = 1400;
const pPos = new Float32Array(P_MAX * 3), pCol = new Float32Array(P_MAX * 3);
const pVel = new Float32Array(P_MAX * 3), pLife = new Float32Array(P_MAX), pMaxLife = new Float32Array(P_MAX);
const pBaseCol = new Float32Array(P_MAX * 3);
let pCursor = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
particles.frustumCulled = false; scene.add(particles);
for (let i = 0; i < P_MAX; i++) { pPos[i * 3 + 1] = -9999; }

const _pc = new THREE.Color();
function spawnParticles(wx, wy, wz, colorHex, count, speed = 4, life = 0.7) {
  if (!showParticles) return;
  _pc.set(colorHex);
  for (let n = 0; n < count; n++) {
    const i = pCursor; pCursor = (pCursor + 1) % P_MAX;
    pPos[i * 3] = wx; pPos[i * 3 + 1] = wy; pPos[i * 3 + 2] = wz;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = speed * (0.4 + Math.random() * 0.9);
    pVel[i * 3] = sp * Math.sin(ph) * Math.cos(th); pVel[i * 3 + 1] = sp * Math.cos(ph) + 1.2; pVel[i * 3 + 2] = sp * Math.sin(ph) * Math.sin(th);
    pBaseCol[i * 3] = _pc.r; pBaseCol[i * 3 + 1] = _pc.g; pBaseCol[i * 3 + 2] = _pc.b;
    pLife[i] = 0; pMaxLife[i] = life * (0.6 + Math.random() * 0.8);
  }
}
function updateParticles(dt) {
  for (let i = 0; i < P_MAX; i++) {
    if (pLife[i] >= pMaxLife[i]) { if (pPos[i * 3 + 1] !== -9999) { pPos[i * 3 + 1] = -9999; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; } continue; }
    pLife[i] += dt;
    const f = Math.max(0, 1 - pLife[i] / pMaxLife[i]);
    pVel[i * 3 + 1] -= 3.2 * dt; // gentle gravity
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    pCol[i * 3] = pBaseCol[i * 3] * f; pCol[i * 3 + 1] = pBaseCol[i * 3 + 1] * f; pCol[i * 3 + 2] = pBaseCol[i * 3 + 2] * f;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

/* ─────────────────────────── SIMULATION ─────────────────────── */
function countNeighbors(x, y, z) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy && !dz) continue;
    let nx = x + dx, ny = y + dy, nz = z + dz;
    if (wrap) {
      nx = (nx + GX) % GX; ny = (ny + GY) % GY; nz = (nz + GZ) % GZ;
    } else if (nx < 0 || ny < 0 || nz < 0 || nx >= GX || ny >= GY || nz >= GZ) continue;
    if (grid[idx(nx, ny, nz)]) n++;
  }
  return n;
}

function stepSimulation() {
  const now = performance.now() / 1000;
  let b = 0, d = 0, pop = 0;
  for (let y = 0; y < GY; y++) for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) {
    const i = idx(x, y, z), alive = grid[i];
    const n = countNeighbors(x, y, z);
    const next = alive ? (surviveSet.has(n) ? 1 : 0) : (birthSet.has(n) ? 1 : 0);
    nextGrid[i] = next;
    if (next) {
      pop++;
      if (!alive) { b++; age[i] = 0; birthTime[i] = now; }
      else age[i]++;
    } else if (alive) d++;
  }
  const tmp = grid; grid = nextGrid; nextGrid = tmp;
  generation++; population = pop; births = b; deaths = d;

  /* DNA economy */
  const mult = 1 + (level - 1) * 0.25;
  dna += Math.floor(Math.min(15, b / 8) * mult);
  if (pop > lastPop) dna += 1;
  lastPop = pop;

  /* Birth particles + sound (sampled to avoid overload) */
  if (b > 0 && showParticles) {
    let spawned = 0;
    for (let y = 0; y < GY && spawned < 14; y++) for (let z = 0; z < GZ && spawned < 14; z++) for (let x = 0; x < GX && spawned < 14; x++) {
      const i = idx(x, y, z);
      if (grid[i] && age[i] === 0 && Math.random() < 0.25) {
        spawnParticles(x - GX / 2 + 0.5, y - GY / 2 + 0.5, z - GZ / 2 + 0.5, 0x22d3ee, 2, 2.6, 0.55);
        spawned++;
      }
    }
  }
  if (b > 4) AudioSys.pop();

  /* Extinction / phoenix tracking */
  if (pop === 0 && generation > 8) {
    if (!extinctToastShown) { extinctToastShown = true; toast('💀 <b>Extinct!</b> Paint new life or press 🎲 Random.', false, 4500); }
    if (!phoenixArmed && started) phoenixArmed = true;
  } else if (pop > 0) extinctToastShown = false;

  /* Stability tracking (still-life detection) */
  if (pop > 100 && Math.abs(pop - (stepSimulation._prevPop || pop)) <= Math.max(2, pop * 0.02)) stableCounter++;
  else stableCounter = 0;
  stepSimulation._prevPop = pop;

  popHistory.push(pop); if (popHistory.length > 140) popHistory.shift();
  checkQuests(); updateLevel(); updateHUD();
}

/* ─────────────────────────── PATTERNS & WORLDS ──────────────── */
function pulsarCells() {
  const cells = [];
  const rows = { 0: [2, 3, 4, 10, 11, 12], 2: [0, 5, 7, 12], 3: [0, 5, 7, 12], 4: [0, 5, 7, 12], 5: [2, 3, 4, 10, 11, 12], 7: [2, 3, 4, 10, 11, 12], 8: [0, 5, 7, 12], 9: [0, 5, 7, 12], 10: [0, 5, 7, 12], 12: [2, 3, 4, 10, 11, 12] };
  for (const [r, cols] of Object.entries(rows)) for (const c of cols) cells.push([c, 0, +r]);
  return cells;
}
function gunCells() {
  const pts = [[1,5],[2,5],[1,6],[2,6],[11,5],[11,6],[11,7],[12,4],[12,8],[13,3],[13,9],[14,3],[14,9],[15,6],[16,2],[16,10],[17,2],[17,10],[18,6],[19,1],[19,11],[20,1],[20,11],[21,2],[21,10],[22,3],[22,9],[23,4],[23,8],[24,5],[24,6],[24,7],[35,3],[35,4],[36,2],[36,6],[37,2],[37,6],[38,3],[38,4]];
  return pts.map(([x, z]) => [x, 0, z]);
}
function helixCells() {
  const cells = [];
  for (let i = 0; i < 22; i++) {
    const a = i * 0.55, y = i;
    cells.push([Math.round(3 + 2.4 * Math.cos(a)), y, Math.round(3 + 2.4 * Math.sin(a))]);
    cells.push([Math.round(3 + 2.4 * Math.cos(a + Math.PI)), y, Math.round(3 + 2.4 * Math.sin(a + Math.PI))]);
    if (i % 2 === 0) cells.push([3, y, 3]);
  }
  return cells;
}
const PATTERNS = {
  glider:   { name: 'Glider', icon: '🛸', cells: [[1,0,0],[2,0,1],[0,0,2],[1,0,2],[2,0,2]] },
  lwss:     { name: 'Spaceship', icon: '🚀', cells: [[1,0,0],[3,0,0],[0,0,1],[4,0,1],[0,0,2],[1,0,2],[2,0,2],[3,0,2]] },
  pulsar:   { name: 'Pulsar', icon: '💓', cells: pulsarCells() },
  acorn:    { name: 'Acorn', icon: '🌰', cells: [[1,0,0],[3,0,0],[0,0,1],[3,0,1],[4,0,1],[5,0,1],[6,0,1]] },
  rpent:    { name: 'R-pentomino', icon: '🎲', cells: [[1,0,0],[2,0,0],[0,0,1],[1,0,1],[1,0,2]] },
  gun:      { name: 'Glider Gun', icon: '🔫', cells: gunCells() },
  cube:     { name: 'Cube 3³', icon: '🧊', cells: (() => { const c = []; for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) c.push([x, y, z]); return c; })() },
  helix:    { name: 'DNA Helix', icon: '🧬', cells: helixCells() },
};

function clearWorld() {
  grid.fill(0); age.fill(0); generation = 0; population = 0; births = deaths = 0;
  popHistory.length = 0; stableCounter = 0; lastPop = 0;
}
function setCell(x, y, z, v) {
  if (x < 0 || y < 0 || z < 0 || x >= GX || y >= GY || z >= GZ) {
    if (!wrap) return;
    x = ((x % GX) + GX) % GX; y = ((y % GY) + GY) % GY; z = ((z % GZ) + GZ) % GZ;
  }
  const i = idx(x, y, z); grid[i] = v;
  if (v) { age[i] = 0; birthTime[i] = performance.now() / 1000; }
}
function recount() { let p = 0; for (let i = 0; i < MAX_CELLS; i++) if (grid[i]) p++; population = p; }
function seedSoup(density = 0.18) {
  clearWorld();
  for (let i = 0; i < MAX_CELLS; i++) if (Math.random() < density) { grid[i] = 1; age[i] = Math.floor(Math.random() * 4); birthTime[i] = performance.now() / 1000; }
  recount();
}
function stampPattern(key, cx, cy, cz) {
  const p = PATTERNS[key]; if (!p) return;
  const ox = Math.round(cx - 3), oy = Math.round(cy), oz = Math.round(cz - 3);
  for (const [x, y, z] of p.cells) setCell(ox + x, oy + y, oz + z, 1);
  recount(); stampCount++;
  spawnParticles(cx - GX / 2 + 0.5, cy - GY / 2 + 0.5, cz - GZ / 2 + 0.5, 0xe879f9, 26, 5, 0.8);
  AudioSys.quest();
}
function seedWorld(name) {
  clearWorld();
  const midY = Math.floor(GY / 2);
  if (name === 'soup') seedSoup(parseFloat($('density-slider').value) / 100);
  else if (name === 'glidergun') { stampPattern('gun', 2, midY, 2); }
  else if (name === 'acorn') { stampPattern('acorn', Math.floor(GX / 2), midY, Math.floor(GZ / 2)); }
  else if (name === 'pulsar') { stampPattern('pulsar', Math.floor(GX / 2), midY, Math.floor(GZ / 2)); }
  else if (name === 'helix') { stampPattern('helix', Math.floor(GX / 2) - 3, 4, Math.floor(GZ / 2) - 3); }
  else if (name === 'empty') { /* blank slate */ }
  recount(); updateHUD();
}

/* ─────────────────────────── RENDERING CELLS ────────────────── */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function ageColor(a, out) {
  if (a === 0) out.setHSL(0.52, 1.0, 0.78);
  else if (a === 1) out.setHSL(0.46, 0.95, 0.62);
  else if (a <= 3) out.setHSL(0.30, 0.9, 0.55);
  else if (a <= 7) out.setHSL(0.10, 0.95, 0.55);
  else if (a <= 14) out.setHSL(0.86, 0.9, 0.62);
  else out.setHSL(0.74, 0.85, 0.68);
  return out;
}
let centroid = new THREE.Vector3(0, 0, 0);
function renderCells(now) {
  let n = 0, cx = 0, cy = 0, cz = 0;
  for (let y = 0; y < GY; y++) for (let z = 0; z < GZ; z++) for (let x = 0; x < GX; x++) {
    const i = idx(x, y, z);
    if (!grid[i]) continue;
    const wx = x - GX / 2 + 0.5, wy = y - GY / 2 + 0.5, wz = z - GZ / 2 + 0.5;
    let s = 1;
    const t = (now - birthTime[i]) / 0.28;
    if (t < 1) s = Math.max(0.05, easeOutBack(Math.max(0, t)));
    else s = 1 + 0.035 * Math.sin(now * 2.6 + age[i] * 0.6 + x * 0.35 + z * 0.35);
    _p.set(wx, wy, wz); _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    cellsMesh.setMatrixAt(n, _m);
    ageColor(age[i], _c);
    const shade = 0.72 + 0.28 * (y / GY); // depth cue: higher = brighter
    _c.multiplyScalar(shade);
    cellsMesh.setColorAt(n, _c);
    n++; cx += wx; cy += wy; cz += wz;
  }
  cellsMesh.count = n;
  cellsMesh.instanceMatrix.needsUpdate = true;
  if (cellsMesh.instanceColor) cellsMesh.instanceColor.needsUpdate = true;
  if (n > 0) centroid.set(cx / n, cy / n, cz / n);
}

/* ─────────────────────────── QUESTS & LEVELS ────────────────── */
const QUESTS = [
  { id: 'first', title: '🌱 First Life', desc: 'Reach 50 population', reward: 50, progress: () => Math.min(1, population / 50) },
  { id: 'boom', title: '💥 Population Boom', desc: 'Reach 400 population', reward: 100, progress: () => Math.min(1, population / 400) },
  { id: 'survivor', title: '⏳ Survivor', desc: 'Reach generation 100', reward: 80, progress: () => Math.min(1, generation / 100) },
  { id: 'ancient', title: '🦕 Ancient World', desc: 'Reach generation 300', reward: 150, progress: () => Math.min(1, generation / 300) },
  { id: 'phoenix', title: '🔥 Phoenix', desc: 'Go extinct, then reach 100 again', reward: 120, progress: () => phoenixArmed ? Math.min(1, population / 100) : 0 },
  { id: 'still', title: '🧊 Still Life', desc: 'Stable population (100+) for 15 generations', reward: 100, progress: () => Math.min(1, stableCounter / 15) },
  { id: 'patterns', title: '🔷 Pattern Master', desc: 'Stamp 5 patterns', reward: 80, progress: () => Math.min(1, stampCount / 5) },
  { id: 'hoarder', title: '🧬 DNA Hoarder', desc: 'Hold 500 DNA', reward: 100, progress: () => Math.min(1, dna / 500) },
];
const questDone = new Set();
function checkQuests() {
  if (!started) return;
  for (const q of QUESTS) {
    if (!questDone.has(q.id) && q.progress() >= 1) {
      questDone.add(q.id); dna += q.reward;
      toast(`🎯 Quest complete: <b>${q.title}</b> &nbsp;+${q.reward} 🧬 DNA`, true, 4200);
      AudioSys.quest(); renderQuests();
    }
  }
  renderQuests();
}
function renderQuests() {
  els.questList.innerHTML = QUESTS.map(q => {
    const done = questDone.has(q.id), pr = Math.round(q.progress() * 100);
    return `<div class="quest ${done ? 'done' : ''}"><b>${q.title}</b><small>${q.desc} · +${q.reward} 🧬</small><div class="q-progress"><div style="width:${pr}%"></div></div></div>`;
  }).join('');
}
function updateLevel() {
  let lv = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if (dna >= LEVEL_THRESHOLDS[i]) lv = i + 1;
  if (lv > level) {
    level = lv;
    toast(`⭐ <b>LEVEL ${level}!</b> DNA multiplier ×${(1 + (level - 1) * 0.25).toFixed(2)} — keep evolving!`, true, 4500);
    AudioSys.levelUp();
    spawnParticles(centroid.x, centroid.y, centroid.z, 0xfbbf24, 60, 7, 1.1);
  }
  const lo = LEVEL_THRESHOLDS[level - 1], hi = LEVEL_THRESHOLDS[level] ?? lo + 1000;
  els.xpFill.style.width = Math.min(100, ((dna - lo) / (hi - lo)) * 100) + '%';
}

/* ─────────────────────────── HUD / TOASTS / CHART ───────────── */
function updateHUD() {
  els.gen.textContent = generation;
  els.pop.textContent = population;
  els.dna.textContent = dna;
  els.level.textContent = level;
  els.births.textContent = births;
  els.deaths.textContent = deaths;
}
function toast(html, gold = false, dur = 3500) {
  const t = document.createElement('div');
  t.className = 'toast' + (gold ? ' gold' : ''); t.innerHTML = html;
  els.toasts.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, dur);
}
function drawChart() {
  const w = els.chart.width, h = els.chart.height;
  chartCtx.clearRect(0, 0, w, h);
  if (popHistory.length < 2) return;
  const max = Math.max(50, ...popHistory);
  chartCtx.beginPath();
  popHistory.forEach((v, i) => {
    const x = (i / 139) * w, y = h - (v / max) * (h - 6) - 3;
    i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
  });
  chartCtx.strokeStyle = '#22d3ee'; chartCtx.lineWidth = 1.6; chartCtx.stroke();
  chartCtx.lineTo(w, h); chartCtx.lineTo(0, h); chartCtx.closePath();
  chartCtx.fillStyle = 'rgba(34,211,238,.14)'; chartCtx.fill();
}

/* ─────────────────────────── INPUT: PICKING & TOOLS ─────────── */
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
function pickVoxel(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  pointerNDC.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObject(hitBox);
  if (!hits.length) return null;
  const p = hits[0].point;
  const x = Math.floor(p.x + GX / 2), y = Math.floor(p.y + GY / 2), z = Math.floor(p.z + GZ / 2);
  if (x < 0 || y < 0 || z < 0 || x >= GX || y >= GY || z >= GZ) return null;
  return { x, y, z };
}

let lastToolAt = 0;
function applyTool(v) {
  if (!v) return;
  const now = performance.now();
  const wx = v.x - GX / 2 + 0.5, wy = v.y - GY / 2 + 0.5, wz = v.z - GZ / 2 + 0.5;
  if (tool === 'paint' || tool === 'erase') {
    const r = brushSize * 0.75, val = tool === 'paint' ? 1 : 0;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy + dz * dz <= r * r) setCell(v.x + dx, v.y + dy, v.z + dz, val);
    }
    recount();
    if (val) spawnParticles(wx, wy, wz, 0x22d3ee, 1, 1.6, 0.4);
  } else if (tool === 'bomb') {
    if (now - lastToolAt < 110) return; lastToolAt = now;
    const r = 3.4, R = 4;
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy + dz * dz <= r * r) setCell(v.x + dx, v.y + dy, v.z + dz, 0);
    }
    recount(); shake = 1.4;
    spawnParticles(wx, wy, wz, 0xfbbf24, 42, 8, 0.9);
    spawnParticles(wx, wy, wz, 0xfb7185, 26, 6, 0.7);
    AudioSys.explosion();
  } else if (tool === 'rain') {
    if (now - lastToolAt < 90) return; lastToolAt = now;
    for (let n = 0; n < 26; n++) {
      const x = v.x + Math.round((Math.random() - 0.5) * brushSize * 5);
      const z = v.z + Math.round((Math.random() - 0.5) * brushSize * 5);
      const y = Math.floor(Math.random() * GY);
      setCell(x, y, z, 1);
      spawnParticles(x - GX / 2 + 0.5, y - GY / 2 + 0.5, z - GZ / 2 + 0.5, 0xa3e635, 2, 2, 0.5);
    }
    recount(); AudioSys.pop();
  } else if (tool === 'mutate') {
    if (now - lastToolAt < 110) return; lastToolAt = now;
    const r = brushSize * 0.9, R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      const x = v.x + dx, y = v.y + dy, z = v.z + dz;
      if (x < 0 || y < 0 || z < 0 || x >= GX || y >= GY || z >= GZ) continue;
      const i = idx(x, y, z);
      if (Math.random() < 0.45) { grid[i] = grid[i] ? 0 : 1; if (grid[i]) { age[i] = 0; birthTime[i] = performance.now() / 1000; } }
    }
    recount(); spawnParticles(wx, wy, wz, 0xe879f9, 22, 6, 0.6); AudioSys.zap();
  } else if (tool === 'stamp') {
    if (now - lastToolAt < 200) return; lastToolAt = now;
    stampPattern(selectedPattern, v.x, v.y, v.z);
  }
}

/* Pointer handling: paint vs orbit vs pan */
let mode = null; // 'paint' | 'orbit' | 'pan'
let lastX = 0, lastY = 0;
const activePointers = new Map();
let pinchDist = 0;
let spaceHeld = false;

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  AudioSys.init();
  canvas.setPointerCapture(e.pointerId);
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    const [a, b] = [...activePointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y); mode = 'pinch';
    return;
  }
  lastX = e.clientX; lastY = e.clientY;
  if (e.button === 2 || e.button === 1) mode = 'pan';
  else if (tool === 'orbit' || e.altKey || spaceHeld) mode = 'orbit';
  else {
    const v = pickVoxel(e.clientX, e.clientY);
    if (v) { mode = 'paint'; applyTool(v); }
    else mode = 'orbit';
  }
});
canvas.addEventListener('pointermove', e => {
  // brush cursor
  els.brushCursor.style.display = 'block';
  els.brushCursor.style.left = e.clientX + 'px';
  els.brushCursor.style.top = e.clientY + 'px';
  const bs = brushSize * 15;
  els.brushCursor.style.width = bs + 'px'; els.brushCursor.style.height = bs + 'px';
  els.brushCursor.className = tool === 'erase' ? 'erase' : tool === 'bomb' ? 'bomb' : '';
  els.brushCursor.id = 'brush-cursor';

  if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mode === 'pinch' && activePointers.size === 2) {
    const [a, b] = [...activePointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) cam.desiredRadius *= pinchDist / d;
    pinchDist = d; return;
  }
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  if (mode === 'paint') applyTool(pickVoxel(e.clientX, e.clientY));
  else if (mode === 'orbit') {
    cam.desiredTheta -= dx * 0.008;
    cam.desiredPhi -= dy * 0.008;
    cam.autoOrbit = false; $('auto-orbit-toggle').checked = false;
  } else if (mode === 'pan') {
    const scale = cam.radius * 0.0016;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    cam.desiredTarget.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
  }
});
function endPointer(e) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2 && mode === 'pinch') mode = null;
  else if (activePointers.size === 0) mode = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { els.brushCursor.style.display = 'none'; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.shiftKey) { setBrush(brushSize + (e.deltaY < 0 ? 1 : -1)); return; }
  cam.desiredRadius *= Math.exp(e.deltaY * 0.0011);
}, { passive: false });

/* Keyboard */
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { spaceHeld = true; e.preventDefault(); togglePlay(); }
  else if (k === '.') { stepSimulation(); }
  else if (k === 'c') { clearWorld(); updateHUD(); toast('🗑 World cleared.'); }
  else if (k === 'r') { seedSoup(parseFloat($('density-slider').value) / 100); updateHUD(); toast('🎲 Fresh primordial soup!'); }
  else if (k === 'f') focusPopulation();
  else if (k === 'm') toggleSound();
  else if (k === 'h') toggleHelp();
  else if (k === 'escape') { $('help-overlay').classList.add('hidden'); }
  else if (k === '[') setBrush(brushSize - 1);
  else if (k === ']') setBrush(brushSize + 1);
  else if (k === '+' || k === '=') setSpeed(speed + 1);
  else if (k === '-' || k === '_') setSpeed(speed - 1);
  else if (k >= '1' && k <= '7') setTool(['paint', 'erase', 'bomb', 'rain', 'mutate', 'stamp', 'orbit'][+k - 1]);
  else if (k === 'q') cam.desiredTheta += 0.25;
  else if (k === 'e') cam.desiredTheta -= 0.25;
  else if (k === 'w' || k === 'arrowup') panKeys(0, 1);
  else if (k === 's' || k === 'arrowdown') panKeys(0, -1);
  else if (k === 'a' || k === 'arrowleft') panKeys(-1, 0);
  else if (k === 'd' || k === 'arrowright') panKeys(1, 0);
});
window.addEventListener('keyup', e => { if (e.key === ' ') spaceHeld = false; });
function panKeys(fx, fy) {
  const scale = cam.radius * 0.06;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
  const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 2).multiplyScalar(-1);
  fwd.y = 0; fwd.normalize();
  cam.desiredTarget.addScaledVector(right, fx * scale).addScaledVector(fwd, fy * scale);
}
function focusPopulation() {
  if (population > 0) { cam.desiredTarget.copy(centroid); cam.desiredRadius = 30; toast('🎯 Focused on densest life.'); }
}

/* ─────────────────────────── UI WIRING ──────────────────────── */
const TOOL_HINTS = {
  paint: '🖌️ Paint life — drag on the world. Right-drag to orbit, scroll to zoom.',
  erase: '🧽 Erase — drag to remove life. Right-drag to orbit.',
  bomb: '💣 Bomb — click/drag to blast a crater. Careful: evolution feels it too!',
  rain: '🌧️ Life rain — drag to seed random life across the layers.',
  mutate: '⚡ Mutation ray — drag to randomly flip cells. Chaos is fun.',
  stamp: '🔷 Stamp — pick a pattern on the left, then click the world to place it.',
  orbit: '🎥 Orbit — drag to fly around your world. Scroll to zoom.',
};
function setTool(t) {
  tool = t; AudioSys.click();
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  els.hint.textContent = TOOL_HINTS[t];
}
function setBrush(n) {
  brushSize = Math.min(6, Math.max(1, n));
  $('brush-size').value = brushSize; els.brushVal.textContent = brushSize;
}
function setSpeed(n) {
  speed = Math.min(30, Math.max(1, n));
  $('speed-slider').value = speed; els.speedVal.textContent = speed;
}
function togglePlay() {
  running = !running;
  $('play-pause-btn').textContent = running ? '⏸' : '▶';
  AudioSys.click();
}
function toggleSound() {
  AudioSys.init();
  AudioSys.setMuted(!AudioSys.muted);
  $('sound-btn').textContent = AudioSys.muted ? '🔇' : '🔊';
}
function toggleHelp() { $('help-overlay').classList.toggle('hidden'); }

document.querySelectorAll('.tool-btn').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.querySelectorAll('.world-btn').forEach(b => b.addEventListener('click', () => {
  selectedWorld = b.dataset.world;
  document.querySelectorAll('.world-btn').forEach(x => x.classList.toggle('selected', x === b));
  AudioSys.init(); AudioSys.click();
}));
$('brush-size').addEventListener('input', e => setBrush(+e.target.value));
$('speed-slider').addEventListener('input', e => setSpeed(+e.target.value));
$('density-slider').addEventListener('input', e => { $('density-val').textContent = e.target.value + '%'; });
$('wrap-toggle').addEventListener('change', e => { wrap = e.target.checked; toast(wrap ? '🔄 Edges now wrap (torus).' : '🧱 Edges are now solid walls.'); });
$('trails-toggle').addEventListener('change', e => { showParticles = e.target.checked; });
$('auto-orbit-toggle').addEventListener('change', e => { cam.autoOrbit = e.target.checked; });
$('play-pause-btn').addEventListener('click', togglePlay);
$('step-btn').addEventListener('click', () => { stepSimulation(); AudioSys.click(); });
$('clear-btn').addEventListener('click', () => { clearWorld(); updateHUD(); toast('🗑 World cleared.'); });
$('random-btn').addEventListener('click', () => { seedSoup(parseFloat($('density-slider').value) / 100); updateHUD(); toast('🎲 Fresh primordial soup!'); });
$('focus-btn').addEventListener('click', focusPopulation);
$('sound-btn').addEventListener('click', toggleSound);
$('help-btn').addEventListener('click', toggleHelp);
$('help-btn-start').addEventListener('click', toggleHelp);
$('help-close').addEventListener('click', toggleHelp);
$('help-play').addEventListener('click', toggleHelp);
$('menu-btn').addEventListener('click', () => { $('start-screen').classList.remove('hidden'); });
$('panels-btn').addEventListener('click', () => document.body.classList.toggle('panels-hidden'));

/* Patterns gallery */
{
  const gridEl = $('pattern-grid');
  for (const [key, p] of Object.entries(PATTERNS)) {
    const b = document.createElement('button');
    b.className = 'pattern-btn' + (key === selectedPattern ? ' active' : '');
    b.innerHTML = `${p.icon} ${p.name}<small>${p.cells.length} cells</small>`;
    b.title = `Stamp ${p.name} — then click the world`;
    b.addEventListener('click', () => {
      selectedPattern = key;
      document.querySelectorAll('.pattern-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); setTool('stamp'); AudioSys.click();
    });
    gridEl.appendChild(b);
  }
}
/* Rules */
document.querySelectorAll('.rule-btn').forEach(b => b.addEventListener('click', () => {
  ruleKey = b.dataset.rule;
  surviveSet = new Set(RULES[ruleKey].survive); birthSet = new Set(RULES[ruleKey].birth);
  document.querySelectorAll('.rule-btn').forEach(x => x.classList.toggle('active', x === b));
  els.ruleName.textContent = 'Rule: ' + RULES[ruleKey].name;
  toast(`🧬 Rules changed: <b>${RULES[ruleKey].name}</b> — same world, new physics!`);
  AudioSys.zap();
}));
$('mutate-rule-btn').addEventListener('click', () => {
  const s = new Set(surviveSet), b = new Set(birthSet);
  const toggle = set => { const v = Math.floor(Math.random() * 9) + 2; set.has(v) ? set.delete(v) : set.add(v); };
  toggle(s); if (Math.random() < 0.5) toggle(b);
  if (!s.size) s.add(5); if (!b.size) b.add(6);
  surviveSet = s; birthSet = b;
  document.querySelectorAll('.rule-btn').forEach(x => x.classList.remove('active'));
  els.ruleName.textContent = `Rule: Mutated S[${[...s].sort().join(',')}] B[${[...b].sort().join(',')}]`;
  toast('⚡ <b>Rules mutated!</b> Evolution will never be the same.');
  AudioSys.zap();
});

/* Start screen */
$('play-btn').addEventListener('click', () => {
  AudioSys.init();
  seedWorld(selectedWorld);
  $('start-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  started = true; running = true;
  cam.autoOrbit = $('auto-orbit-toggle').checked;
  toast('🧬 Welcome, explorer! <b>Paint life</b> or watch your world evolve.', true, 5000);
  renderQuests(); updateHUD();
});

/* ─────────────────────────── MAIN LOOP ──────────────────────── */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let lastT = performance.now(), simAcc = 0, fpsEMA = 60, chartTimer = 0, hudTimer = 0;
function loop() {
  requestAnimationFrame(loop);
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - lastT) / 1000); lastT = nowMs;
  fpsEMA = fpsEMA * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;

  if (running) {
    simAcc += dt * speed;
    while (simAcc >= 1) { stepSimulation(); simAcc -= 1; }
  }
  const now = nowMs / 1000;
  renderCells(now);
  updateParticles(dt);
  updateCamera(dt);

  /* orbiting lights */
  const t = now * 0.25;
  pCyan.position.set(Math.cos(t) * 34, 14 + Math.sin(now * 0.7) * 8, Math.sin(t) * 34);
  pMag.position.set(Math.cos(t + Math.PI) * 34, 10 + Math.cos(now * 0.6) * 8, Math.sin(t + Math.PI) * 34);

  const stars = scene.getObjectByName('stars');
  if (stars) stars.rotation.y += dt * 0.004;

  chartTimer += dt; if (chartTimer > 0.3) { chartTimer = 0; drawChart(); }
  hudTimer += dt; if (hudTimer > 0.25) { hudTimer = 0; els.fps.textContent = Math.round(fpsEMA); }
  renderer.render(scene, camera);
}

/* ─────────────────────────── BOOT (attract mode) ────────────── */
seedWorld('soup');
document.querySelector('.world-btn[data-world="soup"]').classList.add('selected');
renderQuests(); updateHUD();
loop();
