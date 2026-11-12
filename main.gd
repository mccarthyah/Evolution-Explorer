extends Node3D
## EVOLUTION: Living Terrain — Conway B3/S23 on a 2D grid, rendered in 3D.
## No addons, external assets, or individual nodes per cell required.

const GRID: int = 48
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
const TOOLS: Dictionary = {
	KEY_4: {"name": "R-pentomino", "cost": 5},
	KEY_5: {"name": "Glider", "cost": 10},
	KEY_6: {"name": "Pulsar", "cost": 25},
	KEY_7: {"name": "Seed Rain", "cost": 20},
	KEY_8: {"name": "Stasis Field", "cost": 15},
	KEY_9: {"name": "Glider Gun", "cost": 60},
}
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
	ages.resize(TOTAL)
	history.resize(TOTAL)
	heights.resize(TOTAL)
	explosion_cooldowns.resize(TOTAL)
	warning_timers.resize(TOTAL)
	build_world()
	seed_world()
	biomass = STARTING_BIOMASS
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func build_world() -> void:
	var box: BoxMesh = BoxMesh.new()
	box.size = Vector3(0.91, 1.0, 0.91)
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
	add_child(floor_mesh)

	var light: DirectionalLight3D = DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-58.0, -35.0, 0.0)
	light.light_energy = 0.95
	add_child(light)
	var world: WorldEnvironment = WorldEnvironment.new()
	var env: Environment = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.009, 0.014, 0.034)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.25, 0.33, 0.52)
	env.ambient_light_energy = 0.7
	world.environment = env
	add_child(world)

	camera = Camera3D.new()
	camera.current = true
	camera.fov = 78.0
	camera.far = 650.0
	camera.position = Vector3(0.0, 16.0, 40.0)
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
	hint.text = "WASD fly  |  Arrow keys look  |  Space/Ctrl rise/fall  |  Shift boost\nV overview  |  P pause  |  N step  |  R randomize  |  C clear  |  Esc quit\n[ / ] speed  |  - / = height  |  M memory  |  1/2/3 species  |  F/G place/erase cell\nSeed tools (aim at ground): 4 R-pento 5⚡  5 Glider 10⚡  6 Pulsar 25⚡  7 Rain 20⚡\n8 Stasis 15⚡  9 Glider Gun 60⚡  —  harvest gold orbs at blast sites for ⚡"
	canvas.add_child(hint)
	hint.text += "\nInstability: towers 40 gen | oscillators 12 cycles | blast radius 4 | chain reactions ON"
	toast_label = Label.new()
	toast_label.position = Vector2(420.0, 92.0)
	toast_label.add_theme_font_size_override("font_size", 19)
	toast_label.add_theme_color_override("font_color", Color(0.65, 1.0, 0.85))
	toast_label.visible = false
	canvas.add_child(toast_label)

func index_of(x: int, z: int) -> int:
	return z * GRID + x

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
	for k in range(17):
		var cx: int = rng.randi_range(6, GRID - 7)
		var cz: int = rng.randi_range(6, GRID - 7)
		var radius: int = rng.randi_range(4, 9)
		var species: int = rng.randi_range(1, 3)
		for z in range(maxi(0, cz - radius), mini(GRID, cz + radius + 1)):
			for x in range(maxi(0, cx - radius), mini(GRID, cx + radius + 1)):
				if Vector2(x - cx, z - cz).length() < float(radius) and rng.randf() < 0.37:
					cells[index_of(x, z)] = species
	generations = 0
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
			if living != 0 and (neighbours == 2 or neighbours == 3):
				next_cells[i] = living
			elif living == 0 and neighbours == 3:
				var winner: int = 0
				for s in range(1, 3):
					if votes[s] > votes[winner]:
						winner = s
				next_cells[i] = winner + 1
			else:
				next_cells[i] = 0
	for i in range(TOTAL):
		var old: int = int(cells[i])
		var current: int = int(next_cells[i])
		cells[i] = current
		var frozen: bool = in_stasis(i % GRID, i / GRID)
		if current != 0:
			if old != 0:
				ages[i] = ages[i] if frozen else mini(MAX_AGE, ages[i] + 1)
			else:
				ages[i] = 1
			if not frozen:
				history[i] = minf(HISTORY_LIMIT, history[i] + 0.065)
		else:
			ages[i] = 0
			if not frozen:
				history[i] = maxf(0.0, history[i] - 0.012)
	generations += 1
	update_instability()
	update_stasis()
	refresh_population()
	check_contract()

