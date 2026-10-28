"""Identical executable memory contract for the RAG and Coair orchestrators."""
import pytest

from backend.services.chat_orchestrator import ChatOrchestrator
from src.conversation_store import Message


@pytest.mark.parametrize('question', [
    'Which contractor delivered the Haymarket depot roof works in 2011?',
    'What is the utilities diversion programme?',
    'Summarize the project obligations.',
    'What is this project about?',
    '',
])
def test_standalone_queries_ignore_unrelated_history(question):
    history = [Message(role='assistant', content='Unrelated confidential old subject', timestamp='t')]
    assert ChatOrchestrator._followup_context(history, question) == ''


@pytest.mark.parametrize('question', [
    'What about the second notice?', 'Where is this coming from?',
    'Compare it with the previous figure.', 'And the contractor?',
    'You answered the total project budget is £411.5M, where is this coming from?',
])
def test_followups_use_only_the_last_pair(question):
    history = [
        Message(role='user', content='OLD_TOPIC_SHOULD_NOT_RETURN', timestamp='t0'),
        Message(role='user', content='What was the budget?', timestamp='t1'),
        Message(role='assistant', content='The cited budget was £411.5M.', timestamp='t2'),
    ]
    context = ChatOrchestrator._followup_context(history, question)
    assert '£411.5M' in context
    assert 'What was the budget?' in context
    assert 'OLD_TOPIC_SHOULD_NOT_RETURN' not in context


def test_context_remains_bounded_with_large_answers():
    history = [Message(role='assistant', content='x' * 50000, timestamp='t')]
    assert len(ChatOrchestrator._followup_context(history, 'Explain it.')) <= 3100


def test_new_conversation_has_no_invented_context():
    assert ChatOrchestrator._followup_context([], 'And that?') == ''
