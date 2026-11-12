extends Node3D
## Evolution Explorer — Fly Through Living Pillars (Godot 4)
## Pillars grown by Conway's Game of Life.
## Height = how long cells have lived. Old pillars explode.
## Stagnant / repeating patterns explode too.
##
## Controls:
##   Mouse move        — steer ship
##   WASD / arrows     — steer ship
##   Shift             — boost
##   P / Esc           — pause    M — mute (visual only)
##   Enter             — start / restart

const W := 20
const CHUNK_D := 12
const N_CHUNKS := 4
const SPACING := 2.4
const MAX_AGE := 24
const BASE_H := 1.2
const H_PER_AGE := 0.42
const LIFE_INTERVAL := 0.55

const RULES := {
	"Conway B3/S23": {"birth": [3], "survive": [2, 3]},
	"HighLife B36/S23": {"birth": [3, 6], "survive": [2, 3]},
	"Day & Night": {"birth": [3, 6, 7, 8], "survive": [3, 4, 6, 7, 8]},
}

var rule_name := "Conway B3/S23"
var birth_set := {}
var survive_set := {}

var state := "menu" # menu | playing | paused | gameover
var chunks: Array = []
var player_z := 0.0
var ship_x := 0.0
var ship_y := 6.0
var target_x := 0.0
var target_y := 6.0
var speed := 12.0
var base_speed := 14.0
var distance := 0.0
var bonus_score := 0
var dna := 0
var combo := 0
var combo_timer := 0.0
var shield := false
var invuln := 0.0
var boost_held := false
var next_shield_at := 700.0
var last_speed_level := 0
var menu_time := 0.0
var orb_timer := 0.0
var rng := RandomNumberGenerator.new()

var camera: Camera3D
var ship: Node3D
var pillars_mm: MultiMesh
var ground: MeshInstance3D
var grid_lines: MeshInstance3D
var score_label: Label
var dist_label: Label
var dna_label: Label
var speed_label: Label
var life_label: Label
var combo_label: Label
var shield_label: Label
var warn_label: Label
var start_panel: Control
var over_panel: Control
var pause_panel: Control
var final_label: Label
var orbs: Array = []
var keys_held := {}

func _ready() -> void:
	rng.randomize()
	_apply_rule(rule_name)
	_build_world()
	_build_ui()
	reset_world()
	camera.position = Vector3(0, 9.4, -9.5)

func _apply_rule(rname: String) -> void:
	rule_name = rname
	birth_set.clear()
	survive_set.clear()
	for v in RULES[rname]["birth"]:
		birth_set[v] = true
	for v in RULES[rname]["survive"]:
		survive_set[v] = true

