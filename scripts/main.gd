extends Node3D
## Evolution Explorer — Conway's Game of Life in 3D (Godot 4)
## Seed life, grow worlds, bend evolution.
##
## Controls:
##   Left-drag on world  — paint / erase / bomb / stamp (selected tool)
##   Left-drag on space  — orbit camera
##   Right-drag          — pan camera
##   Mouse wheel         — zoom (Shift+wheel = brush size)
##   Space               — play / pause    . — step    C — clear    R — random
##   1-5                 — tools           [ ] — brush size
##   WASD / arrows       — pan             Q / E — rotate

const GX := 28
const GY := 28
const GZ := 12
const MAX_CELLS := GX * GY * GZ

# Rules: survive / birth neighbour counts (26-neighbour 3D Life)
const RULES := {
	"Stable 5766": {"survive": [5, 6], "birth": [6, 7]},
	"Explosive 4555": {"survive": [4, 5], "birth": [5, 6]},
	"Maze 4565": {"survive": [4, 5, 6], "birth": [5]},
	"Chaos 345456": {"survive": [3, 4, 5], "birth": [4, 5, 6]},
}

var grid := PackedByteArray()
var next_grid := PackedByteArray()
var ages := PackedInt32Array()
var generation := 0
var population := 0
var running := true
var speed := 6.0 # generations per second
var sim_acc := 0.0
var rule_name := "Stable 5766"
var survive_set := {}
var birth_set := {}
var brush_size := 2
var tool := "paint" # paint | erase | bomb | stamp
var stamp_kind := "glider"
var auto_orbit := false

# Camera rig
var cam_target := Vector3.ZERO
var cam_radius := 42.0
var cam_theta := 0.75
var cam_phi := 1.02
var cam_desired_target := Vector3.ZERO
var cam_desired_radius := 42.0
var cam_desired_theta := 0.75
var cam_desired_phi := 1.02

var camera: Camera3D
var multimesh_instance: MultiMeshInstance3D
var multimesh: MultiMesh
var picker_body: StaticBody3D
var gen_label: Label
var pop_label: Label
var hint_label: Label
var play_button: Button
var speed_slider: HSlider
var speed_value: Label
var brush_slider: HSlider
var brush_value: Label
var rule_option: OptionButton
var tool_buttons := {}
var stamp_option: OptionButton
var wrap_toggle: CheckBox
var wrap_edges := true
var rng := RandomNumberGenerator.new()

func idx(x: int, y: int, z: int) -> int:
	return (y * GZ + z) * GX + x

func _ready() -> void:
	rng.randomize()
	grid.resize(MAX_CELLS)
	next_grid.resize(MAX_CELLS)
	ages.resize(MAX_CELLS)
	_apply_rule(rule_name)
	_build_world()
	_build_ui()
	seed_soup(0.18)
	_update_hud()

func _apply_rule(rname: String) -> void:
	rule_name = rname
	survive_set.clear()
	birth_set.clear()
	for v in RULES[rname]["survive"]:
		survive_set[v] = true
	for v in RULES[rname]["birth"]:
		birth_set[v] = true

