extends SceneTree

# Run with XDG_DATA_HOME set to a temporary directory: these tests save a pilot.
var failures: int = 0

func _initialize() -> void:
	call_deferred("run_tests")

func check(label: String, condition: bool) -> void:
	if condition:
		print("  ✓ ", label)
	else:
		failures += 1
		printerr("  ✗ ", label)

func board_hash(board: PackedByteArray) -> int:
	var h: int = 2166136261
	for cell in board:
		h = ((h ^ int(cell)) * 16777619) & 0xFFFFFFFF
	return h

func run_tests() -> void:
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.set_process(false)
	var fixture = JSON.parse_string(FileAccess.get_file_as_string("res://tools/fixtures/world-seeds.json"))
	if fixture == null:
		printerr("Could not load shared world seed fixtures")
		quit(1)
		return
	for id in fixture["worlds"]:
		game.active_world = game.worlds_by_id[id]
		game.rng_state = int(fixture["seed"])
		game.seed_world()
		var expected: Dictionary = fixture["worlds"][id]
		check("shared seed fixture: " + id, game.population == int(expected["population"]) and board_hash(game.cells) == int(expected["cell_hash"]))
	for date in fixture["dates"]:
		check("shared daily hash fixture: " + date, game.daily_seed_hash(date) == int(fixture["dates"][date]))
	for id in ["life", "highlife"]:
		game.active_world = game.worlds_by_id[id]
		game.cells.fill(0)
		game.ages.fill(0)
		game.pattern_snapshots.clear()
		game.oscillator_tracks.clear()
		game.explosion_queue.clear()
		game.place_pattern([".O.", "..O", "OOO"], Vector2i(30, 30), 1)
		for g in range(4):
			game.step_simulation()
		var expected_cells: PackedByteArray = PackedByteArray()
		expected_cells.resize(game.TOTAL)
		for point in [Vector2i(32, 31), Vector2i(33, 32), Vector2i(31, 33), Vector2i(32, 33), Vector2i(33, 33)]:
			expected_cells[game.index_of(point.x, point.y)] = 1
		check("glider travels one cell in " + id, game.cells == expected_cells)
	var rows: String = "a1.7/" + "/".join([".8", ".8", ".8", ".8", ".8", ".8", ".8"])
	var save_fixture: Dictionary = fixture["ecosystem"]
	check("shared ecosystem checksum fixture", game.ecosystem_checksum(save_fixture["payload"]) == save_fixture["checksum"] and game.decode_ecosystem(save_fixture["payload"] + ";" + save_fixture["checksum"]))
	var full_code: String = game.encode_ecosystem()
	check("ecosystem saves include checksum", full_code.begins_with("EVO2;"))
	var bad_checksum: String = full_code.substr(0, full_code.length() - 1) + ("1" if full_code.ends_with("0") else "0")
	check("checksum rejects corruption", not game.decode_ecosystem(bad_checksum))
	var previous: PackedByteArray = game.cells.duplicate()
	check("ecosystem code round trips", game.decode_ecosystem(full_code) and game.cells == previous)
	check("legacy ecosystem is centred", game.decode_ecosystem("EVO1;8;" + rows) and game.cells[game.index_of(28, 28)] == 1 and game.population == 1)
	previous = game.cells.duplicate()
	for bad in ["EVO1;8junk;" + rows, "EVO1;+8;" + rows, "EVO1;8;" + rows + "/", "EVO1;;8;" + rows, "EVO1;8;a9/" + "/".join([".8", ".8", ".8", ".8", ".8", ".8", ".8"])]:
		check("reject malformed ecosystem: " + bad.substr(0, 16), not game.decode_ecosystem(bad) and game.cells == previous)
	game.build_touch_controls()
	var fly: Button = game.find_child("Touch_Fly_▲", true, false)
	var look: Button = game.find_child("Touch_Look_◀", true, false)
	var more: Button = game.find_child("Touch_More", true, false)
	check("touch controls created", fly != null and look != null and more != null)
	if fly != null and look != null and more != null:
		fly.button_down.emit()
		look.button_down.emit()
		check("touch holds multiple flight controls", game.flight_key_pressed(KEY_W) and game.flight_key_pressed(KEY_LEFT))
		fly.button_up.emit()
		check("touch release leaves other hold active", not game.flight_key_pressed(KEY_W) and game.flight_key_pressed(KEY_LEFT))
		game.notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
		check("focus loss releases touch controls", game.touch_held.is_empty())
		more.pressed.emit()
		check("touch more menu opens", game.touch_more.visible)
		game.touch_action(KEY_2)
		check("touch action changes brush", game.brush_species == 2)
	game.pilot["xp"] = 0
	game.pilot["level"] = 1
	game.aurora_ttl = 0
	game.add_xp(7)
	game.pilot["xp"] = 0
	game.load_pilot()
	check("XP below level threshold survives reload", int(game.pilot["xp"]) == 7)
	game.queue_free()
	print("Godot runtime tests: ", failures, " failure(s)")
	quit(1 if failures else 0)
