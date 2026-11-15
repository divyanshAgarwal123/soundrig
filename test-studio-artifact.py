"""Reproduce validation from sealed browser-downloaded artifacts, without the app."""
from pathlib import Path
import subprocess,tempfile,zipfile
root=Path(__file__).resolve().parent
with tempfile.TemporaryDirectory() as temporary:
    folders=[]
    for name in ['cues','workflow']:
        folder=Path(temporary)/name;folder.mkdir();folders.append(folder)
        with zipfile.ZipFile(root/'fixtures'/('studio-download-'+name+'.zip')) as z:
            assert all(not Path(p).is_absolute() and '..' not in Path(p).parts for p in z.namelist())
            z.extractall(folder)
    result=subprocess.run(['node',str(root/'test-studio-artifact.mjs'),*map(str,folders)],cwd=root,timeout=15)
raise SystemExit(result.returncode)
