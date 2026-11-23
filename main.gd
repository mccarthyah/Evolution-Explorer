extends Node3D
## EVOLUTION: Living Terrain — Conway B3/S23 on a 2D grid, rendered in 3D.
## No addons, external assets, or individual nodes per cell required.

const GRID: int = 64
const TOTAL: int = GRID * GRID
const SPACING: float = 1.15
const MAX_AGE: int = 65
const HISTORY_LIMIT: float = 1.0
const PALETTE: Array[Color] = [
	Color(0.15, 0.93, 1.0),
	Color(1.0, 0.24, 0.72),
	Color(0.54, 1.0, 0.38)
]

var cells: PackedByteArray = PackedByteArray()
var next_cells: PackedByteArray = PackedByteArray()
var ages: PackedInt32Array = PackedInt32Array()
var history: PackedFloat32Array = PackedFloat32Array()
var heights: PackedFloat32Array = PackedFloat32Array()
var generations: int = 0
var population: int = 0
var running: bool = true
var memory_enabled: bool = true
var generation_interval: float = 0.35
var height_scale: float = 1.0
var accumulated: float = 0.0
var overview: bool = false
var visual_elapsed: float = 0.0
const VISUAL_INTERVAL: float = 1.0 / 20.0
# Cellular Instability: thresholds are measured in simulation generations.
const TOWER_LIFESPAN: int = 40
const OSCILLATOR_CYCLES: int = 12
const EXPLOSION_RADIUS: int = 4
const MAX_EXPLOSIONS_PER_GENERATION: int = 3
const EXPLOSION_COOLDOWN: int = 12
const OSCILLATOR_MAX_CELLS: int = 64
const MAX_DEBRIS_SEEDS: int = 12
var explosion_cooldowns: PackedInt32Array = PackedInt32Array()
var warning_timers: PackedInt32Array = PackedInt32Array()
var pattern_snapshots: Array[PackedByteArray] = []
var oscillator_tracks: Dictionary = {}
var explosion_queue: Array[Vector2i] = []
var blasts: Array[Dictionary] = []
var explosions_total: int = 0
var last_explosion: String = "NONE"
var brush_species: int = 1

# ── Gardener economy ──
const ORB_VALUE: int = 5
const ORB_TTL: float = 20.0
const STASIS_RADIUS: int = 5
const STASIS_GENS: int = 30
const STARTING_BIOMASS: int = 20
const LWSS_ROWS: Array = [".O..O", "O....", "O...O", "OOOO."]
const REPLICATOR_ROWS: Array = ["..OOO", ".O..O", "O...O", "O..O.", "OOO."]
const ACORN_ROWS: Array = [".O.....", "...O...", "OO..OOO"]
const SIMKIN_ROWS: Array = [
	"OO.....OO",
	"OO.....OO",
	"",
	"....OO",
	"....OO",
	"",
	"",
	"",
	"",
	"......................O...O",
	".....................O....OO",
	"....................OO.....OO..OO",
	".....................OO....O...OO",
	"......................O",
]
# Seed catalog: keys 4-9 direct; Q/E cycle and place. Unlocks via levels or journal.
const TOOL_CATALOG: Array = [
	{"id": "rpento", "name": "R-pentomino", "cost": 5, "rows": R_PENTOMINO_ROWS},
	{"id": "glider", "name": "Glider", "cost": 10, "rows": GLIDER_ROWS},
	{"id": "pulsar", "name": "Pulsar", "cost": 25, "rows": PULSAR_ROWS, "centered": true},
	{"id": "rain", "name": "Seed Rain", "cost": 20, "kind": "rain"},
	{"id": "stasis", "name": "Stasis Field", "cost": 15, "kind": "stasis"},
	{"id": "gun", "name": "Glider Gun", "cost": 60, "rows": GUN_ROWS},
	{"id": "lwss", "name": "Lightweight Ship", "cost": 15, "rows": LWSS_ROWS, "unlock": {"discover": "Lightweight Ship"}},
	{"id": "replicator", "name": "Replicator", "cost": 25, "rows": REPLICATOR_ROWS, "unlock": {"world": "highlife"}},
	{"id": "monsoon", "name": "Monsoon", "cost": 30, "kind": "monsoon", "unlock": {"level": 4}},
	{"id": "acorn", "name": "Acorn", "cost": 20, "rows": ACORN_ROWS, "unlock": {"level": 5}},
	{"id": "simkin", "name": "Simkin Gun", "cost": 45, "rows": SIMKIN_ROWS, "unlock": {"level": 6}},
	{"id": "bigbang", "name": "Big Bang", "cost": 100, "kind": "bigbang", "unlock": {"level": 10}},
]
const TOOL_KEYS: Dictionary = {
	KEY_4: "rpento", KEY_5: "glider", KEY_6: "pulsar",
	KEY_7: "rain", KEY_8: "stasis", KEY_9: "gun",
}
const HARVESTER_COST: int = 40
const HARVESTER_MAX: int = 3
const HARVESTER_RADIUS: float = 12.0
const R_PENTOMINO_ROWS: Array = [".XX", "XX.", ".X."]
const GLIDER_ROWS: Array = [".O.", "..O", "OOO"]
const PULSAR_ROWS: Array = [
	"..OOO...OOO..",
	".............",
	"O....O.O....O",
	"O....O.O....O",
	"O....O.O....O",
	"..OOO...OOO..",
	".............",
	"..OOO...OOO..",
	"O....O.O....O",
	"O....O.O....O",
	"O....O.O....O",
	".............",
	"..OOO...OOO..",
]
const GUN_ROWS: Array = [
	"........................O...........",
	"......................O.O...........",
	"............OO......OO............OO",
	"...........O...O....OO............OO",
	"OO........O.....O...OO..............",
	"OO........O...O.OO....O.O...........",
	"..........O.....O.......O...........",
	"...........O...O....................",
	"............OO......................",
]
const CONTRACTS: Array = [
	{"id": "collect", "text": "Harvest 15 biomass from blast sites", "target": 15, "reward": 10},
	{"id": "paint", "text": "Seed 25 cells with the brush (F)", "target": 25, "reward": 15},
	{"id": "explode", "text": "Witness 3 detonations", "target": 3, "reward": 20},
	{"id": "balance", "text": "Grow 40+ living cells of all 3 species", "target": 3, "reward": 25},
	{"id": "tools", "text": "Use 3 different seed tools", "target": 3, "reward": 25},
	{"id": "journal", "text": "Discover 6 lifeforms (J for journal)", "target": 6, "reward": 30},
	{"id": "pop", "text": "Grow the population to 400", "target": 400, "reward": 30},
	{"id": "gen300", "text": "Sustain the world to generation 300", "target": 300, "reward": 40},
	{"id": "master", "text": "MASTER GARDENER: gen 600, 300 alive, 100 biomass", "target": 3, "reward": 100},
]
var biomass: int = 0
var biomass_collected_total: int = 0
var painted_cells: int = 0
var max_population: int = 0
var tools_used: Dictionary = {}
var orbs: Array[Dictionary] = []
var stasis_bubbles: Array[Dictionary] = []
var contract_index: int = 0
var toast_label: Label
var toast_ttl: float = 0.0
var shake: float = 0.0
var shake_offset: Vector3 = Vector3.ZERO

# ── Field journal / discovery ──
const JOURNAL_PATTERNS: Array = [
	{"name": "Block", "rows": ["OO", "OO"], "desc": "still life"},
	{"name": "Tub", "rows": [".O.", "O.O", ".O."], "desc": "still life"},
	{"name": "Boat", "rows": ["OO.", "O.O"], "desc": "still life"},
	{"name": "Beehive", "rows": [".OO.", "O..O", ".OO."], "desc": "still life"},
	{"name": "Loaf", "rows": [".OO.", "O..O", ".O.O", ".O.."], "desc": "still life"},
	{"name": "Blinker", "rows": ["OOO"], "desc": "oscillator p2"},
	{"name": "Toad", "rows": [".OOO", "OOO."], "desc": "oscillator p2"},
	{"name": "Beacon", "rows": ["OO..", "OO..", "..OO", "..OO"], "desc": "oscillator p2"},
	{"name": "Glider", "rows": [".O.", "..O", "OOO"], "desc": "spaceship c/4"},
	{"name": "Lightweight Ship", "rows": [".O..O", "O....", "O...O", "OOOO."], "desc": "spaceship c/2"},
	{"name": "Pulsar", "rows": PULSAR_ROWS, "desc": "oscillator p3"},
	{"name": "Glider Gun", "rows": GUN_ROWS, "desc": "endless gliders"},
	{"name": "Replicator", "rows": REPLICATOR_ROWS, "desc": "HighLife — copies itself every 12 gens"},
]
var discoveries: Dictionary = {}
var journal_sigs: Dictionary = {}
var journal_label: Label

# ── Day/night cycle + glow ──
const DAY_LENGTH: float = 150.0
const BASE_BG := Color(0.009, 0.014, 0.034)
const BASE_FLOOR := Color(0.025, 0.045, 0.085)
var day_night_enabled: bool = true
var day_time: float = 0.0
var world_brightness: float = 1.0
var sun_light: DirectionalLight3D
var floor_material: StandardMaterial3D
var world_env: Environment

# ── v5: replay history, daily challenge, minimap ──
const HISTORY_MAX: int = 100
var history_frames: Array = []
var history_mode: bool = false
var history_view: int = 0
var was_running_before_history: bool = true
var minimap: Control
var minimap_elapsed: float = 0.0
var minimap_on: bool = true
var daily_mode: bool = false
var daily_scored: bool = false
var rng_state: int = -1

# ── Pilot progression (persists in user://pilot.cfg) ──
var pilot: Dictionary = {
	"xp": 0, "level": 1, "sp": 0, "area_brush": false,
	"up": {"vigor": 0, "fertility": 0, "volatility": 0, "magnetism": 0},
	"tools": ["rpento", "glider", "pulsar", "rain", "stasis", "gun"],
	"rec": {"biggestBlast": 0, "tallestTower": 0, "bestDaily": 0, "firesOut": 0},
	"streak": {"last": "", "count": 0},
	"worlds": ["life", "daynight"],
}
var tool_by_id: Dictionary = {}
var selected_tool_idx: int = 0
var harvesters: Array[Dictionary] = []
var upgrade_label: Label

# ── v7 Wildlands: weather, events, ecology ──
const DOMINATOR: Array = [2, 3, 1]  # species DOMINATOR[s-1] assimilates species s
const AURORA_BG := Color(0.012, 0.095, 0.05)
var harmony: PackedByteArray = PackedByteArray()
var event_countdown: int = 60
var pollen_gens: int = 0
var aurora_ttl: float = 0.0
var fires: Dictionary = {}
var meteor: Dictionary = {}
var fires_out: int = 0
var last_record_toast_ms: int = 0

