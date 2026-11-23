// BOOT TEST — the regression test for the v8 "Start Playing does nothing" incident.
//
// A module-load error (e.g. a const used above its declaration — the temporal
// dead zone) kills the whole app before the play button is ever wired, and
// neither `node --check` nor the logic suite catches it because they don't
// evaluate the real file in its real declaration order. This test DOES:
// it imports the actual js/main.js (as .mjs) with a stubbed browser and THREE,
// then clicks START and runs animation frames.
//
// Usage:
//   node tools/boot-test.mjs             → must pass all checks and exit 0
//   node tools/boot-test.mjs --selftest  → additionally re-creates the original
//                                          v8 TDZ bug and proves this test fails on it
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const src = readFileSync(join(ROOT, 'js/main.js'), 'utf8');

/* ═══ Minimal THREE stub — every symbol js/main.js imports ═══ */
const THREE_STUB = `class Color {
  constructor(r = 0, g = 0, b = 0) { this.r = r; this.g = g; this.b = b; }
  set(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  setRGB(r, g, b) { return this.set(r, g, b); }
  setHSL(h, s, l) { return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  lerp(c, t) { return this; }
  multiplyScalar(s) { return this; }
}
class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  add(v) { return this; } sub(v) { return this; }
  distanceTo(v) { return 1; }
  lerpVectors(a, b, t) { return this; }
  applyEuler(e) { return this; }
  applyQuaternion(q) { return this; }
  normalize() { return this; }
  length() { return 1; }
  lengthSq() { return 0; }
}
class Euler { constructor(x = 0, y = 0, z = 0, order = 'XYZ') { this.x = x; this.y = y; this.z = z; this.order = order; } set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
class Quaternion { setFromEuler(e) { return this; } }
class Matrix4 { compose(p, q, s) { return this; } }
class BufferAttribute { constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; this.needsUpdate = false; } }
class BufferGeometry { constructor() { this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; return this; } }
class Geometry {}
class BoxGeometry extends Geometry {}
class SphereGeometry extends Geometry {}
class TorusGeometry extends Geometry {}
class PlaneGeometry extends Geometry {}
class Material { constructor(p) { Object.assign(this, p || {}); } dispose() {} }
class MeshBasicMaterial extends Material {}
class MeshStandardMaterial extends Material {}
class PointsMaterial extends Material {}
class Mesh {
  constructor(geo, mat) { this.geometry = geo; this.material = mat; this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0, order: 'XYZ', set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; this.scale = new Vector3(1, 1, 1); this.visible = true; }
}
class InstancedMesh extends Mesh {
  constructor(geo, mat, n) { super(geo, mat); this.instanceMatrix = { setUsage() {}, needsUpdate: false }; this.instanceColor = null; this.frustumCulled = true; }
  setMatrixAt() {} setColorAt() {}
}
class Points { constructor(geo, mat) { this.geometry = geo; this.material = mat; this.frustumCulled = true; } }
class FogExp2 { constructor(color, density) { this.color = new Color(); this.density = density; } }
class Scene { constructor() { this.background = new Color(); this.fog = null; } add() {} remove() {} }
class AmbientLight { constructor(c, i) {} }
class DirectionalLight { constructor(c, i) { this.position = new Vector3(); } }
class PerspectiveCamera {
  constructor(fov, aspect, near, far) { this.fov = fov; this.aspect = aspect; this.position = new Vector3(); this.rotation = { order: 'YXZ', x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; this.quaternion = new Quaternion(); }
  updateProjectionMatrix() {}
}
class WebGLRenderer {
  constructor(p) { this.domElement = (p && p.canvas) || null; }
  setPixelRatio() {} setSize() {} render() {}
}
const MathUtils = { clamp: (v, a, b) => Math.min(b, Math.max(a, v)) };
class Raycaster {
  constructor() { this.ray = { direction: new Vector3(), origin: new Vector3(), intersectPlane(plane, hit) { return hit.set(0, 0, 0); } }; }
  setFromCamera(ndc, cam) { return this; }
  intersectObject(obj) { return []; }
  intersectObjects(arr) { return []; }
}
class Plane {
  constructor(normal, constant) { this.normal = normal || new Vector3(); this.constant = constant || 0; }
  setFromNormalAndCoplanarPoint() { return this; }
}
export { Color, Vector2, Vector3, Euler, Quaternion, Matrix4, BufferAttribute, BufferGeometry, BoxGeometry, SphereGeometry, TorusGeometry, PlaneGeometry, MeshBasicMaterial, MeshStandardMaterial, PointsMaterial, Mesh, InstancedMesh, Points, FogExp2, Scene, AmbientLight, DirectionalLight, PerspectiveCamera, WebGLRenderer, MathUtils, Raycaster, Plane };
export const ACESFilmicToneMapping = 4, AdditiveBlending = 2, DynamicDrawUsage = 1, PCFSoftShadowMap = 1;
`;

