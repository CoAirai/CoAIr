import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace


class MetadataRevisionTests(unittest.TestCase):
    def setUp(self):
        import duckdb
        self.con = duckdb.connect(':memory:')
        self.con.execute('CREATE TABLE chunks(project_id VARCHAR,doc_id VARCHAR,file_name VARCHAR,page_number INT,text VARCHAR)')
        self.con.execute('CREATE TABLE document_index(project_id VARCHAR,doc_id VARCHAR,search_text VARCHAR,metadata_date_source VARCHAR,ocr_quality VARCHAR,content_hash VARCHAR)')
        for project, doc in [('p','a'),('p','b'),('other','a')]:
            self.con.execute("INSERT INTO chunks VALUES (?,?,?,1,'unchanged OCR')",[project,doc,doc+'.pdf'])
            self.con.execute("INSERT INTO document_index VALUES (?,?,'old metadata','unknown','good','hash')",[project,doc])
        self.patch = patch('src.chunk_store.get_chunk_store',return_value=SimpleNamespace(connection=lambda:self.con))
        self.patch.start()

    def tearDown(self):
        self.patch.stop(); self.con.close()

    def test_metadata_only_change_invalidates_selected_evidence(self):
        from src.chronology_v2 import _corpus_revision
        before = _corpus_revision('p',['a'])
        self.con.execute("UPDATE document_index SET search_text='Revised inspection title Alice 2026-09-14' WHERE project_id='p' AND doc_id='a'")
        self.assertNotEqual(before,_corpus_revision('p',['a']))

    def test_other_project_and_unselected_document_do_not_invalidate(self):
        from src.chronology_v2 import _corpus_revision
        before = _corpus_revision('p',['a'])
        self.con.execute("UPDATE document_index SET search_text='changed' WHERE project_id='other' OR doc_id='b'")
        self.assertEqual(before,_corpus_revision('p',['a']))


class ReviewedMetadataTests(unittest.TestCase):
    def run_update(self, review):
        from src.event_memory import ObservationBatch, _persist_document_metadata
        from src.document_index import DocumentIndexRecord
        record=DocumentIndexRecord(project_id='p',doc_id='a',file_name='a.pdf',title='Old',
            description='Old summary',parties=['Old person'],topics=['existing'],metadata_date='2026-09-12')
        index=Mock();index.list_project.return_value=[record];registry=Mock()
        batch=ObservationBatch(document_title='Model title',document_summary='Model summary',
            document_type='notice',document_parties=['Model person'],document_topics=['new event topic'])
        with patch('src.config.LOCAL_LLM',True),patch('src.document_review.ReviewStore') as reviews,patch('src.document_index.get_document_index',return_value=index),patch('src.document_registry.get_document_registry',return_value=registry):
            reviews.return_value.get.return_value=review
            _persist_document_metadata('p',{'doc_id':'a'},batch)
            reviews.return_value.get.assert_called_once_with('p','a')
        return index.upsert.call_args.args[0],registry

    def test_event_worker_preserves_reviewed_fields_and_explicit_removals(self):
        record,registry=self.run_update({'version':1,'metadata':{'title':'Reviewed title','summary':'',
            'doc_type':'inspection','people':'Alice Morgan','organizations':'','sender':'','recipient':''}})
        self.assertEqual(record.title,'Reviewed title')
        self.assertEqual(record.description,'')
        self.assertEqual(record.parties,['Alice Morgan'])
        self.assertEqual(record.document_family,'inspection')
        self.assertEqual(record.metadata_date,'2026-09-12')
        self.assertIn('new event topic',record.topics)
        self.assertEqual(registry.set_llm_enrichment.call_args.kwargs['summary'],'')

    def test_unreviewed_document_can_still_gain_event_metadata(self):
        record,_=self.run_update({'version':0,'metadata':{'title':'Baseline'}})
        self.assertEqual(record.title,'Model title')
        self.assertEqual(record.description,'Model summary')
        self.assertEqual(record.parties,['Old person','Model person'])
