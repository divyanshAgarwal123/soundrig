"""Check the actual native test's machine-readable result, not just its exit code."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
folder = root/'.qa-output/native'
kit = json.loads((folder/'kit.json').read_text())
game = json.loads(next(line for line in (folder/'game.log').read_text().splitlines() if line.startswith('{')))
assert kit['pass'] and len(kit['cases']) == 7, kit
assert game['pass'], game
for name in ('kit.log', 'import.log', 'game.log'):
    assert 'ERROR:' not in (folder/name).read_text(), name
(folder/'receipt.json').write_text(json.dumps({
    'pass': True, 'kitCases': len(kit['cases']), 'game': game, 'newModelCalls': 0,
    'scope': 'Official native Godot with Dummy audio. No physical listening or outside user test.'
}, indent=2)+'\n')
print('Native kit and existing-game integration passed')