# ── World building ──────────────────────────────────────────────
func _build_world() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.02, 0.024, 0.06)
	e.fog_enabled = true
	e.fog_light_color = Color(0.02, 0.024, 0.06)
	e.fog_density = 0.014
	env.environment = e
	add_child(env)

	var amb := OmniLight3D.new()
	amb.light_color = Color(0.53, 0.6, 1.0)
	amb.light_energy = 0.7
	add_child(amb)

	var sun := DirectionalLight3D.new()
	sun.light_energy = 1.1
	sun.rotation_degrees = Vector3(-55, 20, 0)
	add_child(sun)

	camera = Camera3D.new()
	camera.fov = 62.0
	camera.far = 700.0
	add_child(camera)

	# Ground
	var plane := PlaneMesh.new()
	plane.size = Vector2(400, 500)
	var ground_mat := StandardMaterial3D.new()
	ground_mat.albedo_color = Color(0.04, 0.05, 0.14)
	ground = MeshInstance3D.new()
	ground.mesh = plane
	ground.material_override = ground_mat
	add_child(ground)

	# Grid lines
	var lines := ImmediateMesh.new()
	lines.surface_begin(Mesh.PRIMITIVE_LINES)
	var line_mat := StandardMaterial3D.new()
	line_mat.albedo_color = Color(0.13, 0.83, 0.93, 0.35)
	line_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	line_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for i in range(-40, 41):
		var x := float(i) * SPACING
		lines.surface_add_vertex(Vector3(x, 0.02, -120))
		lines.surface_add_vertex(Vector3(x, 0.02, 120))
	for j in range(-40, 41):
		var z := float(j) * SPACING
		lines.surface_add_vertex(Vector3(-96, 0.02, z))
		lines.surface_add_vertex(Vector3(96, 0.02, z))
	lines.surface_end()
	grid_lines = MeshInstance3D.new()
	grid_lines.mesh = lines
	grid_lines.material_override = line_mat
	add_child(grid_lines)

	# Stars
	var star_mesh := SphereMesh.new()
	star_mesh.radius = 0.35
	star_mesh.height = 0.7
	var star_mat := StandardMaterial3D.new()
	star_mat.albedo_color = Color(0.8, 0.9, 1.0)
	star_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	star_mesh.material = star_mat
	var star_mm := MultiMesh.new()
	star_mm.transform_format = MultiMesh.TRANSFORM_3D
	star_mm.mesh = star_mesh
	star_mm.instance_count = 250
	for i in range(250):
		var pos := Vector3(rng.randf_range(-140, 140), rng.randf_range(-8, 70), rng.randf_range(-30, 220))
		star_mm.set_instance_transform(i, Transform3D(Basis(), pos))
	var star_inst := MultiMeshInstance3D.new()
	star_inst.multimesh = star_mm
	star_inst.name = "Stars"
	add_child(star_inst)

	# Pillars MultiMesh
	var box := BoxMesh.new()
	box.size = Vector3(1.8, 1.0, 1.8)
	var box_mat := StandardMaterial3D.new()
	box_mat.roughness = 0.35
	box_mat.metallic = 0.15
	box.material = box_mat
	pillars_mm = MultiMesh.new()
	pillars_mm.transform_format = MultiMesh.TRANSFORM_3D
	pillars_mm.use_colors = true
	pillars_mm.mesh = box
	pillars_mm.instance_count = W * CHUNK_D * N_CHUNKS
	var pillars_inst := MultiMeshInstance3D.new()
	pillars_inst.multimesh = pillars_mm
	pillars_inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(pillars_inst)

	# Ship: glowing cone + wings + light
	ship = Node3D.new()
	var body_mesh := CylinderMesh.new()
	body_mesh.top_radius = 0.05
	body_mesh.bottom_radius = 0.55
	body_mesh.height = 2.4
	var body_mat := StandardMaterial3D.new()
	body_mat.albedo_color = Color(0.13, 0.83, 0.93)
	body_mat.emission_enabled = true
	body_mat.emission = Color(0.13, 0.83, 0.93)
	body_mat.emission_energy_multiplier = 0.8
	var body := MeshInstance3D.new()
	body.mesh = body_mesh
	body.material_override = body_mat
	body.rotation_degrees = Vector3(90, 0, 0)
	ship.add_child(body)
	var wing_mesh := BoxMesh.new()
	wing_mesh.size = Vector3(2.2, 0.12, 0.9)
	var wing_mat := StandardMaterial3D.new()
	wing_mat.albedo_color = Color(0.91, 0.47, 0.98)
	wing_mat.emission_enabled = true
	wing_mat.emission = Color(0.91, 0.47, 0.98)
	wing_mat.emission_energy_multiplier = 0.6
	var wings := MeshInstance3D.new()
	wings.mesh = wing_mesh
	wings.material_override = wing_mat
	wings.position = Vector3(0, 0, -0.7)
	ship.add_child(wings)
	var ship_light := OmniLight3D.new()
	ship_light.light_color = Color(0.13, 0.83, 0.93)
	ship_light.light_energy = 2.0
	ship_light.omni_range = 30.0
	ship_light.position = Vector3(0, 0.5, -1)
	ship.add_child(ship_light)
	add_child(ship)

	# Orb pool
	var orb_mesh := SphereMesh.new()
	orb_mesh.radius = 0.55
	orb_mesh.height = 1.1
	for i in range(20):
		var m := MeshInstance3D.new()
		m.mesh = orb_mesh
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.13, 0.83, 0.93)
		mat.emission_enabled = true
		mat.emission = Color(0.13, 0.83, 0.93)
		mat.emission_energy_multiplier = 2.0
		m.material_override = mat
		m.visible = false
		add_child(m)
		orbs.append({"mesh": m, "active": false, "shield": false, "base_y": 4.0, "phase": rng.randf_range(0.0, 6.28)})

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)

	var top := HBoxContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 12
	top.offset_top = 10
	top.offset_right = -12
	top.add_theme_constant_override("separation", 12)
	root.add_child(top)

	var title := Label.new()
	title.text = "🚀 EVOLUTION EXPLORER"
	title.add_theme_font_size_override("font_size", 16)
	top.add_child(title)

	score_label = _stat("SCORE 0")
	dist_label = _stat("0m")
	dna_label = _stat("🧬 0")
	speed_label = _stat("SPD 0")
	combo_label = _stat("×1")
	shield_label = _stat("🛡️")
	shield_label.visible = false
	for l in [score_label, dist_label, dna_label, speed_label, combo_label, shield_label]:
		top.add_child(l)

	life_label = Label.new()
	life_label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	life_label.offset_left = 12
	life_label.offset_top = 44
	life_label.add_theme_font_size_override("font_size", 12)
	life_label.add_theme_color_override("font_color", Color(0.55, 0.58, 0.72))
	root.add_child(life_label)

	warn_label = Label.new()
	warn_label.text = "⚠️ STAGNATION DETECTED — PILLARS EXPLODING!"
	warn_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	warn_label.offset_top = 80
	warn_label.offset_left = -260
	warn_label.offset_right = 260
	warn_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	warn_label.add_theme_color_override("font_color", Color(1.0, 0.6, 0.65))
	warn_label.visible = false
	root.add_child(warn_label)

	var hint := Label.new()
	hint.text = "🖱️ Move mouse to steer • WASD steer • Shift boost • P pause"
	hint.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	hint.offset_left = -280
	hint.offset_right = 280
	hint.offset_top = -40
	hint.offset_bottom = -12
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_color_override("font_color", Color(0.55, 0.58, 0.72))
	root.add_child(hint)

	# Start panel
	start_panel = _make_panel(root, "🚀 EVOLUTION EXPLORER",
		"Fly through pillars grown by the Game of Life.\nHeight = how long cells have lived.\nOld pillars explode — and so do stagnant, repeating patterns.\n\n🖱️ Move mouse to steer • WASD • Shift boost\n🧬 Collect DNA orbs • skim pillars for near-miss bonuses\n💥 Young = short = safe. Old = tall = deadly.",
		"▶ TAKE OFF", func() -> void: start_game())
	var rule_opt := OptionButton.new()
	for rname in RULES.keys():
		rule_opt.add_item(rname)
	rule_opt.item_selected.connect(func(i: int) -> void: _apply_rule(rule_opt.get_item_text(i)))
	rule_opt.set_anchors_preset(Control.PRESET_CENTER)
	rule_opt.offset_left = -110
	rule_opt.offset_right = 110
	rule_opt.offset_top = 120
	rule_opt.offset_bottom = 152
	start_panel.add_child(rule_opt)

	# Game over panel
	over_panel = _make_panel(root, "💥 CRASHED!", "", "↻ FLY AGAIN", func() -> void: start_game())
	final_label = Label.new()
	final_label.set_anchors_preset(Control.PRESET_CENTER)
	final_label.offset_left = -200
	final_label.offset_right = 200
	final_label.offset_top = 40
	final_label.offset_bottom = 110
	final_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	final_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	over_panel.add_child(final_label)
	over_panel.visible = false

	# Pause panel
	pause_panel = _make_panel(root, "⏸ PAUSED", "The pillars wait for no one… except now.",
		"▶ RESUME", func() -> void: toggle_pause())
	pause_panel.visible = false

