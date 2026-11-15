extends Node
## Static one-shots only. No wind, walking cadence, live ducking or JS runtime.
const CUES = {
	"land": ["land_01", "land_02", "land_03"],
	"pickup": ["pickup_01", "pickup_02", "pickup_03"],
	"hurt": ["hurt_01", "hurt_02", "hurt_03"],
	"footstep": ["footstep_01", "footstep_02"]
}
const VOICES = 12
var streams: Dictionary = {}
var players: Array[AudioStreamPlayer] = []
var cursors: Dictionary = {}
var next_voice := 0
var started := 0
var stolen := 0
var last_error := ""

func read_bounded(path: String, limit: int) -> PackedByteArray:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return PackedByteArray()
	var length := file.get_length()
	if length <= 0 or length > limit:
		file.close()
		return PackedByteArray()
	var bytes := file.get_buffer(length)
	file.close()
	return bytes if bytes.size() == length else PackedByteArray()

func configure(base: String = "") -> bool:
	# Resolve relative to this script, so moving the whole kit into res://addons works.
	if base.is_empty():
		base = get_script().resource_path.get_base_dir()
	last_error = ""
	var manifest_path := base.path_join("manifest.json")
	var raw_manifest := read_bounded(manifest_path, 65536)
	if raw_manifest.is_empty():
		last_error = "Missing or oversized cue manifest."
		return false
	var parser := JSON.new()
	if parser.parse(raw_manifest.get_string_from_utf8()) != OK:
		last_error = "Invalid cue manifest JSON."
		return false
	var manifest = parser.data
	if not manifest is Dictionary or not manifest.get("clips") is Array or manifest.clips.size() != 11:
		last_error = "Expected the SoundRig eleven-cue manifest."
		return false
	var hashes: Dictionary = {}
	for clip in manifest.clips:
		if not clip is Dictionary or not clip.get("id") is String or not clip.get("wavSHA256") is String or hashes.has(clip.id):
			last_error = "Invalid or duplicate cue declaration."
			return false
		hashes[clip.id] = clip.wavSHA256
	var candidate: Dictionary = {}
	var total_frames := 0
	for choices in CUES.values():
		for id in choices:
			# Manifest/user metadata never supplies a resource path or executable code.
			var path := base.path_join("audio/" + id + ".wav")
			var bytes := read_bounded(path, 201644)
			if bytes.is_empty():
				last_error = "Missing or oversized cue: " + id
				return false
			if bytes.size() < 44 or bytes.slice(0, 4).get_string_from_ascii() != "RIFF" or bytes.slice(8, 16).get_string_from_ascii() != "WAVEfmt " or bytes.decode_u32(4) != bytes.size() - 8 or bytes.decode_u32(16) != 16 or bytes.decode_u16(20) != 1 or bytes.decode_u16(22) != 1 or bytes.decode_u32(24) != 48000 or bytes.decode_u32(28) != 96000 or bytes.decode_u16(32) != 2 or bytes.decode_u16(34) != 16 or bytes.slice(36, 40).get_string_from_ascii() != "data" or bytes.decode_u32(40) != bytes.size() - 44 or (bytes.size() - 44) % 2 != 0:
				last_error = "Invalid PCM16 mono 48 kHz WAV: " + id
				return false
			var hasher := HashingContext.new()
			hasher.start(HashingContext.HASH_SHA256)
			hasher.update(bytes)
			if hasher.finish().hex_encode() != hashes.get(id, ""):
				last_error = "Cue hash mismatch: " + id
				return false
			total_frames += (bytes.size() - 44) / 2
			if total_frames > 24 * 48000:
				last_error = "Cue bank exceeds 24 seconds."
				return false
			var stream := AudioStreamWAV.new()
			stream.format = AudioStreamWAV.FORMAT_16_BITS
			stream.mix_rate = 48000
			stream.stereo = false
			stream.loop_mode = AudioStreamWAV.LOOP_DISABLED
			stream.data = bytes.slice(44)
			candidate[id] = stream
	stop_all()
	streams = candidate
	cursors.clear()
	if players.is_empty():
		for i in range(VOICES):
			var player := AudioStreamPlayer.new()
			add_child(player)
			players.append(player)
	return true

func play_cue(cue: String, gain: float = 1.0) -> bool:
	if not CUES.has(cue) or streams.size() != 11 or not is_finite(gain) or gain <= 0.0 or gain > 1.0:
		return false
	var choices: Array = CUES[cue]
	var index: int = cursors.get(cue, 0)
	var id: String = choices[index % choices.size()]
	cursors[cue] = index + 1
	var player := players[next_voice]
	next_voice = (next_voice + 1) % VOICES
	if player.playing:
		stolen += 1
	player.stop()
	player.stream = streams[id]
	player.volume_db = linear_to_db(gain)
	player.play()
	started += 1
	return true

func stop_all() -> void:
	for player in players:
		player.stop()
		player.stream = null

func active_voices() -> int:
	var count := 0
	for player in players:
		if player.playing:
			count += 1
	return count

func _exit_tree() -> void:
	stop_all()
	streams.clear()
	players.clear()
	cursors.clear()
