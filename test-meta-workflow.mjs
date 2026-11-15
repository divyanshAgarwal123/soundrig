import fs from 'node:fs';
import assert from 'node:assert/strict';
import {assertGameRig} from './checks.mjs';
import {applyPatch,renderTrace,stableJSON,validateTrace} from './core.mjs';
const root=new URL('./',import.meta.url),read=name=>JSON.parse(fs.readFileSync(new URL(name,root)));
const initial=read('evidence/meta-cases-results.json'),repaired=read('evidence/meta-cases-repaired.json'),trace=read('example-trace.json');
assert.equal(initial.completed,6);assert.equal(initial.passed,4);assert.equal(repaired.completed,2);assert.equal(repaired.passed,2);
const finalById=new Map(initial.results.map(r=>[r.id,r]));for(const result of repaired.results)finalById.set(result.id,result);
const cases=[];
for(const result of finalById.values()){
 assert(result.pass);const raw=read('evidence/'+result.record);
 assert(raw.response.attempts.length>0);
 if(result.id.startsWith('unsupported-'))assert(raw.response.rig.unsupported);
 else if(result.id.endsWith('-kit')){
  const rig=assertGameRig(raw.response.rig);assert.equal(stableJSON(rig),stableJSON(result.response.rig));
  const material=result.id.startsWith('wood')?'wood':'concrete';assert(rig.layers.find(l=>l.id==='footsteps').samples.every(id=>id.startsWith('step_'+material+'_')));
 }
 cases.push({id:result.id,record:result.record,attempts:raw.response.attempts.length,pass:true});
}
const patches=[];
for(const name of fs.readdirSync(new URL('evidence/',root)).filter(n=>/^patch-[a-f0-9]+\.json$/.test(n))){
 const raw=read('evidence/'+name);if(!raw.response.verified)continue;
 const before=raw.request.rig,locks=raw.request.lockedIds,next=applyPatch(before,raw.response.patch,locks);assertGameRig(next);
 for(const id of locks)assert.equal(stableJSON(before.layers.find(l=>l.id===id)),stableJSON(next.layers.find(l=>l.id===id)));
 const stems=r=>({...r,layers:r.layers.filter(l=>locks.includes(l.id))});
 assert.deepEqual(renderTrace(stems(before),trace).pcm,renderTrace(stems(next),trace).pcm);
 patches.push({record:name,target:raw.request.layerId,lockedLayers:locks.length,lockedSamples:288000,pass:true});
}
const captured=read('exports/browser-captured-trace.json');validateTrace(assertGameRig(read('hybrid-rig.json')),captured);
assert(captured.commands.some(c=>c.type==='event'&&c.event==='pickup'));assert(captured.commands.some(c=>c.type==='event'&&c.event==='land'));
const report={pass:true,cases,patches,initialBatch:{passed:4,total:6,compileFailuresPreserved:true},repairedCompiles:{passed:2,total:2},capturedTrace:{commands:captured.commands.length,durationMs:captured.durationMs,events:captured.commands.filter(c=>c.type==='event').map(c=>c.event)},scope:'Actual local model records and CUA-downloaded trace. Outcomes after repair are not an untouched held-out success rate. No user preference/time-savings claim.'};
fs.writeFileSync(new URL('evidence/meta-workflow-test.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