# ── v8 New Worlds: generalized Life-like rule engine ──
var WORLDS: Array = [
	{"id": "life", "name": "Life", "bs": "B3/S23", "patches": 16, "radius": [3, 8], "density": 0.34, "tower": 40,
		"desc": "the classic home world"},
	{"id": "daynight", "name": "Day & Night", "bs": "B3678/S34678", "soup": 0.45, "tower": 40,
		"desc": "symmetric rule — dark regions behave like live ones"},
	{"id": "highlife", "name": "HighLife", "bs": "B36/S23", "patches": 16, "radius": [3, 8], "density": 0.34, "tower": 40,
		"unlock": {"level": 5}, "desc": "home of the replicator"},
	{"id": "crystal", "name": "Crystals", "bs": "B3/S012345678", "patches": 4, "radius": [1, 1], "density": 0.6, "tower": 60,
		"unlock": {"level": 8}, "desc": "Life without Death — cells never die; mine with explosions"},
]
var worlds_by_id: Dictionary = {}
var selected_world_id: String = "life"
var active_world: Dictionary = {}

func unlocked_worlds() -> Array:
	var list: Array = []
	for w in WORLDS:
		if not w.has("unlock") or (pilot["worlds"] as Array).has(w["id"]):
			list.append(w)
	return list

func cycle_world() -> void:
	var wlist: Array = unlocked_worlds()
	if wlist.size() < 2:
		return
	var widx: int = 0
	for wi in range(wlist.size()):
		if String(wlist[wi]["id"]) == selected_world_id:
			widx = wi
	selected_world_id = String(wlist[(widx + 1) % wlist.size()]["id"])
	daily_mode = false
	rng_state = -1
	active_world = worlds_by_id[selected_world_id]
	seed_world()
	show_banner("🌍 %s — %s  (%s)" % [String(active_world["name"]), String(active_world["desc"]), String(active_world["bs"])], Color(1.0, 0.85, 0.3))

var mesh_instance: MultiMeshInstance3D
var multimesh: MultiMesh
var camera: Camera3D
var hud: Label
var hint: Label
var floor_mesh: MeshInstance3D
var rng: RandomNumberGenerator = RandomNumberGenerator.new()

func _ready() -> void:
	rng.randomize()
	cells.resize(TOTAL)
	next_cells.resize(TOTAL)
	harmony.resize(TOTAL)
	ages.resize(TOTAL)
	history.resize(TOTAL)
	heights.resize(TOTAL)
	explosion_cooldowns.resize(TOTAL)
	warning_timers.resize(TOTAL)
	build_world()
	for w in WORLDS:
		var rule_parts: PackedStringArray = String(w["bs"]).substr(1).split("/S")
		var bmask: int = 0
		for ch in rule_parts[0]:
			bmask |= 1 << int(ch)
		var smask: int = 0
		for ch in rule_parts[1]:
			smask |= 1 << int(ch)
		w["birth_mask"] = bmask
		w["survive_mask"] = smask
		worlds_by_id[w["id"]] = w
	active_world = WORLDS[0]
	seed_world()
	biomass = STARTING_BIOMASS
	build_journal_sigs()
	for tool in TOOL_CATALOG:
		tool_by_id[tool["id"]] = tool
	load_pilot()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func build_world() -> void:
	var box: BoxMesh = BoxMesh.new()
	box.size = Vector3(0.74, 1.0, 0.74)
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.metallic = 0.0
	mat.roughness = 0.26
	box.material = mat
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.instance_count = TOTAL
	multimesh.mesh = box
	mesh_instance = MultiMeshInstance3D.new()
	mesh_instance.multimesh = multimesh
	add_child(mesh_instance)

	var floor_box: BoxMesh = BoxMesh.new()
	floor_box.size = Vector3(GRID * SPACING + 2.0, 0.25, GRID * SPACING + 2.0)
	floor_mesh = MeshInstance3D.new()
	floor_mesh.mesh = floor_box
	floor_mesh.position.y = -0.20
	var floor_mat: StandardMaterial3D = StandardMaterial3D.new()
	floor_mat.albedo_color = Color(0.025, 0.045, 0.085)
	floor_mat.metallic = 0.5
	floor_mat.roughness = 0.52
	floor_mesh.material_override = floor_mat
	floor_material = floor_mat
	add_child(floor_mesh)

	var light: DirectionalLight3D = DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-58.0, -35.0, 0.0)
	light.light_energy = 0.95
	add_child(light)
	sun_light = light
	var world: WorldEnvironment = WorldEnvironment.new()
	var env: Environment = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.009, 0.014, 0.034)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.25, 0.33, 0.52)
	env.ambient_light_energy = 0.7
	env.glow_enabled = true
	env.glow_intensity = 1.0
	env.glow_strength = 0.55
	env.glow_hdr_threshold = 0.8
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	world.environment = env
	add_child(world)
	world_env = env

	camera = Camera3D.new()
	camera.current = true
	camera.fov = 78.0
	camera.far = 650.0
	camera.position = Vector3(0.0, 20.0, 50.0)
	camera.rotation = Vector3(-0.30, 0.0, 0.0)
	add_child(camera)

	var canvas: CanvasLayer = CanvasLayer.new()
	add_child(canvas)
	hud = Label.new()
	hud.position = Vector2(20.0, 18.0)
	hud.add_theme_font_size_override("font_size", 19)
	hud.add_theme_color_override("font_color", Color(0.72, 0.96, 1.0))
	canvas.add_child(hud)
	hint = Label.new()
	hint.position = Vector2(20.0, 125.0)
	hint.add_theme_font_size_override("font_size", 14)
	hint.add_theme_color_override("font_color", Color(0.77, 0.83, 0.96))
	hint.text = "WASD fly  |  Arrow keys look  |  Space/Ctrl rise/fall  |  Shift boost\nV overview  |  P pause  |  N step  |  R randomize  |  C clear  |  Esc quit\n[ / ] speed  |  - / = height  |  M memory  |  1/2/3 species  |  F/G place/erase cell\nSeed tools (aim at ground): 4 R-pento 5⚡  5 Glider 10⚡  6 Pulsar 25⚡  7 Rain 20⚡\n8 Stasis 15⚡  9 Glider Gun 60⚡  —  harvest gold orbs at blast sites for ⚡\nJ field journal  |  X save code / L load code  |  B bloom  |  T day/night"
	canvas.add_child(hint)
	hint.text += "\nInstability: towers 40 gen | oscillators 12 cycles | blast radius 4 | chain reactions ON"
	hint.text += "\nK minimap  |  H replay (, / . scrub)  |  Z daily challenge"
	hint.text += "\nU genetics lab  |  Q/E select/place seeds  |  Y auto-harvester 40⚡"
	hint.text += "\n🌍 Weather strikes: ☄️ meteors · 🔥 wildfire · 🌌 aurora ×2XP · 🌸 pollen — species RPS ecology"
	hint.text += "\n0 cycle worlds  |  Life · Day & Night · HighLife (Lv5) · Crystals (Lv8)"
	toast_label = Label.new()
	toast_label.position = Vector2(420.0, 92.0)
	toast_label.add_theme_font_size_override("font_size", 19)
	toast_label.add_theme_color_override("font_color", Color(0.65, 1.0, 0.85))
	toast_label.visible = false
	canvas.add_child(toast_label)
	journal_label = Label.new()
	journal_label.position = Vector2(1000.0, 18.0)
	journal_label.add_theme_font_size_override("font_size", 15)
	journal_label.add_theme_color_override("font_color", Color(0.65, 0.9, 1.0))
	journal_label.visible = false
	canvas.add_child(journal_label)
	refresh_journal()
	upgrade_label = Label.new()
	upgrade_label.position = Vector2(640.0, 150.0)
	upgrade_label.add_theme_font_size_override("font_size", 17)
	upgrade_label.add_theme_color_override("font_color", Color(0.65, 1.0, 0.85))
	upgrade_label.visible = false
	canvas.add_child(upgrade_label)
	refresh_upgrade_label()
	build_minimap(canvas)

func index_of(x: int, z: int) -> int:
	return z * GRID + x

# Deterministic RNG: free mode uses the seeded RandomNumberGenerator,
# daily mode uses a date-derived LCG so everyone gets the same world.
func rnd() -> float:
	if rng_state < 0:
		return rng.randf()
	rng_state = (rng_state * 1664525 + 1013904223) & 0xFFFFFFFF
	return float(rng_state) / 4294967296.0

func rnd_range(lo: int, hi: int) -> int:
	return lo + int(rnd() * float(hi - lo + 1))

func seed_world() -> void:
	for i in range(TOTAL):
		cells[i] = 0
		ages[i] = 0
		history[i] = 0.0
		heights[i] = 0.0
		explosion_cooldowns[i] = 0
		warning_timers[i] = 0
	pattern_snapshots.clear()
	oscillator_tracks.clear()
	explosion_queue.clear()
	blasts.clear()
	explosions_total = 0
	last_explosion = "NONE"
	history_frames.clear()
	if history_mode:
		history_mode = false
		running = was_running_before_history
	if active_world.has("soup"):
		for i in range(TOTAL):
			if rnd() < float(active_world["soup"]):
				cells[i] = rnd_range(1, 3)
	else:
		for k in range(int(active_world["patches"])):
			var cx: int = rnd_range(6, GRID - 7)
			var cz: int = rnd_range(6, GRID - 7)
			var radius: int = rnd_range(int(active_world["radius"][0]), int(active_world["radius"][1]))
			var species: int = rnd_range(1, 3)
			for z in range(maxi(0, cz - radius), mini(GRID, cz + radius + 1)):
				for x in range(maxi(0, cx - radius), mini(GRID, cx + radius + 1)):
					if Vector2(x - cx, z - cz).length() < float(radius) and rnd() < float(active_world["density"]):
						cells[index_of(x, z)] = species
	generations = 0
	event_countdown = 55 + rnd_range(0, 24)
	pollen_gens = 0
	aurora_ttl = 0.0
	fires.clear()
	if not meteor.is_empty():
		var mnode: MeshInstance3D = meteor["node"] as MeshInstance3D
		if mnode != null and is_instance_valid(mnode):
			mnode.queue_free()
		meteor = {}
	refresh_population()

func refresh_population() -> void:
	population = 0
	for cell in cells:
		if cell != 0:
			population += 1
	max_population = maxi(max_population, population)

