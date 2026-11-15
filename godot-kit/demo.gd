extends Control
const Kit = preload("soundrig.gd")
var kit := Kit.new()
var report := Label.new()

func _ready() -> void:
	add_child(kit)
	var column := VBoxContainer.new()
	column.position = Vector2(32, 28)
	column.size = Vector2(780, 480)
	column.add_theme_constant_override("separation", 18)
	add_child(column)
	var title := Label.new()
	title.text = "SoundRig. In your game."
	title.add_theme_font_size_override("font_size", 36)
	column.add_child(title)
	var note := Label.new()
	note.text = "Static one-shots. No wind, walking cadence or live ducking.\nThe WAVs already include your mix. Playback needs no model."
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(note)
	var valid := kit.configure()
	for cue in ["land", "pickup", "hurt", "footstep"]:
		var button := Button.new()
		button.text = "Play " + cue
		button.custom_minimum_size.y = 48
		button.disabled = not valid
		button.pressed.connect(func():
			kit.play_cue(cue)
			report.text = "Started " + cue + " / " + str(kit.started) + " total cue starts")
		column.add_child(button)
	column.add_child(report)
	report.text = "11 WAVs verified. Choose a cue." if valid else kit.last_error
	var stop := Button.new()
	stop.text = "Stop all"
	stop.pressed.connect(func(): kit.stop_all(); report.text = "Playback stopped.")
	column.add_child(stop)
	column.modulate = Color(0.13, 0.13, 0.11)