# ── World building ──────────────────────────────────────────────
func _build_world() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.02, 0.024, 0.06)
	e.fog_enabled = true
	e.fog_light_color = Color(0.02, 0.024, 0.06)
	e.fog_density = 0.012
	env.environment = e
	add_child(env)

	var amb := OmniLight3D.new()
	amb.light_color = Color(0.53, 0.6, 1.0)
	amb.light_energy = 0.6
	add_child(amb)

	var sun := DirectionalLight3D.new()
	sun.light_energy = 1.2
	sun.rotation_degrees = Vector3(-50, 30, 0)
	add_child(sun)

	var cyan := OmniLight3D.new()
	cyan.light_color = Color(0.13, 0.83, 0.93)
	cyan.light_energy = 2.0
	cyan.omni_range = 90.0
	add_child(cyan)
	cyan.name = "CyanLight"

	var mag := OmniLight3D.new()
	mag.light_color = Color(0.91, 0.47, 0.98)
	mag.light_energy = 2.0
	mag.omni_range = 90.0
	add_child(mag)
	mag.name = "MagLight"

	camera = Camera3D.new()
	camera.fov = 55.0
	camera.far = 600.0
	add_child(camera)

	# Floor
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(GX, GZ)
	var floor_mat := StandardMaterial3D.new()
	floor_mat.albedo_color = Color(0.05, 0.07, 0.16, 0.9)
	floor_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var floor_inst := MeshInstance3D.new()
	floor_inst.mesh = floor_mesh
	floor_inst.material_override = floor_mat
	floor_inst.position = Vector3(0, -GY * 0.5 - 0.02, 0)
	add_child(floor_inst)

	# Grid lines via ImmediateMesh
	var lines := ImmediateMesh.new()
	lines.surface_begin(Mesh.PRIMITIVE_LINES)
	var line_mat := StandardMaterial3D.new()
	line_mat.albedo_color = Color(0.13, 0.83, 0.93, 0.35)
	line_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	line_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for i in range(GX + 1):
		var x := float(i) - GX * 0.5
		lines.surface_add_vertex(Vector3(x, -GY * 0.5, -GZ * 0.5))
		lines.surface_add_vertex(Vector3(x, -GY * 0.5, GZ * 0.5))
	for j in range(GZ + 1):
		var z := float(j) - GZ * 0.5
		lines.surface_add_vertex(Vector3(-GX * 0.5, -GY * 0.5, z))
		lines.surface_add_vertex(Vector3(GX * 0.5, -GY * 0.5, z))
	lines.surface_end()
	var lines_inst := MeshInstance3D.new()
	lines_inst.mesh = lines
	lines_inst.material_override = line_mat
	add_child(lines_inst)

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
	star_mm.instance_count = 300
	for i in range(300):
		var dir := Vector3(rng.randf_range(-1, 1), rng.randf_range(-1, 1), rng.randf_range(-1, 1)).normalized()
		var t := Transform3D(Basis(), dir * rng.randf_range(120.0, 220.0))
		star_mm.set_instance_transform(i, t)
	var star_inst := MultiMeshInstance3D.new()
	star_inst.multimesh = star_mm
	add_child(star_inst)

	# Cells MultiMesh
	var box := BoxMesh.new()
	box.size = Vector3(0.9, 0.9, 0.9)
	var box_mat := StandardMaterial3D.new()
	box_mat.roughness = 0.35
	box_mat.metallic = 0.15
	box.material = box_mat
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = box
	multimesh.instance_count = MAX_CELLS
	multimesh_instance = MultiMeshInstance3D.new()
	multimesh_instance.multimesh = multimesh
	multimesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(multimesh_instance)

	# Invisible picker volume for raycasts
	picker_body = StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box_shape := BoxShape3D.new()
	box_shape.size = Vector3(GX, GY, GZ)
	shape.shape = box_shape
	picker_body.add_child(shape)
	add_child(picker_body)

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
	top.add_theme_constant_override("separation", 10)
	root.add_child(top)

	var title := Label.new()
	title.text = "🧬 EVOLUTION EXPLORER"
	title.add_theme_font_size_override("font_size", 18)
	top.add_child(title)

	gen_label = Label.new()
	gen_label.text = "GEN 0"
	top.add_child(gen_label)
	pop_label = Label.new()
	pop_label.text = "POP 0"
	top.add_child(pop_label)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(spacer)

	play_button = Button.new()
	play_button.text = "⏸ Pause"
	play_button.pressed.connect(_toggle_play)
	top.add_child(play_button)

	var clear_btn := Button.new()
	clear_btn.text = "🗑 Clear"
	clear_btn.pressed.connect(func() -> void:
		clear_world()
		_update_hud()
	)
	top.add_child(clear_btn)

	var random_btn := Button.new()
	random_btn.text = "🎲 Random"
	random_btn.pressed.connect(func() -> void:
		seed_soup(0.18)
		_update_hud()
	)
	top.add_child(random_btn)

	var step_btn := Button.new()
	step_btn.text = "⏭ Step"
	step_btn.pressed.connect(func() -> void:
		step_simulation()
		_update_hud()
	)
	top.add_child(step_btn)

	# Left panel
	var left := VBoxContainer.new()
	left.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	left.offset_left = 12
	left.offset_top = -160
	left.offset_bottom = 160
	left.add_theme_constant_override("separation", 6)
	root.add_child(left)

	left.add_child(_panel_title("TOOLS"))
	for entry in [["paint", "🖌️ Paint (1)"], ["erase", "🧽 Erase (2)"], ["bomb", "💣 Bomb (3)"], ["stamp", "🔷 Stamp (4)"]]:
		var b := Button.new()
		b.text = entry[1]
		b.toggle_mode = true
		b.pressed.connect(_on_tool_pressed.bind(entry[0]))
		tool_buttons[entry[0]] = b
		left.add_child(b)
	tool_buttons["paint"].button_pressed = true

	stamp_option = OptionButton.new()
	for s in ["glider", "lwss", "pulsar", "acorn", "rpent", "gun", "cube", "helix"]:
		stamp_option.add_item(s)
	stamp_option.item_selected.connect(func(i: int) -> void: stamp_kind = stamp_option.get_item_text(i))
	left.add_child(stamp_option)

	brush_slider = HSlider.new()
	brush_slider.min_value = 1
	brush_slider.max_value = 6
	brush_slider.step = 1
	brush_slider.value = 2
	brush_slider.value_changed.connect(func(v: float) -> void:
		brush_size = int(v)
		brush_value.text = "Brush: %d" % brush_size
	)
	left.add_child(brush_slider)
	brush_value = Label.new()
	brush_value.text = "Brush: 2"
	left.add_child(brush_value)

	# Right panel
	var right := VBoxContainer.new()
	right.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	right.offset_right = -12
	right.offset_top = -160
	right.offset_bottom = 160
	right.add_theme_constant_override("separation", 6)
	root.add_child(right)

	right.add_child(_panel_title("RULES"))
	rule_option = OptionButton.new()
	for rname in RULES.keys():
		rule_option.add_item(rname)
	rule_option.item_selected.connect(func(i: int) -> void: _apply_rule(rule_option.get_item_text(i)))
	right.add_child(rule_option)

	wrap_toggle = CheckBox.new()
	wrap_toggle.text = "Wrap edges"
	wrap_toggle.button_pressed = true
	wrap_toggle.toggled.connect(func(on: bool) -> void: wrap_edges = on)
	right.add_child(wrap_toggle)

	var orbit_toggle := CheckBox.new()
	orbit_toggle.text = "Auto-orbit"
	orbit_toggle.toggled.connect(func(on: bool) -> void: auto_orbit = on)
	right.add_child(orbit_toggle)

	speed_slider = HSlider.new()
	speed_slider.min_value = 1
	speed_slider.max_value = 30
	speed_slider.step = 1
	speed_slider.value = 6
	speed_slider.value_changed.connect(func(v: float) -> void:
		speed = v
		speed_value.text = "Speed: %d gen/s" % int(v)
	)
	right.add_child(speed_slider)
	speed_value = Label.new()
	speed_value.text = "Speed: 6 gen/s"
	right.add_child(speed_value)

	hint_label = Label.new()
	hint_label.text = "🖌️ Paint life — drag on the world. Right-drag to orbit, scroll to zoom."
	hint_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	hint_label.offset_left = -320
	hint_label.offset_right = 320
	hint_label.offset_top = -44
	hint_label.offset_bottom = -12
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(hint_label)

