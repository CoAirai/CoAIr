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
        for task in ('chronology_extract', 'chronology_synthesis', 'chronology_verify'):
            profile = get_task_profile(task)
            self.assertGreaterEqual(profile.timeout_seconds, 600)
            self.assertLess(profile.max_input_tokens + profile.max_output_tokens,
                            LLM_CONTEXT_TOKENS)


if __name__ == '__main__':
    unittest.main()
