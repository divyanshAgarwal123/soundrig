import {validateTrace} from './core.mjs';
import {assertGameRig} from './checks.mjs';
import {validateContract,canonical} from './quality-contract.mjs';
export function validateSnapshot(input) {
  const keys=['version','project','trace','traceProvenance','contract','protection'];
  if(!input||Array.isArray(input)||Object.keys(input).length!==keys.length||Object.keys(input).some(k=>!keys.includes(k))||input.version!==1||typeof input.protection!=='boolean')throw Error('Unsupported revision snapshot.');
  if(!input.project||new TextEncoder().encode(JSON.stringify(input.project)).length>4194304)throw Error('Revision project exceeds 4 MiB.');
  const rig=assertGameRig(input.project.rig),trace=validateTrace(rig,input.trace),p=input.traceProvenance;
  if(!p||Array.isArray(p)||Object.keys(p).some(k=>!['kind','source','mappingID'].includes(k))||!['captured','imported','synthetic'].includes(p.kind)||typeof p.source!=='string'||p.source.length>240||(p.mappingID!=null&&(typeof p.mappingID!=='string'||p.mappingID.length>2048)))throw Error('Invalid revision trace provenance.');
  const contract=input.contract===null?null:validateContract({validateTrace},rig,input.contract);
  if(input.protection&&!contract)throw Error('A protected revision must include saved checks.');
  return structuredClone({...input,trace,contract});
}
export function snapshotChanges(current,next){
  const rows=[],format=value=>value==null?'None':typeof value==='object'?canonical(value):String(value);
  if(current.project.name!==next.project.name)rows.push(['Project',current.project.name,next.project.name]);
  for(const key of ['quality','clearMix']){const fallback=key==='quality'?'classic':false,a=current.project[key]??fallback,b=next.project[key]??fallback;if(a!==b)rows.push([key==='quality'?'Playback quality':'Cue focus',format(a),format(b)]);}
  for(const slot of new Set([...Object.keys(current.project.assets),...Object.keys(next.project.assets)])){
    const a=current.project.assets[slot],b=next.project.assets[slot],label=slot.replaceAll('_',' ');
    if(a?.wav64!==b?.wav64||a?.filename!==b?.filename)rows.push([label+' recording',a?.filename??'Included sound',b?.filename??'Included sound']);
    if(a?.license!==b?.license)rows.push([label+' source note',a?.license??'Included asset license',b?.license??'Included asset license']);
  }
  if(current.project.rig.master!==next.project.rig.master)rows.push(['Master level',format(current.project.rig.master),format(next.project.rig.master)]);
  for(const id of new Set([...current.project.rig.layers,...next.project.rig.layers].map(l=>l.id))){
    const a=current.project.rig.layers.find(l=>l.id===id),b=next.project.rig.layers.find(l=>l.id===id);
    if(!a||!b){rows.push([id,a?'Present':'Absent',b?'Present':'Absent']);continue;}
    for(const field of new Set([...Object.keys(a),...Object.keys(b)]))if(field!=='id'&&canonical(a[field])!==canonical(b[field]))rows.push([id.replaceAll('_',' ')+' · '+field,format(a[field]),format(b[field])]);
  }
  if(canonical(current.trace)!==canonical(next.trace))rows.push(['Selected run',`${current.trace.durationMs/1000}s · ${current.trace.commands.length} commands`,`${next.trace.durationMs/1000}s · ${next.trace.commands.length} commands`]);
  if(canonical(current.contract)!==canonical(next.contract))rows.push(['Check definitions',`${current.contract?.cases.length??0} current checks`,`${next.contract?.cases.length??0} stored checks`]);
  return rows;
}
