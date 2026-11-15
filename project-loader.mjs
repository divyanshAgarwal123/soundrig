async function importRuntime(source){
 const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
 try{return await import(url);}finally{URL.revokeObjectURL(url);}
}
export class ProjectLoader {
 constructor(runtime,player,importer=importRuntime){this.active={runtime,player};this.importer=importer;this.attempts=0;this.busy=false;}
 async replace(source,rig,controls,{beforeCommit,commit,rollback}={}){
  if(this.busy)throw Error('Another project is being prepared. Your current project is unchanged.');
  if(this.attempts>=8)throw Error('Eight sound/mix versions loaded. Save your project and reload before loading more.');
  this.busy=true;let candidate;
  try{
   this.attempts++;
   const runtime=await this.importer(source);
   candidate=new runtime.SoundRigPlayer(rig,{processorSource:runtime.createPlayer().processorSource,monitorGain:0});
   await candidate.start();await candidate.measureControl(controls);candidate.stop();
   const previous=this.active,next={runtime,player:candidate};
   await beforeCommit?.();
   try{commit?.(next);}catch(error){try{rollback?.(previous);}catch(rollbackError){error.message+=' UI recovery warning: '+rollbackError.message;}throw error;}
   this.active=next;
   try{previous.player.stop();}catch(error){this.active.cleanupWarning=error.message;}
   try{await previous.player.dispose();}catch(error){this.active.cleanupWarning=error.message;}
   return this.active;
  }catch(error){if(candidate)await candidate.dispose().catch(()=>{});throw error;}
  finally{this.busy=false;}
 }
}
