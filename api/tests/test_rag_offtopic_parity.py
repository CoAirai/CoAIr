"""The accepted RAG off-topic behavior survives prompt and router transfer."""
from unittest.mock import Mock
from src.router import QueryRouter
from src.types import QueryType
import pytest


@pytest.mark.parametrize('query', ['What is the weather in London?', 'weather forecast',
                                    'What is 12 + 7?', 'recipe for pancakes'])
def test_obvious_non_project_questions_do_not_retrieve_or_plan(query):
    router = QueryRouter.__new__(QueryRouter)
    router._jargon = Mock(side_effect=AssertionError('must not expand'))
    result = router.classify_query(query)
    assert result.query_type == QueryType.OFFTOPIC and result.used_llm is False
    answer = router._dispatch_query(QueryType.OFFTOPIC, query, query)
    assert not answer['sources'] and answer['query_type'] == 'offtopic'


@pytest.mark.parametrize('query', ['How did weather affect the programme?', 'What is the contract sum?',
                                    'Calculate the total cost from the spreadsheet.'])
def test_real_project_questions_are_not_rejected_as_general_trivia(query):
    assert QueryRouter._classify_obvious_offtopic(query) is None


def test_old_conversation_does_not_change_the_current_question_intent():
    query = '<CONVERSATION_HISTORY>User: weather forecast</CONVERSATION_HISTORY>\nCurrent question: What is the contract sum?'
    assert QueryRouter._classify_obvious_offtopic(query) is None
