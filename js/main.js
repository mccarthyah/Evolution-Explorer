/* ════════════════════════════════════════════════════════════════
   EVOLUTION — Living Terrain (web version, mirrors main.gd)
   Conway B3/S23, 3 species, age-height + terrain memory.
   Cellular Instability: towers explode at age 40 (radius-4 craters,
   chain reactions, debris seeding); oscillators (periods 2-6)
   detonate after 12 cycles. Free-fly + F/G centre painting.
   ════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

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
  pop(big = false) {
    if (!this.ctx || this.muted) return;
    const now = performance.now(); if (now - this.lastPop < 90) return; this.lastPop = now;
    const t = this.ctx.currentTime, dur = big ? 0.5 : 0.22;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(big ? 220 : 380, t);
    o.frequency.exponentialRampToValueAtTime(60, t + dur);
    g.gain.setValueAtTime(big ? 0.22 : 0.10, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
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
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
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

/* ─────────────────────────── SIMULATION ─────────────────────── */
const idxOf = (x, z) => z * GRID + x;
function refreshPopulation() { let p = 0; for (let i = 0; i < TOTAL; i++) if (cells[i]) p++; population = p; }
function seedWorld() {
  cells.fill(0); ages.fill(0); history.fill(0); heights.fill(0);
  cooldowns.fill(0); warnings.fill(0);
  snapshots = []; tracks = new Map(); queue = []; blasts = [];
  explosionsTotal = 0; lastExplosion = 'NONE';
  for (let k = 0; k < 17; k++) {
    const cx = 6 + Math.floor(Math.random() * (GRID - 12));
    const cz = 6 + Math.floor(Math.random() * (GRID - 12));
    const radius = 4 + Math.floor(Math.random() * 6);
    const species = 1 + Math.floor(Math.random() * 3);
    for (let z = Math.max(0, cz - radius); z <= Math.min(GRID - 1, cz + radius); z++)
      for (let x = Math.max(0, cx - radius); x <= Math.min(GRID - 1, cx + radius); x++) {
        if (Math.hypot(x - cx, z - cz) < radius && Math.random() < 0.37) cells[idxOf(x, z)] = species;
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
    if (current !== 0) {
      ages[i] = old !== 0 ? Math.min(MAX_AGE, ages[i] + 1) : 1;
      history[i] = Math.min(HISTORY_LIMIT, history[i] + 0.065);
    } else {
      ages[i] = 0;
      history[i] = Math.max(0, history[i] - 0.012);
    }
  }
  generations++;
  updateInstability();
  refreshPopulation();
}

/* ── Cellular Instability (mirrors main.gd) ── */
function updateInstability() {
  for (let i = 0; i < TOTAL; i++) {
    if (cooldowns[i] > 0) cooldowns[i]--;
    if (cells[i] !== 0 && ages[i] >= TOWER_LIFESPAN && cooldowns[i] === 0) {
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
      if (cooldowns[ci] === 0) {
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
        if (ages[i] >= TOWER_LIFESPAN - 6 && i !== source && cooldowns[i] === 0) queue.push([x, z]);
      }
      cells[i] = 0; ages[i] = 0; warnings[i] = 0;
      history[i] = Math.max(history[i], 0.45);
      cooldowns[i] = EXPLOSION_COOLDOWN;
    }
  const glider = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
  for (let s = 0; s < MAX_DEBRIS_SEEDS; s++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = (EXPLOSION_RADIUS + 1) + Math.random() * (EXPLOSION_RADIUS * 1.5);
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
      cells[i] = Math.random() < 0.7 ? species : 1 + Math.floor(Math.random() * 3);
      ages[i] = 1;
      cooldowns[i] = EXPLOSION_COOLDOWN;
    }
  }
  const w = cellWorld(cx, cz);
  blasts.push({ x: cx, z: cz, ttl: 0.65 });
  spawnBlastRing(w.x, w.z);
  spawnParticles(w.x, 3, w.z, new THREE.Color(1.0, 0.55, 0.15), 26, 7, 0.8);
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
  camera.rotation.set(pitch, yaw, 0);
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
function paintAt(clientX, clientY, alive) {
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
  refreshPopulation();
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  AudioSys.init();
  if (!started) return;
  paintAt(e.clientX, e.clientY, e.button === 0);
});
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  if (!started) return;
  if (k === 'escape' || k === 'p') running = !running;
  else if (k === 'n') { if (!running) stepSimulation(); }
  else if (k === 'r') seedWorld();
  else if (k === 'c') {
    cells.fill(0); ages.fill(0); history.fill(0); generations = 0; population = 0;
    snapshots = []; tracks = new Map(); queue = []; cooldowns.fill(0);
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
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function toggleOverview() {
  overview = !overview;
  if (overview) { camera.position.set(0, 85, 60); yaw = 0; pitch = -0.95; }
  else { camera.position.set(0, 16, 32); yaw = 0; pitch = -0.30; }
  camera.rotation.set(pitch, yaw, 0);
}

/* ─────────────────────────── UI ─────────────────────────────── */
function toast(html, dur = 3000) {
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = html;
  $('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, dur);
}
function updateHUD() {
  const mode = overview ? 'OVERVIEW' : 'FLIGHT';
  $('stats').textContent =
    `EVOLUTION  /  LIVING TERRAIN\nGeneration ${generations}     Alive ${population}     ${mode}\n${running ? 'RUNNING' : 'PAUSED'}   |   ${(1 / generationInterval).toFixed(1)} gen/sec   |   Height ${heightScale.toFixed(1)}x   |   Memory ${memoryEnabled ? 'ON' : 'OFF'}   |   Brush ${brushSpecies}\nExplosions ${explosionsTotal}  |  Last ${lastExplosion}`;
}
$('sound-btn').addEventListener('click', () => {
  AudioSys.init();
  AudioSys.setMuted(!AudioSys.muted);
  $('sound-btn').textContent = AudioSys.muted ? '🔇' : '🔊';
});
$('play-btn').addEventListener('click', () => {
  AudioSys.init();
  started = true;
  $('start-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  toast('🧬 Welcome to the Living Terrain. Towers pulse red-hot before they blow.', 4500);
});

/* ─────────────────────────── MAIN LOOP ──────────────────────── */
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
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
  if (running) {
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
  updateParticles(dt);
  updateBlasts(dt);
  for (let b = blasts.length - 1; b >= 0; b--) {
    blasts[b].ttl -= dt;
    if (blasts[b].ttl <= 0) blasts.splice(b, 1);
  }
  hudTimer += dt; if (hudTimer > 0.12) { hudTimer = 0; if (started) updateHUD(); }
  renderer.render(scene, camera);
}

/* ─────────────────────────── BOOT ───────────────────────────── */
seedWorld();
camera.rotation.set(pitch, yaw, 0);
loop();
