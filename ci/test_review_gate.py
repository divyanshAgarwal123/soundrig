"""A passing test or closed old finding cannot certify an unreviewed head."""
import importlib.util
import contextlib
import io
import json
import sys
from unittest.mock import patch
from types import SimpleNamespace
import zipfile
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('gate',Path(__file__).with_name('review_gate.py'))
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class GateTests(unittest.TestCase):
    def setUp(self):
        self.pr={'author':{'login':'divyanshAgarwal123'},'isCrossRepository':False,'baseRefName':'main','changedFiles':0,'controlChanges':[],'headRefOid':'new','baseRefOid':'base','potentialMergeCommit':{'oid':'merge'},'testedMergeCommit':'merge', 'statusCheckRollup':[
            {'name':name,'status':'COMPLETED','conclusion':'SUCCESS','head_sha':'new'} for name in gate.REQUIRED]}
        self.review={'review_session':{'status':'completed','review_complete':True,'commit_sha':'new'},
                     'findings':[],'finding_count':0}

    def assess(self):return gate.assess(self.pr,self.review,('new','base','merge'))

    def test_clean_head_evidence_still_requires_human_base_review(self):
        report = self.assess()
        self.assertTrue(report['headAndCIEvidencePass'])
        self.assertFalse(report['pass'])
        self.assertFalse(report['reviewedBaseAttested'])
        self.assertTrue(any('human base review' in b for b in report['blockers']))

    def test_base_update_before_collection_cannot_reuse_head_review_as_approval(self):
        self.pr.update(baseRefOid='new-base', potentialMergeCommit={'oid':'new-merge'}, testedMergeCommit='new-merge')
        # Head review and fresh CI are valid, but neither proves the reviewed base.
        report = gate.assess(self.pr,self.review,('new','new-base','new-merge'))
        self.assertTrue(report['headAndCIEvidencePass'])
        self.assertFalse(report['pass'])
        self.assertFalse(report['reviewedBaseAttested'])

    def test_missing_stalled_skipped_failed_and_partial_reviews_block(self):
        for status in (None,'started','skipped','failed','aborted','superseded','mystery'):
            with self.subTest(status=status):
                self.review['review_session']['status']=status
                self.assertFalse(self.assess()['headAndCIEvidencePass'])
        self.review['review_session'].update(status='completed',review_complete=False)
        self.assertFalse(self.assess()['headAndCIEvidencePass'])

    def test_stale_or_changed_head_blocks(self):
        self.review['review_session']['commit_sha']='old'
        self.assertFalse(self.assess()['headAndCIEvidencePass'])
        self.review['review_session']['commit_sha']='new'
        self.assertFalse(gate.assess(self.pr,self.review,('changed','base','merge'))['headAndCIEvidencePass'])

    def test_all_open_actionable_and_unknown_states_block(self):
        for state in gate.OPEN | {'unknown'}:
            self.review.update(finding_count=1,findings=[{'id':'f','title':'bug','attribution_status':state,'action_level':'remediation_recommended'}])
            self.assertFalse(self.assess()['headAndCIEvidencePass'])
        self.review['findings'][0].update(attribution_status='pending',action_level='unknown')
        self.assertFalse(self.assess()['headAndCIEvidencePass'])

    def test_low_is_flagged_and_closed_findings_retained_as_settled(self):
        self.review.update(finding_count=1,findings=[{'id':'f','title':'note','attribution_status':'pending','action_level':'informational'}])
        self.assertEqual(self.assess()['lowFindingsForHuman'],[{'id':'f','title':'note'}])
        self.assertTrue(self.assess()['headAndCIEvidencePass'])
        self.review['findings'][0].update(attribution_status='implemented',action_level='action_required')
        self.assertTrue(self.assess()['headAndCIEvidencePass'])

    def test_failed_missing_duplicate_or_pending_check_blocks(self):
        for checks in ([],self.pr['statusCheckRollup'][:1]):
            self.assertFalse(gate.assess({**self.pr,'statusCheckRollup':checks},self.review,('new','base','merge'))['headAndCIEvidencePass'])
        for status,conclusion in [('COMPLETED','FAILURE'),('IN_PROGRESS',''),('COMPLETED','CANCELLED')]:
            self.pr['statusCheckRollup'][0].update(status=status,conclusion=conclusion)
            self.assertFalse(self.assess()['headAndCIEvidencePass'])

    def test_truncation_missing_count_and_wrong_shape_block(self):
        for extra in ({'qar_operation_result_truncated':True},{'truncated':True},{'next_page_token':'more'},{'finding_count':1},{'findings':None}):
            self.assertFalse(gate.assess(self.pr,{**self.review,**extra},('new','base','merge'))['headAndCIEvidencePass'])


    def test_dismissals_need_reason_and_nonempty_explanation(self):
        finding={'id':'f','title':'bug','attribution_status':'dismissed','action_level':'action_required'}
        self.review.update(finding_count=1,findings=[finding])
        for reason,explanation in [(None,None),('intentional',''),('unknown','a reason'),('false_positive','   ')]:
            finding.update(dismiss_reason=reason,dismiss_explanation=explanation)
            self.assertFalse(self.assess()['headAndCIEvidencePass'])
        finding.update(dismiss_reason='false_positive',dismiss_explanation='Source and test demonstrate the guard.')
        self.assertTrue(self.assess()['headAndCIEvidencePass'])

    def test_live_collection_uses_latest_checks_even_with_unchanged_head(self):
        self.pr['url']='https://github.com/'+gate.REPO+'/pull/5'
        latest={**self.pr,'statusCheckRollup':[dict(c) for c in self.pr['statusCheckRollup']]}
        latest['statusCheckRollup'][0]['conclusion']='FAILURE'
        output=io.StringIO()
        with patch.object(gate,'read',side_effect=[self.pr,self.review,latest,latest]), patch.object(gate,'collect_ci'), patch.object(gate,'collect_changes'), patch.object(sys,'argv',['review_gate.py','--pr','5']), contextlib.redirect_stdout(output):
            self.assertEqual(gate.main(),1)
        self.assertFalse(json.loads(output.getvalue())['headAndCIEvidencePass'])


    def test_deferred_or_rejected_actionable_findings_never_count_as_fixed(self):
        finding={'id':'f','title':'bug','attribution_status':'dismissed','dismiss_explanation':'Acknowledged but not fixed.'}
        self.review.update(finding_count=1,findings=[finding])
        for reason in ('deferred','rejected'):
            for level in ('action_required','remediation_recommended'):
                finding.update(dismiss_reason=reason,action_level=level)
                self.assertFalse(self.assess()['headAndCIEvidencePass'])
        finding.update(action_level='informational')
        self.assertTrue(self.assess()['headAndCIEvidencePass'])
        self.assertEqual(self.assess()['lowFindingsForHuman'],[{'id':'f','title':'bug'}])


    def test_base_or_merge_change_and_missing_or_stale_receipt_block(self):
        for extra in ({'baseRefOid':'changed'},{'potentialMergeCommit':{'oid':'other'}},{'testedMergeCommit':'old'},{'testedMergeCommit':None}):
            self.assertFalse(gate.assess({**self.pr,**extra},self.review,('new','base','merge'))['headAndCIEvidencePass'])
        self.pr['statusCheckRollup'][0]['head_sha']='old'
        self.assertFalse(self.assess()['headAndCIEvidencePass'])

    def test_identity_change_during_ci_collection_blocks(self):
        self.pr['url']='https://github.com/'+gate.REPO+'/pull/5'
        final={**self.pr,'baseRefOid':'changed'}
        output=io.StringIO()
        with patch.object(gate,'read',side_effect=[self.pr,self.review,self.pr,final]), patch.object(gate,'collect_ci'), patch.object(gate,'collect_changes'), patch.object(sys,'argv',['review_gate.py','--pr','5']), contextlib.redirect_stdout(output):
            self.assertEqual(gate.main(),1)
        self.assertFalse(json.loads(output.getvalue())['headAndCIEvidencePass'])


    def test_actual_receipt_is_read_and_bound_to_merge_candidate(self):
        def run(receipt, artifacts=None, attachment='new', duplicate=False):
            checks={'total_count':2,'check_runs':[dict(c,id=i+10,head_sha=attachment,app={'slug':'github-actions'},details_url='https://github.com/'+gate.REPO+f'/actions/runs/123/job/{i}') for i,c in enumerate(self.pr['statusCheckRollup'])]}
            empty={'total_count':0,'check_runs':[]}
            head=checks if attachment=='new' else empty
            merge=checks if attachment=='merge' or duplicate else empty
            artifacts=artifacts or {'total_count':2,'artifacts':[{'name':prefix+'merge','expired':False,'id':i,'size_in_bytes':1024} for i,prefix in enumerate(('offline-','native-'))]}
            data=io.BytesIO()
            with zipfile.ZipFile(data,'w') as archive:archive.writestr('receipt.json',json.dumps(receipt))
            with patch.object(gate,'read',side_effect=[[head],[merge],[artifacts]]) as reader, patch.object(gate.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=data.getvalue())):
                gate.collect_ci(self.pr)
            endpoints=[call.args[0][-1] for call in reader.call_args_list[:2]]
            self.assertTrue(any('/commits/new/' in e for e in endpoints))
            self.assertTrue(any('/commits/merge/' in e for e in endpoints))
        for attachment,duplicate in [('new',False),('merge',False),('new',True)]:
            with self.subTest(attachment=attachment,duplicate=duplicate):
                run({'pass':True,'sourceCommit':'merge'},attachment=attachment,duplicate=duplicate)
                self.assertEqual(self.pr['testedMergeCommit'],'merge')
                self.assertEqual(len(self.pr['statusCheckRollup']),2)
                self.assertTrue(self.assess()['headAndCIEvidencePass'])
        with self.assertRaises(ValueError):run({'pass':True,'sourceCommit':'old'})
        with self.assertRaises(ValueError):run({'pass':False,'sourceCommit':'merge'})
        with self.assertRaises(ValueError):run({'pass':True,'sourceCommit':'merge'},{'total_count':0,'artifacts':[]})

    def test_changed_duplicate_ci_check_is_rejected(self):
        first={'total_count':1,'check_runs':[{'id':10,'name':'Offline regression (Linux)','head_sha':'new','status':'completed','conclusion':'success','details_url':'same-job'}]}
        second={'total_count':1,'check_runs':[dict(first['check_runs'][0],conclusion='failure')]}
        with patch.object(gate,'read',side_effect=[[first],[second]]):
            with self.assertRaisesRegex(ValueError,'CI check changed'):
                gate.collect_ci(self.pr)

    def test_required_jobs_from_different_runs_are_rejected(self):
        checks={'total_count':2,'check_runs':[dict(c,id=i+10,app={'slug':'github-actions'},details_url='https://github.com/'+gate.REPO+f'/actions/runs/{i+123}/job/{i}') for i,c in enumerate(self.pr['statusCheckRollup'])]}
        with patch.object(gate,'read',side_effect=[[checks],[{'total_count':0,'check_runs':[]}]]):
            with self.assertRaisesRegex(ValueError,'one workflow run'):
                gate.collect_ci(self.pr)


    def test_complete_pages_are_collected_and_partial_pages_stay_blocked(self):
        first=[{'name':str(i)} for i in range(100)]
        second=[{'name':'required job on page2'}]
        pages=[{'total_count':101,'check_runs':first},{'total_count':101,'check_runs':second}]
        with patch.object(gate,'read',return_value=pages):
            self.assertEqual(gate.read_pages('fixture','check_runs'),first+second)
        with patch.object(gate,'read',return_value=pages[:1]):
            with self.assertRaises(ValueError):gate.read_pages('fixture','check_runs')
        with patch.object(gate,'read',return_value=[]):
            with self.assertRaises(ValueError):gate.read_pages('fixture','check_runs')


    def test_final_snapshot_catches_reruns_during_receipt_collection(self):
        self.pr['url']='https://github.com/'+gate.REPO+'/pull/5'
        for status,conclusion,run in [('IN_PROGRESS',None,1),('COMPLETED','FAILURE',1),('COMPLETED','SUCCESS',2)]:
            latest={**self.pr,'statusCheckRollup':[dict(c,details_url='https://github.com/'+gate.REPO+'/actions/runs/1/job/2') for c in self.pr['statusCheckRollup']]}
            final={**latest,'statusCheckRollup':[dict(c) for c in latest['statusCheckRollup']]}
            final['statusCheckRollup'][0].update(status=status,conclusion=conclusion,details_url='https://github.com/'+gate.REPO+f'/actions/runs/{run}/job/2')
            output=io.StringIO()
            with patch.object(gate,'read',side_effect=[self.pr,self.review,latest,final]), patch.object(gate,'collect_ci'), patch.object(gate,'collect_changes'), patch.object(sys,'argv',['review_gate.py','--pr','5']), contextlib.redirect_stdout(output):
                self.assertEqual(gate.main(),1)
            self.assertIn('Required CI changed while collecting receipts',json.loads(output.getvalue())['blockers'])
            self.assertFalse(json.loads(output.getvalue())['headAndCIEvidencePass'])


    def test_untrusted_authors_bases_and_control_changes_require_human(self):
        for extra in ({'author':{'login':'contributor'}},{'isCrossRepository':True},{'baseRefName':'unmerged-feature'},{'controlChanges':['ci/check.py']},{'controlChanges':None}):
            self.assertFalse(gate.assess({**self.pr,**extra},self.review,('new','base','merge'))['headAndCIEvidencePass'])

    def test_control_edits_and_renames_cannot_hide_in_paginated_files(self):
        for path in ('integration-proof/godot-platformer/game.gd','integration-proof/godot-platformer/game_singleplayer.tscn'):
            self.assertTrue(gate.is_control(path))
        self.pr['changedFiles']=2
        pages=[[{'filename':'README.md'}],[{'filename':'renamed.py','previous_filename':'ci/check.py'}]]
        with patch.object(gate,'read',return_value=pages):gate.collect_changes(self.pr,5)
        self.assertEqual(self.pr['controlChanges'],['ci/check.py'])
        with patch.object(gate,'read',return_value=pages[:1]):
            with self.assertRaises(ValueError):gate.collect_changes(self.pr,5)

    def test_command_errors_preserve_private_actionable_diagnostics(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(gate,'ERROR_LOG_DIR',Path(folder)), patch.object(gate.subprocess,'run',return_value=SimpleNamespace(returncode=1,stderr='403 credentials expired; synthetic-private-value',stdout='')):
                with self.assertRaises(RuntimeError) as error:gate.read(['gh','fixture'])
            self.assertIn('authentication/authorization',str(error.exception))
            self.assertNotIn('synthetic-private-value',str(error.exception))
            log=next(Path(folder).glob('*.txt'))
            self.assertIn('synthetic-private-value',log.read_text())
            self.assertEqual(log.stat().st_mode & 0o777,0o600)


if __name__=='__main__':unittest.main()
