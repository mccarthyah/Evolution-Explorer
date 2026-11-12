/* ════════════════════════════════════════════════════════════════
   EVOLUTION — Living Terrain (web version)
   Conway B3/S23, 3 species, age-height + terrain memory.
   Cells explode at MAX_AGE; stagnant/repeating patterns detonate.
   Free-fly camera with pointer-lock mouse look + ground painting.
   Mirrors the Godot original (main.gd) + explosion systems.
   ════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* ─────────────────────────── CONFIG ─────────────────────────── */
const GRID = 80, TOTAL = GRID * GRID, SPACING = 1.15;
const MAX_AGE = 65, HISTORY_LIMIT = 1.0;
const PALETTE = [new THREE.Color(0.15, 0.93, 1.0), new THREE.Color(1.0, 0.24, 0.72), new THREE.Color(0.54, 1.0, 0.38)];
const ORANGE = new THREE.Color(1.0, 0.52, 0.26);
const GHOST_A = new THREE.Color(0.06, 0.14, 0.26), GHOST_B = new THREE.Color(0.19, 0.26, 0.42);

const $ = id => document.getElementById(id);
const canvas = $('game-canvas');

/* ─────────────────────────── STATE ──────────────────────────── */
let cells = new Uint8Array(TOTAL), nextCells = new Uint8Array(TOTAL);
let ages = new Uint16Array(TOTAL), history = new Float32Array(TOTAL), heights = new Float32Array(TOTAL);
let generations = 0, population = 0, running = true, memoryEnabled = true;
let generationInterval = 0.22, heightScale = 1.0, accumulated = 0;
let overview = false, mouseCaptured = false, brushSpecies = 1;
let explosionsEnabled = true, explosions = 0;
let hashHistory = [];
let started = false;

/* ─────────────────────────── AUDIO (light) ──────────────────── */
const AudioSys = {
  ctx: null, master: null, muted: false,
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
camera.position.set(0, 16, 40);
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
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  stars.position.set(0, 0, 0); scene.add(stars);
}

/* Pillars */
const pillarGeo = new THREE.BoxGeometry(0.91, 1, 0.91);
const pillarMat = new THREE.MeshStandardMaterial({ roughness: 0.26, metalness: 0.18 });
const pillarsMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, TOTAL);
pillarsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pillarsMesh.frustumCulled = false;
scene.add(pillarsMesh);
{ const c = new THREE.Color(0xffffff); for (let i = 0; i < TOTAL; i++) pillarsMesh.setColorAt(i, c); }

/* Particles */
const P_MAX = 1800;
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
function spawnParticles(wx, wy, wz, color, count, speed = 5, life = 0.8) {
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
function cellWorldPos(i) {
  const x = i % GRID, z = Math.floor(i / GRID);
  return new THREE.Vector3((x - (GRID - 1) / 2) * SPACING, 4, (z - (GRID - 1) / 2) * SPACING);
}

/* ─────────────────────────── SIMULATION ─────────────────────── */
const idxOf = (x, z) => z * GRID + x;
function refreshPopulation() { let p = 0; for (let i = 0; i < TOTAL; i++) if (cells[i]) p++; population = p; }
function seedWorld() {
  cells.fill(0); ages.fill(0); history.fill(0); heights.fill(0);
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
  generations = 0; explosions = 0; hashHistory = [];
  refreshPopulation();
}
function hashCells() {
  let h = 2166136261;
  for (let i = 0; i < TOTAL; i++) { h ^= cells[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
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
  /* Age explosions */
  if (explosionsEnabled) {
    let bursts = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (cells[i] !== 0 && ages[i] >= MAX_AGE) {
        cells[i] = 0; ages[i] = 0; explosions++;
        if (bursts < 10) { const p = cellWorldPos(i); spawnParticles(p.x, p.y, p.z, new THREE.Color(1.0, 0.85, 0.4), 14, 5, 0.8); bursts++; }
      }
    }
    if (bursts > 0) AudioSys.pop(false);
  }
  /* Stagnation / repeat detection */
  const h = hashCells();
  const repeated = hashHistory.includes(h);
  hashHistory.push(h); if (hashHistory.length > 4) hashHistory.shift();
  if (repeated && generations > 10 && population > 20 && explosionsEnabled) {
    let count = 0, bursts = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (cells[i] !== 0 && ages[i] >= 10) {
        cells[i] = 0; ages[i] = 0; explosions++; count++;
        if (bursts < 14) { const p = cellWorldPos(i); spawnParticles(p.x, p.y, p.z, new THREE.Color(1.0, 0.24, 0.72), 16, 6, 0.9); bursts++; }
      }
    }
    if (count > 0) {
      showWarn();
      AudioSys.pop(true);
      toast(`💥 <b>Stagnation!</b> ${count} pillars exploded — pattern was repeating.`, 3200);
    }
    hashHistory = [];
  }
  refreshPopulation();
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
    if (living > 0) _c.copy(PALETTE[living - 1]).lerp(ORANGE, ageFactor * 0.55);
    else _c.copy(GHOST_A).lerp(GHOST_B, mem);
    pillarsMesh.setColorAt(i, _c);
  }
  pillarsMesh.instanceMatrix.needsUpdate = true;
  if (pillarsMesh.instanceColor) pillarsMesh.instanceColor.needsUpdate = true;
}

