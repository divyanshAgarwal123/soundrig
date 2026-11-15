import {assertGameRig} from './checks.mjs';
export function editCue(rig,id,gain,rate){
 if(!Number.isFinite(gain)||gain<0||gain>1||!Number.isFinite(rate)||rate<.75||rate>1.25)throw Error('Cue level must be 0–1 and pitch rate 0.75–1.25.');
 const next=structuredClone(rig),layer=next.layers.find(l=>l.id===id);
 if(!layer||layer.type!=='sample'||!layer.event||typeof layer.gain!=='number'||typeof layer.rate!=='number')throw Error('Choose a sampled event cue with fixed level and pitch. Dynamic mappings stay in the layer editor.');
 layer.gain=gain;layer.rate=rate;return assertGameRig(next);
}