func step_simulation() -> void:
	for z in range(GRID):
		for x in range(GRID):
			var i: int = index_of(x, z)
			var neighbours: int = 0
			var votes: Array[int] = [0, 0, 0]
			for dz in range(-1, 2):
				for dx in range(-1, 2):
					if dx == 0 and dz == 0:
						continue
					var nx: int = x + dx
					var nz: int = z + dz
					if nx < 0 or nx >= GRID or nz < 0 or nz >= GRID:
						continue
					var neighbour: int = int(cells[index_of(nx, nz)])
					if neighbour > 0:
						neighbours += 1
						votes[neighbour - 1] += 1
			var living: int = int(cells[i])
			if living != 0 and (int(active_world["survive_mask"]) & (1 << neighbours)) != 0:
				next_cells[i] = living
			elif living == 0 and (int(active_world["birth_mask"]) & (1 << neighbours)) != 0:
				var winner: int = 0
				for s in range(1, 3):
					if votes[s] > votes[winner]:
						winner = s
				next_cells[i] = winner + 1
			else:
				next_cells[i] = 0
			# v7 ecology: harmony pauses aging; 3 dominant rivals assimilate a survivor.
			if int(next_cells[i]) != 0 and votes[0] > 0 and votes[1] > 0 and votes[2] > 0:
				harmony[i] = 1
			else:
				harmony[i] = 0
				if living != 0 and int(next_cells[i]) != 0:
					var dom: int = DOMINATOR[living - 1]
					if votes[dom - 1] >= 3:
						next_cells[i] = dom
	var previous_tallest_tower: int = int(pilot["rec"]["tallestTower"])
	for i in range(TOTAL):
		var old: int = int(cells[i])
		var current: int = int(next_cells[i])
		cells[i] = current
		var frozen: bool = in_stasis(i % GRID, i / GRID)
		if current != 0:
			if old != 0:
				ages[i] = ages[i] if frozen or harmony[i] != 0 else mini(MAX_AGE, ages[i] + 1)
			else:
				ages[i] = 1
			if not frozen:
				history[i] = minf(HISTORY_LIMIT, history[i] + memory_gain())
			if ages[i] > int(pilot["rec"]["tallestTower"]):
				pilot["rec"]["tallestTower"] = ages[i]
		else:
			ages[i] = 0
			if not frozen:
				history[i] = maxf(0.0, history[i] - 0.012)
	if int(pilot["rec"]["tallestTower"]) > previous_tallest_tower:
		save_pilot()
	generations += 1
	# v7 weather & events (seeded rnd → daily runs share the same weather).
	if pollen_gens > 0:
		pollen_gens -= 1
	if not fires.is_empty():
		spread_fire()
	event_countdown -= 1
	if event_countdown <= 0 and generations > 40:
		trigger_random_event()
	update_instability()
	update_stasis()
	refresh_population()
	check_contract()
	history_frames.append({"c": cells.duplicate(), "a": ages.duplicate(), "h": heights.duplicate()})
	if history_frames.size() > HISTORY_MAX:
		history_frames.pop_front()
	if daily_mode and not daily_scored and generations == 300:
		score_daily()

# Detect short-period oscillators as stationary, bounded connected structures.
# The signature includes the absolute footprint, so moving gliders are not
# mistaken for oscillators. Period-one still lifes are handled by tower aging.
func update_instability() -> void:
	for i in range(TOTAL):
		if explosion_cooldowns[i] > 0:
			explosion_cooldowns[i] -= 1
		if cells[i] != 0 and ages[i] >= tower_lifespan() and explosion_cooldowns[i] == 0 and not in_stasis(i % GRID, i / GRID):
			explosion_queue.append(Vector2i(i % GRID, i / GRID))
			# Prevent the same cell being queued repeatedly while waiting.
			explosion_cooldowns[i] = EXPLOSION_COOLDOWN
		if cells[i] != 0 and ages[i] >= tower_lifespan() - 8:
			warning_timers[i] = 8
		elif warning_timers[i] > 0:
			warning_timers[i] -= 1

	# Store exact previous board states. Only periods 2..6 qualify.
	var board: PackedByteArray = cells.duplicate()
	pattern_snapshots.append(board)
	if pattern_snapshots.size() > 7:
		pattern_snapshots.pop_front()
	if pattern_snapshots.size() >= 3:
		find_oscillators()

	# Limit detonation work per generation; chained blasts are queued.
	var processed: int = 0
	while not explosion_queue.is_empty() and processed < MAX_EXPLOSIONS_PER_GENERATION:
		var center: Vector2i = explosion_queue.pop_front()
		if center.x < 0 or center.x >= GRID or center.y < 0 or center.y >= GRID:
			continue
		detonate(center)
		processed += 1

func find_oscillators() -> void:
	var seen: PackedByteArray = PackedByteArray()
	seen.resize(TOTAL)
	var updated: Dictionary = {}
	for start in range(TOTAL):
		if cells[start] == 0 or seen[start] != 0:
			continue
		var component: Array[int] = []
		var frontier: Array[int] = [start]
		seen[start] = 1
		var head: int = 0
		while head < frontier.size():
			var idx: int = frontier[head]
			head += 1
			component.append(idx)
			var x: int = idx % GRID
			var z: int = idx / GRID
			for dz in range(-1, 2):
				for dx in range(-1, 2):
					if dx == 0 and dz == 0:
						continue
					var nx: int = x + dx
					var nz: int = z + dz
					if nx < 0 or nx >= GRID or nz < 0 or nz >= GRID:
						continue
					var ni: int = index_of(nx, nz)
					if cells[ni] != 0 and seen[ni] == 0:
						seen[ni] = 1
						frontier.append(ni)
		if component.size() < 2 or component.size() > OSCILLATOR_MAX_CELLS:
			continue
		# Field journal discovery: match shape signature against the library.
		var sig: String = component_signature(component)
		if journal_sigs.has(sig):
			var pname: String = journal_sigs[sig]
			if not discoveries.has(pname):
				discoveries[pname] = true
				biomass += 10
				biomass_collected_total += 10
				add_xp(25)
				check_discover_unlock(pname)
				show_banner("🔬 DISCOVERED: %s  (+10 ⚡)" % pname, Color(0.55, 0.9, 1.0))
				print("EVOLUTION: discovered ", pname, " at generation ", generations)
				refresh_journal()
		var min_x: int = GRID
		var min_z: int = GRID
		var max_x: int = 0
		var max_z: int = 0
		for idx in component:
			min_x = mini(min_x, idx % GRID)
			max_x = maxi(max_x, idx % GRID)
			min_z = mini(min_z, idx / GRID)
			max_z = maxi(max_z, idx / GRID)
		# A one-cell margin accounts for a blinker changing orientation.
		min_x = maxi(0, min_x - 1)
		min_z = maxi(0, min_z - 1)
		max_x = mini(GRID - 1, max_x + 1)
		max_z = mini(GRID - 1, max_z + 1)
		var key: String = "%d:%d" % [(min_x + max_x) / 2, (min_z + max_z) / 2]
		var period: int = 0
		for lag in range(2, mini(6, pattern_snapshots.size() - 1) + 1):
			var previous: PackedByteArray = pattern_snapshots[pattern_snapshots.size() - 1 - lag]
			var identical: bool = true
			for z in range(min_z, max_z + 1):
				for x in range(min_x, max_x + 1):
					var i: int = index_of(x, z)
					if (previous[i] != 0) != (cells[i] != 0):
						identical = false
						break
				if not identical:
					break
			if identical:
				# Reject period-one still lifes, even though they also match lag 2.
				var prior: PackedByteArray = pattern_snapshots[pattern_snapshots.size() - 2]
				var changed: bool = false
				for idx in component:
					if (prior[idx] != 0) != (cells[idx] != 0):
						changed = true
						break
				if changed:
					period = lag
					break
		if period == 0:
			continue
		var track: Dictionary = oscillator_tracks.get(key, {"ticks": 0, "period": period})
		if int(track["period"]) != period:
			track = {"ticks": 0, "period": period}
		track["ticks"] = int(track["ticks"]) + 1
		updated[key] = track
		if int(track["ticks"]) >= OSCILLATOR_CYCLES * period:
			var cx: int = (min_x + max_x) / 2
			var cz: int = (min_z + max_z) / 2
			var center_idx: int = index_of(cx, cz)
			if explosion_cooldowns[center_idx] == 0 and not in_stasis(cx, cz):
				explosion_queue.append(Vector2i(cx, cz))
				explosion_cooldowns[center_idx] = EXPLOSION_COOLDOWN
			updated.erase(key)
	oscillator_tracks = updated

func detonate(center: Vector2i, radius: int = EXPLOSION_RADIUS, orb_n: int = 0, debris_n: int = 0) -> void:
	var source: int = index_of(center.x, center.y)
	var species: int = int(cells[source])
	if species == 0:
		species = rnd_range(1, 3)
	var destroyed: int = 0
	for z in range(maxi(0, center.y - radius), mini(GRID, center.y + radius + 1)):
		for x in range(maxi(0, center.x - radius), mini(GRID, center.x + radius + 1)):
			var dist: float = Vector2(x - center.x, z - center.y).length()
			if dist > float(radius):
				continue
			var i: int = index_of(x, z)
			if cells[i] != 0:
				destroyed += 1
				# Chain reactions: near-expired towers may detonate next generation.
				if ages[i] >= tower_lifespan() - 6 and i != source and explosion_cooldowns[i] == 0 and not in_stasis(x, z):
					explosion_queue.append(Vector2i(x, z))
			cells[i] = 0
			ages[i] = 0
			warning_timers[i] = 0
			history[i] = maxf(history[i], 0.45)
			explosion_cooldowns[i] = EXPLOSION_COOLDOWN
	# Scatter viable fragments outside the cleared crater.
	# Small clusters and gliders seed new activity rather than dying instantly.
	var glider: Array[Vector2i] = [Vector2i(1, 0), Vector2i(2, 1), Vector2i(0, 2), Vector2i(1, 2), Vector2i(2, 2)]
	var debris_count: int = debris_n if debris_n > 0 else MAX_DEBRIS_SEEDS
	for seed in range(debris_count):
		var angle: float = rnd() * TAU
		var distance: float = rnd() * (float(radius) * 2.5 - float(radius) - 1.0) + float(radius) + 1.0
		var px: int = center.x + roundi(cos(angle) * distance)
		var pz: int = center.y + roundi(sin(angle) * distance)
		var kind: int = seed % 3
		var offsets: Array[Vector2i] = [Vector2i.ZERO]
		if kind == 0:
			offsets = glider
		elif kind == 1:
			offsets = [Vector2i.ZERO, Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]
		for offset in offsets:
			var x: int = px + offset.x
			var z: int = pz + offset.y
			if x < 0 or x >= GRID or z < 0 or z >= GRID:
				continue
			var i: int = index_of(x, z)
			cells[i] = species if rnd() < 0.7 else rnd_range(1, 3)
			ages[i] = 1
			explosion_cooldowns[i] = EXPLOSION_COOLDOWN
	var blast_pos := Vector3((float(center.x) - float(GRID - 1) * 0.5) * SPACING, 3.0, (float(center.y) - float(GRID - 1) * 0.5) * SPACING)
	var blast_node := _make_blast_node(blast_pos)
	blasts.append({"x": center.x, "z": center.y, "ttl": 0.65, "node": blast_node})
	_spawn_burst(blast_pos, Color(1.0, 0.55, 0.15), 26)
	spawn_orbs(center.x, center.y, orb_n if orb_n > 0 else orb_count())
	shake = clampf(16.0 / (1.0 + blast_pos.distance_to(camera.global_position) * 0.14), 0.15, 1.1)
	explosions_total += 1
	add_xp(3)
	last_explosion = "(%d,%d) cleared %d" % [center.x, center.y, destroyed]
	if destroyed > int(pilot["rec"]["biggestBlast"]):
		pilot["rec"]["biggestBlast"] = destroyed
		save_pilot()
		var now_ms: int = Time.get_ticks_msec()
		if now_ms - last_record_toast_ms > 6000 and destroyed >= 10:
			last_record_toast_ms = now_ms
			show_banner("🏆 NEW RECORD — biggest blast cleared %d!" % destroyed, Color(1.0, 0.85, 0.3))
	pattern_snapshots.clear()
	oscillator_tracks.clear()
	print("EVOLUTION: explosion ", last_explosion, " at generation ", generations)