# Detect short-period oscillators as stationary, bounded connected structures.
# The signature includes the absolute footprint, so moving gliders are not
# mistaken for oscillators. Period-one still lifes are handled by tower aging.
func update_instability() -> void:
	for i in range(TOTAL):
		if explosion_cooldowns[i] > 0:
			explosion_cooldowns[i] -= 1
		if cells[i] != 0 and ages[i] >= TOWER_LIFESPAN and explosion_cooldowns[i] == 0 and not in_stasis(i % GRID, i / GRID):
			explosion_queue.append(Vector2i(i % GRID, i / GRID))
			# Prevent the same cell being queued repeatedly while waiting.
			explosion_cooldowns[i] = EXPLOSION_COOLDOWN
		if cells[i] != 0 and ages[i] >= TOWER_LIFESPAN - 8:
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

func detonate(center: Vector2i) -> void:
	var source: int = index_of(center.x, center.y)
	var species: int = int(cells[source])
	if species == 0:
		species = rng.randi_range(1, 3)
	var destroyed: int = 0
	for z in range(maxi(0, center.y - EXPLOSION_RADIUS), mini(GRID, center.y + EXPLOSION_RADIUS + 1)):
		for x in range(maxi(0, center.x - EXPLOSION_RADIUS), mini(GRID, center.x + EXPLOSION_RADIUS + 1)):
			var dist: float = Vector2(x - center.x, z - center.y).length()
			if dist > float(EXPLOSION_RADIUS):
				continue
			var i: int = index_of(x, z)
			if cells[i] != 0:
				destroyed += 1
				# Chain reactions: near-expired towers may detonate next generation.
				if ages[i] >= TOWER_LIFESPAN - 6 and i != source and explosion_cooldowns[i] == 0 and not in_stasis(x, z):
					explosion_queue.append(Vector2i(x, z))
			cells[i] = 0
			ages[i] = 0
			warning_timers[i] = 0
			history[i] = maxf(history[i], 0.45)
			explosion_cooldowns[i] = EXPLOSION_COOLDOWN
	# Scatter viable fragments outside the cleared crater.
	# Small clusters and gliders seed new activity rather than dying instantly.
	var glider: Array[Vector2i] = [Vector2i(1, 0), Vector2i(2, 1), Vector2i(0, 2), Vector2i(1, 2), Vector2i(2, 2)]
	for seed in range(MAX_DEBRIS_SEEDS):
		var angle: float = rng.randf_range(0.0, TAU)
		var distance: float = rng.randf_range(float(EXPLOSION_RADIUS) + 1.0, float(EXPLOSION_RADIUS) * 2.5)
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
			cells[i] = species if rng.randf() < 0.7 else rng.randi_range(1, 3)
			ages[i] = 1
			explosion_cooldowns[i] = EXPLOSION_COOLDOWN
	var blast_pos := Vector3((float(center.x) - float(GRID - 1) * 0.5) * SPACING, 3.0, (float(center.y) - float(GRID - 1) * 0.5) * SPACING)
	var blast_node := _make_blast_node(blast_pos)
	blasts.append({"x": center.x, "z": center.y, "ttl": 0.65, "node": blast_node})
	_spawn_burst(blast_pos, Color(1.0, 0.55, 0.15), 26)
	spawn_orbs(center.x, center.y, 3)
	shake = clampf(16.0 / (1.0 + blast_pos.distance_to(camera.global_position) * 0.14), 0.15, 1.1)
	explosions_total += 1
	last_explosion = "(%d,%d) cleared %d" % [center.x, center.y, destroyed]
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
	get_tree().create_timer(1.2).timeout.connect(func() -> void: if is_instance_valid(p): p.queue_free())

func _process(delta: float) -> void:
	if running:
		accumulated += delta
		var steps: int = 0
		while accumulated >= generation_interval and steps < 4:
			step_simulation()
			accumulated -= generation_interval
			steps += 1
		if steps == 4:
			accumulated = 0.0
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
	if toast_ttl > 0.0:
		toast_ttl -= delta
		if toast_ttl <= 0.0:
			toast_label.visible = false
	for b in range(blasts.size() - 1, -1, -1):
		blasts[b]["ttl"] = float(blasts[b]["ttl"]) - delta
		if float(blasts[b]["ttl"]) <= 0.0:
			blasts.remove_at(b)
	var mode: String = "OVERVIEW" if overview else "FLIGHT"
	hud.text = "EVOLUTION  /  LIVING TERRAIN\nGeneration %d     Alive %d     %s\n%s   |   %.1f gen/sec   |   Height %.1fx   |   Memory %s   |   Brush %d" % [generations, population, mode, "RUNNING" if running else "PAUSED", 1.0 / generation_interval, height_scale, "ON" if memory_enabled else "OFF", brush_species]
	hud.text += "\nExplosions %d  |  Last %s" % [explosions_total, last_explosion]
	hud.text += "\n⚡ Biomass %d   |   Contract %s" % [biomass, contract_hud_text()]

