// Strong simple alternative: four sample roles using standard Phaser APIs.
// This baseline omits procedural wind, trace verification and language editing.
export function preloadBaseline(scene, base = './assets/') {
  for(const id of ['step_concrete_a','step_concrete_b','land_soft_a','pickup_confirm','hurt_error'])scene.load.audio(id,base+id+'.wav');
}
export function createBaseline(scene) {
  let lastStep=-Infinity,nextStep=0;
  return {
    state:({speed,grounded,alive})=>{if(speed>0&&grounded&&alive&&scene.time.now-lastStep>1000/(1.5+speed*2.3)){lastStep=scene.time.now;scene.sound.play(['step_concrete_a','step_concrete_b'][nextStep++%2],{volume:.75*speed});}},
    event:(name,intensity=1)=>{const id={land:'land_soft_a',pickup:'pickup_confirm',hurt:'hurt_error'}[name];if(!id)throw Error('Unknown event');scene.sound.play(id,{volume:.65*intensity});},
  };
}