const POST_STUB = 'export class EffectComposer { constructor(renderer) { this.renderer = renderer; } addPass() {} setSize() {} render() {} }\n' +
  'export class RenderPass { constructor(scene, camera) {} }\n' +
  'export class UnrealBloomPass { constructor(res, s, r, t) {} }\n';

/* ═══ Runner: stubbed browser, real module import, START click, frames ═══ */
const RUNNER = `// Auto-generated by tools/boot-test.mjs — imports the real game module.
const rafCallbacks = [];
const els = new Map();
const ctx2d = new Proxy({}, { get: (t, k) => (typeof k === 'string' && k !== 'canvas' ? () => {} : undefined), set: () => true });

function makeEl(id) {
  return {
    id, dataset: {}, style: {}, textContent: '', value: '', innerHTML: '', disabled: false,
    width: 146, height: 146,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (f) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    _listeners: {},
    addEventListener(evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); },
    removeEventListener() {},
    getContext() { return ctx2d; },
    focus() {}, select() {},
    appendChild() {}, removeChild() {},
    click() { for (const fn of (this._listeners.click || []).slice()) fn({}); },
  };
}

const worldBtns = ['life', 'daynight', 'highlife', 'crystal'].map(id => {
  const el = makeEl('wb-' + id);
  el.dataset.world = id;
  return el;
});

globalThis.document = {
  getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  querySelectorAll(sel) { return sel === '.world-btn' ? worldBtns : []; },
  createElement() { return makeEl('dyn-' + els.size); },
  addEventListener() {},
  body: makeEl('body'),
};
globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
const windowListeners = {};
globalThis.window.addEventListener = (type, fn) => { (windowListeners[type] ||= []).push(fn); };
function key(type, value, options = {}) {
  const e = { key: value, target: { tagName: 'BODY' }, preventDefault() { this.prevented = true; }, ...options };
  for (const fn of windowListeners[type] || []) fn(e);
  return e;
}
for (const id of ['save-modal', 'load-modal', 'upgrade-modal']) document.getElementById(id).classList.add('hidden');
// NOTE: window.AudioContext deliberately absent — audio paths are guarded and must no-op
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { storage.set(key, String(value)); }, removeItem(key) { storage.delete(key); } };
try {
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });
} catch (e) { /* keep Node's navigator */ }
globalThis.requestAnimationFrame = cb => { rafCallbacks.push(cb); return rafCallbacks.length; };

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra); }
};

// T1: the module loads without any exception — the exact failure class of the v8 incident
let game;
try {
  game = await import('./js/main.mjs');
  check('T1 module loads (no TDZ / load-time error)', true);
} catch (e) {
  check('T1 module loads (no TDZ / load-time error)', false, e.message);
  console.log('\\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(1);
}

const play = els.get('play-btn');
check('T2 play button exists and has a click listener', play && (play._listeners.click || []).length >= 1);
check('T3 four world buttons wired', worldBtns.every(b => (b._listeners.click || []).length >= 1));
check('T3 locked worlds render lock state', worldBtns[2].innerHTML.includes('Lv 5') || worldBtns[2].innerHTML.includes('HighLife'), worldBtns[2].innerHTML);

try { worldBtns[2].click(); check('T4 locked world click handled', true); }
catch (e) { check('T4 locked world click handled', false, e.message); }

try { worldBtns[1].click(); check('T5 Day & Night world switch works', true); }
catch (e) { check('T5 Day & Night world switch works', false, e.message); }

try {
  worldBtns[0].click();
  play.click();
  check('T6 start screen hidden after START', els.get('start-screen').classList.contains('hidden'));
  check('T6 HUD visible after START', !els.get('hud').classList.contains('hidden'));
} catch (e) {
  check('T6 START works', false, e.message);
}

try {
  const cbs = rafCallbacks.splice(0);
  check('T7 loop registered a frame callback', cbs.length >= 1, String(cbs.length));
  for (const cb of cbs) cb();
  check('T7 one frame runs clean (flight/visuals/no-audio paths)', true);
} catch (e) {
  check('T7 one frame runs clean', false, e.message);
}

try {
  const cbs = rafCallbacks.splice(0);
  for (const cb of cbs) cb();
  check('T8 second frame runs clean', true);
} catch (e) {
  check('T8 second frame runs clean', false, e.message); }

// Flight keys must not activate save/daily shortcuts; editable UI must keep normal keys.
try {
  key('keydown', 's');
  check('T9 S flies without opening save', game.getKeys().has('s') && els.get('save-modal').classList.contains('hidden'));
  key('keyup', 's');
  key('keydown', 'd');
  check('T9 D flies without starting daily', game.getKeys().has('d') && !game.isDaily());
  key('keyup', 'd');
  key('keydown', '4');
  key('keyup', '4');
  key('keydown', '5');
  key('keyup', '5');
  check('T9 number keys place their mapped seed tools', game.getToolsUsed().has('rpento') && game.getToolsUsed().has('glider'));
  key('keydown', 'x');
  check('T9 X opens save', !els.get('save-modal').classList.contains('hidden'));
  check('T9 opening modal clears held flight keys', game.getKeys().size === 0);
  els.get('save-close-btn').click();
  key('keydown', 'z');
  check('T9 Z starts daily', game.isDaily());
  key('keyup', 'z');
  const typed = key('keydown', ' ', { target: { tagName: 'TEXTAREA' } });
  check('T9 editable fields keep spaces and suppress flight', !typed.prevented && !game.getKeys().has(' '));
  key('keydown', 'Control', {ctrlKey: true});
  check('T9 Control still enables descent', game.getKeys().has('control'));
  for (const fn of windowListeners.blur || []) fn();
  check('T9 losing focus releases held controls', game.getKeys().size === 0);
} catch (e) { check('keyboard regression tests', false, e.stack); }

// Import validates the complete format and preserves legacy centered grids.
try {
  const rows = ['a1.7', ...Array(7).fill('.8')].join('/');
  const decoded = game.decodeEcosystem('EVO1;8;' + rows);
  const roundtrip = game.decodeEcosystem(game.encodeEcosystem());
  check('ecosystem code round trips', roundtrip && roundtrip.every((cell, i) => cell === game.getCells()[i]));
  check('legacy ecosystem is centred', decoded && decoded[28 * 64 + 28] === 1 && decoded.reduce((a, b) => a + b, 0) === 1);
  for (const bad of ['EVO1;8junk;' + rows, 'EVO1;+8;' + rows, 'EVO1;8;' + rows + '/', 'EVO1;;8;' + rows, 'EVO1;8;a9/' + Array(7).fill('.8').join('/')])
    check('reject malformed ecosystem ' + bad.slice(0, 16), game.decodeEcosystem(bad) === null);
} catch (e) { check('ecosystem import regression tests', false, e.stack); }

// Test actual persistence functions and a generation, without exposing game internals in production.
try {
  game.resetPilot();
  game.addXP(7);
  check('T9 XP below level threshold is saved', JSON.parse(storage.get('evolution-pilot')).xp === 7);
  game.resetPilot();
  storage.set('evolution-pilot', JSON.stringify({v: 1, xp: 7, level: 1, sp: 0}));
  game.loadPilot();
  check('T9 saved XP reloads', game.getPilot().xp === 7);
  game.addXP(43);
  const leveled = JSON.parse(storage.get('evolution-pilot'));
  check('T9 level and remaining XP save together', leveled.level === 2 && leveled.xp === 0);
  game.resetPilot();
  game.setupStableBlock();
  game.stepSimulation();
  check('T10 tallest tower record is saved', JSON.parse(storage.get('evolution-pilot')).rec.tallestTower === 1);
  game.resetPilot();
  storage.set('evolution-pilot', JSON.stringify({v: 1, xp: 0, level: 1, sp: 0, rec: {tallestTower: 1}}));
  game.loadPilot();
  check('T10 tower record reloads', game.getPilot().rec.tallestTower === 1);
  const originalSet = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('storage unavailable'); };
  game.addXP(1);
  localStorage.setItem = originalSet;
  check('T11 unavailable storage does not interrupt progression', game.getPilot().xp === 1);
} catch (e) { check('persistence regression tests', false, e.stack); }

console.log('\\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
`;