func _make_blast_node(pos: Vector3) -> MeshInstance3D:
	var sphere := SphereMesh.new()
	sphere.radius = 1.0
	sphere.height = 2.0
	sphere.radial_segments = 24
	sphere.rings = 12
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.55, 0.15, 0.55)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sphere.material = mat
	var node := MeshInstance3D.new()
	node.mesh = sphere
	node.position = pos
	node.scale = Vector3.ONE
	add_child(node)
	return node

func _spawn_burst(pos: Vector3, color: Color, amount: int) -> void:
	var p := CPUParticles3D.new()
	p.amount = amount
	p.one_shot = true
	p.explosiveness = 0.9
	p.lifetime = 0.8
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.8
	p.direction = Vector3(0, 1, 0)
	p.spread = 180.0
	p.initial_velocity_min = 3.0
	p.initial_velocity_max = 8.0
	p.gravity = Vector3(0, -4, 0)
	p.color = color
	var mesh := SphereMesh.new()
	mesh.radius = 0.12
	mesh.height = 0.24
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material = mat
	p.mesh = mesh
	p.position = pos
	add_child(p)
	p.emitting = true
	get_tree().create_timer(1.2).timeout.connect(func() -> void:
		if is_instance_valid(p):
			p.queue_free()
	)

func _process(delta: float) -> void:
	# Day/night cycle.
	if day_night_enabled:
		day_time += delta
		var day_phase: float = fmod(day_time, DAY_LENGTH) / DAY_LENGTH
		world_brightness = 0.72 + 0.28 * (0.5 + 0.5 * sin(day_phase * TAU - PI * 0.5))
	else:
		world_brightness = 1.0
	if world_env != null:
		world_env.background_color = BASE_BG * world_brightness
		world_env.ambient_light_energy = 0.7 * world_brightness
	if aurora_ttl > 0.0:
		aurora_ttl -= delta * 1000.0
		if world_env != null:
			world_env.background_color = world_env.background_color.lerp(AURORA_BG, 0.55)
	update_meteor(delta)
	if sun_light != null:
		sun_light.light_energy = 0.95 * world_brightness
	if floor_material != null:
		floor_material.albedo_color = BASE_FLOOR * world_brightness
	if running and not history_mode:
		accumulated += delta
		var steps: int = 0
		while accumulated >= generation_interval and steps < 4:
			step_simulation()
			accumulated -= generation_interval
			steps += 1
		if steps == 4:
			accumulated = 0.0
	minimap_elapsed += delta
	if minimap_on and minimap != null and minimap_elapsed >= 0.25:
		minimap_elapsed = 0.0
		minimap.queue_redraw()
	visual_elapsed += delta
	if visual_elapsed >= VISUAL_INTERVAL:
		update_visuals(minf(0.1, visual_elapsed))
		visual_elapsed = 0.0
	update_flight(delta)
	camera.global_position -= shake_offset
	shake = maxf(0.0, shake - delta * 1.6)
	if shake > 0.001:
		shake_offset = Vector3(rng.randf_range(-1.0, 1.0), rng.randf_range(-1.0, 1.0), rng.randf_range(-1.0, 1.0)) * shake * 0.4
	else:
		shake_offset = Vector3.ZERO
	camera.global_position += shake_offset
	update_orbs(delta)
	for h in harvesters:
		var hnode: MeshInstance3D = h["node"] as MeshInstance3D
		if hnode != null and is_instance_valid(hnode):
			hnode.rotate_y(delta * 1.2)
			hnode.position.y = 5.0 + sin(float(h["phase"]) + Time.get_ticks_msec() * 0.0015) * 0.4
	if toast_ttl > 0.0:
		toast_ttl -= delta
		if toast_ttl <= 0.0:
			toast_label.visible = false
	for b in range(blasts.size() - 1, -1, -1):
		blasts[b]["ttl"] = float(blasts[b]["ttl"]) - delta
		if float(blasts[b]["ttl"]) <= 0.0:
			blasts.remove_at(b)
	var mode: String = "FLIGHT · %s" % String(active_world["name"]).to_upper()
	if history_mode:
		mode = "REPLAY"
	elif overview:
		mode = "OVERVIEW"
	elif daily_mode:
		mode = "DAILY · %s" % String(active_world["name"]).to_upper()
	hud.text = "EVOLUTION  /  LIVING TERRAIN\nGeneration %d     Alive %d     %s\n%s   |   %.1f gen/sec   |   Height %.1fx   |   Memory %s   |   Brush %d" % [generations, population, mode, "RUNNING" if running else "PAUSED", 1.0 / generation_interval, height_scale, "ON" if memory_enabled else "OFF", brush_species]
	hud.text += "\nExplosions %d  |  Last %s" % [explosions_total, last_explosion]
	hud.text += "\n⚡ Biomass %d   |   🔬 %d/%d   |   Contract %s" % [biomass, discoveries.size(), JOURNAL_PATTERNS.size(), contract_hud_text()]
	if history_mode:
		hud.text += "\n⏳ REPLAY %d/%d  —  , / . scrub (Shift ×10)  —  H to return" % [history_view + 1, history_frames.size()]
	var next_xp: int = xp_for_next()
	var filled_xp: int = clampi(int(float(pilot["xp"]) / float(next_xp) * 10.0), 0, 10)
	var xp_bar: String = "▓".repeat(filled_xp) + "░".repeat(10 - filled_xp)
	hud.text += "\nLV %d %s %d/%d XP  ·  SP %d  ·  🎣 %d/%d" % [int(pilot["level"]), xp_bar, int(pilot["xp"]), next_xp, int(pilot["sp"]), harvesters.size(), HARVESTER_MAX]
	var fx: Array = []
	if aurora_ttl > 0.0:
		fx.append("🌌 Aurora ×2XP %ds" % int(ceil(aurora_ttl / 1000.0)))
	if pollen_gens > 0:
		fx.append("🌸 Pollen %dgen" % pollen_gens)
	if not fires.is_empty():
		fx.append("🔥 Wildfire %d cells" % fires.size())
	if not fx.is_empty():
		hud.text += "\n" + "  ·  ".join(fx)

func update_visuals(delta: float) -> void:
	if history_mode:
		# Replay: render a stored frame, dimmed to distinguish it from live.
		var frame: Dictionary = history_frames[history_view]
		var fc: PackedByteArray = frame["c"]
		var fa: PackedInt32Array = frame["a"]
		var fh: PackedFloat32Array = frame["h"]
		for z in range(GRID):
			for x in range(GRID):
				var i: int = index_of(x, z)
				var living: int = int(fc[i])
				var h: float = maxf(0.025, fh[i])
				var pos: Vector3 = Vector3((float(x) - float(GRID - 1) * 0.5) * SPACING, h * 0.5, (float(z) - float(GRID - 1) * 0.5) * SPACING)
				multimesh.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(1.0, h, 1.0)), pos))
				var tint: Color
				if living > 0:
					tint = PALETTE[living - 1].lerp(Color(1.0, 0.52, 0.26), float(fa[i]) / float(MAX_AGE) * 0.55)
				else:
					tint = Color(0.06, 0.14, 0.26)
				tint = Color(tint.r * 0.8, tint.g * 0.8, tint.b * 0.8)
				multimesh.set_instance_color(i, tint)
		return
	for z in range(GRID):
		for x in range(GRID):
			var i: int = index_of(x, z)
			var living: int = int(cells[i])
			var age_factor: float = float(ages[i]) / float(MAX_AGE)
			var terrain_memory: float = history[i] if memory_enabled else 0.0
			var target: float = (1.4 + 12.0 * sqrt(age_factor) + 11.0 * terrain_memory) * height_scale if living != 0 else (6.5 * terrain_memory * height_scale)
			heights[i] = lerpf(heights[i], target, minf(1.0, delta * 5.5))
			var h: float = maxf(0.025, heights[i])
			var pos: Vector3 = Vector3((float(x) - float(GRID - 1) * 0.5) * SPACING, h * 0.5, (float(z) - float(GRID - 1) * 0.5) * SPACING)
			multimesh.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(1.0, h, 1.0)), pos))
			var tint: Color
			if living > 0:
				tint = PALETTE[living - 1].lerp(Color(1.0, 0.52, 0.26), age_factor * 0.55)
				if ages[i] >= tower_lifespan() - 8:
					tint = tint.lerp(Color(1.0, 0.16, 0.04), 0.65 + 0.35 * sin(float(generations) * 2.0))
			else:
				tint = Color(0.06, 0.14, 0.26).lerp(Color(0.19, 0.26, 0.42), terrain_memory)
			if fires.has(i):
				tint = Color(1.0, 0.42 + 0.3 * sin(float(generations) * 3.0 + float(i)), 0.06)
			tint = Color(tint.r * world_brightness, tint.g * world_brightness, tint.b * world_brightness)
			multimesh.set_instance_color(i, tint)

