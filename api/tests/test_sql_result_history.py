"""Structured SQL results retain data, order and provenance after chat reload."""
from datetime import datetime
from unittest.mock import patch

from backend.api.conversations import get_conversation
from src.conversation_store import ConversationStore, Message
from backend.services.response_builder import build_chat_response
import asyncio


def test_structured_result_survives_real_store_round_trip(tmp_path):
    artifact = {
        'generated_sql': 'SELECT date, amount, approved FROM costs',
        'columns': ['date', 'amount', 'approved'], 'tables_used': ['costs'],
        'row_count': 57, 'preview_rows': [{'approved': False, 'amount': 0, 'date': '2026-10-24'}],
        'source_file_id': 'source-a', 'source_file_name': 'costs.xlsx',
        'chart': {'type': 'line', 'x': 'date', 'y': ['amount']},
    }
    with patch('src.conversation_store.CONVERSATIONS_DIR', tmp_path):
        store = ConversationStore('member', 'project-a')
        conversation = store.create_conversation('Cost result')
        store.add_message(conversation.conversation_id, Message(
            role='assistant', content='The costs are shown below.',
            timestamp=datetime.now().isoformat(), query_type='data',
            sql=artifact['generated_sql'], result_data=artifact['preview_rows'],
            sql_artifact=artifact,
        ))
        reloaded = ConversationStore('member', 'project-a')
        response = asyncio.run(get_conversation(conversation.conversation_id, reloaded))
        assert response.messages[0].response.sql_artifact.model_dump() == artifact
        foreign = ConversationStore('member', 'project-b')
        assert foreign.get_conversation(conversation.conversation_id) is None


def test_empty_result_keeps_column_headings_and_old_messages_still_load():
    result = build_chat_response({'query_type': 'data', 'answer': 'No rows.',
        'sql': 'SELECT amount, date FROM costs WHERE false',
        'result_data': [], 'result_columns': ['amount', 'date'], 'sources': []})
    assert result.sql_artifact.columns == ['amount', 'date']
    assert result.sql_artifact.preview_rows == []
    assert result.sql_artifact.row_count == 0
    old = build_chat_response({'query_type': 'data', 'answer': 'Old result',
        'sql': 'SELECT amount FROM costs', 'result_data': [{'amount': 0}], 'sources': []})
    assert old.sql_artifact.preview_rows == [{'amount': 0}]
    assert old.sql_artifact.columns == ['amount']


def test_sql_source_resolves_original_document_within_active_project():
    from types import SimpleNamespace
    from src.project_context import current_project_id_var
    token = current_project_id_var.set('project-a')
    records = [SimpleNamespace(project_id='project-a', file_name='costs.xlsx', doc_id='original-a')]
    catalog = SimpleNamespace(entries={
        'foreign': SimpleNamespace(project_id='project-b', source_file='/private/b/secret.xlsx',
                                   tables=[SimpleNamespace(table_name='cost_view')]),
        'local': SimpleNamespace(project_id='project-a', source_file='/data/a/costs.xlsx',
                                 tables=[SimpleNamespace(table_name='cost_view')]),
    })
    try:
        with patch('src.catalog.get_catalog', return_value=catalog), \
             patch('src.document_registry.get_document_registry', return_value=SimpleNamespace(
                 get_all=lambda project_id: records if project_id=='project-a' else [])):
            result = build_chat_response({'query_type':'data','answer':'Amounts','sql':'SELECT amount FROM cost_view',
                'result_data':[{'amount':0}], 'sources':[{'type':'structured_data','file_name':'cache.parquet',
                'doc_id':'cache-id','table_name':'cost_view'}]})
        assert result.sql_artifact.source_file_id == 'original-a'
        assert result.sql_artifact.source_file_name == 'costs.xlsx'
        assert not result.citations  # Structured provenance has its own source control.
        persisted = result.sql_artifact.model_dump()
        persisted.update(source_file_name='cache.parquet', source_file_id='cache-id')
        with patch('src.catalog.get_catalog', return_value=catalog), \
             patch('src.document_registry.get_document_registry', return_value=SimpleNamespace(
                 get_all=lambda project_id: records if project_id=='project-a' else [])):
            restored = build_chat_response({'query_type':'data','answer':'Amounts',
                'project_id':'project-a','sql_artifact':persisted})
        assert restored.sql_artifact.source_file_id == 'original-a'
        assert restored.sql_artifact.source_file_name == 'costs.xlsx'
    finally:
        current_project_id_var.reset(token)
