"""Run with DEPLOYMENT_MODE=local to verify on-device report budgets."""
import unittest
from src.config import LOCAL_LLM, LLM_CONTEXT_TOKENS
from src.chronology_v2 import evidence_batches, _synthesis_batches, _overview_clusters
from src.evidence_model import EvidenceItem
from src.model_profiles import get_task_profile


@unittest.skipUnless(LOCAL_LLM, 'local deployment budget tests')
class LocalChronologyBudgetTests(unittest.TestCase):
    def test_evidence_batches_preserve_every_source(self):
        sources = [EvidenceItem(source_id=f's{i}', doc_id='d', file_name='d.pdf',
                               page=i+1, excerpt='x' * 5000) for i in range(9)]
        batches = evidence_batches(sources)
        self.assertGreater(len(batches), 1)
        self.assertEqual([item for batch in batches for item in batch], sources)
        self.assertTrue(all(sum(len(item.excerpt)+160 for item in batch) <= 12000
                            for batch in batches))

    def test_synthesis_keeps_all_events_in_small_batches(self):
        events = [{'event_date': f'2011-03-{i+1:02d}', 'claims': []} for i in range(8)]
        batches = _synthesis_batches(events, [])
        self.assertEqual([item for batch in batches for item in batch], events)
        self.assertTrue(all(len(batch) <= 3 for batch in batches))

    def test_overview_compaction_keeps_distinct_claim_provenance(self):
        first = {'text': 'A dated notice', 'source_ids': ['a']}
        second = {'text': 'A dated notice', 'source_ids': ['b'], 'counter_source_ids': ['c']}
        events = [{'event_date': '2011-03-08', 'claims': [first],
                   'observations': [{'claims': [first]}, {'claims': [first, second]}]}]
        result = _overview_clusters(events)
        self.assertEqual(result[0]['claims'], [first, second])
        self.assertEqual(len(events[0]['observations']), 2)
        self.assertEqual(result[0]['event_date'], '2011-03-08')

    def test_report_timeout_and_context_fit_local_model(self):
        for task in ('chronology_extract', 'chronology_synthesis', 'chronology_verify', 'ingestion_event_extract'):
            profile = get_task_profile(task)
            self.assertGreaterEqual(profile.timeout_seconds, 600)
            self.assertLess(profile.max_input_tokens + profile.max_output_tokens,
                            LLM_CONTEXT_TOKENS)


class SourcePreservingDraftTests(unittest.TestCase):
    def test_all_events_and_provenance_survive(self):
        from src.chronology_v2 import _local_source_preserving_draft
        sources = [EvidenceItem(source_id=f's{i}', doc_id='d', file_name='d.pdf',
                    excerpt=f'On 2011-03-{i+1:02d}, Alice issued notice {i+1}.') for i in range(8)]
        events = [{'event_date':f'2011-03-{i+1:02d}', 'date_precision':'exact',
                   'date_source':'content_body','date_evidence':f'2011-03-{i+1:02d}',
                   'claims':[{'text':'Alice issued a notice', 'source_ids':[f's{i}']}]} for i in range(8)]
        draft = _local_source_preserving_draft(list(reversed(events)), sources)
        self.assertEqual(len(draft['entries']), 8)
        self.assertEqual(len(draft['overview_claims']), 5)
        self.assertEqual([e['claims'][0]['source_ids'][0] for e in draft['entries']], [f's{i}' for i in range(8)])
        self.assertEqual(draft['entries'][0]['event_date'], '2011-03-01')
        self.assertNotIn('supported', draft['entries'][0]['claims'][0])

    def test_unknown_sources_and_invented_quantities_cannot_pass(self):
        from src.chronology_v2 import _local_source_preserving_draft
        source = EvidenceItem(source_id='s', doc_id='d', file_name='d.pdf', excerpt='Alice issued a notice')
        for claim in ({'text':'Alice issued a notice','source_ids':['invented']},
                      {'text':'Alice issued 900 notices','source_ids':['s']}):
            with self.assertRaisesRegex(ValueError, 'insufficient_evidence'):
                _local_source_preserving_draft([{'claims':[claim]}], [source])

    def test_split_extraction_resumes_without_repeating_model_calls(self):
        from unittest.mock import patch
        from src import chronology_v2 as v
        sources = [EvidenceItem(source_id=f's{i}', doc_id='d', file_name='d.pdf',excerpt='text') for i in range(2)]
        prepared = v.PreparedChronologyQuery('t','t',(),(),(),(),(),())
        saved = {}
        def load(key, digest):
            row=saved.get((key,digest)); return row
        def save(key,digest,status,output,error):
            saved[(key,digest)]={'status':status,'output':output}
        def extract(**kw):
            if len(kw['batch'])>1:raise ValueError('model_output_incomplete')
            return [{'source':kw['batch'][0].source_id}]
        with patch.object(v,'extract_batch',side_effect=extract):
            expected=v.extract_batches(sources,prepared,load_step=load,save_step=save)
        # Simulate checkpoints written by the older worker: only leaves ready.
        saved={k:val for k,val in saved.items() if k[0]!='extract:1'}
        with patch.object(v,'extract_batch',side_effect=AssertionError('model called again')):
            self.assertEqual(v.extract_batches(sources,prepared,load_step=load,save_step=save), expected)
        changed=[EvidenceItem(source_id='new',doc_id='d',file_name='d.pdf',excerpt='changed'),sources[1]]
        with patch.object(v,'extract_batch',side_effect=RuntimeError('fresh evidence requires extraction')):
            with self.assertRaisesRegex(RuntimeError,'fresh evidence'):
                v.extract_batches(changed,prepared,load_step=load,save_step=save)


