extends Node3D
## EVOLUTION: Living Terrain — Conway B3/S23 on a 2D grid, rendered in 3D.
## No addons, external assets, or individual nodes per cell required.

const GRID: int = 80
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
var generation_interval: float = 0.22
var height_scale: float = 1.0
var accumulated: float = 0.0
var overview: bool = false
var mouse_captured: bool = true
var brush_species: int = 1

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
	build_world()
	seed_world()
	set_mouse_capture(true)

func build_world() -> void:
	var box: BoxMesh = BoxMesh.new()
	box.size = Vector3(0.91, 1.0, 0.91)
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.metallic = 0.18
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
	hint.text = "WASD fly  |  Mouse look  |  Space/Ctrl rise/fall  |  Shift boost\nTab mouse unlock  |  V overview  |  P pause  |  N step  |  R randomize  |  C clear\n[ / ] speed  |  - / = height  |  M terrain memory  |  1/2/3 species  |  X explosions\nUnlock mouse with Tab to LEFT-CLICK paint / RIGHT-CLICK erase on the ground"
	warn_label = Label.new()
	warn_label.position = Vector2(20.0, 60.0)
	warn_label.add_theme_font_size_override("font_size", 17)
	warn_label.add_theme_color_override("font_color", Color(1.0, 0.55, 0.6))
	warn_label.text = "⚠️ STAGNATION DETECTED — OLD PILLARS EXPLODING!"
	warn_label.visible = false
	canvas.add_child(warn_label)
	canvas.add_child(hint)

func index_of(x: int, z: int) -> int:
	return z * GRID + x

func seed_world() -> void:
	for i in range(TOTAL):
		cells[i] = 0
		ages[i] = 0
		history[i] = 0.0
		heights[i] = 0.0
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
	explosions = 0
	hash_history.clear()
	refresh_population()

func refresh_population() -> void:
	population = 0
	for cell in cells:
		if cell != 0:
			population += 1

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
		if current != 0:
			ages[i] = mini(MAX_AGE, ages[i] + 1) if old != 0 else 1
			history[i] = minf(HISTORY_LIMIT, history[i] + 0.065)
		else:
			ages[i] = 0
			history[i] = maxf(0.0, history[i] - 0.012)
	generations += 1
	refresh_population()

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
	update_visuals(delta)
	update_flight(delta)
	var mode: String = "OVERVIEW" if overview else "FLIGHT"
	hud.text = "EVOLUTION  /  LIVING TERRAIN\nGeneration %d     Alive %d     %s\n%s   |   %.1f gen/sec   |   Height %.1fx   |   Memory %s   |   Brush %d" % [generations, population, mode, "RUNNING" if running else "PAUSED", 1.0 / generation_interval, height_scale, "ON" if memory_enabled else "OFF", brush_species]

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
			else:
				tint = Color(0.06, 0.14, 0.26).lerp(Color(0.19, 0.26, 0.42), terrain_memory)
			multimesh.set_instance_color(i, tint)

func update_flight(delta: float) -> void:
	if overview or not mouse_captured:
		return
	var move: Vector3 = Vector3.ZERO
	if Input.is_key_pressed(KEY_W): move -= camera.global_basis.z
	if Input.is_key_pressed(KEY_S): move += camera.global_basis.z
	if Input.is_key_pressed(KEY_A): move -= camera.global_basis.x
	if Input.is_key_pressed(KEY_D): move += camera.global_basis.x
	if Input.is_key_pressed(KEY_SPACE): move += Vector3.UP
	if Input.is_key_pressed(KEY_CTRL): move += Vector3.DOWN
	if move.length_squared() > 0.0:
		var speed: float = 55.0 if Input.is_key_pressed(KEY_SHIFT) else 19.0
		camera.global_position += move.normalized() * speed * delta
		camera.position.y = maxf(0.8, camera.position.y)

func set_mouse_capture(enabled: bool) -> void:
	mouse_captured = enabled
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if enabled else Input.MOUSE_MODE_VISIBLE

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and mouse_captured and not overview:
		camera.rotation.y -= event.relative.x * 0.0025
		camera.rotation.x = clampf(camera.rotation.x - event.relative.y * 0.0025, -1.54, 1.54)
	if event is InputEventMouseButton and event.pressed and not mouse_captured:
		if event.button_index == MOUSE_BUTTON_LEFT or event.button_index == MOUSE_BUTTON_RIGHT:
			paint_at_cursor(event.position, event.button_index == MOUSE_BUTTON_LEFT)
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_TAB:
				set_mouse_capture(not mouse_captured)
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
			KEY_M:
				memory_enabled = not memory_enabled
			KEY_X:
				explosions_enabled = not explosions_enabled
			KEY_V:
				overview = not overview
				if overview:
					camera.position = Vector3(0.0, 105.0, 68.0)
					camera.rotation = Vector3(-0.95, 0.0, 0.0)
					set_mouse_capture(false)
				else:
					camera.position = Vector3(0.0, 16.0, 40.0)
					camera.rotation = Vector3(-0.30, 0.0, 0.0)
					set_mouse_capture(true)
			KEY_BRACKETLEFT:
				generation_interval = minf(2.0, generation_interval * 1.25)
			KEY_BRACKETRIGHT:
				generation_interval = maxf(0.035, generation_interval / 1.25)
			KEY_MINUS:
				height_scale = maxf(0.2, height_scale - 0.2)
			KEY_EQUAL:
				height_scale = minf(4.0, height_scale + 0.2)
			KEY_1, KEY_2, KEY_3:
				brush_species = event.keycode - KEY_1 + 1

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
	refresh_population()
