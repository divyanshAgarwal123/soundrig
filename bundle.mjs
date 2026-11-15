import {validateRig} from './core.mjs';

export function bundleModule({core, processor, player, samples}, input) {
  const rig = validateRig(input);
  const withoutImport = code => code.replace(/^import[^\n]+\n/gm, '');
  if (!samples) throw Error('Embedded sample bank source required');
  const shared = samples + '\n' + withoutImport(core);
  const processorSource = shared.replace(/^export (?=(?:const|function|class)\b)/gm, '') + '\n' + withoutImport(processor);
  return '// SoundRig portable component. Fixed runtime + validated preset; no model calls.\n' +
    shared + '\n' + withoutImport(player) + '\nexport const preset = ' + JSON.stringify(rig) + ';\n' +
    'export function createPlayer(options = {}) { return new SoundRigPlayer(preset, {...options, processorSource: ' +
    JSON.stringify(processorSource) + '}); }\n';
}
