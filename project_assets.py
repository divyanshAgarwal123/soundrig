"""Bounded WAV preparation. Imported metadata never becomes a path or code."""
import base64
import hashlib
import io
import json
import math
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAX_BODY = 4 * 1024 * 1024


def text(value, limit, label):
    if not isinstance(value, str) or not value.strip() or len(value) > limit or any(ord(c) < 32 for c in value):
        raise ValueError(f'{label} must contain 1–{limit} printable characters.')
    return value.strip()


def prepare_wav(item):
    if not isinstance(item, dict) or set(item) != {'filename', 'license', 'wav64'}:
        raise ValueError('A WAV filename, source/license note and wav64 data are required.')
    filename = text(item['filename'], 100, 'Filename')
    note = text(item['license'], 240, 'Source/license note')
    encoded = item['wav64']
    if not isinstance(encoded, str) or len(encoded) > 550000:
        raise ValueError('WAV must be at most 400 KiB.')
    try:
        original = base64.b64decode(encoded, validate=True)
    except Exception as error:
        raise ValueError('Invalid WAV base64 data.') from error
    if len(original) > 409600 or len(original) < 44 or original[:4] != b'RIFF' or original[8:12] != b'WAVE':
        raise ValueError('Choose an uncompressed PCM16 WAV, at most 400 KiB.')
    if struct.unpack_from('<I', original, 4)[0] != len(original)-8:
        raise ValueError('WAV RIFF length is truncated or inconsistent.')
    cursor, chunks, seen, contents = 12, 0, set(), {}
    while cursor < len(original):
        if cursor+8 > len(original):
            raise ValueError('Truncated WAV chunk header.')
        kind, size = struct.unpack_from('<4sI', original, cursor)
        end = cursor+8+size
        if end+(size % 2) > len(original) or chunks >= 32:
            raise ValueError('WAV chunk length or count exceeds its bounds.')
        if kind in (b'fmt ', b'data') and kind in seen:
            raise ValueError('Duplicate WAV format/audio chunk.')
        if kind in (b'fmt ',b'data'):contents[kind]=original[cursor+8:end]
        seen.add(kind); chunks += 1; cursor = end+(size % 2)
    if not {b'fmt ', b'data'} <= seen:
        raise ValueError('WAV needs format and audio chunks.')
    if len(contents[b'fmt '])<16:
        raise ValueError('Truncated WAV format chunk.')
    format_tag,channels,rate,byte_rate,alignment,bits=struct.unpack_from('<HHIIHH',contents[b'fmt '])
    if format_tag!=1 or channels not in (1,2) or rate not in (24000,44100,48000) or bits!=16:
        raise ValueError('Use PCM16 mono/stereo at 24, 44.1 or 48 kHz.')
    if alignment!=channels*2 or byte_rate!=rate*alignment or len(contents[b'data'])%alignment:
        raise ValueError('WAV frame alignment, byte rate or audio length is inconsistent.')
    try:
        with wave.open(io.BytesIO(original), 'rb') as source:
            channels, rate, frames = source.getnchannels(), source.getframerate(), source.getnframes()
            if source.getsampwidth() != 2 or source.getcomptype() != 'NONE' or channels not in (1, 2) or rate not in (24000, 44100, 48000):
                raise ValueError('Use PCM16 mono/stereo at 24, 44.1 or 48 kHz.')
            if frames < rate*.004 or frames > rate*1.5:
                raise ValueError('Use a one-shot between 4 ms and 1.5 seconds.')
            raw = source.readframes(frames)
            if len(raw) != frames*channels*2:
                raise ValueError('Truncated WAV audio frames.')
    except (wave.Error, EOFError) as error:
        raise ValueError('Unsupported WAV. Export PCM16 mono/stereo at 24, 44.1 or 48 kHz.') from error
    values = [x[0]/32768 for x in struct.iter_unpack('<h', raw)]
    near_full_scale = sum(abs(x)>=.999 for x in values)
    mono = values if channels == 1 else [(values[i]+values[i+1])*.5 for i in range(0, len(values), 2)]
    original_dc = math.fsum(mono)/len(mono)
    raw_peak = max(map(abs,mono));edge_count=max(1,min(round(rate*.005),len(mono)//4))
    edges=mono[:edge_count]+mono[-edge_count:]
    baseline=math.fsum(edges)/len(edges) if max(edges)-min(edges)<=max(.0001,raw_peak*.01) else 0
    detected=[x-baseline for x in mono]
    peak = max(map(abs, detected))
    if peak < .0005:
        raise ValueError('Audio is silent or stereo channels cancel. Export a non-silent mono recording.')
    threshold = peak*.005
    first = next(i for i,x in enumerate(detected) if abs(x) >= threshold)
    last = len(detected)-next(i for i,x in enumerate(reversed(detected)) if abs(x) >= threshold)
    first = max(0, first-round(rate*.002)); last = min(len(mono), last+round(rate*.002))
    clip = mono[first:last]; fade = max(1, round(rate*.002))
    weights = [min(1, i/fade, (len(clip)-1-i)/fade) for i in range(len(clip))]
    center = math.fsum(x*w for x,w in zip(clip,weights))/math.fsum(weights)
    clip = [(x-center)*w for x,w in zip(clip,weights)]
    rms = math.sqrt(math.fsum(x*x for x in clip)/len(clip)); peak = max(map(abs, clip))
    if rms < .00005:
        raise ValueError('Prepared audio is too quiet. Use a non-silent recording.')
    gain = min(4, .12/rms, .8/peak)
    pcm = b''.join(struct.pack('<h', max(-32768, min(32767, round(x*gain*32768)))) for x in clip)
    samples = [x[0]/32768 for x in struct.iter_unpack('<h', pcm)]
    metadata = dict(title=filename, pack='project', sourceFile=filename, author='User supplied',
                    license='User-declared: '+note, licenseNote=note,
                    sourceSHA256=hashlib.sha256(original).hexdigest(), pcmSHA256=hashlib.sha256(pcm).hexdigest(),
                    sampleRate=rate, frames=len(samples), seconds=len(samples)/rate,
                    peak=max(map(abs,samples)), rms=math.sqrt(math.fsum(x*x for x in samples)/len(samples)),
                    dc=math.fsum(samples)/len(samples), sourceDC=original_dc, sourceChannels=channels,
                    sourceNearFullScaleSamples=near_full_scale,
                    trimmedLeadingSeconds=first/rate, trimmedTrailingSeconds=(frames-last)/rate,
                    preparationGain=gain, preparation='Stereo mean; digital/quiet-baseline padding trim before weighted DC removal; 2ms fades; RMS target0.12, gain≤4 and peak≤0.8; source rate retained. Full-scale source clipping cannot be recovered.',
                    pcm16=base64.b64encode(pcm).decode())
    return metadata


def prepare_project(data):
    if not isinstance(data, dict) or type(data.get('version')) is not int or data['version'] not in (1,2):
        raise ValueError('Project schema1 or2 required.')
    required={'version','name','rig','assets','clearMix'} | ({'quality'} if data['version']==2 else set())
    if set(data)!=required or data.get('quality','classic') not in ('classic','studio'):
        raise ValueError('Project requires name, rig, assets, clearMix and a supported schema2 quality.')
    text(data['name'], 80, 'Project name')
    if not isinstance(data['rig'], dict) or type(data['clearMix']) is not bool or not isinstance(data['assets'], dict):
        raise ValueError('Invalid project recipe, mix or sound slots.')
    catalog = json.loads((ROOT/'assets/catalog.json').read_text())
    if len(data['assets']) > 8 or not set(data['assets']) <= set(catalog):
        raise ValueError('Choose one of the eight existing sound slots.')
    pack = {key:prepare_wav(item) for key,item in data['assets'].items()}
    combined = {**catalog, **pack}
    decoded = sum(x['frames']*4 for x in combined.values())
    encoded = sum(len(x['pcm16']) if 'pcm16' in x else ((x['frames']*2+2)//3)*4 for x in combined.values())
    seconds = sum(x['seconds'] for x in combined.values())
    if decoded > 1048576 or encoded > 524288 or seconds > 6:
        raise ValueError('Project bank exceeds 6 seconds, 512 KiB encoded PCM or 1 MiB decoded PCM. Use shorter clips.')
    return pack, {'name':data['name'], 'importedSlots':list(pack), 'encodedPCMBytes':encoded,
                  'decodedBytesPerRealm':decoded, 'seconds':seconds,
                  'assets':{key:{k:v for k,v in value.items() if k != 'pcm16'} for key,value in pack.items()},
                  'sourceNotes':'User declarations are retained, not ownership verified.'}
