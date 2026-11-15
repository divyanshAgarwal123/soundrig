import fs from 'node:fs';
import {validateSnapshot} from './revision-data.mjs';
try{console.log(JSON.stringify(validateSnapshot(JSON.parse(fs.readFileSync(0,'utf8')))));}catch(error){console.error('Error: '+error.message);process.exitCode=1;}