func _panel_title(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", 12)
	l.add_theme_color_override("font_color", Color(0.55, 0.58, 0.72))
	return l

func _on_tool_pressed(t: String) -> void:
	tool = t
	for key in tool_buttons.keys():
		tool_buttons[key].button_pressed = (key == t)
	var hints := {
		"paint": "🖌️ Paint life — drag on the world. Right-drag to orbit, scroll to zoom.",
		"erase": "🧽 Erase — drag to remove life. Right-drag to orbit.",
		"bomb": "💣 Bomb — click/drag to blast a crater.",
		"stamp": "🔷 Stamp — pick a pattern, then click the world to place it.",
	}
	hint_label.text = hints.get(t, "")

func _toggle_play() -> void:
	running = not running
	play_button.text = "▶ Play" if not running else "⏸ Pause"

# ── Simulation ──────────────────────────────────────────────────
func count_neighbors(x: int, y: int, z: int) -> int:
	var n := 0
	for dy in range(-1, 2):
		for dz in range(-1, 2):
			for dx in range(-1, 2):
				if dx == 0 and dy == 0 and dz == 0:
					continue
				var nx := x + dx
				var ny := y + dy
				var nz := z + dz
				if wrap_edges:
					nx = posmod(nx, GX)
					ny = posmod(ny, GY)
					nz = posmod(nz, GZ)
				elif nx < 0 or ny < 0 or nz < 0 or nx >= GX or ny >= GY or nz >= GZ:
					continue
				if grid[idx(nx, ny, nz)] == 1:
					n += 1
	return n

func step_simulation() -> void:
	for y in range(GY):
		for z in range(GZ):
			for x in range(GX):
				var i := idx(x, y, z)
				var alive := grid[i] == 1
				var n := count_neighbors(x, y, z)
				var next := false
				if alive:
					next = survive_set.has(n)
				else:
					next = birth_set.has(n)
				next_grid[i] = 1 if next else 0
				if next:
					if not alive:
						ages[i] = 0
					else:
						ages[i] += 1
	var tmp := grid
	grid = next_grid
	next_grid = tmp
	generation += 1
	_recount()

func _recount() -> void:
	var p := 0
	for i in range(MAX_CELLS):
		if grid[i] == 1:
			p += 1
	population = p

func clear_world() -> void:
	grid.fill(0)
	ages.fill(0)
	generation = 0
	population = 0

func seed_soup(density: float) -> void:
	clear_world()
	for i in range(MAX_CELLS):
		if rng.randf() < density:
			grid[i] = 1
			ages[i] = rng.randi_range(0, 3)
	_recount()

func set_cell(x: int, y: int, z: int, v: int) -> void:
	if wrap_edges:
		x = posmod(x, GX)
		y = posmod(y, GY)
		z = posmod(z, GZ)
	elif x < 0 or y < 0 or z < 0 or x >= GX or y >= GY or z >= GZ:
		return
	var i := idx(x, y, z)
	grid[i] = v
	if v == 1:
		ages[i] = 0

func stamp_pattern(kind: String, cx: int, cy: int, cz: int) -> void:
	var cells := _pattern_cells(kind)
	var ox := cx - 3
	var oz := cz - 3
	for c in cells:
		set_cell(ox + c[0], cy + c[1], oz + c[2], 1)
	_recount()

func _pattern_cells(kind: String) -> Array:
	match kind:
		"glider":
			return [[1, 0, 0], [2, 0, 1], [0, 0, 2], [1, 0, 2], [2, 0, 2]]
		"lwss":
			return [[1, 0, 0], [3, 0, 0], [0, 0, 1], [4, 0, 1], [0, 0, 2], [1, 0, 2], [2, 0, 2], [3, 0, 2]]
		"acorn":
			return [[1, 0, 0], [3, 0, 0], [0, 0, 1], [3, 0, 1], [4, 0, 1], [5, 0, 1], [6, 0, 1]]
		"rpent":
			return [[1, 0, 0], [2, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 2]]
		"pulsar":
			var cells: Array = []
			var rows := {0: [2, 3, 4, 10, 11, 12], 2: [0, 5, 7, 12], 3: [0, 5, 7, 12], 4: [0, 5, 7, 12], 5: [2, 3, 4, 10, 11, 12], 7: [2, 3, 4, 10, 11, 12], 8: [0, 5, 7, 12], 9: [0, 5, 7, 12], 10: [0, 5, 7, 12], 12: [2, 3, 4, 10, 11, 12]}
			for r in rows.keys():
				for c in rows[r]:
					cells.append([c, 0, r])
			return cells
		"gun":
			var pts := [[1, 5], [2, 5], [1, 6], [2, 6], [11, 5], [11, 6], [11, 7], [12, 4], [12, 8], [13, 3], [13, 9], [14, 3], [14, 9], [15, 6], [16, 2], [16, 10], [17, 2], [17, 10], [18, 6], [19, 1], [19, 11], [20, 1], [20, 11], [21, 2], [21, 10], [22, 3], [22, 9], [23, 4], [23, 8], [24, 5], [24, 6], [24, 7], [35, 3], [35, 4], [36, 2], [36, 6], [37, 2], [37, 6], [38, 3], [38, 4]]
			var cells: Array = []
			for p in pts:
				cells.append([p[0], 0, p[1]])
			return cells
		"cube":
			var cells: Array = []
			for x in range(3):
				for y in range(3):
					for z in range(3):
						cells.append([x, y, z])
			return cells
		"helix":
			var cells: Array = []
			for i in range(22):
				var a := float(i) * 0.55
				cells.append([int(round(3.0 + 2.4 * cos(a))), i, int(round(3.0 + 2.4 * sin(a)))])
				cells.append([int(round(3.0 + 2.4 * cos(a + PI))), i, int(round(3.0 + 2.4 * sin(a + PI)))])
				if i % 2 == 0:
					cells.append([3, i, 3])
			return cells
	return []

# ── Rendering ───────────────────────────────────────────────────
func _age_color(a: int) -> Color:
	if a == 0:
		return Color.from_hsv(0.52, 1.0, 0.95)
	elif a == 1:
		return Color.from_hsv(0.46, 0.95, 0.75)
	elif a <= 3:
		return Color.from_hsv(0.30, 0.9, 0.7)
	elif a <= 7:
		return Color.from_hsv(0.10, 0.95, 0.7)
	elif a <= 14:
		return Color.from_hsv(0.86, 0.9, 0.75)
	return Color.from_hsv(0.74, 0.85, 0.8)

func _render_cells() -> void:
	var n := 0
	for y in range(GY):
		for z in range(GZ):
			for x in range(GX):
				var i := idx(x, y, z)
				if grid[i] != 1:
					continue
				var pos := Vector3(float(x) - GX * 0.5 + 0.5, float(y) - GY * 0.5 + 0.5, float(z) - GZ * 0.5 + 0.5)
				multimesh.set_instance_transform(n, Transform3D(Basis(), pos))
				var c := _age_color(ages[i])
				var shade := 0.72 + 0.28 * (float(y) / float(GY))
				multimesh.set_instance_color(n, Color(c.r * shade, c.g * shade, c.b * shade))
				n += 1
	multimesh.visible_instance_count = n

func _update_hud() -> void:
	gen_label.text = "GEN %d" % generation
	pop_label.text = "POP %d" % population

# ── Input ───────────────────────────────────────────────────────
var _drag_mode := ""
var _last_mouse := Vector2.ZERO
var _last_tool_ms := 0

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			if Input.is_key_pressed(KEY_SHIFT):
				brush_size = clampi(brush_size + 1, 1, 6)
				brush_slider.value = brush_size
				brush_value.text = "Brush: %d" % brush_size
			else:
				cam_desired_radius *= 0.9
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			if Input.is_key_pressed(KEY_SHIFT):
				brush_size = clampi(brush_size - 1, 1, 6)
				brush_slider.value = brush_size
				brush_value.text = "Brush: %d" % brush_size
			else:
				cam_desired_radius *= 1.1
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				_last_mouse = mb.position
				var v := _pick_voxel(mb.position)
				if v != Vector3i(-1, -1, -1):
					_drag_mode = "paint"
					_apply_tool(v)
				else:
					_drag_mode = "orbit"
			else:
				_drag_mode = ""
		elif mb.button_index == MOUSE_BUTTON_RIGHT or mb.button_index == MOUSE_BUTTON_MIDDLE:
			_drag_mode = "pan" if mb.pressed else ""
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		var delta := mm.position - _last_mouse
		_last_mouse = mm.position
		if _drag_mode == "paint":
			var v := _pick_voxel(mm.position)
			if v != Vector3i(-1, -1, -1):
				_apply_tool(v)
		elif _drag_mode == "orbit":
			cam_desired_theta -= delta.x * 0.008
			cam_desired_phi -= delta.y * 0.008
		elif _drag_mode == "pan":
			var scale := cam_radius * 0.0016
			var right := camera.global_transform.basis.x
			var up := camera.global_transform.basis.y
			cam_desired_target -= right * delta.x * scale
			cam_desired_target += up * delta.y * scale
	elif event is InputEventKey:
		var k := event as InputEventKey
		if not k.pressed or k.echo:
			return
		match k.keycode:
			KEY_SPACE:
				_toggle_play()
			KEY_PERIOD:
				step_simulation()
				_update_hud()
			KEY_C:
				clear_world()
				_update_hud()
			KEY_R:
				seed_soup(0.18)
				_update_hud()
			KEY_1:
				_on_tool_pressed("paint")
			KEY_2:
				_on_tool_pressed("erase")
			KEY_3:
				_on_tool_pressed("bomb")
			KEY_4:
				_on_tool_pressed("stamp")
			KEY_BRACKETLEFT:
				brush_size = clampi(brush_size - 1, 1, 6)
				brush_slider.value = brush_size
				brush_value.text = "Brush: %d" % brush_size
			KEY_BRACKETRIGHT:
				brush_size = clampi(brush_size + 1, 1, 6)
				brush_slider.value = brush_size
				brush_value.text = "Brush: %d" % brush_size
			KEY_Q:
				cam_desired_theta += 0.25
			KEY_E:
				cam_desired_theta -= 0.25
			KEY_W, KEY_UP:
				_pan_keys(0, 1)
			KEY_S, KEY_DOWN:
				_pan_keys(0, -1)
			KEY_A, KEY_LEFT:
				_pan_keys(-1, 0)
			KEY_D, KEY_RIGHT:
				_pan_keys(1, 0)

func _pan_keys(fx: int, fy: int) -> void:
	var scale := cam_radius * 0.06
	var right := camera.global_transform.basis.x
	var fwd := -camera.global_transform.basis.z
	fwd.y = 0
	fwd = fwd.normalized()
	cam_desired_target += right * float(fx) * scale + fwd * float(fy) * scale

func _pick_voxel(screen_pos: Vector2) -> Vector3i:
	var from := camera.project_ray_origin(screen_pos)
	var to := from + camera.project_ray_normal(screen_pos) * 300.0
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.collision_mask = 1
	var space := get_world_3d().direct_space_state
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		return Vector3i(-1, -1, -1)
	var p: Vector3 = hit["position"]
	var x := int(floor(p.x + GX * 0.5))
	var y := int(floor(p.y + GY * 0.5))
	var z := int(floor(p.z + GZ * 0.5))
	if x < 0 or y < 0 or z < 0 or x >= GX or y >= GY or z >= GZ:
		return Vector3i(-1, -1, -1)
	return Vector3i(x, y, z)

func _apply_tool(v: Vector3i) -> void:
	var now := Time.get_ticks_msec()
	if tool == "paint" or tool == "erase":
		var r := float(brush_size) * 0.75
		var R := int(ceil(r))
		var val := 1 if tool == "paint" else 0
		for dy in range(-R, R + 1):
			for dz in range(-R, R + 1):
				for dx in range(-R, R + 1):
					if float(dx * dx + dy * dy + dz * dz) <= r * r:
						set_cell(v.x + dx, v.y + dy, v.z + dz, val)
		_recount()
	elif tool == "bomb":
		if now - _last_tool_ms < 110:
			return
		_last_tool_ms = now
		var r := 3.4
		var R := 4
		for dy in range(-R, R + 1):
			for dz in range(-R, R + 1):
				for dx in range(-R, R + 1):
					if float(dx * dx + dy * dy + dz * dz) <= r * r:
						set_cell(v.x + dx, v.y + dy, v.z + dz, 0)
		_recount()
	elif tool == "stamp":
		if now - _last_tool_ms < 200:
			return
		_last_tool_ms = now
		stamp_pattern(stamp_kind, v.x, v.y, v.z)

# ── Main loop ───────────────────────────────────────────────────
func _process(delta: float) -> void:
	if running:
		sim_acc += delta * speed
		while sim_acc >= 1.0:
			step_simulation()
			sim_acc -= 1.0
		_update_hud()
	_render_cells()

	if auto_orbit:
		cam_desired_theta += delta * 0.12
	var k := 1.0 - pow(0.0001, delta)
	cam_theta += (cam_desired_theta - cam_theta) * k
	cam_phi += (cam_desired_phi - cam_phi) * k
	cam_radius += (cam_desired_radius - cam_radius) * k
	cam_target = cam_target.lerp(cam_desired_target, k)
	cam_phi = clampf(cam_phi, 0.12, PI - 0.12)
	cam_radius = clampf(cam_radius, 7.0, 110.0)
	var sp := sin(cam_phi)
	camera.position = cam_target + Vector3(
		cam_radius * sp * sin(cam_theta),
		cam_radius * cos(cam_phi),
		cam_radius * sp * cos(cam_theta))
	camera.look_at(cam_target)

	var t := Time.get_ticks_msec() / 1000.0 * 0.25
	var cyan := get_node_or_null("CyanLight") as OmniLight3D
	var mag := get_node_or_null("MagLight") as OmniLight3D
	if cyan:
		cyan.position = Vector3(cos(t) * 34.0, 14.0, sin(t) * 34.0)
	if mag:
		mag.position = Vector3(cos(t + PI) * 34.0, 10.0, sin(t + PI) * 34.0)
