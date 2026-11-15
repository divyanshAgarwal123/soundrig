"""Private local immutable checkpoints. Logical snapshot quota never evicts work."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json,os,re,sqlite3,subprocess,uuid
from contextlib import closing
from project_api import build_project,ProjectBusy,validation_error,ADMISSION
ROOT=Path(__file__).resolve().parent
MAX_SNAPSHOT=5*1024*1024
MAX_COUNT=24
MAX_BYTES=48*1024*1024

def bounded_tree(value):
    todo=[(value,0)];count=0
    while todo:
        item,depth=todo.pop();count+=1
        if depth>32 or count>100000:raise ValueError('Revision nesting or item count exceeds its bounds.')
        if isinstance(item,dict):todo.extend((v,depth+1) for v in item.values())
        elif isinstance(item,list):todo.extend((v,depth+1) for v in item)

def validate_snapshot(snapshot):
    bounded_tree(snapshot)
    raw=json.dumps(snapshot,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
    if len(raw)>MAX_SNAPSHOT:raise ValueError('Revision exceeds 5 MiB.')
    if not isinstance(snapshot,dict) or not isinstance(snapshot.get('project'),dict):raise ValueError('Revision snapshot required.')
    # Keep the existing WAV/parser/runtime budgets rather than trusting saved bytes.
    build_project(snapshot['project'],snapshot.get('trace'))
    result=subprocess.run(['node',str(ROOT/'revision-cli.mjs')],input=raw,capture_output=True,timeout=15)
    if result.returncode:raise ValueError(validation_error(result))
    return json.loads(result.stdout)

class RevisionStore:
    def __init__(self,folder=None,max_count=MAX_COUNT,max_bytes=MAX_BYTES,validator=validate_snapshot):
        self.folder=Path(folder) if folder else ROOT/'.soundrig-revisions'
        self.db=self.folder/'history.sqlite3';self.max_count=max_count;self.max_bytes=max_bytes;self.validator=validator
    def connect(self):
        if self.folder.is_symlink() or self.db.is_symlink():raise ValueError('Revision store cannot use symbolic links.')
        self.folder.mkdir(mode=0o700,parents=True,exist_ok=True);self.folder.chmod(0o700)
        for suffix in ('-journal','-wal','-shm'):
            if Path(str(self.db)+suffix).is_symlink():raise ValueError('Unsafe revision database sidecar.')
        fd=os.open(self.db,os.O_CREAT|os.O_WRONLY|getattr(os,'O_NOFOLLOW',0),0o600);os.close(fd);self.db.chmod(0o600)
        con=sqlite3.connect(self.db,timeout=1,isolation_level=None);con.row_factory=sqlite3.Row
        con.execute('PRAGMA synchronous=FULL')
        con.execute('CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY,label TEXT NOT NULL,created TEXT NOT NULL,summary TEXT NOT NULL,payload BLOB NOT NULL,sha TEXT NOT NULL)')
        return con
    def listing(self):
        with closing(self.connect()) as con:
            rows=con.execute('SELECT id,label,created,summary,length(payload) AS bytes FROM revisions ORDER BY created DESC,id DESC').fetchall()
        records=[{**dict(row),'summary':json.loads(row['summary'])} for row in rows]
        return {'revisions':records,'usedBytes':sum(r['bytes'] for r in records),'maxBytes':self.max_bytes,'maxCount':self.max_count}
    def save(self,label,snapshot):
        if not isinstance(label,str) or not 1<=len(label.strip())<=80 or any(ord(c)<32 for c in label):raise ValueError('Give the revision a name of 1–80 printable characters.')
        snapshot=self.validator(snapshot)
        raw=json.dumps(snapshot,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
        if len(raw)>MAX_SNAPSHOT:raise ValueError('Revision exceeds 5 MiB.')
        summary={'project':snapshot['project']['name'],'sounds':len(snapshot['project']['assets']),'quality':snapshot['project'].get('quality','classic'),'checks':len(snapshot['contract']['cases']) if snapshot['contract'] else 0,'traceSeconds':snapshot['trace']['durationMs']/1000}
        record={'id':uuid.uuid4().hex,'label':label.strip(),'created':datetime.now(timezone.utc).isoformat(),'summary':summary,'bytes':len(raw)}
        con=self.connect()
        try:
            con.execute('BEGIN IMMEDIATE')
            count,total=con.execute('SELECT count(*),coalesce(sum(length(payload)),0) FROM revisions').fetchone()
            if count>=self.max_count or total+len(raw)>self.max_bytes:raise ValueError('Revision history is full. Download checkpoints you need and remove a saved revision before saving or restoring. Current work is unchanged.')
            con.execute('INSERT INTO revisions VALUES (?,?,?,?,?,?)',(record['id'],record['label'],record['created'],json.dumps(summary),raw,hashlib.sha256(raw).hexdigest()))
            con.commit();return record
        except Exception:con.rollback();raise
        finally:con.close()
    def load(self,identifier):
        self.check_id(identifier)
        with closing(self.connect()) as con:row=con.execute('SELECT payload,sha FROM revisions WHERE id=?',(identifier,)).fetchone()
        if row is None:raise ValueError('Saved revision no longer exists. Refresh the list.')
        raw=row['payload']
        if len(raw)>MAX_SNAPSHOT or hashlib.sha256(raw).hexdigest()!=row['sha']:raise ValueError('Revision integrity check failed. Current work is unchanged.')
        return self.validator(json.loads(raw))
    def remove(self,identifier):
        self.check_id(identifier)
        with closing(self.connect()) as con:
            con.execute('BEGIN IMMEDIATE');con.execute('DELETE FROM revisions WHERE id=?',(identifier,));con.commit()
        return {'removed':identifier}
    @staticmethod
    def check_id(identifier):
        if not isinstance(identifier,str) or not re.fullmatch('[a-f0-9]{32}',identifier):raise ValueError('Invalid revision reference.')

STORE=RevisionStore()
def revision_endpoint(data):
    action=data.get('action')
    allowed={'list':{'action'},'save':{'action','label','snapshot'},'load':{'action','id'},'remove':{'action','id'}}
    if action not in allowed or set(data)!=allowed[action]:raise ValueError('Unsupported revision request.')
    if action!='list' and not ADMISSION.acquire(blocking=False):raise ProjectBusy('Another project is being prepared. Retry; current work is unchanged.')
    try:
        if action=='list':return STORE.listing()
        if action=='save':return {'revision':STORE.save(data['label'],data['snapshot'])}
        if action=='load':return {'snapshot':STORE.load(data['id'])}
        return STORE.remove(data['id'])
    except sqlite3.OperationalError as error:
        if 'locked' in str(error):raise ProjectBusy('Revision history is busy. Retry; current work is unchanged.') from error
        raise ValueError('Revision storage failed. Current work is unchanged.') from error
    finally:
        if action!='list':ADMISSION.release()
