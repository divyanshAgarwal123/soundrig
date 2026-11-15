"""Loopback trust-boundary checks. Does not run or toggle inference."""
from pathlib import Path
import json
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent
BASE = 'http://127.0.0.1:8772'
results = []

def post(path, data, expected, headers=None):
    raw = data if isinstance(data, bytes) else json.dumps(data).encode()
    request = urllib.request.Request(BASE + path, data=raw,
        headers=headers if headers is not None else {'Content-Type': 'application/json', 'X-SoundRig': 'local-proof'})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    assert code == expected, (path, code, expected)
    results.append({'path': path, 'expectedStatus': expected, 'actualStatus': code})

before = json.load(urllib.request.urlopen(BASE + '/api/status'))['calls']['upstream']
post('/api/export', {'rig': None}, 403, {})
post('/api/export', {'rig': None}, 403, {'X-SoundRig': 'local-proof', 'Origin': 'https://example.com'})
post('/api/export', {'rig': None}, 400)
post('/api/export', b'not-json', 400)
post('/api/export', b'x' * 196609, 400)
post('/api/compile', {'prompt': ''}, 400)
post('/api/compile', {'prompt': 'x' * 4001}, 400)
post('/api/patch', {'prompt': 'change', 'rig': {}, 'layerId': 'wind', 'lockedIds': ['wind']}, 400)
post('/api/missing', {}, 404)
after = json.load(urllib.request.urlopen(BASE + '/api/status'))['calls']['upstream']
assert before == after, 'Boundary probes must not start inference'
evidence = {'pass': True, 'cases': len(results), 'results': results, 'additionalModelCalls': after - before,
    'scope': 'Local HTTP rejection paths only. No deployment security certification.'}
(ROOT / 'evidence/server-boundaries.json').write_text(json.dumps(evidence, indent=2))
print(json.dumps(evidence, indent=2))
