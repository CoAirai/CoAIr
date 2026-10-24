"""Agent prompt boundaries, including global labels attached to local records."""
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from src.project_context import set_current_project
from src.react_agent import ReActAgent
from src.hybrid_executor import HybridExecutor


def document(project, name, topics, kind='document'):
    return SimpleNamespace(project_id=project, doc_id=name, file_name=name + '.pdf',
        llm_summary=name + ' source summary', llm_topics=topics, file_type=kind,
        cluster_label='FOREIGN GLOBAL CLUSTER')


class MetadataScopeTests(unittest.TestCase):
    def setUp(self):
        self.records = [document('a', 'utilities', ['Utility diversion']),
                        document('a', 'notices', ['Utility diversion', 'Delay notice']),
                        document('b', 'rival-claim', ['Rival confidential claim'])]
        self.registry = MagicMock()
        self.registry.get_completed.side_effect = lambda project_id=None: [
            r for r in self.records if project_id is None or r.project_id == project_id]
        self.registry_patch = patch('src.document_registry.get_document_registry', return_value=self.registry)
        self.registry_patch.start()
        cluster_patch = patch('src.document_clusterer.get_clusterer', return_value=SimpleNamespace(
            list_clusters=lambda: [{'label': 'FOREIGN GLOBAL CLUSTER', 'doc_count': 3}]))
        cluster_patch.start()
        self.addCleanup(cluster_patch.stop)
        self.addCleanup(self.registry_patch.stop)
        self.addCleanup(set_current_project, '')
        self.hybrid = HybridExecutor()
        self.hybrid._light_graph = MagicMock()
        self.hybrid._light_graph.get_statistics.return_value = {'node_count': 1}
        self.hybrid._light_graph.get_all_parties.return_value = [{'party': 'FOREIGN PARTY'}]
        set_current_project('a')

    def prompts(self):
        return ReActAgent._corpus_map(), self.hybrid._build_doc_context('utility diversion')

    def test_project_topics_and_documents_exclude_global_metadata(self):
        for text in self.prompts():
            self.assertIn('Utility diversion (2)', text)
            self.assertNotIn('Rival', text)
            self.assertNotIn('FOREIGN', text)
        text = self.hybrid._build_doc_context('utility')
        self.assertIn('utilities.pdf', text)
        self.assertNotIn('rival-claim.pdf', text)
        self.hybrid._light_graph.get_all_parties.assert_not_called()

    def test_project_switch_does_not_reuse_previous_metadata(self):
        self.prompts()
        set_current_project('b')
        for text in self.prompts():
            self.assertIn('Rival confidential claim', text)
            self.assertNotIn('Utility diversion', text)
            self.assertNotIn('utilities.pdf', text)

    def test_empty_or_missing_project_never_falls_back_to_global(self):
        for project in ('empty-project', ''):
            set_current_project(project)
            self.assertEqual(ReActAgent._corpus_map(), '')
            self.assertEqual(self.hybrid._build_doc_context(), 'No documents loaded.')

    def test_document_selection_also_scopes_topics(self):
        self.assertNotIn('Delay notice', ReActAgent._corpus_map(['utilities']))
        text = self.hybrid._build_doc_context('utility', doc_ids=['utilities'])
        self.assertIn('utilities.pdf', text)
        self.assertNotIn('notices.pdf', text)
        self.assertNotIn('Delay notice', text)
        self.assertEqual(self.hybrid._build_doc_context(doc_ids=['rival-claim']), 'No documents loaded.')

    def test_registry_failure_fails_closed(self):
        self.registry.get_completed.side_effect = RuntimeError('unavailable')
        self.assertEqual(ReActAgent._corpus_map(), '')
        self.assertEqual(self.hybrid._build_doc_context(), 'No documents loaded.')

    def test_registry_cannot_return_another_project_record(self):
        self.registry.get_completed.side_effect = None
        self.registry.get_completed.return_value = self.records
        for text in self.prompts():
            self.assertNotIn('Rival', text)
            self.assertNotIn('rival-claim.pdf', text)

    def test_table_context_ranks_with_project_and_explicit_allowlist(self):
        da = MagicMock()
        da.get_tables_for_project.side_effect = lambda project: ['costs-a'] if project == 'a' else []
        # Deliberately return a foreign candidate as well, to check final fencing.
        da.select_tables.return_value = ['costs-a', 'costs-b']
        da.sql_table_names.return_value = ['costs-b', 'costs-a']
        da.get_table_summary.return_value = {'columns': ['cost'], 'row_count': 1}
        self.hybrid._data_analyzer = da
        self.hybrid._jargon = SimpleNamespace(build_column_context=lambda columns: '')
        with patch('src.document_rag._current_user_corpus', return_value=''):
            for query in ('cost', ''):
                text = self.hybrid._build_table_context(query)
                self.assertIn('costs-a', text)
                self.assertNotIn('costs-b', text)
            da.select_tables.assert_called_with('cost', max_tables=8, allowed_tables=['costs-a'])
            self.assertEqual(self.hybrid._build_table_context('cost', allowed_tables=[]),
                             'No reliable data tables loaded.')
            self.assertEqual(self.hybrid._build_table_context('cost', allowed_tables=['costs-b']),
                             'No reliable data tables loaded.')
            set_current_project('empty-project')
            self.assertEqual(self.hybrid._build_table_context('cost'), 'No reliable data tables loaded.')

    def test_legacy_corpus_table_policy_is_preserved(self):
        da = MagicMock()
        da.get_tables_for_project.return_value = []
        da.get_tables_for_corpus.return_value = ['legacy-edinburgh']
        da.select_tables.return_value = ['legacy-edinburgh', 'costs-b']
        da.get_table_summary.return_value = {'columns': [], 'row_count': 1}
        self.hybrid._data_analyzer = da
        self.hybrid._jargon = SimpleNamespace(build_column_context=lambda columns: '')
        with patch('src.document_rag._current_user_corpus', return_value='edinburgh'):
            text = self.hybrid._build_table_context('cost')
            self.assertIn('legacy-edinburgh', text)
            self.assertNotIn('costs-b', text)


if __name__ == '__main__':
    unittest.main()
