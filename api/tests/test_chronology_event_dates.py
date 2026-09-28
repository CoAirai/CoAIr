import unittest
from src.chronology_dates import event_date_is_grounded as grounded
from src.chronology_v2 import _enforce_event_date
from src.evidence_model import EvidenceItem


class EventDateSeparationTests(unittest.TestCase):
    def test_upload_and_document_metadata_are_not_sources(self):
        for source in ('uploaded_at','ingested_at','indexed_at','created_at','modified_at','metadata','document_date'):
            self.assertFalse(grounded('2026-09-28','exact',source,'28 September 2026',['28 September 2026']))

    def test_system_timestamp_label_cannot_be_disguised_as_content(self):
        for label in ('Uploaded at','Upload date','uploaded_at','Ingested','Indexed','Processed on','File created','Last modified','created_at'):
            text=f'{label}: 28 September 2026\nThe inspection date is not recorded.'
            self.assertFalse(grounded('2026-09-28','exact','content_header','28 September 2026',[text]),label)

    def test_source_event_date_is_independent_of_document_and_upload_dates(self):
        text='Uploaded at: 28 September 2026\nReport dated 5 June 2010.\nThe inspection finished on 12 April 2007.'
        self.assertTrue(grounded('2007-04-12','exact','content_body','12 April 2007',[text]))
        self.assertFalse(grounded('2026-09-28','exact','content_body','12 April 2007',[text]))
        self.assertFalse(grounded('2010-06-05','exact','content_body','12 April 2007',[text]))

    def test_no_invented_day_or_invalid_calendar_date(self):
        self.assertTrue(grounded('2007-04','month','content_body','April 2007',['Works began in April 2007.']))
        self.assertFalse(grounded('2007-04-01','exact','content_body','April 2007',['Works began in April 2007.']))
        self.assertFalse(grounded('2026-02-31','exact','content_body','31 February 2026',['31 February 2026']))
        self.assertTrue(grounded('2007-04-12','exact','content_body','12 Apr 2007',['12 Apr 2007']))

    def test_unknown_event_keeps_claim_without_date_fallback(self):
        event={'event_date':'2026-09-28','date_precision':'exact','date_source':'uploaded_at',
               'date_evidence':'28 September 2026','claims':[{'text':'Inspection completed.','source_ids':['s']}]}
        result=_enforce_event_date(event,[EvidenceItem(source_id='s',doc_id='d',file_name='scan.pdf',document_date='2010-06-05',excerpt='Inspection completed; date unknown.')])
        self.assertEqual(result['event_date'],'')
        self.assertEqual(result['date_source'],'unresolved')
        self.assertEqual(result['claims'],event['claims'])

    def test_month_only_event_loses_invented_day_but_keeps_month(self):
        event={'event_date':'2007-04-01','date_precision':'exact','date_source':'content_body',
               'date_evidence':'April 2007','claims':[{'text':'Works began.','source_ids':['s']}]}
        result=_enforce_event_date(event,[EvidenceItem(source_id='s',doc_id='d',file_name='d.pdf',excerpt='Works began in April 2007.')])
        self.assertEqual((result['event_date'],result['date_precision']),('2007-04','month'))

    def test_v3_rejects_mismatched_date_and_retains_undated_events(self):
        from src.chronology_v3 import _events_valid, _final_valid
        evidence=[EvidenceItem(source_id='s',doc_id='d',file_name='d.pdf',excerpt='Alice completed inspection on 12 April 2007.')]
        raw={'event_date':'2026-09-28','date_precision':'exact','date_source':'content_body','date_evidence':'12 April 2007','supporting_source_ids':['s'],'actor':'Alice','action':'completed inspection'}
        self.assertFalse(_events_valid({'entries':[raw]},evidence))
        self.assertTrue(_events_valid({'entries':[{**raw,'event_date':'2007-04-12'}]},evidence))
        claim={'text':'Alice completed inspection.','source_ids':['s']}
        self.assertTrue(_final_valid({'overview_claims':[claim],'entries':[{'event_date':'','date_source':'unresolved','date_evidence':'','claims':[claim]}]},evidence,enforce_style=False))