func _stat(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", 15)
	return l

func _make_panel(parent: Control, title: String, body: String, btn_text: String, on_press: Callable) -> Control:
	var dim := ColorRect.new()
	dim.color = Color(0.01, 0.015, 0.05, 0.75)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	parent.add_child(dim)
	var card := PanelContainer.new()
	card.set_anchors_preset(Control.PRESET_CENTER)
	card.offset_left = -260
	card.offset_right = 260
	card.offset_top = -230
	card.offset_bottom = 230
	dim.add_child(card)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	card.add_child(v)
	var t := Label.new()
	t.text = title
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 30)
	v.add_child(t)
	if body != "":
		var b := Label.new()
		b.text = body
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.add_theme_color_override("font_color", Color(0.6, 0.64, 0.8))
		v.add_child(b)
	var btn := Button.new()
	btn.text = btn_text
	btn.custom_minimum_size = Vector2(220, 48)
	btn.pressed.connect(on_press)
	var center := CenterContainer.new()
	center.add_child(btn)
	v.add_child(center)
	return dim

# ── Life chunks ─────────────────────────────────────────────────
func _idx(x: int, z: int) -> int:
	return z * W + x

func _make_chunk(z_start: float) -> Dictionary:
	var ch := {
		"z_start": z_start,
		"grid": PackedByteArray(),
		"next": PackedByteArray(),
		"age": PackedInt32Array(),
		"heights": PackedFloat32Array(),
		"targets": PackedFloat32Array(),
		"near_cd": PackedFloat32Array(),
		"gen": 0,
		"pop": 0,
		"oldest": 0,
		"timer": rng.randf_range(0.0, LIFE_INTERVAL),
		"hashes": [],
	}
	ch["grid"].resize(W * CHUNK_D)
	ch["next"].resize(W * CHUNK_D)
	ch["age"].resize(W * CHUNK_D)
	ch["heights"].resize(W * CHUNK_D)
	ch["targets"].resize(W * CHUNK_D)
	ch["near_cd"].resize(W * CHUNK_D)
	_seed_chunk(ch)
	return ch

