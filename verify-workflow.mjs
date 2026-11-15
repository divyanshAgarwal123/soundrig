import fs from 'node:fs';
import {checkContract,digest,canonical} from './quality-contract.mjs';
import {validateBindings} from './game-adapter.mjs';
import * as runtime from './component.mjs';
try{
 const contract=JSON.parse(fs.readFileSync(new URL('contract.json',import.meta.url))),project=JSON.parse(fs.readFileSync(new URL('project.json',import.meta.url))),bindings=JSON.parse(fs.readFileSync(new URL('bindings.json',import.meta.url)));
 validateBindings(bindings);
 if(canonical(project.rig)!==canonical(runtime.preset))throw Error('Editable recipe differs from the component. Re-export this project.');
 const identities={componentSHA256:await digest(fs.readFileSync(new URL('component.mjs',import.meta.url),'utf8')),projectSHA256:await digest(project),bindingsSHA256:await digest(bindings)};
 const integrity=JSON.parse(fs.readFileSync(new URL('integrity.json',import.meta.url)));
 for(const key of Object.keys(identities))if(identities[key]!==integrity[key])throw Error(key+' differs from the exported project. Re-export after changing sounds, mix or bindings.');
 const report=await checkContract(runtime,runtime.preset,contract);
 Object.assign(report,identities);
 console.log(JSON.stringify(report,null,2));process.exitCode=report.pass?0:1;
}catch(error){console.error('Verification failed: '+error.message);process.exitCode=2;}