/* ─────────────────────────── FLIGHT & PAINTING ──────────────── */
const keys = new Set();
function setMouseCapture(on) {
  mouseCaptured = on;
  if (on) canvas.requestPointerLock?.();
  else if (document.pointerLockElement) document.exitPointerLock();
}
document.addEventListener('pointerlockchange', () => {
  mouseCaptured = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', e => {
  if (!mouseCaptured || overview || !started) return;
  yaw -= e.movementX * 0.0025;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0025, -1.54, 1.54);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
let painting = false, paintAlive = true;
canvas.addEventListener('mousedown', e => {
  AudioSys.init();
  if (!started) return;
  if (!mouseCaptured && !overview) {
    // unlocked: paint / erase
    painting = true; paintAlive = e.button === 0;
    paintAtCursor(e.clientX, e.clientY, paintAlive);
  } else if (!mouseCaptured && overview) {
    painting = true; paintAlive = e.button === 0;
    paintAtCursor(e.clientX, e.clientY, paintAlive);
  } else if (mouseCaptured) {
    // captured: click re-locks handled by browser; nothing
  }
});
window.addEventListener('mouseup', () => painting = false);
window.addEventListener('mousemove', e => {
  if (painting && !mouseCaptured) paintAtCursor(e.clientX, e.clientY, paintAlive);
});
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function paintAtCursor(clientX, clientY, alive) {
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
function updateFlight(dt) {
  if (overview || !mouseCaptured || !started) return;
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
    const sp = keys.has('shift') ? 55 : 19;
    camera.position.addScaledVector(move.normalize(), sp * dt);
    camera.position.y = Math.max(0.8, camera.position.y);
  }
  camera.rotation.set(pitch, yaw, 0);
}
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'tab') { e.preventDefault(); if (started && !overview) setMouseCapture(!mouseCaptured); return; }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  if (!started) return;
  if (k === 'p') running = !running;
  else if (k === 'n') { if (!running) stepSimulation(); }
  else if (k === 'r') seedWorld();
  else if (k === 'c') { cells.fill(0); ages.fill(0); history.fill(0); generations = 0; population = 0; hashHistory = []; }
  else if (k === 'm') memoryEnabled = !memoryEnabled;
  else if (k === 'x') { explosionsEnabled = !explosionsEnabled; toast(explosionsEnabled ? '💥 Explosions <b>ON</b>' : '💥 Explosions <b>OFF</b>', 1800); }
  else if (k === 'v') toggleOverview();
  else if (k === '[') generationInterval = Math.min(2.0, generationInterval * 1.25);
  else if (k === ']') generationInterval = Math.max(0.035, generationInterval / 1.25);
  else if (k === '-') heightScale = Math.max(0.2, heightScale - 0.2);
  else if (k === '=' || k === '+') heightScale = Math.min(4.0, heightScale + 0.2);
  else if (k === '1' || k === '2' || k === '3') brushSpecies = +k;
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function toggleOverview() {
  overview = !overview;
  if (overview) {
    camera.position.set(0, 105, 68);
    yaw = 0; pitch = -0.95;
    setMouseCapture(false);
  } else {
    camera.position.set(0, 16, 40);
    yaw = 0; pitch = -0.30;
    setMouseCapture(true);
  }
  camera.rotation.set(pitch, yaw, 0);
}

/* ─────────────────────────── UI ─────────────────────────────── */
function toast(html, dur = 3000) {
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = html;
  $('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, dur);
}
let warnTimer = null;
function showWarn() {
  $('warn-banner').classList.remove('hidden');
  clearTimeout(warnTimer);
  warnTimer = setTimeout(() => $('warn-banner').classList.add('hidden'), 2600);
}
function updateHUD() {
  const mode = overview ? 'OVERVIEW' : 'FLIGHT';
  $('stats').textContent =
    `EVOLUTION  /  LIVING TERRAIN\nGeneration ${generations}     Alive ${population}     ${mode}     Explosions ${explosions}\n${running ? 'RUNNING' : 'PAUSED'}   |   ${(1 / generationInterval).toFixed(1)} gen/sec   |   Height ${heightScale.toFixed(1)}x   |   Memory ${memoryEnabled ? 'ON' : 'OFF'}   |   Brush ${brushSpecies}   |   Explosions ${explosionsEnabled ? 'ON' : 'OFF'}`;
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
  setMouseCapture(true);
  toast('🧬 Welcome to the Living Terrain. <b>Tab</b> unlocks mouse to paint life.', 4500);
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
  if (running && started) {
    accumulated += dt;
    let steps = 0;
    while (accumulated >= generationInterval && steps < 4) {
      stepSimulation();
      accumulated -= generationInterval;
      steps++;
    }
    if (steps === 4) accumulated = 0;
  } else if (running && !started) {
    // attract: evolve behind start screen
    accumulated += dt;
    let steps = 0;
    while (accumulated >= generationInterval && steps < 4) {
      stepSimulation();
      accumulated -= generationInterval;
      steps++;
    }
    if (steps === 4) accumulated = 0;
  }
  updateVisuals(dt);
  updateFlight(dt);
  updateParticles(dt);
  hudTimer += dt; if (hudTimer > 0.12) { hudTimer = 0; if (started) updateHUD(); }
  renderer.render(scene, camera);
}

/* ─────────────────────────── BOOT ───────────────────────────── */
seedWorld();
camera.rotation.set(pitch, yaw, 0);
loop();