class NumericGroundingTests(unittest.TestCase):
    def test_sentence_punctuation_is_not_part_of_a_number(self):
        from src.chronology_v2 import _claims_are_source_valid
        evidence=[EvidenceItem(source_id='s',doc_id='d',file_name='d.pdf',excerpt='In 2009 the cost was 1,200.50 pounds')]
        for text in ('The record is from 2009.', 'In 2009, the cost was 1,200.50.'):
            self.assertTrue(_claims_are_source_valid({'overview_claims':[{'text':text,'source_ids':['s']}]},evidence))
        self.assertFalse(_claims_are_source_valid({'overview_claims':[{'text':'The cost was 1,200.60.','source_ids':['s']}]},evidence))

class EventDateTests(unittest.TestCase):
    def test_missing_precision_preserves_only_grounded_calendar_dates(self):
        from src.chronology_v2 import _enforce_event_date
        evidence = [EvidenceItem(source_id='s', doc_id='d', file_name='scan.pdf',
                                 excerpt='12 September 2026: Alice approved the inspection.')]
        event = {'event_date':'2026-09-12', 'date_precision':'unknown',
                 'date_source':'content_body', 'date_evidence':'12 September 2026',
                 'claims':[{'text':'Alice approved the inspection.', 'source_ids':['s']}]}
        self.assertEqual(_enforce_event_date(event,evidence)['date_precision'],'exact')
        self.assertEqual(_enforce_event_date(event,evidence)['event_date'],'2026-09-12')
        for change in ({'date_evidence':'15 September 2026'},
                       {'date_source':'metadata'}, {'event_date':'2026-02-31'},
                       {'claims':[{'text':'Alice approved it.', 'source_ids':['other']}] }):
            self.assertEqual(_enforce_event_date({**event,**change},evidence)['event_date'],'')

    def test_independent_verifier_receives_event_date_provenance(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        from src import chronology_v2 as v
        evidence = [EvidenceItem(source_id='s',doc_id='d',file_name='scan.pdf',
                                 excerpt='12 September 2026: Alice approved the inspection.')]
        event = {'event_date':'2026-09-12','date_precision':'exact',
                 'date_source':'content_body','date_evidence':'12 September 2026',
                 'claims':[{'text':'Alice approved the inspection.','source_ids':['s']}]}
        def verify(prompt, **kwargs):
            self.assertIn('"event_date": "2026-09-12"',prompt)
            self.assertIn('"date_evidence": "12 September 2026"',prompt)
            return SimpleNamespace(raw={'decisions':[{'claim_ref':'event:0:0','supported':True,'reason_code':'supported'}]})
        with patch('src.llm_client.generate_response_json',side_effect=verify):
            result=v.verify_claims(prepared=v.PreparedChronologyQuery('q','q',(),(),(),(),(),()),
                chronology={'entries':[event]},evidence=evidence,cache_context='test')
        self.assertTrue(result['event:0:0'])


if __name__ == '__main__':
    unittest.main()
