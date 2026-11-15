from pathlib import Path
import copy,json,zipfile,hashlib,unittest
from delivery import delivery_endpoint
ROOT=Path(__file__).resolve().parent
PROJECT=json.loads((ROOT/'fixtures/studio-browser-project.json').read_text())
GODOT={'project.godot','soundrig.gd','test_soundrig.gd','demo.gd','demo.tscn','GODOT_README.md','SOUNDRIG_LICENSE.txt'}

class GodotPackageTests(unittest.TestCase):
    def test_native_adapter_keeps_the_same_wavs(self):
        a=delivery_endpoint({'project':PROJECT});b=delivery_endpoint({'project':PROJECT},target='godot');self.assertEqual(b['files'],31)
        with zipfile.ZipFile(ROOT/a['url']) as old,zipfile.ZipFile(ROOT/b['url']) as new:
            self.assertEqual(set(new.namelist())-set(old.namelist()),GODOT)
            for name in old.namelist():self.assertEqual(old.read(name),new.read(name),name)
            self.assertEqual(json.loads(new.read('project.json')),PROJECT)
            for name in GODOT:self.assertEqual(new.read(name),(ROOT/'godot-kit'/name).read_bytes())
    def test_metadata_stays_data_and_target_is_fixed(self):
        p=copy.deepcopy(PROJECT);p['name']='res://evil.gd"; execute()';p['assets']['pickup_confirm']['filename']='../evil.gd'
        r=delivery_endpoint({'project':p},target='godot')
        with zipfile.ZipFile(ROOT/r['url']) as z:
            self.assertEqual(json.loads(z.read('project.json'))['name'],p['name']);self.assertFalse(any('evil' in n for n in z.namelist()))
            self.assertNotIn(b'execute()',z.read('soundrig.gd'))
        with self.assertRaises(ValueError):delivery_endpoint({'project':p},target='../../evil')
    def test_repeat_archive_is_identical(self):
        a=delivery_endpoint({'project':PROJECT},target='godot');original=(ROOT/a['url']).read_bytes();b=delivery_endpoint({'project':PROJECT},target='godot');self.assertEqual(original,(ROOT/b['url']).read_bytes())

if __name__=='__main__':
    result=unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(GodotPackageTests))
    (ROOT/'evidence/practical-godot-package-tests.json').write_text(json.dumps({'pass':result.wasSuccessful(),'cases':result.testsRun,'scope':'Fixed-path Godot package, original sources, exact WAV identity, deterministic archive, metadata and target boundary. Actual engine is a separate executed check.'},indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)