func update_visuals(delta: float) -> void:
	for z in range(GRID):
		for x in range(GRID):
			var i: int = index_of(x, z)
			var living: int = int(cells[i])
			var age_factor: float = float(ages[i]) / float(MAX_AGE)
			var terrain_memory: float = history[i] if memory_enabled else 0.0
			var target: float = (1.4 + 12.0 * sqrt(age_factor) + 11.0 * terrain_memory) * height_scale if living != 0 else (8.0 * terrain_memory * height_scale)
			heights[i] = lerpf(heights[i], target, minf(1.0, delta * 5.5))
			var h: float = maxf(0.025, heights[i])
			var pos: Vector3 = Vector3((float(x) - float(GRID - 1) * 0.5) * SPACING, h * 0.5, (float(z) - float(GRID - 1) * 0.5) * SPACING)
			multimesh.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(1.0, h, 1.0)), pos))
			var tint: Color
			if living > 0:
				tint = PALETTE[living - 1].lerp(Color(1.0, 0.52, 0.26), age_factor * 0.55)
				if ages[i] >= TOWER_LIFESPAN - 8:
					tint = tint.lerp(Color(1.0, 0.16, 0.04), 0.65 + 0.35 * sin(float(generations) * 2.0))
			else:
				tint = Color(0.06, 0.14, 0.26).lerp(Color(0.19, 0.26, 0.42), terrain_memory)
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
		match event.keycode:
			KEY_ESCAPE, KEY_F10:
				get_tree().quit()
			KEY_P:
				running = not running
			KEY_N:
				if not running: step_simulation()
			KEY_R:
				seed_world()
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
				for i in range(TOTAL):
					explosion_cooldowns[i] = 0
			KEY_M:
				memory_enabled = not memory_enabled
			KEY_V:
				overview = not overview
				if overview:
					camera.position = Vector3(0.0, 85.0, 60.0)
					camera.rotation = Vector3(-0.95, 0.0, 0.0)
				else:
					camera.position = Vector3(0.0, 16.0, 32.0)
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
				use_tool(event.keycode)
			KEY_F, KEY_G:
				paint_at_cursor(get_viewport().get_visible_rect().size * 0.5, event.keycode == KEY_F)

func paint_at_cursor(screen_pos: Vector2, alive: bool) -> void:
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
	if alive:
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

func use_tool(keycode: int) -> void:
	var tool: Dictionary = TOOLS[keycode]
	var cost: int = int(tool["cost"])
	if biomass < cost:
		show_banner("Not enough biomass for %s — need %d ⚡" % [tool["name"], cost], Color(1.0, 0.55, 0.6))
		return
	var target: Vector2i = aim_cell()
	if target.x < 0:
		show_banner("Aim at the ground to place " + tool["name"], Color(1.0, 0.55, 0.6))
		return
	match keycode:
		KEY_4:
			place_pattern(R_PENTOMINO_ROWS, target, brush_species)
		KEY_5:
			place_pattern(GLIDER_ROWS, target, brush_species)
		KEY_6:
			place_pattern(PULSAR_ROWS, Vector2i(target.x - 6, target.y - 6), brush_species)
		KEY_7:
			for k in range(40):
				var angle: float = rng.randf_range(0.0, TAU)
				var dist: float = rng.randf_range(0.0, 6.0)
				var x: int = clampi(target.x + roundi(cos(angle) * dist), 0, GRID - 1)
				var z: int = clampi(target.y + roundi(sin(angle) * dist), 0, GRID - 1)
				var i: int = index_of(x, z)
				cells[i] = brush_species if rng.randf() < 0.75 else rng.randi_range(1, 3)
				ages[i] = 1
			refresh_population()
		KEY_8:
			if stasis_bubbles.size() >= 4:
				show_banner("Too many stasis fields active", Color(1.0, 0.55, 0.6))
				return
			make_stasis_bubble(target)
		KEY_9:
			place_pattern(GUN_ROWS, target, brush_species)
	biomass -= cost
	tools_used[keycode] = true
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
		orbs.append({"node": node, "ttl": ORB_TTL, "value": ORB_VALUE, "base": Vector3(wx, 2.2, wz), "phase": rng.randf_range(0.0, TAU)})

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
		if camera.global_position.distance_to(base) < 2.6:
			biomass += int(orb["value"])
			biomass_collected_total += int(orb["value"])
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
