import asyncio
from types import SimpleNamespace
import pytest

@pytest.mark.parametrize('owner,accepted', [('alice',True),('someone-else',False)])
def test_local_admission_handoff_preserves_owner(monkeypatch,owner,accepted):
    from src import config, user_store, run_store
    from backend.tasks import query_progress as progress_module
    from backend.services.chat_orchestrator import ChatOrchestrator
    progress=progress_module.QueryProgress()
    progress.start('local-request',owner)
    progress.add('local-request','thinking','Waiting for an available generation slot')
    monkeypatch.setattr(progress_module,'query_progress',progress)
    monkeypatch.setattr(config,'LOCAL_LLM',True)
    monkeypatch.setattr(user_store,'get_user_store',lambda:SimpleNamespace(enforce_quota=lambda u:None))
    monkeypatch.setattr(run_store,'get_run_store',lambda:SimpleNamespace(start=lambda **kw:None))
    class ReachedConversationWrite(Exception):pass
    class Store:
        def add_message(self,*args):raise ReachedConversationWrite()
    expected=ReachedConversationWrite if accepted else ValueError
    with pytest.raises(expected):
        asyncio.run(ChatOrchestrator().process('question','conversation',None,Store(),
                    username='alice',request_id='local-request',project_id='project'))
    assert progress.get('local-request').username==owner
    assert len(progress.get('local-request').steps)==1
