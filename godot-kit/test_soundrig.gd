extends SceneTree
const Kit = preload("soundrig.gd")

func _initialize() -> void:
	call_deferred("run_checks")

func run_checks() -> void:
	var kit := Kit.new()
	root.add_child(kit)
	var ok := kit.configure()
	if "--expect-reject" in OS.get_cmdline_user_args():
		assert(not ok and not kit.last_error.is_empty())
		assert(kit.streams.is_empty() and kit.players.is_empty())
		print(JSON.stringify({"pass": true, "rejected": kit.last_error}))
		kit.free()
		call_deferred("quit", 0)
		return
	assert(ok, kit.last_error)
	assert(kit.streams.size() == 11 and kit.players.size() == 12)
	assert(not kit.play_cue("../pickup") and not kit.play_cue("pickup", NAN))
	for cue in ["land", "pickup", "hurt", "footstep"]:
		assert(kit.play_cue(cue))
	await process_frame
	assert(kit.started == 4 and kit.active_voices() == 4)
	await create_timer(2.2).timeout
	assert(kit.active_voices() == 0)
	for i in range(30):
		assert(kit.play_cue("pickup"))
	await process_frame
	assert(kit.players.size() == 12 and kit.active_voices() <= 12 and kit.stolen > 0)
	kit.stop_all()
	assert(kit.active_voices() == 0)
	# Let the audio server consume queued play/stop commands before process shutdown.
	await create_timer(0.2).timeout
	print(JSON.stringify({"pass": true, "loadedCues": 11, "starts": kit.started, "voicePool": 12, "stolen": kit.stolen, "cleanup": true, "scope": "Godot playback state; no speaker/listener assessment"}))
	kit.free()
	await create_timer(0.1).timeout
	call_deferred("quit", 0)
