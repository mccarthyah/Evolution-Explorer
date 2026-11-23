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
	var full_code: String = game.encode_ecosystem()
	var previous: PackedByteArray = game.cells.duplicate()
	check("ecosystem code round trips", game.decode_ecosystem(full_code) and game.cells == previous)
	check("legacy ecosystem is centred", game.decode_ecosystem("EVO1;8;" + rows) and game.cells[game.index_of(28, 28)] == 1 and game.population == 1)
	previous = game.cells.duplicate()
	for bad in ["EVO1;8junk;" + rows, "EVO1;+8;" + rows, "EVO1;8;" + rows + "/", "EVO1;;8;" + rows, "EVO1;8;a9/" + "/".join([".8", ".8", ".8", ".8", ".8", ".8", ".8"])]:
		check("reject malformed ecosystem: " + bad.substr(0, 16), not game.decode_ecosystem(bad) and game.cells == previous)
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
