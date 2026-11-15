import fs from 'node:fs';
import {bundleModule} from './bundle.mjs';
import {assertGameRig} from './checks.mjs';
import {SAMPLE_PACK,SAMPLE_LICENSES} from './samples.mjs';
import {studioSource} from './studio-dsp.mjs';
export async function projectModule(rig,pack={},clearMix=false,quality='classic'){
 if(!['classic','studio'].includes(quality))throw Error('Choose classic or studio playback');
 rig=assertGameRig(rig);
 if(!pack||Object.keys(pack).some(id=>!Object.hasOwn(SAMPLE_PACK,id))||typeof clearMix!=='boolean')throw Error('Fixed sound slots and boolean mix required');
 const source=Object.fromEntries(['core','processor','player','samples'].map(n=>[n,fs.readFileSync(new URL(n==='processor'?'worklet.mjs':n+'.mjs',import.meta.url),'utf8')]));
 const bank={...SAMPLE_PACK,...pack};
 source.samples=source.samples.split('\n').map(line=>line.startsWith('export const SAMPLE_PACK =')?'export const SAMPLE_PACK = Object.freeze('+JSON.stringify(bank)+');':line.startsWith('export const SAMPLE_LICENSES =')?'export const SAMPLE_LICENSES = '+JSON.stringify({...SAMPLE_LICENSES,project:Object.fromEntries(Object.entries(pack).map(([id,s])=>[id,s.licenseNote]))})+';':line.startsWith('export const MIX_SETTINGS =')?'export const MIX_SETTINGS = Object.freeze({enabled:'+JSON.stringify(clearMix)+'});':line).join('\n');
 if(quality==='studio')source.core=studioSource(source.core);
 const module=bundleModule(source,rig);if(Buffer.byteLength(module)>=2097152)throw Error('Portable component exceeds2MiB');
 const imported=await import('data:text/javascript;base64,'+Buffer.from(module).toString('base64'));
 return {module,imported};
}
