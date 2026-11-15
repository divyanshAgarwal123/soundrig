import fs from 'node:fs';
import {projectModule} from './project-runtime.mjs';
import {validateContract,checkContract,digest} from './quality-contract.mjs';
import {validateBindings} from './game-adapter.mjs';
const parts=[];for await(const part of process.stdin)parts.push(part);const raw=Buffer.concat(parts);if(raw.length>4194304)throw Error('Workflow input exceeds4MiB');
const data=JSON.parse(raw);const {imported,module}=await projectModule(data.project.rig,data.pack,data.project.clearMix,data.project.quality);
if(data.validateOnly){validateContract(imported,data.project.rig,data.contract);console.log(JSON.stringify({ok:true}));}
else {
 const report=await checkContract(imported,data.project.rig,data.contract);report.projectSHA256=await digest(data.project);report.componentSHA256=await digest(module);if(data.bindings)report.bindingsSHA256=await digest(validateBindings(data.bindings));
 console.log(JSON.stringify({...(data.reportOnly?{}:{module}),report,...(data.bindings?{bindings:validateBindings(data.bindings)}:{}),...(data.trace?{trace:imported.validateTrace(data.project.rig,data.trace)}:{})}));
}