func update_flight(delta: float) -> void:
	var look_speed: float = 1.65
	if Input.is_key_pressed(KEY_LEFT):
		camera.rotation.y += look_speed * delta
	if Input.is_key_pressed(KEY_RIGHT):
		camera.rotation.y -= look_speed * delta
	if Input.is_key_pressed(KEY_UP):
		camera.rotation.x -= look_speed * delta
	if Input.is_key_pressed(KEY_DOWN):
		camera.rotation.x += look_speed * delta
	camera.rotation.x = clampf(camera.rotation.x, -1.48, 1.48)
	var move: Vector3 = Vector3.ZERO
	if Input.is_key_pressed(KEY_W): move -= camera.global_basis.z
	if Input.is_key_pressed(KEY_S): move += camera.global_basis.z
	if Input.is_key_pressed(KEY_A): move -= camera.global_basis.x
	if Input.is_key_pressed(KEY_D): move += camera.global_basis.x
	if Input.is_key_pressed(KEY_SPACE): move += Vector3.UP
	if Input.is_key_pressed(KEY_CTRL): move += Vector3.DOWN
	if move.length_squared() > 0.0:
		var speed: float = 42.0 if Input.is_key_pressed(KEY_SHIFT) else 15.0
		camera.global_position += move.normalized() * speed * delta
		camera.position.y = maxf(0.8, camera.position.y)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		get_tree().quit()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if upgrade_label != null and upgrade_label.visible:
			match event.keycode:
				KEY_1:
					buy_upgrade("vigor")
				KEY_2:
					buy_upgrade("fertility")
				KEY_3:
					buy_upgrade("volatility")
				KEY_4:
					buy_upgrade("magnetism")
				KEY_U:
					upgrade_label.visible = false
			return
		match event.keycode:
			KEY_ESCAPE, KEY_F10:
				get_tree().quit()
			KEY_P:
				running = not running
			KEY_N:
				if not running: step_simulation()
			KEY_R:
				daily_mode = false
				rng_state = -1
				active_world = worlds_by_id[selected_world_id]
				seed_world()
			KEY_0:
				cycle_world()
			KEY_C:
				for i in range(TOTAL):
					cells[i] = 0
					ages[i] = 0
					history[i] = 0.0
				generations = 0
				population = 0
				pattern_snapshots.clear()
				oscillator_tracks.clear()
				explosion_queue.clear()
				history_frames.clear()
				for i in range(TOTAL):
					explosion_cooldowns[i] = 0
			KEY_M:
				memory_enabled = not memory_enabled
			KEY_V:
				overview = not overview
				if overview:
					camera.position = Vector3(0.0, 105.0, 72.0)
					camera.rotation = Vector3(-0.95, 0.0, 0.0)
				else:
					camera.position = Vector3(0.0, 20.0, 42.0)
					camera.rotation = Vector3(-0.30, 0.0, 0.0)
			KEY_BRACKETLEFT:
				generation_interval = minf(2.0, generation_interval * 1.25)
			KEY_BRACKETRIGHT:
				generation_interval = maxf(0.20, generation_interval / 1.25)
			KEY_MINUS:
				height_scale = maxf(0.2, height_scale - 0.2)
			KEY_EQUAL:
				height_scale = minf(4.0, height_scale + 0.2)
			KEY_1, KEY_2, KEY_3:
				brush_species = event.keycode - KEY_1 + 1
			KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9:
				use_tool(TOOL_KEYS[event.keycode])
			KEY_Q:
				cycle_tool()
			KEY_E:
				var tool_list: Array = unlocked_tools()
				if not tool_list.is_empty() and selected_tool_idx < tool_list.size():
					use_tool(tool_list[selected_tool_idx]["id"])
			KEY_U:
				upgrade_label.visible = not upgrade_label.visible
				refresh_upgrade_label()
			KEY_Y:
				place_harvester()
			KEY_B:
				if world_env != null:
					world_env.glow_enabled = not world_env.glow_enabled
			KEY_T:
				day_night_enabled = not day_night_enabled
			KEY_J:
				journal_label.visible = not journal_label.visible
				refresh_journal()
			KEY_X:
				DisplayServer.clipboard_set(encode_ecosystem())
				show_banner("Ecosystem code copied to clipboard", Color(0.65, 1.0, 0.85))
			KEY_L:
				if decode_ecosystem(DisplayServer.clipboard_get()):
					show_banner("Ecosystem loaded from clipboard ✓", Color(0.65, 1.0, 0.85))
				else:
					show_banner("No valid EVO1 code in clipboard", Color(1.0, 0.55, 0.6))
			KEY_H:
				toggle_history()
			KEY_COMMA:
				scrub_history(-10 if event.shift_pressed else -1)
			KEY_PERIOD:
				scrub_history(10 if event.shift_pressed else 1)
			KEY_K:
				minimap_on = not minimap_on
				if minimap != null:
					minimap.visible = minimap_on
			KEY_Z:
				start_daily()
			KEY_F, KEY_G:
				paint_at_cursor(get_viewport().get_visible_rect().size * 0.5, event.keycode == KEY_F)

func paint_at_cursor(screen_pos: Vector2, alive: bool) -> void:
	if history_mode:
		return
	var ray_origin: Vector3 = camera.project_ray_origin(screen_pos)
	var ray_direction: Vector3 = camera.project_ray_normal(screen_pos)
	var hit: Variant = Plane(Vector3.UP, 0.0).intersects_ray(ray_origin, ray_direction)
	if hit == null:
		return
	var point: Vector3 = hit as Vector3
	var x: int = roundi(point.x / SPACING + float(GRID - 1) * 0.5)
	var z: int = roundi(point.z / SPACING + float(GRID - 1) * 0.5)
	if x < 0 or x >= GRID or z < 0 or z >= GRID:
		return
	var i: int = index_of(x, z)
	cells[i] = brush_species if alive else 0
	ages[i] = 1 if alive else 0
	if alive and pilot["area_brush"]:
		for dz in range(-1, 2):
			for dx in range(-1, 2):
				var nx: int = x + dx
				var nz: int = z + dz
				if nx >= 0 and nx < GRID and nz >= 0 and nz < GRID:
					cells[index_of(nx, nz)] = brush_species
					ages[index_of(nx, nz)] = 1
		painted_cells += 9
	elif alive:
		painted_cells += 1
	refresh_population()

func aim_cell() -> Vector2i:
	var screen: Vector2 = get_viewport().get_visible_rect().size * 0.5
	var ray_origin: Vector3 = camera.project_ray_origin(screen)
	var ray_direction: Vector3 = camera.project_ray_normal(screen)
	var hit: Variant = Plane(Vector3.UP, 0.0).intersects_ray(ray_origin, ray_direction)
	if hit == null:
		return Vector2i(-1, -1)
	var point: Vector3 = hit as Vector3
	var x: int = roundi(point.x / SPACING + float(GRID - 1) * 0.5)
	var z: int = roundi(point.z / SPACING + float(GRID - 1) * 0.5)
	if x < 0 or x >= GRID or z < 0 or z >= GRID:
		return Vector2i(-1, -1)
	return Vector2i(x, z)

func place_pattern(rows: Array, origin: Vector2i, species: int) -> int:
	var placed: int = 0
	for r in range(rows.size()):
		var row: String = rows[r]
		for c in range(row.length()):
			if row[c] == "O":
				var x: int = origin.x + c
				var z: int = origin.y + r
				if x >= 0 and x < GRID and z >= 0 and z < GRID:
					cells[index_of(x, z)] = species
					ages[index_of(x, z)] = 1
					placed += 1
	refresh_population()
	return placed

func seed_rain_at(target: Vector2i, radius: float, count: int) -> void:
	for k in range(count):
		var angle: float = rnd() * TAU
		var dist: float = rnd() * radius
		var x: int = clampi(target.x + roundi(cos(angle) * dist), 0, GRID - 1)
		var z: int = clampi(target.y + roundi(sin(angle) * dist), 0, GRID - 1)
		var i: int = index_of(x, z)
		cells[i] = brush_species if rnd() < 0.75 else rnd_range(1, 3)
		ages[i] = 1
	refresh_population()

func unlocked_tools() -> Array:
	var list: Array = []
	for tool in TOOL_CATALOG:
		if (pilot["tools"] as Array).has(tool["id"]):
			list.append(tool)
	return list

func cycle_tool() -> void:
	var list: Array = unlocked_tools()
	if list.is_empty():
		return
	selected_tool_idx = (selected_tool_idx + 1) % list.size()
	show_banner("🧰 %s (%d⚡) — E to place" % [list[selected_tool_idx]["name"], int(list[selected_tool_idx]["cost"])], Color(0.77, 0.83, 0.96))

func use_tool(id: String) -> void:
	if not tool_by_id.has(id):
		return
	if history_mode:
		show_banner("Exit replay (H) before using tools", Color(1.0, 0.55, 0.6))
		return
	var tool: Dictionary = tool_by_id[id]
	var cost: int = int(tool["cost"])
	if not (pilot["tools"] as Array).has(id):
		var lock_hint: String = "discover it in the wild"
		if tool.has("unlock") and tool["unlock"].has("level"):
			lock_hint = "reach level %d" % int(tool["unlock"]["level"])
		elif tool.has("unlock") and tool["unlock"].has("world"):
			lock_hint = "unlock the %s world" % String(worlds_by_id[tool["unlock"]["world"]]["name"])
		show_banner("%s is locked — %s" % [tool["name"], lock_hint], Color(1.0, 0.55, 0.6))
		return
	if biomass < cost:
		show_banner("Not enough biomass for %s — need %d ⚡" % [tool["name"], cost], Color(1.0, 0.55, 0.6))
		return
	var target: Vector2i = aim_cell()
	if target.x < 0:
		show_banner("Aim at the ground to place " + tool["name"], Color(1.0, 0.55, 0.6))
		return
	var kind: String = String(tool.get("kind", ""))
	if kind == "stasis":
		if stasis_bubbles.size() >= 4:
			show_banner("Too many stasis fields active", Color(1.0, 0.55, 0.6))
			return
		make_stasis_bubble(target)
	elif kind == "rain":
		douse_fires_at(target.x, target.y, 6.0)
		seed_rain_at(target, 6.0, 40)
	elif kind == "monsoon":
		douse_fires_at(target.x, target.y, 13.0)
		seed_rain_at(target, 13.0, 90)
	elif kind == "bigbang":
		douse_fires_at(target.x, target.y, 8.0)
		place_pattern(PULSAR_ROWS, Vector2i(target.x - 6, target.y - 6), brush_species)
		place_pattern(ACORN_ROWS, Vector2i(target.x - 12, target.y - 12), 1 + (brush_species % 3))
		place_pattern(GLIDER_ROWS, Vector2i(target.x + 6, target.y + 2), brush_species)
		place_pattern(GLIDER_ROWS, Vector2i(target.x + 2, target.y + 8), 1 + ((brush_species + 1) % 3))
		seed_rain_at(target, 8.0, 30)
	elif tool.has("rows"):
		var origin: Vector2i = target
		if tool.has("centered"):
			origin = Vector2i(target.x - 6, target.y - 6)
		place_pattern(tool["rows"], origin, brush_species)
	biomass -= cost
	tools_used[id] = true
	show_banner("%s placed  (-%d ⚡)" % [tool["name"], cost], Color(0.65, 1.0, 0.85))

func make_stasis_bubble(target: Vector2i) -> void:
	var pos: Vector3 = Vector3((float(target.x) - float(GRID - 1) * 0.5) * SPACING, 2.5, (float(target.y) - float(GRID - 1) * 0.5) * SPACING)
	var sphere: SphereMesh = SphereMesh.new()
	sphere.radius = float(STASIS_RADIUS) * SPACING
	sphere.height = float(STASIS_RADIUS) * SPACING * 2.0
	sphere.radial_segments = 28
	sphere.rings = 14
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(0.3, 0.9, 1.0, 0.15)
	sphere.material = mat
	var node: MeshInstance3D = MeshInstance3D.new()
	node.mesh = sphere
	node.position = pos
	add_child(node)
	stasis_bubbles.append({"x": target.x, "z": target.y, "gens": STASIS_GENS, "node": node})
	douse_fires_at(target.x, target.y, float(STASIS_RADIUS))

