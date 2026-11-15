import {validateRig,resolveRig} from './core.mjs';

export function gameChecks(input) {
  const rig=validateRig(input),rest={speed:0,air:0,grounded:1,alive:1};
  const resolved=(id,controls)=>resolveRig(rig,controls).find(l=>l.id===id);
  const gain=(id,controls)=>resolved(id,controls)?.gain ?? 0;
  const feet=rig.layers.find(l=>l.id==='footsteps'),wind=rig.layers.find(l=>l.id==='wind');
  const result=(id,pass,detail)=>({id,pass,detail});
  return [
    result('master-level',rig.master>0,'Kit output is enabled'),
    result('walking-source',feet?.event===null&&(rig.version===2||feet?.type==='sample')&&resolved('footsteps',{...rest,speed:1})?.pulseHz>0,'Footsteps use a continuous walking cadence'),
    result('wind-source',wind?.type==='noise'&&wind.event===null&&wind.filter?.type==='lowpass','Wind uses filtered continuous noise'),
    result('footsteps-run',gain('footsteps',{...rest,speed:1})>0,'Footsteps respond to movement'),
    result('footsteps-rest',gain('footsteps',rest)===0,'No footsteps while still'),
    result('footsteps-air',gain('footsteps',{...rest,speed:1,grounded:0,air:1})===0,'No footsteps in the air'),
    result('footsteps-death',gain('footsteps',{...rest,speed:1,alive:0})===0,'No footsteps after death'),
    result('wind-air',gain('wind',{...rest,grounded:0,air:1})>0,'Wind responds to air movement'),
    result('wind-ground',gain('wind',{...rest,air:1})===0,'Wind stops on the ground'),
    result('wind-death',gain('wind',{...rest,grounded:0,air:1,alive:0})===0,'Wind stops after death'),
    ...[['land','land_thud'],['pickup','pickup_chime'],['hurt','hurt_buzz']].map(([event,id])=>{const layer=rig.layers.find(l=>l.id===id);return result('event-'+event,layer?.event===event&&(rig.version===2||layer?.type==='sample')&&gain(id,rest)>0,'Audible finite '+event+' sound is mapped');}),
  ];
}
export function assertGameRig(input) {
  const rig=validateRig(input),failed=gameChecks(rig).filter(c=>!c.pass);
  if(failed.length)throw Error('Behavior check failed. Required: '+failed.map(c=>c.detail).join('; '));
  return rig;
}
