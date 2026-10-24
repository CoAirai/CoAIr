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