function buildDir(docoredSrc) {
  const dir = mkdtempSync(join(tmpdir(), 'evo-boot-'));
  mkdirSync(join(dir, 'node_modules/three'), { recursive: true });
  mkdirSync(join(dir, 'lib/postprocessing'), { recursive: true });
  mkdirSync(join(dir, 'js'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/three/package.json'), '{"name":"three","main":"index.mjs","type":"module"}');
  writeFileSync(join(dir, 'node_modules/three/index.mjs'), THREE_STUB);
  for (const [name, body] of [['EffectComposer', POST_STUB], ['RenderPass', POST_STUB], ['UnrealBloomPass', POST_STUB]])
    writeFileSync(join(dir, 'lib/postprocessing/' + name + '.js'), body);
  writeFileSync(join(dir, 'js/main.mjs'), docoredSrc + `\nexport { resetPilot, addXP, loadPilot, stepSimulation, encodeEcosystem, decodeEcosystem };\nexport const getPilot = () => pilot;\nexport const getCells = () => cells;\nexport const getKeys = () => keys;\nexport const getToolsUsed = () => toolsUsed;\nexport const isDaily = () => dailyMode;\nexport function setupStableBlock() { activeWorld = WORLDS_BY_ID.life; cells.fill(0); ages.fill(0); for (const i of [0, 1, GRID, GRID + 1]) cells[i] = 1; }\n`);
  writeFileSync(join(dir, 'run.mjs'), RUNNER);
  return dir;
}

function runIn(dir, label) {
  console.log('── ' + label);
  const r = spawnSync('node', ['run.mjs'], { cwd: dir, stdio: 'inherit' });
  return r.status === 0;
}

let ok = true;
const selftest = process.argv.includes('--selftest');

// 1) the real file must pass
ok = runIn(buildDir(src), 'boot: real js/main.js') && ok;

// 2) selftest: reintroduce the exact v8 TDZ bug; the test MUST fail on it
if (selftest) {
  let broken = src
    .replace("const LWSS_ROWS = ['.O..O', 'O....', 'O...O', 'OOOO.'];\nconst REPLICATOR_ROWS = ['..OOO', '.O..O', 'O...O', 'O..O.', 'OOO.'];",
             "const LWSS_ROWS = ['.O..O', 'O....', 'O...O', 'OOOO.'];")
    .replace("   neighbour counts (bit n set = that count triggers birth/survival). */\nconst _bsMask",
             "   neighbour counts (bit n set = that count triggers birth/survival). */\nconst REPLICATOR_ROWS = ['..OOO', '.O..O', 'O...O', 'O..O.', 'OOO.'];\nconst _bsMask");
  if (broken === src) { console.error('selftest: could not reconstruct the bug — update the patterns in tools/boot-test.mjs'); process.exit(1); }
  const passed = runIn(buildDir(broken), 'selftest: file with the original TDZ bug (must FAIL)');
  if (passed) { console.error('selftest: test did NOT catch the bug — harness is not protecting you'); process.exit(1); }
  console.log('selftest OK: boot test correctly rejects the declaration-order bug');
}

console.log(ok ? 'BOOT TEST PASSED' : 'BOOT TEST FAILED');
process.exit(ok ? 0 : 1);
