"""Preserve sourced prose without accepting fabricated facts or clusters."""
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from src.ai_reports import _claim_supported
from src.chronology_v2 import (
    PreparedChronologyQuery, _claims_are_source_valid, _enforce_event_date, synthesize,
)
from src.evidence_model import EvidenceItem, VerifiedClaim


class ChronologyClaimParityTests(unittest.TestCase):
    def test_rag_claim_capacity_preserves_atomic_sourced_paragraphs(self):
        from pydantic import ValidationError
        from src.chronology_v2 import OverviewModel, EventModel
        claim = {'text': 'A sourced fact.', 'source_ids': ['s1']}
        OverviewModel.model_validate({'overview_claims': [claim] * 5})
        EventModel.model_validate({'claims': [claim] * 4})
        with self.assertRaises(ValidationError):
            OverviewModel.model_validate({'overview_claims': [claim] * 6})
        with self.assertRaises(ValidationError):
            EventModel.model_validate({'claims': [claim] * 5})

    def test_rejection_diagnostics_identify_schema_without_logging_source_text(self):
        from src.chronology_v2 import OverviewModel
        from src.llm_client import _structured_text_validator
        text = json.dumps({'overview_claims': [dict(text='PRIVATE SOURCE TEXT', source_ids=['s1'])] * 6})
        with patch('src.llm_client.logger.warning') as warning:
            self.assertFalse(_structured_text_validator(text, OverviewModel.model_json_schema(), OverviewModel))
        message = str(warning.call_args)
        self.assertIn('overview_claims', message)
        self.assertIn('too_long', message)
        self.assertNotIn('PRIVATE SOURCE TEXT', message)

    def test_punctuation_does_not_invent_numbers_or_reject_supported_year(self):
        evidence = [EvidenceItem('s1', 'd1', 'notice.pdf',
                                excerpt='October 2006: Notice 17 was issued')]
        for text, expected in [('In October 2006, Notice 17 was issued.', True),
                               ('The notice was issued in 2006.', True),
                               ('Notice 99 was issued in 2006.', False),
                               ('The delay was 1.5 days.', False)]:
            with self.subTest(text=text):
                claim = {'text': text, 'source_ids': ['s1']}
                self.assertEqual(_claims_are_source_valid({'overview_claims': [claim]}, evidence), expected)
                self.assertEqual(_claim_supported(VerifiedClaim(text, ['s1']),
                                                 {'s1': evidence[0]}), expected)

    def test_proven_day_precision_matches_renderer_contract(self):
        evidence = [EvidenceItem('s1', 'd1', 'notice.pdf', excerpt='19 April 2007: notice issued')]
        event = dict(event_date='2007-04-19', date_precision='day', date_source='content_header',
                     date_evidence='19 April 2007', claims=[dict(text='notice issued', source_ids=['s1'])])
        self.assertEqual(_enforce_event_date(event, evidence)['date_precision'], 'exact')
        event['date_evidence'] = 'not in the document'
        self.assertEqual(_enforce_event_date(event, evidence)['event_date'], '')

    def test_synthesis_prunes_individual_claims_and_fails_when_nothing_survives(self):
        evidence = [EvidenceItem('s1', 'd1', 'notice.pdf', excerpt='Notice 17 was issued.')]
        good = {'text': 'Notice 17 was issued.', 'source_ids': ['s1']}
        bad = {'text': 'The delay lasted 999 days.', 'source_ids': ['s1']}
        for stage in ('overview', 'events', 'all-overview', 'all-events', 'missing-cluster'):
            def generate(prompt, **kwargs):
                if kwargs['schema_name'] == 'chronology_v2_overview':
                    claims = [bad] if stage == 'all-overview' else [good, bad] if stage == 'overview' else [good]
                    raw = {'overview_claims': claims}
                else:
                    cluster = json.loads(prompt.split('EVENT CLUSTERS:\n', 1)[1]
                                         .split('\n\nEVIDENCE BEGIN', 1)[0])[0]
                    claims = [bad] if stage == 'all-events' else [good, bad] if stage == 'events' else [good]
                    raw = {'entries': [{'cluster_id': cluster['cluster_id'], 'claims': claims}]}
                    if stage == 'missing-cluster':
                        raw = {'entries': []}
                kwargs['validation_model'].model_validate(raw)
                validator = kwargs.get('semantic_validator')
                if validator and not validator(raw):
                    raise ValueError('model_output_invalid')
                return SimpleNamespace(raw=raw)

            def run():
                return synthesize(prepared=PreparedChronologyQuery('q', 'q', (), (), (), (), (), ('q',)),
                                  candidates=[{'claims': [good]}], evidence=evidence, cache_context='test')

            with self.subTest(stage=stage), patch('src.llm_client.generate_response_json', side_effect=generate):
                errors = {'all-overview': 'source_verification_failed',
                          'all-events': 'insufficient_evidence', 'missing-cluster': 'model_output_invalid'}
                if stage in errors:
                    with self.assertRaisesRegex(ValueError, errors[stage]):
                        run()
                else:
                    result = run()
                    self.assertEqual([c['text'] for c in result['overview_claims']], [good['text']])
                    self.assertEqual([c['text'] for c in result['entries'][0]['claims']], [good['text']])


if __name__ == '__main__':
    unittest.main()