func _seed_chunk(ch: Dictionary) -> void:
	var grid: PackedByteArray = ch["grid"]
	var age: PackedInt32Array = ch["age"]
	grid.fill(0)
	age.fill(0)
	ch["gen"] = 0
	ch["hashes"] = []
	var density := rng.randf_range(0.20, 0.27)
	for i in range(grid.size()):
		if rng.randf() < density:
			grid[i] = 1
			age[i] = rng.randi_range(0, 3)
	var patterns := {
		"glider": [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
		"acorn": [[1, 0], [3, 0], [0, 1], [3, 1], [4, 1], [5, 1], [6, 1]],
		"rpent": [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
		"lwss": [[1, 0], [3, 0], [0, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2]],
	}
	var keys := patterns.keys()
	var n_pat := rng.randi_range(1, 2)
	for p in range(n_pat):
		var pat: Array = patterns[keys[rng.randi_range(0, keys.size() - 1)]]
		var ox := rng.randi_range(2, W - 9)
		var oz := rng.randi_range(2, CHUNK_D - 5)
		for cell in pat:
			var x: int = (ox + cell[0]) % W
			var z: int = oz + cell[1]
			if z < CHUNK_D:
				var i := _idx(x, z)
				grid[i] = 1
				age[i] = 0
	_refresh_targets(ch)
	var heights: PackedFloat32Array = ch["heights"]
	var targets: PackedFloat32Array = ch["targets"]
	for i in range(heights.size()):
		heights[i] = targets[i]
	_recount(ch)

func _refresh_targets(ch: Dictionary) -> void:
	var grid: PackedByteArray = ch["grid"]
	var age: PackedInt32Array = ch["age"]
	var targets: PackedFloat32Array = ch["targets"]
	for i in range(grid.size()):
		targets[i] = (BASE_H + float(age[i]) * H_PER_AGE) if grid[i] == 1 else 0.0

func _recount(ch: Dictionary) -> void:
	var grid: PackedByteArray = ch["grid"]
	var age: PackedInt32Array = ch["age"]
	var pop := 0
	var oldest := 0
	for i in range(grid.size()):
		if grid[i] == 1:
			pop += 1
			oldest = maxi(oldest, age[i])
	ch["pop"] = pop
	ch["oldest"] = oldest

func _hash_grid(grid: PackedByteArray) -> int:
	var h := 2166136261
	for i in range(grid.size()):
		h = h ^ grid[i]
		h = int((h * 16777619) & 0xFFFFFFFF)
	return h

func _cell_world(ch: Dictionary, gx: int, gz: int) -> Vector2:
	return Vector2(float(gx) * SPACING - float(W) * SPACING * 0.5 + SPACING * 0.5, float(ch["z_start"]) + float(gz) * SPACING + SPACING * 0.5)

func _explode_cell(ch: Dictionary, gx: int, gz: int) -> void:
	var i := _idx(gx, gz)
	var grid: PackedByteArray = ch["grid"]
	var age: PackedInt32Array = ch["age"]
	var targets: PackedFloat32Array = ch["targets"]
	grid[i] = 0
	age[i] = 0
	targets[i] = 0.0
	var w := _cell_world(ch, gx, gz)
	_spawn_burst(Vector3(w.x, 4.0, w.y), Color(0.91, 0.47, 0.98), 14)

func _step_life(ch: Dictionary) -> void:
	var grid: PackedByteArray = ch["grid"]
	var next: PackedByteArray = ch["next"]
	var age: PackedInt32Array = ch["age"]
	for gz in range(CHUNK_D):
		for gx in range(W):
			var n := 0
			for dz in range(-1, 2):
				for dx in range(-1, 2):
					if dx == 0 and dz == 0:
						continue
					var nx := posmod(gx + dx, W)
					var nz := gz + dz
					if nz < 0 or nz >= CHUNK_D:
						continue
					if grid[_idx(nx, nz)] == 1:
						n += 1
			var i := _idx(gx, gz)
			if grid[i] == 1:
				next[i] = 1 if survive_set.has(n) else 0
			else:
				next[i] = 1 if birth_set.has(n) else 0
	for i in range(grid.size()):
		if next[i] == 1:
			if grid[i] == 0:
				age[i] = 0
			else:
				age[i] += 1
			if age[i] >= MAX_AGE:
				next[i] = 0
		else:
			age[i] = 0
	ch["grid"] = next
	ch["next"] = grid
	ch["gen"] = int(ch["gen"]) + 1
	_refresh_targets(ch)
	_recount(ch)
	# Stagnation / repeat detection
	var h := _hash_grid(ch["grid"])
	var hashes: Array = ch["hashes"]
	var repeated := hashes.has(h)
	hashes.append(h)
	while hashes.size() > 4:
		hashes.pop_front()
	ch["hashes"] = hashes
	if repeated and int(ch["gen"]) > 6 and int(ch["pop"]) > 8:
		var count := 0
		for gz in range(CHUNK_D):
			for gx in range(W):
				var i := _idx(gx, gz)
				var g: PackedByteArray = ch["grid"]
				var a: PackedInt32Array = ch["age"]
				if g[i] == 1 and a[i] >= 4:
					_explode_cell(ch, gx, gz)
					count += 1
		if count > 0:
			_refresh_targets(ch)
			_recount(ch)
			bonus_score += mini(200, count * 10)
			warn_label.visible = true
			get_tree().create_timer(2.5).timeout.connect(func() -> void: warn_label.visible = false)
		ch["hashes"] = []
	if int(ch["pop"]) == 0:
		_seed_chunk(ch)

func _update_chunks(dt: float) -> void:
	while chunks.size() > 0 and float(chunks[0]["z_start"]) + float(CHUNK_D) * SPACING < player_z - 30.0:
		chunks.pop_front()
	while chunks.size() < N_CHUNKS:
		var last: Dictionary = chunks[chunks.size() - 1]
		chunks.append(_make_chunk(float(last["z_start"]) + float(CHUNK_D) * SPACING))
	for ch in chunks:
		ch["timer"] = float(ch["timer"]) + dt
		if float(ch["timer"]) >= LIFE_INTERVAL:
			ch["timer"] = 0.0
			_step_life(ch)

# ── Rendering ───────────────────────────────────────────────────
func _age_color(a: int) -> Color:
	if a >= MAX_AGE - 3:
		return Color(1.0, 0.95, 0.9)
	elif a == 0:
		return Color.from_hsv(0.52, 1.0, 0.85)
	elif a == 1:
		return Color.from_hsv(0.46, 0.95, 0.72)
	elif a <= 3:
		return Color.from_hsv(0.30, 0.9, 0.66)
	elif a <= 7:
		return Color.from_hsv(0.10, 0.95, 0.66)
	elif a <= 14:
		return Color.from_hsv(0.86, 0.9, 0.72)
	return Color.from_hsv(0.74, 0.85, 0.78)

func _render_pillars(dt: float) -> void:
	var n := 0
	var grow_k := minf(1.0, dt * 5.5)
	for ch in chunks:
		var heights: PackedFloat32Array = ch["heights"]
		var targets: PackedFloat32Array = ch["targets"]
		var age: PackedInt32Array = ch["age"]
		for gz in range(CHUNK_D):
			for gx in range(W):
				var i := _idx(gx, gz)
				heights[i] += (targets[i] - heights[i]) * grow_k
				var h := heights[i]
				if h < 0.06:
					continue
				var w := _cell_world(ch, gx, gz)
				var basis := Basis.from_scale(Vector3(1.0, h, 1.0))
				pillars_mm.set_instance_transform(n, Transform3D(basis, Vector3(w.x, h * 0.5, w.y)))
				pillars_mm.set_instance_color(n, _age_color(age[i]))
				n += 1
	pillars_mm.visible_instance_count = n

func _spawn_burst(pos: Vector3, color: Color, amount: int) -> void:
	var p := CPUParticles3D.new()
	p.amount = amount
	p.one_shot = true
	p.explosiveness = 0.9
	p.lifetime = 0.8
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.6
	p.direction = Vector3(0, 1, 0)
	p.spread = 180.0
	p.initial_velocity_min = 3.0
	p.initial_velocity_max = 7.0
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

# ── Orbs ────────────────────────────────────────────────────────
func _spawn_orb(is_shield: bool) -> void:
	for o in orbs:
		if o["active"]:
			continue
		for tries in range(12):
			var ch: Dictionary = chunks[rng.randi_range(0, chunks.size() - 1)]
			var gx := rng.randi_range(0, W - 1)
			var gz := rng.randi_range(0, CHUNK_D - 1)
			var w := _cell_world(ch, gx, gz)
			if w.y < player_z + 18.0 or w.y > player_z + 130.0:
				continue
			o["active"] = true
			o["shield"] = is_shield
			var m: MeshInstance3D = o["mesh"]
			m.visible = true
			var mat := m.material_override as StandardMaterial3D
			var col := Color(1.0, 0.75, 0.14) if is_shield else Color(0.13, 0.83, 0.93)
			mat.albedo_color = col
			mat.emission = col
			o["base_y"] = rng.randf_range(2.5, 9.5)
			m.position = Vector3(w.x, o["base_y"], w.y)
			return
		return

func _check_orbs(dt: float) -> void:
	for o in orbs:
		if not o["active"]:
			continue
		var m: MeshInstance3D = o["mesh"]
		m.rotation.y += dt * 2.4
		m.position.y = float(o["base_y"]) + sin(Time.get_ticks_msec() / 400.0 + float(o["phase"])) * 0.4
		if state != "playing":
			continue
		if m.position.distance_to(ship.position) < 1.9:
			o["active"] = false
			m.visible = false
			if o["shield"]:
				shield = true
				shield_label.visible = true
			else:
				combo += 1
				combo_timer = 4.0
				dna += 1
				bonus_score += 50 * maxi(1, combo)
				_spawn_burst(m.position, Color(0.13, 0.83, 0.93), 10)

# ── Collision ───────────────────────────────────────────────────
func _check_collisions() -> void:
	if state != "playing" or invuln > 0.0:
		return
	if ship_y < 1.0:
		_crash("You flew into the ground!")
		return
	for ch in chunks:
		if float(ch["z_start"]) > player_z + 4.0 or float(ch["z_start"]) + float(CHUNK_D) * SPACING < player_z - 4.0:
			continue
		var targets: PackedFloat32Array = ch["targets"]
		var near_cd: PackedFloat32Array = ch["near_cd"]
		for gz in range(CHUNK_D):
			for gx in range(W):
				var i := _idx(gx, gz)
				var h := targets[i]
				if h < 1.0:
					continue
				var w := _cell_world(ch, gx, gz)
				var dx := absf(ship_x - w.x)
				var dz := absf(player_z - w.y)
				if dx < 1.15 and dz < 1.15 and ship_y < h - 0.3:
					_crash("You hit a pillar!")
					return
				if near_cd[i] <= 0.0 and dx < 2.3 and dz < 2.3 and ship_y < h + 1.6 and ship_y >= h - 0.3:
					near_cd[i] = 2.5
					combo += 1
					combo_timer = 4.0
					dna += 2
					bonus_score += 100 * maxi(1, combo)
					_spawn_burst(Vector3(ship_x, ship_y, player_z), Color(1.0, 0.75, 0.14), 8)

func _crash(msg: String) -> void:
	if shield:
		shield = false
		invuln = 2.5
		shield_label.visible = false
		_spawn_burst(ship.position, Color(1.0, 0.75, 0.14), 40)
		return
	state = "gameover"
	ship.visible = false
	_spawn_burst(ship.position, Color(0.13, 0.83, 0.93), 60)
	_spawn_burst(ship.position, Color(0.91, 0.47, 0.98), 40)
	var final_score := int(distance * 2.0) + bonus_score
	final_label.text = "Score: %d\nDistance: %dm\nDNA: %d" % [final_score, int(distance), dna]
	over_panel.visible = true

# ── Game flow ───────────────────────────────────────────────────
func reset_world() -> void:
	chunks.clear()
	var z := -28.0
	for i in range(N_CHUNKS):
		chunks.append(_make_chunk(z))
		z += float(CHUNK_D) * SPACING
	player_z = 0.0
	ship_x = 0.0
	ship_y = 6.0
	target_x = 0.0
	target_y = 6.0
	distance = 0.0
	bonus_score = 0
	dna = 0
	combo = 0
	combo_timer = 0.0
	shield = false
	invuln = 0.0
	next_shield_at = 700.0
	last_speed_level = 0
	base_speed = 14.0
	speed = 12.0
	for o in orbs:
		o["active"] = false
		(o["mesh"] as MeshInstance3D).visible = false
	ship.visible = true
	shield_label.visible = false
	warn_label.visible = false
	_update_hud()

func start_game() -> void:
	reset_world()
	state = "playing"
	start_panel.visible = false
	over_panel.visible = false
	pause_panel.visible = false

func toggle_pause() -> void:
	if state == "playing":
		state = "paused"
		pause_panel.visible = true
	elif state == "paused":
		state = "playing"
		pause_panel.visible = false

func _update_hud() -> void:
	score_label.text = "SCORE %d" % (int(distance * 2.0) + bonus_score)
	dist_label.text = "%dm" % int(distance)
	dna_label.text = "🧬 %d" % dna
	speed_label.text = "SPD %d" % int(speed)
	combo_label.text = "×%d" % maxi(1, combo)
	var gen := 0
	var pop := 0
	var oldest := 0
	for ch in chunks:
		gen += int(ch["gen"])
		pop += int(ch["pop"])
		oldest = maxi(oldest, int(ch["oldest"]))
	life_label.text = "Life (%s): Gen %d · Pop %d · Oldest %d" % [rule_name, gen, pop, oldest]

# ── Input ───────────────────────────────────────────────────────
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and state == "playing":
		var vp := get_viewport().get_visible_rect().size
		var mp := (event as InputEventMouseMotion).position
		target_x = clampf((mp.x / vp.x * 2.0 - 1.0) * 22.0, -22.0, 22.0)
		target_y = clampf(1.5 + (1.0 - mp.y / vp.y) * 13.5, 1.2, 15.0)
	elif event is InputEventKey:
		var k := event as InputEventKey
		if k.pressed:
			keys_held[k.keycode] = true
			if k.keycode == KEY_SHIFT:
				boost_held = true
			elif k.keycode == KEY_P or k.keycode == KEY_ESCAPE:
				toggle_pause()
			elif k.keycode == KEY_ENTER:
				if state == "menu" or state == "gameover":
					start_game()
		else:
			keys_held.erase(k.keycode)
			if k.keycode == KEY_SHIFT:
				boost_held = false

func _keyboard_steer(dt: float) -> void:
	var mx := 0.0
	var my := 0.0
	if keys_held.has(KEY_A) or keys_held.has(KEY_LEFT):
		mx -= 1.0
	if keys_held.has(KEY_D) or keys_held.has(KEY_RIGHT):
		mx += 1.0
	if keys_held.has(KEY_W) or keys_held.has(KEY_UP):
		my += 1.0
	if keys_held.has(KEY_S) or keys_held.has(KEY_DOWN):
		my -= 1.0
	if mx != 0.0 or my != 0.0:
		target_x = clampf(target_x + mx * 30.0 * dt, -22.0, 22.0)
		target_y = clampf(target_y + my * 20.0 * dt, 1.2, 15.0)

# ── Main loop ───────────────────────────────────────────────────
func _process(delta: float) -> void:
	if state == "paused":
		return
	if state == "menu":
		menu_time += delta
		speed = 12.0
		player_z += speed * delta
		target_x = sin(menu_time * 0.45) * 10.0
		target_y = 6.0 + sin(menu_time * 0.7) * 2.2
		_update_chunks(delta)
	elif state == "playing":
		_keyboard_steer(delta)
		target_x = clampf(target_x, -22.0, 22.0)
		target_y = clampf(target_y, 1.2, 15.0)
		base_speed = minf(32.0, 14.0 + float(int(distance / 400.0)) * 0.7)
		speed = base_speed * (1.55 if boost_held else 1.0)
		player_z += speed * delta
		distance += speed * delta
		if invuln > 0.0:
			invuln -= delta
		if combo_timer > 0.0:
			combo_timer -= delta
			if combo_timer <= 0.0:
				combo = 0
		var lvl := int(distance / 400.0)
		if lvl > last_speed_level:
			last_speed_level = lvl
		if distance >= next_shield_at:
			next_shield_at += 700.0
			_spawn_orb(true)
		orb_timer += delta
		if orb_timer > 0.7:
			orb_timer = 0.0
			_spawn_orb(false)
		_update_chunks(delta)
		_check_collisions()
		_update_hud()
	elif state == "gameover":
		player_z += 2.0 * delta
		_update_chunks(delta)

	# Ship follow + banking
	var prev_x := ship_x
	var prev_y := ship_y
	var k := 1.0 - pow(0.0005, delta)
	ship_x += (target_x - ship_x) * k
	ship_y += (target_y - ship_y) * k
	ship.position = Vector3(ship_x, ship_y, player_z)
	var vx := (ship_x - prev_x) / maxf(delta, 0.001)
	var vy := (ship_y - prev_y) / maxf(delta, 0.001)
	ship.rotation.z = clampf(-vx * 0.028, -0.7, 0.7)
	ship.rotation.x = clampf(vy * 0.02, -0.45, 0.45)

	# Camera chase
	var cam_k := 1.0 - pow(0.001, delta)
	camera.position.x += (ship_x * 0.62 - camera.position.x) * cam_k
	camera.position.y += (ship_y + 3.4 - camera.position.y) * cam_k
	camera.position.z += (player_z - 9.5 - camera.position.z) * cam_k
	camera.look_at(Vector3(ship_x * 0.85, ship_y + 0.4, player_z + 14.0))
	camera.fov = lerpf(camera.fov, 62.0 + (speed - 14.0) * 0.5 + (9.0 if boost_held and state == "playing" else 0.0), minf(1.0, delta * 4.0))

	# Followers
	ground.position = Vector3(0, 0, player_z + 90.0)
	grid_lines.position = Vector3(0, 0, roundf(player_z / SPACING) * SPACING + 60.0)
	var stars := get_node_or_null("Stars") as MultiMeshInstance3D
	if stars:
		stars.position = Vector3(0, 0, player_z)

	_render_pillars(delta)
	_check_orbs(delta)
	for ch in chunks:
		var near_cd: PackedFloat32Array = ch["near_cd"]
		for i in range(near_cd.size()):
			if near_cd[i] > 0.0:
				near_cd[i] -= delta
