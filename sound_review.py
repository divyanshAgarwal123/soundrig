"""Inspect one bounded recording without publishing or activating a project."""
import base64
import io
import math
import struct
import wave
from project_assets import prepare_wav
from project_api import ADMISSION, ProjectBusy


def _wav(samples, rate):
    pcm=b''.join(struct.pack('<h',max(-32768,min(32767,round(x*32768)))) for x in samples)
    output=io.BytesIO()
    with wave.open(output,'wb') as stream:
        stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(rate);stream.writeframes(pcm)
    return base64.b64encode(output.getvalue()).decode()


def review_endpoint(data):
    if not ADMISSION.acquire(blocking=False):
        raise ProjectBusy('Another sound is being prepared. Retry after it finishes.')
    try:
        if not isinstance(data,dict) or set(data)!={'asset'}:raise ValueError('One recording is required.')
        item=data['asset'];prepared=prepare_wav(item)
        with wave.open(io.BytesIO(base64.b64decode(item['wav64'],validate=True)),'rb') as stream:
            channels,rate,frames=stream.getnchannels(),stream.getframerate(),stream.getnframes()
            raw=[x[0]/32768 for x in struct.iter_unpack('<h',stream.readframes(frames))]
        original=raw if channels==1 else [(raw[i]+raw[i+1])*.5 for i in range(0,len(raw),2)]
        ready=[x[0]/32768 for x in struct.iter_unpack('<h',base64.b64decode(prepared['pcm16']))]
        rms=lambda values:math.sqrt(math.fsum(x*x for x in values)/len(values))
        before_rms=rms(original);after_rms=rms(ready)
        gains=[.12/before_rms,.12/after_rms]
        ceiling=min(1,.8/max(max(map(abs,original))*gains[0],max(map(abs,ready))*gains[1]))
        warnings=[]
        if prepared['sourceNearFullScaleSamples']:warnings.append('Source samples are near full scale: possible clipping. Preparation cannot restore clipped detail.')
        if channels==2 and before_rms<rms(raw)*.25:warnings.append('Stereo averaging loses substantial level. Check channel polarity or export a mono recording.')
        if prepared['preparationGain']>=3.999:warnings.append('Preparation reached its 4× gain cap. A cleaner, louder source may work better; noise is not removed.')
        report={k:v for k,v in prepared.items() if k!='pcm16'}
        report.update(preparationVersion=1,sourceFrames=frames,sourceSeconds=frames/rate,sourceMonoRMS=before_rms,sourceMonoPeak=max(map(abs,original)),warnings=warnings)
        return {'report':report,'comparison':{'original':_wav([x*gains[0]*ceiling for x in original],rate),'prepared':_wav([x*gains[1]*ceiling for x in ready],rate),'method':'Whole-clip RMS matched, shared 0.8 peak ceiling. Original is averaged to mono. These comparison levels are not the applied game mix.'},'preparedPCM16':prepared['pcm16']}
    finally:
        ADMISSION.release()
