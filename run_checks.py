"""Reproduce local checks without invoking a model. Start server.py first."""
from pathlib import Path
import json
import subprocess
import sys
import time

root = Path(__file__).resolve().parent
checks = [
    ['node', 'test-core.mjs'], ['node', 'test-player.mjs'],
    ['node', 'test-hybrid.mjs'], [sys.executable, 'test-authoring.py'],
    ['node', 'test-preview.mjs'], [sys.executable, 'probe-boundaries.py'],
    ['node', 'test-meta-workflow.mjs'],
    [sys.executable,'test-project-assets.py'],['node','test-project-runtime.mjs'],
    ['node','test-project-export-ui.mjs'],[sys.executable,'test-project-api.py'],
    ['node','test-workflow.mjs'],[sys.executable,'test-workflow-server.py'],['node','test-export.mjs'],['node','test-workflow-artifact.mjs'],
    [sys.executable,'test-studio-budget.py'],['node','test-studio-quality.mjs'],[sys.executable,'test-studio-delivery.py'],['node','--experimental-vm-modules','test-landing.mjs'],[sys.executable,'test-studio-artifact.py'],
    [sys.executable,'test-recording-review.py'],['node','test-recording-stage.mjs'],['node','test-cue-edit.mjs'],[sys.executable,'test-godot-package.py'],
    ['node','test-recording-apply.mjs'],['node','test-studio-ux.mjs'],[sys.executable,'test-revision-store.py'],['node','test-revision-activation.mjs'],[sys.executable,'test-revision-api.py'],[sys.executable,'test-revision-e2e.py'],
]
results = []
for command in checks:
    began = time.monotonic()
    try:
        result = subprocess.run(command, cwd=root, text=True, capture_output=True, timeout=90)
    except subprocess.TimeoutExpired as error:
        results.append({'command': command, 'pass': False, 'timedOut': True,
                        'seconds': round(time.monotonic()-began, 3)})
        print('FAIL ' + command[-1] + ': exceeded 90 second limit', flush=True)
        print((error.stdout or b'').decode() if isinstance(error.stdout, bytes) else (error.stdout or ''))
        print((error.stderr or b'').decode() if isinstance(error.stderr, bytes) else (error.stderr or ''))
        break
    results.append({'command': command, 'pass': result.returncode == 0,
                    'seconds': round(time.monotonic()-began, 3)})
    print(('PASS ' if result.returncode == 0 else 'FAIL ') + command[-1], flush=True)
    if result.returncode:
        print(result.stdout + result.stderr)
        break
report = {'pass': len(results) == len(checks) and all(r['pass'] for r in results),
          'checks': results, 'newModelCalls': 0,
          'scope': 'Offline checks plus loopback HTTP boundary checks. Actual model records are checked, not regenerated.'}
(root/'evidence'/'final-checks.json').write_text(json.dumps(report, indent=2))
sys.exit(0 if report['pass'] else 1)
