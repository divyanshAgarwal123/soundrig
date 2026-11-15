"""Rebuild the small CC0 catalog from official, locally downloaded Kenney archives."""
from pathlib import Path
import base64, hashlib, json, math, struct, subprocess, wave, zipfile

ROOT = Path(__file__).resolve().parent
SOURCES = ROOT.parent.parent / 'resources/soundrig-kenney'
CHOSEN = [
    ('step_concrete_a', 'impact', 'footstep_concrete_000', 'Concrete footstep A'),
    ('step_concrete_b', 'impact', 'footstep_concrete_001', 'Concrete footstep B'),
    ('step_wood_a', 'impact', 'footstep_wood_000', 'Wood footstep A'),
    ('step_wood_b', 'impact', 'footstep_wood_001', 'Wood footstep B'),
    ('land_soft_a', 'impact', 'impactSoft_heavy_000', 'Soft heavy landing A'),
    ('land_soft_b', 'impact', 'impactSoft_heavy_001', 'Soft heavy landing B'),
    ('pickup_confirm', 'interface', 'confirmation_001', 'Pickup confirmation'),
    ('hurt_error', 'interface', 'error_001', 'Hurt alert'),
]
catalog, licenses, archives = {}, {}, {}
for pack in ['impact', 'interface']:
    path = SOURCES / (pack + '.zip')
    archive = zipfile.ZipFile(path)
    license_name = next(n for n in archive.namelist() if n.lower().endswith('license.txt'))
    text = archive.read(license_name).decode()
    assert 'Creative Commons Zero, CC0' in text
    licenses[pack] = text
    (ROOT / 'licenses' / (pack + '-CC0.txt')).write_text(text)
    archives[pack] = {'page': 'https://kenney.nl/assets/' + ('impact-sounds' if pack == 'impact' else 'interface-sounds'),
        'archiveSHA256': hashlib.sha256(path.read_bytes()).hexdigest(), 'author': 'Kenney', 'license': 'CC0-1.0'}

for asset_id, pack, basename, title in CHOSEN:
    archive = zipfile.ZipFile(SOURCES / (pack + '.zip'))
    member = 'Audio/' + basename + '.ogg'
    original = archive.read(member)
    ogg = ROOT / 'assets' / (asset_id + '.ogg'); ogg.write_bytes(original)
    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(ogg), '-ac', '1', '-ar', '24000', '-f', 's16le', '-'],
        check=True, capture_output=True).stdout
    samples = [x / 32768 for x in struct.unpack('<' + 'h' * (len(decoded) // 2), decoded)]
    peak = max(map(abs, samples)); threshold = max(.0005, peak * .005)
    audible = [i for i, x in enumerate(samples) if abs(x) > threshold]
    first, last = max(0, audible[0] - 48), min(len(samples), audible[-1] + 49)
    samples = samples[first:last]
    rms = math.sqrt(sum(x*x for x in samples) / len(samples))
    gain = min(.18 / rms, .9 / max(map(abs, samples)))
    for i in range(len(samples)):
        fade = min(1, i / 48, (len(samples) - 1 - i) / 48)
        samples[i] = round(max(-.9, min(.9, samples[i] * gain * fade)) * 32767)
    pcm = struct.pack('<' + 'h' * len(samples), *samples)
    assert len(samples) <= 36000
    with wave.open(str(ROOT / 'assets' / (asset_id + '.wav')), 'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(24000); out.writeframes(pcm)
    catalog[asset_id] = {'title': title, 'pack': pack, 'sourceFile': member,
        'sourceSHA256': hashlib.sha256(original).hexdigest(), 'pcmSHA256': hashlib.sha256(pcm).hexdigest(),
        'sampleRate': 24000, 'frames': len(samples), 'seconds': round(len(samples)/24000, 6),
        'peak': max(map(abs, samples))/32768, 'rms': math.sqrt(sum(x*x for x in samples)/len(samples))/32768,
        'trimmedLeadingSeconds': first/24000, 'pcm16': base64.b64encode(pcm).decode(), **archives[pack]}

encoded = sum(len(x['pcm16']) for x in catalog.values())
frames = sum(x['frames'] for x in catalog.values())
assert frames <= 6 * 24000 and frames * 4 <= 1024 * 1024 and encoded <= 512 * 1024
metadata = {key: {k:v for k,v in value.items() if k != 'pcm16'} for key,value in catalog.items()}
(ROOT / 'assets/catalog.json').write_text(json.dumps(metadata, indent=2))
(ROOT / 'assets/provenance.json').write_text(json.dumps({'archives': archives, 'preparation': 'ffmpeg mono24k PCM16; trim below0.5% peak preserving2ms; RMS target0.18/peak cap0.9;2ms endpoint fade. No perceptual-quality guarantee.', 'encodedBytes': encoded, 'decodedFloatBytes': frames * 4, 'assets': metadata}, indent=2))
source = '''// Kenney CC0 audio. Prepared PCM and provenance are immutable build inputs, not model outputs.
export const SAMPLE_PACK = Object.freeze(PACK);
const decodedSamples = new Map();
function decodePCM16(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(Math.floor(text.length * 3 / 4) - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0));
  let value = 0, bits = 0, cursor = 0;
  for (const char of text) { if (char === '=') break; const n = alphabet.indexOf(char); if (n < 0) throw Error('Invalid embedded PCM'); value = (value << 6) | n; bits += 6; if (bits >= 8) { bits -= 8; bytes[cursor++] = (value >>> bits) & 255; } }
  const data = new DataView(bytes.buffer), pcm = new Float32Array(bytes.length / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = data.getInt16(i * 2, true) / 32768;
  return pcm;
}
export function getSample(id) {
  if (!Object.hasOwn(SAMPLE_PACK, id)) throw Error('Unknown sample: ' + id);
  if (!decodedSamples.has(id)) decodedSamples.set(id, {...SAMPLE_PACK[id], pcm: decodePCM16(SAMPLE_PACK[id].pcm16)});
  return decodedSamples.get(id);
}
for (const id of Object.keys(SAMPLE_PACK)) getSample(id);
export const SAMPLE_LICENSES = LICENSES;
'''.replace('Object.freeze(PACK)', 'Object.freeze(' + json.dumps(catalog, separators=(',', ':')) + ')').replace('= LICENSES;', '= ' + json.dumps(licenses) + ';')
(ROOT / 'samples.mjs').write_text(source)
print(json.dumps({'assets': len(catalog), 'frames': frames, 'encodedBytes': encoded, 'decodedFloatBytes': frames * 4, 'seconds': frames/24000, 'metadata': metadata}, indent=2))
