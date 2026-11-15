extends SceneTree
var pickups := 0

func _initialize() -> void:
	call_deferred("run_checks")

func run_checks() -> void:
	var game = load("res://game_singleplayer.tscn").instantiate()
	root.add_child(game)
	current_scene = game
	root.get_node("Music").stop()
	var player = game.get_node("Level/Player")
	player.coin_collected.connect(func(): pickups += 1)
	await physics_frame
	var coins = game.get_node("Level/Coins/CoinsHorizontal1").get_children()
	var before := pickups
	player.global_position = coins[0].global_position
	player.velocity = Vector2.ZERO
	for i in range(6):
		await physics_frame
	assert(pickups > before, "Actual physics overlap did not collect the first coin")
	before = pickups
	player.global_position = coins[2].global_position
	player.velocity = Vector2.ZERO
	for i in range(6):
		await physics_frame
	assert(pickups > before, "Actual physics overlap did not collect another coin")
	assert(game.soundrig_kit.started == pickups)
	assert(game.soundrig_kit.streams.size() == 11)
	game.soundrig_kit.stop_all()
	assert(game.soundrig_kit.active_voices() == 0)
	print(JSON.stringify({"pass": true, "actualCoinSignals": pickups, "soundrigStarts": game.soundrig_kit.started, "voicePool": game.soundrig_kit.players.size(), "source": "Godot official 2D platformer, controlled player teleports causing physics overlaps", "scope": "Native game integration under Dummy audio driver; no human play or listening judgment"}))
	game.queue_free()
	await create_timer(0.3).timeout
	quit(0)
