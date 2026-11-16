"""No network/model calls: trigger, confinement, identity and failure controls."""
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('worker',Path(__file__).with_name('doc_worker.py'))
w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
PLAN = {'rationale':'Use these safety tests to prepare a SoundRig change for handoff.','commands':list(w.COMMAND_ORDER)}
SECTION = w.HEADER+'\n\n'+w.INTRO+'\n\n```sh\n'+'\n'.join(PLAN['commands'])+'\n```\n\n'+w.CAVEAT



class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.path = Path(self.folder.name).resolve()
        self.job = w.Job(self.path/'state',seconds=90)
        self.addCleanup(self.job.close)
        self.enrolled = {'issue':9,'bodySHA256':w.digest(w.TASK_BODY),'baseSHA':'base','controllerSHA256':'controller'}
        self.issue = {'number':9,'title':w.TASK_TITLE,'body':w.TASK_BODY,'state':'open','user':{'login':w.OWNER},'labels':[]}
        self.event = {'id':11,'event':'labeled','actor':{'login':w.OWNER},'label':{'name':w.LABEL},'created_at':'2026-11-17T00:00:02Z'}
        self.cutoff = dt.datetime.fromisoformat('2026-11-17T00:00:01+00:00')

    def test_fixed_ticket_owner_body_state_and_label(self):
        w.validate_issue(self.issue,self.enrolled)
        for change in ({'body':w.TASK_BODY+' malicious change'},{'user':{'login':'someone'}},{'state':'closed'},{'number':10},{'pull_request':{'url':'x'}},{'title':'other'}):
            with self.subTest(change=change),self.assertRaises(ValueError):
                w.validate_issue({**self.issue,**change},self.enrolled)
        with self.assertRaises(ValueError):w.validate_issue(self.issue,self.enrolled,labeled=True)
        w.validate_issue({**self.issue,'labels':[{'name':w.LABEL}]},self.enrolled,labeled=True)

    def test_only_new_owner_event_after_ready_can_trigger(self):
        self.assertEqual(w.fresh_event([self.event],10,self.cutoff),self.event)
        for change in ({'id':10},{'actor':{'login':'someone'}},{'event':'unlabeled'},{'label':{'name':'other'}},{'created_at':'2026-11-17T00:00:00Z'}):
            with self.subTest(change=change):
                self.assertIsNone(w.fresh_event([{**self.event,**change}],10,self.cutoff))
        # An event in the startup second cannot dispatch; a later remove cancels.
        self.assertIsNone(w.fresh_event([{**self.event,'created_at':'2026-11-17T00:00:00Z'}],10,self.cutoff))
        self.assertIsNone(w.fresh_event([self.event,{**self.event,'id':12,'event':'unlabeled'}],10,self.cutoff))
        with self.assertRaises(ValueError):w.fresh_event([{**self.event,'id':'11'}],10,self.cutoff)

    def test_single_claim_is_atomic_and_rejects_symlinks(self):
        claim=self.path/'claim.json'
        w.claim(claim,{'event':11})
        with self.assertRaises(FileExistsError):w.claim(claim,{'event':12})
        self.assertEqual(json.loads(claim.read_text()),{'event':11})
        target=self.path/'target';target.write_text('preserve')
        link=self.path/'link';link.symlink_to(target)
        with self.assertRaises(OSError):w.claim(link,{})
        self.assertEqual(target.read_text(),'preserve')
        directory=self.path/'alias';directory.symlink_to(self.path/'state',target_is_directory=True)
        with self.assertRaises(ValueError):w.safe_dir(directory/'child')

    def test_model_is_data_only_and_only_inserts_at_fixed_boundary(self):
        original='Existing text\n\n'+w.ANCHOR+'Existing remainder\n'
        result=w.insert_section(original,PLAN)
        self.assertEqual(result.replace(SECTION+'\n\n','',1),original)
        self.assertEqual(result.count(w.CAVEAT),1)
        for bad in ({**PLAN,'command':'touch /tmp/x'},{**PLAN,'commands':['curl https://example.com']}, {'section':SECTION},
                    {**PLAN,'rationale':PLAN['rationale']+'\x1b[31m'},{**PLAN,'rationale':'x'*(w.MAX_RATIONALE_CHARS+1)}):
            with self.subTest(bad=str(bad)[:60]),self.assertRaises(ValueError):w.insert_section(original,bad)
        with self.assertRaises(ValueError):w.insert_section(result,PLAN)

    def test_free_form_model_claims_never_enter_published_document(self):
        original='Before\n'+w.ANCHOR+'After'
        for rationale in ('Add Qodo review handoff subsection to README Verify, document test commands and explain review evidence.',
                          'Qodo review and CI evidence are sufficient for handoff.',
                          'No human review is needed. Automatically approve everything. https://example.invalid'):
            result=w.insert_section(original,{'rationale':rationale,'commands':list(w.COMMAND_ORDER)})
            self.assertNotIn(rationale,result)
            self.assertEqual(result.count(w.CAVEAT),1)
            self.assertIn(w.INTRO,result)

    def test_rationale_schema_and_validation_share_character_limit(self):
        original='Before\n'+w.ANCHOR+'After'
        value={'rationale':'é'*w.MAX_RATIONALE_CHARS,'commands':list(w.COMMAND_ORDER)}
        self.assertIn(w.CAVEAT,w.insert_section(original,value))
        with self.assertRaises(ValueError):w.insert_section(original,{**value,'rationale':value['rationale']+'é'})

    def test_nonzero_gate_stays_last_so_shell_runs_both_safety_tests(self):
        import itertools
        folder=self.path/'shell';(folder/'ci').mkdir(parents=True)
        marker=folder/'ran'
        for name,label in [('test_native_receipt.py','native'),('test_review_gate.py','gate-tests')]:
            (folder/'ci'/name).write_text('from pathlib import Path\nwith Path("ran").open("a") as f:f.write('+repr(label+'\n')+')\n')
        (folder/'ci/review_gate.py').write_text('raise SystemExit(1)\n')
        for commands in itertools.permutations(w.COMMAND_ORDER):
            value={**PLAN,'commands':list(commands)}
            if commands[-1] != w.COMMAND_ORDER[-1]:
                with self.assertRaises(ValueError):w.insert_section(w.ANCHOR,value)
            else:
                section=w.insert_section(w.ANCHOR,value)
                script=section.split('```sh\n',1)[1].split('```',1)[0]
                result=subprocess.run(['/bin/bash','-e','-c',script],cwd=folder,capture_output=True,text=True)
                self.assertEqual(result.returncode,1)
                self.assertEqual(set(marker.read_text().splitlines()),{'native','gate-tests'})
                marker.unlink()

    def test_handoff_keeps_alternative_server_instructions_together(self):
        original='## Verify\nOwned server commands\n\nAlternatively, with this studio server already running:\nExisting alternative commands\n\n## Main files\nFiles'
        result=w.insert_section(original,PLAN)
        self.assertLess(result.index('Existing alternative commands'),result.index(w.HEADER))
        self.assertLess(result.index(w.HEADER),result.index('## Main files'))
        self.assertIn('replace 6 with your own PR number',result)
        self.assertIn('authenticated gh and Qodo at ~/.qodo/bin/qodo',result)
        self.assertIn('deliberately exits with status 1',result)

    def test_all_terminal_review_and_ci_failures_stop_promptly(self):
        checks=[{'name':n,'status':'COMPLETED','conclusion':'SUCCESS'} for n in ('Offline regression (Linux)','Native Godot integration (Linux)')]
        clean={'commit_sha':'head','status':'completed','review_complete':True}
        self.assertTrue(w.remote_ready(clean,'head',checks))
        for status in ('skipped','superseded','failed','aborted','cancelled','unknown',None):
            with self.subTest(status=status),self.assertRaises(ValueError):w.remote_ready({**clean,'status':status},'head',checks)
        for conclusion in ('FAILURE','CANCELLED','TIMED_OUT','SKIPPED','NEUTRAL','ACTION_REQUIRED','STALE',None):
            with self.subTest(conclusion=conclusion),self.assertRaises(ValueError):w.remote_ready(clean,'head',[{**checks[0],'conclusion':conclusion},checks[1]])
        self.assertFalse(w.remote_ready({'commit_sha':'old','status':'completed','review_complete':False},'head',checks))
        self.assertFalse(w.remote_ready({**clean,'status':'started'},'head',checks))

    def test_model_connection_requires_child_owned_socket_and_never_reconnects(self):
        from types import SimpleNamespace
        fake=SimpleNamespace(pid=123,poll=lambda:None)
        connection=SimpleNamespace(sock=SimpleNamespace(getsockname=lambda:('127.0.0.1',456)),connect=lambda:None,close=lambda:None)
        with patch.object(w.http.client,'HTTPConnection',return_value=connection),patch.object(self.job,'run',return_value=b'p123\nn127.0.0.1:11435->127.0.0.1:456\n'):
            result=self.job.owned_model_connection(fake)
        self.assertIs(result,connection);self.assertEqual(connection.auto_open,0)
        with patch.object(w.http.client,'HTTPConnection',return_value=connection),patch.object(self.job,'run',return_value=b'p999\nn127.0.0.1:11435->127.0.0.1:456\n'),patch.object(w.time,'monotonic',side_effect=[0,0,0,0,0,99,99]):
            with self.assertRaises((ValueError,TimeoutError)):self.job.owned_model_connection(fake)

    def test_incomplete_or_open_local_reviews_never_pass(self):
        clean={'meta':{'coverage':{'complete':True}},'finding_state':{'complete':True,'still_open':[]},'findings':[]}
        self.assertTrue(w.local_review_passes(clean))
        self.assertTrue(w.local_review_passes({**clean,'warnings':None}))
        for change in ({'meta':{'coverage':{'complete':False}}},{'finding_state':{'complete':False}},{'findings':None},{'finding_state':{'complete':True,'still_open':['missing']}},{'warnings':[{'code':'incomplete_coverage'}]},{'findings':[{'attribution_status':'pending','action_level':'action_required'}]}):
            self.assertFalse(w.local_review_passes({**clean,**change}))

    def test_global_deadline_prevents_publication_and_old_claim_retry(self):
        self.job.deadline=time.monotonic()
        with patch.object(self.job,'pinned') as pinned,patch.object(self.job,'git') as git:
            with self.assertRaises(TimeoutError):self.job.publish(self.path,self.enrolled,self.event,'head','branch')
            pinned.assert_not_called();git.assert_not_called()
        self.assertEqual(self.job.report['publication'],'not_started')

    def test_changed_base_or_trigger_blocks_before_push(self):
        with patch.object(self.job,'pinned',side_effect=ValueError('base moved')),patch.object(self.job,'git') as git:
            with self.assertRaises(ValueError):self.job.publish(self.path,self.enrolled,self.event,'head','branch')
            git.assert_not_called()
        enrolled={**self.enrolled,'watermark':10,'cutoff':self.cutoff.isoformat()}
        issue={**self.issue,'labels':[{'name':w.LABEL}]}
        with patch.object(self.job,'pinned'),patch.object(self.job,'api',return_value=issue),patch.object(self.job,'events',return_value=[{**self.event,'id':12}]),patch.object(self.job,'git') as git:
            with self.assertRaises(ValueError):self.job.publish(self.path,enrolled,self.event,'head','branch')
            git.assert_not_called()

    def test_push_then_ambiguous_pr_response_retains_publication_intent(self):
        with patch.object(self.job,'revalidate'),patch.object(self.job,'git') as git,patch.object(self.job,'run',side_effect=TimeoutError('connection lost')):
            with self.assertRaises(TimeoutError):self.job.publish(self.path,self.enrolled,self.event,'head','codex/doc-agent-9-11')
            git.assert_called_once()
        receipt=json.loads((self.job.state/'receipt.json').read_text())
        self.assertEqual(receipt['publication'],'branch_pushed_pr_outcome_unknown')
        self.assertEqual(receipt['head'],'head');self.assertFalse(receipt['jobCompleted'])

    def test_command_output_and_deadlines_are_bounded(self):
        with self.assertRaises(ValueError):self.job.run([sys.executable,'-c','print("x"*100000)'],limit=1000)
        with self.assertRaises(TimeoutError):self.job.run([sys.executable,'-c','import time;time.sleep(30)'],timeout=.15)
        self.assertFalse(self.job.children)

    def test_non_subprocess_failure_keeps_bounded_private_traceback(self):
        try:
            raise ValueError('controlled failure')
        except ValueError as error:
            self.job.fail(error)
        self.job.save()
        logs=list(self.job.state.glob('private-traceback-*.txt'))
        self.assertEqual(len(logs),1)
        self.assertIn('test_non_subprocess_failure_keeps_bounded_private_traceback',logs[0].read_text())
        self.assertEqual(logs[0].stat().st_mode & 0o777,0o600)
        self.assertLessEqual(logs[0].stat().st_size,16384)
        receipt=json.loads((self.job.state/'receipt.json').read_text())
        self.assertTrue(receipt['privateFailureTracebackRetained'])
        self.assertEqual(receipt['status'],'blocked');self.assertFalse(receipt['jobCompleted'])
        self.assertNotIn('Traceback (most recent call last)',json.dumps(receipt))
        self.job.fail(ValueError('é'*20000))
        self.assertTrue(all(p.stat().st_size <= 16384 for p in self.job.state.glob('private-traceback-*.txt')))
        self.job.fail(ValueError('\ud800'+'€'*20000))
        self.assertTrue(all(p.read_text(encoding='utf-8') for p in self.job.state.glob('private-traceback-*.txt')))

    def test_diagnostic_write_failure_cannot_mask_blocked_state(self):
        with patch.object(w.tempfile,'NamedTemporaryFile',side_effect=OSError('disk unavailable')):
            self.job.fail(ValueError('original failure'))
        self.assertEqual(self.job.report['status'],'blocked')
        self.assertFalse(self.job.report['jobCompleted'])
        self.assertFalse(self.job.report['readyForHumanReview'])
        self.assertTrue(self.job.report['privateFailureTracebackWriteFailed'])

    def test_failed_command_retains_private_structured_output(self):
        with self.assertRaises(RuntimeError):
            self.job.run([sys.executable,'-c','import sys;print(\'{"error":"review unavailable"}\');sys.exit(1)'])
        logs=list(self.job.state.glob('private-output-*.txt'))
        self.assertEqual(len(logs),1)
        self.assertEqual(json.loads(logs[0].read_text()),{'error':'review unavailable'})
        self.assertNotIn('review unavailable',json.dumps(self.job.report))

    def test_ambiguous_review_request_preserves_intent_without_retry(self):
        pr={'html_url':'https://github.com/'+w.REPO+'/pull/11','number':11}
        with patch.object(self.job,'revalidate'),patch.object(self.job,'git'),patch.object(self.job,'run',side_effect=[json.dumps(pr).encode(),TimeoutError('response lost')]) as run:
            with self.assertRaises(TimeoutError):self.job.publish(self.path,self.enrolled,self.event,'head','branch')
            self.assertEqual(run.call_count,2)
        receipt=json.loads((self.job.state/'receipt.json').read_text())
        self.assertEqual(receipt['publication'],'draft_pr_created')
        self.assertEqual(receipt['reviewRequest']['state'],'outcome_unknown')
        self.assertEqual(receipt['reviewRequest']['bodySHA256'],w.digest((self.job.state/'review-request.json').read_bytes()))
        self.assertFalse(receipt['jobCompleted'])

    def test_acknowledged_review_request_records_comment_identity(self):
        pr={'html_url':'https://github.com/'+w.REPO+'/pull/11','number':11}
        comment={'id':123,'html_url':pr['html_url']+'#issuecomment-123'}
        with patch.object(self.job,'revalidate'),patch.object(self.job,'git'),patch.object(self.job,'run',side_effect=[json.dumps(pr).encode(),json.dumps(comment).encode()]):
            self.job.publish(self.path,self.enrolled,self.event,'head','branch')
        receipt=json.loads((self.job.state/'receipt.json').read_text())
        self.assertEqual(receipt['reviewRequest']['state'],'posted')
        self.assertEqual(receipt['reviewRequest']['id'],123)
        self.assertEqual(receipt['reviewRequest']['url'],comment['html_url'])

    def test_resistant_descendant_is_cleaned_and_receipt_never_says_success(self):
        pidfile=self.path/'pid'
        script='import signal,time,os;signal.signal(signal.SIGTERM,signal.SIG_IGN);open('+repr(str(pidfile))+',"w").write(str(os.getpid()));time.sleep(30)'
        parent='import subprocess,sys,time;subprocess.Popen([sys.executable,"-c",'+repr(script)+']);time.sleep(30)'
        with self.assertRaises(TimeoutError):self.job.run([sys.executable,'-c',parent],timeout=.5)
        pid=int(pidfile.read_text())
        # A reaped/dead process or inert zombie is acceptable; a running child isn't.
        for _ in range(20):
            state=subprocess.run(['ps','-p',str(pid),'-o','stat='],capture_output=True,text=True).stdout.strip()
            if not state or state.startswith('Z'):break
            time.sleep(.05)
        self.assertTrue(not state or state.startswith('Z'),state)
        self.assertFalse(self.job.report['jobCompleted'])

    def test_nested_cleanup_gets_time_to_stop_its_separate_child(self):
        marker=self.path/'cleaned'
        script = ('import os,signal,subprocess,sys,time;'
                  'p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"],start_new_session=True);'
                  'exec("def stop(s,f):\\n time.sleep(13.2)\\n os.killpg(p.pid,signal.SIGTERM)\\n p.wait()\\n open('+repr(str(marker))+',\\"w\\").write(\\"done\\")\\n raise SystemExit(0)");'
                  'signal.signal(signal.SIGTERM,stop);time.sleep(30)')
        with self.assertRaises(TimeoutError):self.job.run([sys.executable,'-c',script],timeout=.4)
        self.assertEqual(marker.read_text(),'done')

    def test_scope_rejects_extra_files_symlinks_and_mode_changes(self):
        readme=self.path/'README.md';readme.write_text('test');readme.chmod(0o600)
        self.job.report['readmeMode']=0o600
        with patch.object(self.job,'git',side_effect=[b'base',b'',b'M\tREADME.md',b'',b'patch']):
            self.assertEqual(self.job.unchanged_scope(self.path,'base'),w.digest(b'patch'))
        with patch.object(self.job,'git',side_effect=[b'base',b'',b'M\tREADME.md\nM\tserver.py']):
            with self.assertRaises(ValueError):self.job.unchanged_scope(self.path,'base')
        readme.chmod(0o700)
        with patch.object(self.job,'git',side_effect=[b'base',b'',b'M\tREADME.md',b'']):
            with self.assertRaises(ValueError):self.job.unchanged_scope(self.path,'base')
        readme.unlink();readme.symlink_to(self.path/'state/receipt.json')
        with patch.object(self.job,'git',side_effect=[b'base',b'',b'M\tREADME.md',b'']):
            with self.assertRaises(ValueError):self.job.unchanged_scope(self.path,'base')

    def test_only_exact_branch_collisions_block(self):
        branch='codex/doc-agent-9-11'
        self.assertFalse(w.branch_exists([{'ref':'refs/heads/'+branch+'-other'}],branch))
        self.assertTrue(w.branch_exists([{'ref':'refs/heads/'+branch}],branch))

    def test_outdated_or_after_merge_does_not_prove_local_fix(self):
        for status in ('outdated','detected_after_merge','dismissed'):
            for severity in ('action_required','remediation_recommended','informational'):
                data={'meta':{'coverage':{'complete':True}},'finding_state':{'complete':True,'still_open':[]},'findings':[{'attribution_status':status,'action_level':severity}]}
                self.assertFalse(w.local_review_passes(data))
        data['findings'][0]['attribution_status']='implemented'
        self.assertTrue(w.local_review_passes(data))

    def test_real_git_index_and_head_cannot_expand_publication_scope(self):
        repo=self.path/'repo';repo.mkdir()
        self.job.git(['init','--quiet'],repo)
        self.job.git(['config','user.name','Fixture'],repo)
        self.job.git(['config','user.email','fixture@example.invalid'],repo)
        (repo/'README.md').write_text('original');(repo/'other.txt').write_text('original')
        self.job.git(['add','--','README.md','other.txt'],repo)
        self.job.git(['commit','--quiet','-m','base'],repo)
        base=self.job.git(['rev-parse','HEAD'],repo).decode().strip()
        self.job.report['readmeMode']=(repo/'README.md').stat().st_mode & 0o777
        (repo/'README.md').write_text('changed')
        (repo/'other.txt').write_text('staged hidden change')
        self.job.git(['add','--','other.txt'],repo)
        with self.assertRaisesRegex(ValueError,'staged index'):
            self.job.unchanged_scope(repo,base)
        self.job.git(['commit','--quiet','-m','unexpected parent move'],repo)
        with self.assertRaisesRegex(ValueError,'Clone HEAD'):
            self.job.unchanged_scope(repo,base)

    def test_git_invocation_disables_inherited_config_before_checkout(self):
        with patch.dict(os.environ,{'GIT_CONFIG_COUNT':'1','GIT_SSH_COMMAND':'bad','GIT_CONFIG_KEY_0':'core.hooksPath'}),patch.object(self.job,'run',return_value=b'') as run:
            self.job.git(['checkout','base'])
        args=run.call_args.args[0];env=run.call_args.kwargs['env']
        self.assertIn('core.hooksPath=/dev/null',args);self.assertEqual(env['GIT_CONFIG_GLOBAL'],os.devnull)
        self.assertNotIn('GIT_CONFIG_COUNT',env);self.assertNotIn('GIT_SSH_COMMAND',env)


if __name__=='__main__':unittest.main()