func in_stasis(x: int, z: int) -> bool:
	for bubble in stasis_bubbles:
		var dx: float = float(x) - float(bubble["x"])
		var dz: float = float(z) - float(bubble["z"])
		if dx * dx + dz * dz <= float(STASIS_RADIUS * STASIS_RADIUS):
			return true
	return false

func update_stasis() -> void:
	for b in range(stasis_bubbles.size() - 1, -1, -1):
		stasis_bubbles[b]["gens"] = int(stasis_bubbles[b]["gens"]) - 1
		if int(stasis_bubbles[b]["gens"]) <= 0:
			var node: MeshInstance3D = stasis_bubbles[b].get("node") as MeshInstance3D
			if node != null and is_instance_valid(node):
				node.queue_free()
			stasis_bubbles.remove_at(b)

func spawn_orbs(cx: int, cz: int, count: int) -> void:
	for k in range(count):
		var angle: float = rng.randf_range(0.0, TAU)
		var dist: float = rng.randf_range(1.0, float(EXPLOSION_RADIUS))
		var wx: float = (float(cx) + cos(angle) * dist - float(GRID - 1) * 0.5) * SPACING
		var wz: float = (float(cz) + sin(angle) * dist - float(GRID - 1) * 0.5) * SPACING
		var mesh: SphereMesh = SphereMesh.new()
		mesh.radius = 0.30
		mesh.height = 0.60
		mesh.radial_segments = 16
		mesh.rings = 8
		var mat: StandardMaterial3D = StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.albedo_color = Color(1.0, 0.82, 0.25)
		mesh.material = mat
		var node: MeshInstance3D = MeshInstance3D.new()
		node.mesh = mesh
		node.position = Vector3(wx, 2.2, wz)
		add_child(node)
		orbs.append({"node": node, "ttl": ORB_TTL, "value": orb_value(), "base": Vector3(wx, 2.2, wz), "phase": rng.randf_range(0.0, TAU)})

func update_orbs(delta: float) -> void:
	for o in range(orbs.size() - 1, -1, -1):
		var orb: Dictionary = orbs[o]
		orb["ttl"] = float(orb["ttl"]) - delta
		var node: MeshInstance3D = orb["node"] as MeshInstance3D
		var base: Vector3 = orb["base"]
		var valid_node: bool = node != null and is_instance_valid(node)
		if valid_node:
			node.position = base + Vector3(0.0, sin(float(orb["phase"]) + Time.get_ticks_msec() * 0.002) * 0.35, 0.0)
			var remaining: float = float(orb["ttl"])
			if remaining < 4.0:
				var s: float = clampf(0.30 * remaining / 4.0, 0.10, 0.30)
				node.scale = Vector3(s / 0.30, s / 0.30, s / 0.30)
		var collected: bool = camera.global_position.distance_to(base) < collect_radius()
		if not collected:
			for h in harvesters:
				var hnode: MeshInstance3D = h["node"] as MeshInstance3D
				if hnode != null and is_instance_valid(hnode) and hnode.global_position.distance_to(base) < HARVESTER_RADIUS:
					collected = true
					break
		if collected:
			biomass += int(orb["value"])
			biomass_collected_total += int(orb["value"])
			add_xp(ceili(float(orb["value"]) / 5.0))
			show_banner("+%d ⚡ biomass" % int(orb["value"]), Color(1.0, 0.85, 0.3))
			if valid_node:
				node.queue_free()
			orbs.remove_at(o)
			continue
		if float(orb["ttl"]) <= 0.0:
			if valid_node:
				node.queue_free()
			orbs.remove_at(o)

func show_banner(text: String, color: Color = Color(0.65, 1.0, 0.85)) -> void:
	toast_label.text = text
	toast_label.add_theme_color_override("font_color", color)
	toast_label.visible = true
	toast_ttl = 2.2

func check_contract() -> void:
	if contract_index >= CONTRACTS.size():
		return
	var contract: Dictionary = CONTRACTS[contract_index]
	if not contract_done(contract):
		return
	biomass += int(contract["reward"])
	add_xp(30)
	contract_index += 1
	show_banner("✔ CONTRACT COMPLETE: %s  (+%d ⚡)" % [contract["text"], int(contract["reward"])], Color(1.0, 0.85, 0.3))
	print("EVOLUTION: contract complete: ", contract["id"], " at generation ", generations)
	if contract_index >= CONTRACTS.size():
		show_banner("🏆 MASTER GARDENER — the terrain is yours. Sandbox continues.", Color(1.0, 0.85, 0.3))

func contract_done(contract: Dictionary) -> bool:
	var id: String = contract["id"]
	var target: float = float(contract["target"])
	match id:
		"collect":
			return float(biomass_collected_total) >= target
		"paint":
			return float(painted_cells) >= target
		"explode":
			return float(explosions_total) >= target
		"balance":
			var ok: int = 0
			for c in species_counts():
				if c >= 40:
					ok += 1
			return float(ok) >= target
		"tools":
			return float(tools_used.size()) >= target
		"journal":
			return float(discoveries.size()) >= target
		"pop":
			return float(max_population) >= target
		"gen300":
			return float(generations) >= target
		"master":
			var parts: int = 0
			if generations >= 600:
				parts += 1
			if max_population >= 300:
				parts += 1
			if biomass_collected_total >= 100:
				parts += 1
			return float(parts) >= target
	return false

func species_counts() -> Array:
	var counts: Array = [0, 0, 0]
	for i in range(TOTAL):
		if cells[i] != 0:
			counts[int(cells[i]) - 1] += 1
	return counts

# ── Field journal helpers ──
func rows_to_points(rows: Array) -> Array:
	var pts: Array = []
	for r in range(rows.size()):
		var row: String = rows[r]
		for c in range(row.length()):
			if row[c] != ".":
				pts.append(Vector2i(c, r))
	return pts

func points_signature(pts: Array) -> String:
	var min_x: int = GRID
	var min_z: int = GRID
	for p in pts:
		min_x = mini(min_x, p.x)
		min_z = mini(min_z, p.y)
	var normalized: Array = []
	for p in pts:
		normalized.append(Vector2i(p.x - min_x, p.y - min_z))
	normalized.sort_custom(func(a, b): return a.y < b.y or (a.y == b.y and a.x < b.x))
	var parts: PackedStringArray = PackedStringArray()
	for p in normalized:
		parts.append("%d,%d" % [p.x, p.y])
	return "/".join(parts)

func rotate_rows(rows: Array) -> Array:
	var r_count: int = rows.size()
	var c_count: int = 0
	for row in rows:
		c_count = maxi(c_count, String(row).length())
	var out: Array = []
	for c in range(c_count):
		var line: String = ""
		for r in range(r_count):
			line += String(rows[r_count - 1 - r]).rpad(c_count, ".")[c]
		out.append(line)
	return out

func mirror_rows(rows: Array) -> Array:
	var out: Array = []
	var width: int = 0
	for row in rows:
		width = maxi(width, String(row).length())
	for row in rows:
		var line: String = ""
		var padded: String = String(row).rpad(width, ".")
		for c in range(width - 1, -1, -1):
			line += padded[c]
		out.append(line)
	return out

func build_journal_sigs() -> void:
	for pattern in JOURNAL_PATTERNS:
		var variants: Array = [pattern["rows"]]
		for k in range(3):
			variants.append(rotate_rows(variants[variants.size() - 1]))
		variants.append(mirror_rows(pattern["rows"]))
		for k in range(3):
			variants.append(rotate_rows(variants[variants.size() - 1]))
		var seen: Dictionary = {}
		for v in variants:
			var key: String = "/".join(v)
			if seen.has(key):
				continue
			seen[key] = true
			var sig: String = points_signature(rows_to_points(v))
			if not journal_sigs.has(sig):
				journal_sigs[sig] = pattern["name"]

func component_signature(component: Array) -> String:
	var min_x: int = GRID
	var min_z: int = GRID
	for idx in component:
		min_x = mini(min_x, idx % GRID)
		min_z = mini(min_z, idx / GRID)
	var normalized: Array = []
	for idx in component:
		normalized.append(Vector2i(idx % GRID - min_x, idx / GRID - min_z))
	normalized.sort_custom(func(a, b): return a.y < b.y or (a.y == b.y and a.x < b.x))
	var parts: PackedStringArray = PackedStringArray()
	for p in normalized:
		parts.append("%d,%d" % [p.x, p.y])
	return "/".join(parts)

func refresh_journal() -> void:
	if journal_label == null:
		return
	journal_label.text = journal_text()

func journal_text() -> String:
	var t: String = "🔬 FIELD JOURNAL  %d/%d\n\n" % [discoveries.size(), JOURNAL_PATTERNS.size()]
	for pattern in JOURNAL_PATTERNS:
		var pname: String = pattern["name"]
		if discoveries.has(pname):
			t += "✔ " + pname + "  —  " + String(pattern["desc"]) + "\n"
		else:
			t += "·  ???\n"
	return t

# ── Ecosystem save/share (EVO1 run-length codes) ──
func encode_ecosystem() -> String:
	var rows: Array = []
	for z in range(GRID):
		var s: String = ""
		var run: int = 0
		var val: int = -1
		for x in range(GRID):
			var v: int = int(cells[index_of(x, z)])
			if v == val:
				run += 1
			else:
				if val >= 0:
					s += ".abc"[val] + str(run)
				val = v
				run = 1
		s += ".abc"[val] + str(run)
		rows.append(s)
	return "EVO1;%d;%s" % [GRID, "/".join(rows)]

func decode_ecosystem(code: String) -> bool:
	var parts: PackedStringArray = code.strip_edges().split(";", false)
	if parts.size() != 3 or parts[0] != "EVO1":
		return false
	var n_grid: int = int(parts[1])
	if n_grid < 8 or n_grid > GRID:
		return false
	var rows: PackedStringArray = parts[2].split("/", false)
	if rows.size() != n_grid:
		return false
	var src: PackedByteArray = PackedByteArray()
	src.resize(n_grid * n_grid)
	for z in range(n_grid):
		var row: String = rows[z]
		var x: int = 0
		var p: int = 0
		while p < row.length():
			var v: int = ".abc".find(row[p])
			if v < 0:
				return false
			p += 1
			var num: String = ""
			while p < row.length() and row[p] >= "0" and row[p] <= "9":
				num += row[p]
				p += 1
			if not num.is_valid_int():
				return false
			var n: int = int(num)
			if n <= 0 or x + n > n_grid:
				return false
			for k in range(n):
				src[z * n_grid + x + k] = v
				x += n
		if x != n_grid:
			return false
	var decoded: PackedByteArray = PackedByteArray()
	decoded.resize(TOTAL)
	if n_grid == GRID:
		decoded = src
	else:
		# legacy smaller world (e.g. 48×48): centre it in the 64×64 field
		var off: int = (GRID - n_grid) / 2
		for z in range(n_grid):
			for x in range(n_grid):
				decoded[index_of(x + off, z + off)] = src[z * n_grid + x]
	cells = decoded
	for i in range(TOTAL):
		ages[i] = 1 if cells[i] != 0 else 0
		history[i] = 0.0
	pattern_snapshots.clear()
	oscillator_tracks.clear()
	explosion_queue.clear()
	for i in range(TOTAL):
		explosion_cooldowns[i] = 0
	refresh_population()
	return true

