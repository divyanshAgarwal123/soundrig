// Authored, opt-in DSP transformation. Classic source stays byte-for-byte intact.
export function studioSource(classic) {
  const replace = (before, after) => {
    if (classic.split(before).length !== 2) throw Error('Studio DSP source contract changed');
    classic = classic.replace(before, after);
  };
  replace('x = s.asset.pcm[index] + (s.asset.pcm[index + 1] - s.asset.pcm[index]) * fraction;',
    'x = studioSample(s.asset.pcm, index, fraction, s.step);');
  replace('const x = .8 * Math.tanh(pre); output[i] = x;',
    'const x = studioTransfer(pre); output[i] = x;');
  replace("number(pcm[i], -Math.fround(.8), Math.fround(.8), 'PCM sample');v.setInt16(44 + i * 2, Math.round(Math.max(-.8,Math.min(.8,sample)) * 32767)",
    "number(pcm[i], -Math.fround(.99), Math.fround(.99), 'PCM sample');v.setInt16(44 + i * 2, Math.round(sample * 32767)");
  return `
// Fixed coefficient bank is built once on module load, never in process().
const STUDIO_TAPS=24, STUDIO_PHASES=64;
const STUDIO_KERNELS=Array.from({length:33},(_,band)=>{
 const cutoff=(band+32)/64, weights=new Float64Array(65*24);
 for(let phase=0;phase<=64;phase++){
  let total=0;
  for(let tap=0;tap<24;tap++){
   const x=tap-11-phase/64;
   const window=Math.abs(x)>=12?0:.42+.5*Math.cos(Math.PI*x/12)+.08*Math.cos(2*Math.PI*x/12);
   const weight=(Math.abs(x)<1e-12?cutoff:Math.sin(Math.PI*cutoff*x)/(Math.PI*x))*window;
   weights[phase*24+tap]=weight;total+=weight;
  }
  for(let tap=0;tap<24;tap++)weights[phase*24+tap]/=total;
 }
 return weights;
});
export function studioSample(pcm,index,fraction,step){
 const cutoff=Math.min(1,1/step)*.94;
 const table=STUDIO_KERNELS[Math.max(0,Math.min(32,Math.floor(cutoff*64)-32))];
 const phase=fraction*64, p=Math.min(63,Math.floor(phase)), blend=phase-p;
 let result=0;
 for(let tap=0;tap<24;tap++){
  const frame=index+tap-11;
  if(frame>=0&&frame<pcm.length){const a=table[p*24+tap];result+=pcm[frame]*(a+(table[(p+1)*24+tap]-a)*blend);}
 }
 return result;
}
export const STUDIO_QUALITY=Object.freeze({taps:24,phases:64,coefficientBytes:33*65*24*8,transfer:'linear through 0.8; bounded soft knee above'});
export function studioTransfer(x){const magnitude=Math.abs(x);return magnitude<=.8?x:Math.sign(x)*(.8+.18*Math.tanh((magnitude-.8)/.18));}
` + classic;
}
