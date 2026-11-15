from pathlib import Path
import json,unittest,zipfile
from unittest.mock import patch
import project_api
ROOT=Path(__file__).resolve().parent

class ProjectAPI(unittest.TestCase):
    def test_admission_refuses_concurrent_work_before_building(self):
        self.assertTrue(project_api.ADMISSION.acquire(blocking=False))
        try:
            with patch.object(project_api,'build_project') as build:
                with self.assertRaises(project_api.ProjectBusy):project_api.project_endpoint('/api/project',{})
                build.assert_not_called()
        finally:project_api.ADMISSION.release()
    def test_failed_build_releases_admission(self):
        with patch.object(project_api,'build_project',side_effect=ValueError('explicit fixture failure')):
            with self.assertRaises(ValueError):project_api.project_endpoint('/api/project',{'project':{}})
        self.assertTrue(project_api.ADMISSION.acquire(blocking=False));project_api.ADMISSION.release()
    def test_cache_is_bounded_and_expired_reference_refuses(self):
        with patch.object(project_api,'PROJECTS',project_api.OrderedDict()),patch.object(project_api,'build_project',return_value=({'module':'fixture','report':{}},{})):
            digests=[]
            for i in range(9):digests.append(project_api.project_endpoint('/api/project',{'project':{'name':'explicit fixture '+str(i)}})['digest'])
            self.assertEqual(len(project_api.PROJECTS),8)
            with self.assertRaises(ValueError):project_api.project_snapshot(digests[0])
            self.assertEqual(project_api.project_snapshot(digests[-1])['project']['name'],'explicit fixture 8')
    def test_current_project_package_retains_exact_portable_font_bytes(self):
        project=json.loads((ROOT/'fixtures/studio-example-project.json').read_text())
        trace=json.loads((ROOT/'example-trace.json').read_text())
        result=project_api.project_endpoint('/api/project-export',{'project':project,'trace':trace})
        with zipfile.ZipFile(ROOT/result['url']) as z:
            self.assertEqual(len(z.namelist()),12)
            self.assertEqual(z.read('fonts/SoundRigDisplay.ttf'),(ROOT/'fonts/SoundRigDisplay.ttf').read_bytes())
            self.assertEqual(z.read('fonts/OFL.txt'),(ROOT/'fonts/ArchivoBlack-OFL.txt').read_bytes())
            self.assertIn('fonts/SoundRigDisplay.ttf',z.read('index.html').decode())
    def test_actual_downloaded_zip_has_fixed_safe_files_and_matching_component(self):
        with zipfile.ZipFile(ROOT/'exports/browser-runnable-project.zip') as z:
            self.assertIsNone(z.testzip());self.assertEqual(len(z.namelist()),10)
            for name in z.namelist():self.assertFalse(name.startswith('/'));self.assertNotIn('..',Path(name).parts)
            self.assertEqual(z.read('component.mjs'),(ROOT/'exports/browser-downloaded-final.mjs').read_bytes())
            self.assertEqual(z.read('host.mjs'),(ROOT/'exports/browser-runnable/host.mjs').read_bytes())

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromTestCase(ProjectAPI))
    (ROOT/'evidence/project-api-test.json').write_text(json.dumps({'pass':result.wasSuccessful(),'cases':result.testsRun,'scope':'Explicit admission/cache fixtures plus actual browser-downloaded ZIP integrity. No inference or network calls.'},indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)