func contract_hud_text() -> String:
	if contract_index >= CONTRACTS.size():
		return "ALL COMPLETE 🏆"
	var contract: Dictionary = CONTRACTS[contract_index]
	var target: int = int(contract["target"])
	var id: String = contract["id"]
	var progress: String = ""
	match id:
		"collect":
			progress = "%d/%d⚡" % [mini(biomass_collected_total, target), target]
		"paint":
			progress = "%d/%d" % [mini(painted_cells, target), target]
		"explode":
			progress = "%d/%d" % [mini(explosions_total, target), target]
		"balance":
			var ok: int = 0
			for c in species_counts():
				if c >= 40:
					ok += 1
			progress = "%d/3 species" % ok
		"tools":
			progress = "%d/%d" % [mini(tools_used.size(), target), target]
		"journal":
			progress = "%d/%d" % [mini(discoveries.size(), target), target]
		"pop":
			progress = "%d/%d" % [mini(max_population, target), target]
		"gen300":
			progress = "%d/%d" % [mini(generations, target), target]
		"master":
			var parts: int = 0
			if generations >= 600:
				parts += 1
			if max_population >= 300:
				parts += 1
			if biomass_collected_total >= 100:
				parts += 1
			progress = "%d/3 goals" % parts
	return "%d/%d  %s  [%s]  reward %d⚡" % [contract_index + 1, CONTRACTS.size(), contract["text"], progress, int(contract["reward"])]

# ── v5: replay history ──
func toggle_history() -> void:
	if not history_mode and history_frames.size() < 2:
		show_banner("Not enough history yet — let it run", Color(1.0, 0.55, 0.6))
		return
	history_mode = not history_mode
	if history_mode:
		was_running_before_history = running
		running = false
		history_view = history_frames.size() - 1
		show_banner("⏳ REPLAY — , / . to scrub (Shift ×10) — H to return", Color(1.0, 0.85, 0.3))
	else:
		running = was_running_before_history

func scrub_history(delta: int) -> void:
	if not history_mode:
		return
	history_view = clampi(history_view + delta, 0, history_frames.size() - 1)

# ── v5: daily challenge ──
func daily_seed_hash(s: String = Time.get_date_string_from_system()) -> int:
	var h: int = 5381
	for k in range(s.length()):
		h = (h * 33) ^ s.unicode_at(k)
	return h & 0xFFFFFFFF

func start_daily() -> void:
	daily_mode = true
	daily_scored = false
	rng_state = daily_seed_hash()
	active_world = WORLDS[daily_seed_hash() % WORLDS.size()]
	seed_world()
	show_banner("📅 DAILY CHALLENGE %s — %s (%s), score at generation 300" % [Time.get_date_string_from_system(), active_world["name"], active_world["bs"]], Color(1.0, 0.85, 0.3))

func score_daily() -> void:
	daily_scored = true
	add_xp(50)
	var score: int = population * 3 + biomass + discoveries.size() * 25 + explosions_total * 5
	var config: ConfigFile = ConfigFile.new()
	config.load("user://daily.cfg")
	var best: int = int(config.get_value("daily", Time.get_date_string_from_system(), 0))
	if score > best:
		config.set_value("daily", Time.get_date_string_from_system(), score)
		config.save("user://daily.cfg")
	# v7 streak: consecutive days scored → +1 SP every 3 days (same-day reruns don't re-award).
	var today: String = Time.get_date_string_from_system()
	if String(pilot["streak"]["last"]) != today:
		var yesterday: String = Time.get_date_string_from_unix_time(int(Time.get_unix_time_from_system()) - 86400)
		pilot["streak"]["count"] = 1 if String(pilot["streak"]["last"]) != yesterday else int(pilot["streak"]["count"]) + 1
		pilot["streak"]["last"] = today
		if int(pilot["streak"]["count"]) % 3 == 0:
			pilot["sp"] = int(pilot["sp"]) + 1
	if score > int(pilot["rec"]["bestDaily"]):
		pilot["rec"]["bestDaily"] = score
	save_pilot()
	show_banner("🏁 DAILY SCORE: Alive %d · ⚡%d · 🔬%d · 💥%d → %d (best %d) · 🔥 streak %d" % [population, biomass, discoveries.size(), explosions_total, score, maxi(best, score), int(pilot["streak"]["count"])], Color(1.0, 0.85, 0.3))

# ── v5: minimap ──
func build_minimap(canvas: CanvasLayer) -> void:
	minimap = Control.new()
	minimap.position = Vector2(1264.0, 726.0)
	minimap.size = Vector2(146.0, 146.0)
	minimap.draw.connect(_draw_minimap)
	canvas.add_child(minimap)

func _draw_minimap() -> void:
	if minimap == null or camera == null:
		return
	var s: float = 146.0 / float(GRID)
	minimap.draw_rect(Rect2(Vector2.ZERO, minimap.size), Color(0.016, 0.027, 0.07, 0.88))
	var src: PackedByteArray = cells
	if history_mode and history_frames.size() > 0:
		src = history_frames[history_view]["c"]
	var cell_size: Vector2 = Vector2(s, s)
	for z in range(GRID):
		for x in range(GRID):
			var i: int = index_of(x, z)
			var v: int = int(src[i])
			if v != 0:
				minimap.draw_rect(Rect2(Vector2(float(x) * s, float(z) * s), cell_size), PALETTE[v - 1])
			elif history[i] > 0.05:
				minimap.draw_rect(Rect2(Vector2(float(x) * s, float(z) * s), cell_size), Color(0.1, 0.16, 0.28, history[i] * 0.55))
	if not history_mode:
		for i in fires.keys():
			minimap.draw_rect(Rect2(Vector2(float(i % GRID) * s, float(i / GRID) * s), cell_size), Color(1.0, 0.54, 0.16))
	for bubble in stasis_bubbles:
		var c: Vector2 = Vector2((float(bubble["x"]) + 0.5) * s, (float(bubble["z"]) + 0.5) * s)
		minimap.draw_arc(c, float(STASIS_RADIUS) * s, 0.0, TAU, 24, Color(0.3, 0.9, 1.0, 0.7), 1.5)
	var px: float = camera.global_position.x / SPACING + float(GRID - 1) * 0.5 + 0.5
	var pz: float = camera.global_position.z / SPACING + float(GRID - 1) * 0.5 + 0.5
	var p: Vector2 = Vector2(px * s, pz * s)
	var fwd: Vector3 = -camera.global_basis.z
	var dir: Vector2 = Vector2(fwd.x, fwd.z)
	if dir.length() > 0.001:
		dir = dir.normalized()
	minimap.draw_line(p, p + dir * 9.0, Color(1.0, 1.0, 1.0), 1.5)
	minimap.draw_circle(p, 3.0, Color(1.0, 1.0, 1.0))

# ── Pilot progression: persistence, XP, unlocks, genetics ──
func load_pilot() -> void:
	var config: ConfigFile = ConfigFile.new()
	if config.load("user://pilot.cfg") != OK:
		return
	pilot["xp"] = int(config.get_value("pilot", "xp", 0))
	pilot["level"] = maxi(1, int(config.get_value("pilot", "level", 1)))
	pilot["sp"] = int(config.get_value("pilot", "sp", 0))
	pilot["area_brush"] = bool(config.get_value("pilot", "area_brush", false))
	for track in ["vigor", "fertility", "volatility", "magnetism"]:
		pilot["up"][track] = clampi(int(config.get_value("up", track, 0)), 0, 3)
	var saved_tools: Array = config.get_value("tools", "ids", [])
	for id in saved_tools:
		if not (pilot["tools"] as Array).has(id) and tool_by_id.has(id):
			(pilot["tools"] as Array).append(id)
	var saved_worlds: Array = config.get_value("worlds", "ids", [])
	for id in saved_worlds:
		if not (pilot["worlds"] as Array).has(id) and worlds_by_id.has(id):
			(pilot["worlds"] as Array).append(id)
	pilot["rec"] = {
		"biggestBlast": int(config.get_value("rec", "biggest_blast", 0)),
		"tallestTower": int(config.get_value("rec", "tallest_tower", 0)),
		"bestDaily": int(config.get_value("rec", "best_daily", 0)),
		"firesOut": int(config.get_value("rec", "fires_out", 0)),
	}
	var streak_last: String = String(config.get_value("streak", "last", ""))
	if streak_last != "":
		pilot["streak"] = {"last": streak_last, "count": int(config.get_value("streak", "count", 0))}

func save_pilot() -> void:
	var config: ConfigFile = ConfigFile.new()
	config.set_value("pilot", "xp", pilot["xp"])
	config.set_value("pilot", "level", pilot["level"])
	config.set_value("pilot", "sp", pilot["sp"])
	config.set_value("pilot", "area_brush", pilot["area_brush"])
	for track in ["vigor", "fertility", "volatility", "magnetism"]:
		config.set_value("up", track, pilot["up"][track])
	config.set_value("tools", "ids", pilot["tools"])
	config.set_value("worlds", "ids", pilot["worlds"])
	config.set_value("rec", "biggest_blast", pilot["rec"]["biggestBlast"])
	config.set_value("rec", "tallest_tower", pilot["rec"]["tallestTower"])
	config.set_value("rec", "best_daily", pilot["rec"]["bestDaily"])
	config.set_value("rec", "fires_out", pilot["rec"]["firesOut"])
	config.set_value("streak", "last", pilot["streak"]["last"])
	config.set_value("streak", "count", pilot["streak"]["count"])
	config.save("user://pilot.cfg")

func xp_for_next() -> int:
	return 50 + (int(pilot["level"]) - 1) * 25

func add_xp(n: int) -> void:
	if aurora_ttl > 0.0:
		n *= 2
	pilot["xp"] = int(pilot["xp"]) + n
	var leveled: bool = false
	while int(pilot["xp"]) >= xp_for_next():
		pilot["xp"] = int(pilot["xp"]) - xp_for_next()
		pilot["level"] = int(pilot["level"]) + 1
		pilot["sp"] = int(pilot["sp"]) + 1
		leveled = true
		check_level_unlocks()
	if leveled:
		show_banner("⬆️ PILOT LEVEL %d — +1 skill point (U to spend)" % int(pilot["level"]), Color(1.0, 0.85, 0.3))
		refresh_upgrade_label()
	save_pilot()

