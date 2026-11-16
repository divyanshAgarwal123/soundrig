"""Native failures must replace prior success and retain machine-readable evidence."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('native',Path(__file__).with_name('native_receipt.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class ReceiptTests(unittest.TestCase):
    def test_success_and_later_command_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            (folder/'kit.json').write_text(json.dumps({'pass':True,'cases':[{}]*7}))
            (folder/'game.log').write_text('{"pass":true}\n')
            for name in ('kit.log','import.log'):(folder/name).write_text('ok')
            self.assertTrue(native.record(folder,'success')['pass'])
            self.assertFalse(native.record(folder,'failure')['pass'])
            self.assertEqual(json.loads((folder/'receipt.json').read_text())['status'],'failed')

    def test_missing_or_malformed_outputs_record_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)/'native'
            self.assertFalse(native.record(folder,'success')['pass'])
            (folder/'kit.json').write_text('{')
            self.assertFalse(native.record(folder,'success')['pass'])
            self.assertIn('JSONDecodeError',json.loads((folder/'receipt.json').read_text())['error'])

    def test_engine_error_is_failure_even_when_result_claims_pass(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            (folder/'kit.json').write_text(json.dumps({'pass':True,'cases':[{}]*7}))
            (folder/'game.log').write_text('{"pass":true}\n')
            (folder/'kit.log').write_text('ok')
            (folder/'import.log').write_text('ERROR: import failed')
            self.assertFalse(native.record(folder,'success')['pass'])


if __name__=='__main__':unittest.main()
