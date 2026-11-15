// A single candidate; identity checks survive asynchronous reads and requests.
export class RecordingStage {
 constructor(){this.epoch=0;this.pending=null;}
 clear(){this.epoch++;this.pending=null;}
 async inspect(read,prepare,identity,current){
  const epoch=++this.epoch;this.pending=null;
  const asset=await read();if(epoch!==this.epoch||identity!==current())return null;
  const review=await prepare(asset);if(epoch!==this.epoch||identity!==current())return null;
  this.pending={asset,review,identity};return this.pending;
 }
 candidate(identity){if(!this.pending||this.pending.identity!==identity)throw Error('This recording changed. Preview it again before applying.');return this.pending;}
}