func check_level_unlocks() -> void:
	for tool in TOOL_CATALOG:
		var tool_id: String = tool["id"]
		if tool.has("unlock") and tool["unlock"].has("level") and int(tool["unlock"]["level"]) == int(pilot["level"]) and not (pilot["tools"] as Array).has(tool_id):
			(pilot["tools"] as Array).append(tool_id)
			show_banner("🔓 New seed unlocked: %s (%d⚡) — Q/E to select" % [tool["name"], int(tool["cost"])], Color(1.0, 0.85, 0.3))
	for w in WORLDS:
		if w.has("unlock") and int(w["unlock"]["level"]) == int(pilot["level"]) and not (pilot["worlds"] as Array).has(w["id"]):
			(pilot["worlds"] as Array).append(w["id"])
			show_banner("🌍 New world unlocked: %s — %s (press 0)" % [w["name"], w["desc"]], Color(1.0, 0.85, 0.3))
			if String(w["id"]) == "highlife" and not (pilot["tools"] as Array).has("replicator"):
				(pilot["tools"] as Array).append("replicator")
				show_banner("🔓 New seed unlocked: Replicator — it copies itself!", Color(1.0, 0.85, 0.3))
	if int(pilot["level"]) >= 7 and not pilot["area_brush"]:
		pilot["area_brush"] = true
		show_banner("🔓 Area Brush unlocked — F stamps 3×3 meadows", Color(1.0, 0.85, 0.3))

func check_discover_unlock(pname: String) -> void:
	for tool in TOOL_CATALOG:
		if tool.has("unlock") and tool["unlock"].has("discover") and String(tool["unlock"]["discover"]) == pname and not (pilot["tools"] as Array).has(tool["id"]):
			(pilot["tools"] as Array).append(tool["id"])
			show_banner("🔓 New seed unlocked: %s — discovered in the wild!" % tool["name"], Color(1.0, 0.85, 0.3))
			save_pilot()

func tower_lifespan() -> int:
	return int(active_world.get("tower", TOWER_LIFESPAN)) + 7 * int(pilot["up"]["vigor"])

func memory_gain() -> float:
	return 0.065 * (1.0 + 0.5 * float(pilot["up"]["fertility"])) * (2.0 if pollen_gens > 0 else 1.0)

func orb_count() -> int:
	return 3 + int(pilot["up"]["volatility"])

func orb_value() -> int:
	return ORB_VALUE + int(pilot["up"]["magnetism"])

func collect_radius() -> float:
	return 2.6 + 0.8 * float(pilot["up"]["magnetism"])

func refresh_upgrade_label() -> void:
	if upgrade_label == null:
		return
	var t: String = "🧬 GENETICS LAB — %s  ·  SP %d\n\n" % [rank_title(), int(pilot["sp"])]
	t += "1 Vigor      [%s]  tower lifespan %d (this world)\n" % [pips("vigor"), tower_lifespan()]
	t += "2 Fertility  [%s]  memory gain +%.0f%%\n" % [pips("fertility"), 50.0 * float(pilot["up"]["fertility"])]
	t += "3 Volatility [%s]  %d orbs per blast\n" % [pips("volatility"), orb_count()]
	t += "4 Magnetism  [%s]  orbs %d⚡, radius %.1f\n\n" % [pips("magnetism"), orb_value(), collect_radius()]
	t += "U close  ·  1-4 spend"
	t += "\n\n🏆 Records — blast %d · tower %d · daily %d · doused %d · streak %d🔥" % [int(pilot["rec"]["biggestBlast"]), int(pilot["rec"]["tallestTower"]), int(pilot["rec"]["bestDaily"]), int(pilot["rec"]["firesOut"]), int(pilot["streak"]["count"])]
	upgrade_label.text = t

func pips(track: String) -> String:
	var lvl: int = int(pilot["up"][track])
	var s: String = ""
	for k in range(3):
		s += "●" if k < lvl else "○"
	return s

func buy_upgrade(track: String) -> void:
	if int(pilot["sp"]) < 1 or int(pilot["up"][track]) >= 3:
		return
	pilot["sp"] = int(pilot["sp"]) - 1
	pilot["up"][track] = int(pilot["up"][track]) + 1
	show_banner("🧬 %s upgraded to %d" % [track.capitalize(), int(pilot["up"][track])], Color(0.65, 1.0, 0.85))
	save_pilot()
	refresh_upgrade_label()

func place_harvester() -> void:
	if history_mode:
		show_banner("Exit replay (H) first", Color(1.0, 0.55, 0.6))
		return
	if biomass < HARVESTER_COST:
		show_banner("Auto-harvester costs %d ⚡" % HARVESTER_COST, Color(1.0, 0.55, 0.6))
		return
	if harvesters.size() >= HARVESTER_MAX:
		show_banner("Max %d harvesters" % HARVESTER_MAX, Color(1.0, 0.55, 0.6))
		return
	var target: Vector2i = aim_cell()
	if target.x < 0:
		show_banner("Aim at the ground to place the harvester", Color(1.0, 0.55, 0.6))
		return
	var pos: Vector3 = Vector3((float(target.x) - float(GRID - 1) * 0.5) * SPACING, 5.0, (float(target.y) - float(GRID - 1) * 0.5) * SPACING)
	var cyl: CylinderMesh = CylinderMesh.new()
	cyl.top_radius = 1.5
	cyl.bottom_radius = 1.5
	cyl.height = 0.25
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.33, 1.0, 0.69)
	cyl.material = mat
	var node: MeshInstance3D = MeshInstance3D.new()
	node.mesh = cyl
	node.position = pos
	add_child(node)
	harvesters.append({"node": node, "phase": rng.randf_range(0.0, TAU)})
	biomass -= HARVESTER_COST
	show_banner("🎣 Auto-harvester deployed (-%d ⚡)" % HARVESTER_COST, Color(0.65, 1.0, 0.85))

# ── v7 Wildlands: weather events, wildfire, ecology helpers ──
func rank_title() -> String:
	var l: int = int(pilot["level"])
	if l >= 12:
		return "Worldshaper"
	if l >= 9:
		return "Master Gardener"
	if l >= 7:
		return "Landscape Architect"
	if l >= 5:
		return "Groundskeeper"
	if l >= 3:
		return "Seed Sower"
	return "Sprout Tender"

func trigger_random_event() -> void:
	var roll: float = rnd()
	if roll < 0.30:
		trigger_meteor()
	elif roll < 0.60:
		trigger_wildfire()
	elif roll < 0.80:
		aurora_ttl = 60000.0
		show_banner("🌌 AURORA — double XP for 60 seconds!", Color(0.55, 0.95, 0.75))
	else:
		pollen_gens = 60
		show_banner("🌸 POLLEN BLOOM — terrain memory surges for 60 generations", Color(0.65, 1.0, 0.85))
	event_countdown = 90 + rnd_range(0, 70)

func trigger_meteor() -> void:
	var cx: int = 4 + rnd_range(0, GRID - 9)
	var cz: int = 4 + rnd_range(0, GRID - 9)
	var to: Vector3 = Vector3((float(cx) - float(GRID - 1) * 0.5) * SPACING, 1.0, (float(cz) - float(GRID - 1) * 0.5) * SPACING)
	var from: Vector3 = Vector3(to.x + 34.0, 70.0, to.z - 28.0)
	var sphere := SphereMesh.new()
	sphere.radius = 0.9
	sphere.height = 1.8
	sphere.radial_segments = 16
	sphere.rings = 8
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.63, 0.24)
	sphere.material = mat
	var node := MeshInstance3D.new()
	node.mesh = sphere
	node.position = from
	add_child(node)
	meteor = {"node": node, "from": from, "to": to, "t": 0.0, "dur": 1.5, "cx": cx, "cz": cz}
	show_banner("☄️ METEOR INBOUND — impact imminent!", Color(1.0, 0.85, 0.3))

func update_meteor(delta: float) -> void:
	if meteor.is_empty():
		return
	meteor["t"] = float(meteor["t"]) + delta
	var p: float = minf(1.0, float(meteor["t"]) / float(meteor["dur"]))
	var node: MeshInstance3D = meteor["node"] as MeshInstance3D
	if node != null and is_instance_valid(node):
		node.position = (meteor["from"] as Vector3).lerp(meteor["to"] as Vector3, p * p)
		if rng.randf() < 0.35:
			_spawn_burst(node.position, Color(1.0, 0.6, 0.2), 3)
	if p >= 1.0:
		var cx: int = int(meteor["cx"])
		var cz: int = int(meteor["cz"])
		if node != null and is_instance_valid(node):
			node.queue_free()
		meteor = {}
		detonate(Vector2i(cx, cz), 5, 10, 16)
		shake = 1.25
		add_xp(4)
		show_banner("☄️ METEOR IMPACT — big crater, fresh debris, 10 orbs!", Color(1.0, 0.85, 0.3))

func trigger_wildfire() -> void:
	var cands: Array = []
	for i in range(TOTAL):
		if fires.has(i):
			continue
		if cells[i] != 0 and ages[i] >= tower_lifespan() * 0.5:
			cands.append(i)
		elif cells[i] == 0 and history[i] > 1.2:
			cands.append(i)
	if cands.is_empty():
		pollen_gens = 60
		show_banner("🌸 POLLEN BLOOM — terrain memory surges for 60 generations", Color(0.65, 1.0, 0.85))
		return
	var n: int = mini(3, 1 + rnd_range(0, 2))
	for k in range(n):
		var i: int = cands[rnd_range(0, cands.size() - 1)]
		if not in_stasis(i % GRID, i / GRID):
			fires[i] = true
	show_banner("🔥 WILDFIRE — it spreads through old growth! Douse: rain tools or stasis", Color(1.0, 0.55, 0.6))

func spread_fire() -> void:
	var next: Dictionary = {}
	for i in fires.keys():
		var x: int = i % GRID
		var z: int = i / GRID
		if cells[i] != 0:
			cells[i] = 0
			ages[i] = 0
			warning_timers[i] = 0
		history[i] = maxf(0.0, history[i] - 0.35)
		for dz in range(-1, 2):
			for dx in range(-1, 2):
				if dx == 0 and dz == 0:
					continue
				var nx: int = x + dx
				var nz: int = z + dz
				if nx < 0 or nx >= GRID or nz < 0 or nz >= GRID:
					continue
				var j: int = index_of(nx, nz)
				if fires.has(j) or next.has(j) or in_stasis(nx, nz):
					continue
				if cells[j] != 0 and rnd() < 0.65:
					next[j] = true
				elif cells[j] == 0 and history[j] > 1.2 and rnd() < 0.3:
					next[j] = true
	fires = next

func douse_fires_at(cx: int, cz: int, radius: float) -> int:
	if fires.is_empty():
		return 0
	var doused: int = 0
	for i in fires.keys():
		var dx: float = float(i % GRID) - float(cx)
		var dz: float = float(i / GRID) - float(cz)
		if dx * dx + dz * dz <= radius * radius:
			fires.erase(i)
			doused += 1
	if doused > 0:
		fires_out += doused
		pilot["rec"]["firesOut"] = int(pilot["rec"]["firesOut"]) + doused
		add_xp(2 * doused)
		save_pilot()
		show_banner("💧 Doused %d fire%s (+%d XP)" % [doused, "s" if doused > 1 else "", 2 * doused], Color(0.65, 1.0, 0.85))
	return doused
