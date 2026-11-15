export function cueWAV(pcm){
 if(!(pcm instanceof Float32Array)||pcm.length>Math.ceil(25.1*48000))throw Error('Sprite exceeds its audio bound');
 const b=Buffer.alloc(44+pcm.length*2);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length*2,40);
 for(let i=0;i<pcm.length;i++){const x=pcm[i];if(!Number.isFinite(x)||Math.abs(x)>.99)throw Error('Non-finite or out-of-range delivery sample');b.writeInt16LE(Math.round(x*32767),44+i*2);}
 return b;
}
