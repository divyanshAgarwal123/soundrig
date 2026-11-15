class_name Game
extends Node


@onready var _pause_menu := $InterfaceLayer/PauseMenu as PauseMenu


func _unhandled_input(input_event: InputEvent) -> void:
	if input_event.is_action_pressed(&"toggle_fullscreen"):
		var mode := DisplayServer.window_get_mode()
		if mode == DisplayServer.WINDOW_MODE_FULLSCREEN or \
				mode == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		else:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		get_tree().root.set_input_as_handled()

	elif input_event.is_action_pressed(&"toggle_pause"):
		var tree := get_tree()
		tree.paused = not tree.paused
		if tree.paused:
			_pause_menu.open()
		else:
			_pause_menu.close()
		get_tree().root.set_input_as_handled()


# SoundRig integration: one connection; subsequent kit replacements keep this call.
var soundrig_kit: Node

func _ready() -> void:
	soundrig_kit = preload("res://soundrig/soundrig.gd").new()
	add_child(soundrig_kit)
	assert(soundrig_kit.configure(), soundrig_kit.last_error)
	$Level/Player.coin_collected.connect(func(): soundrig_kit.play_cue("pickup"))
