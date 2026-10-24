"""Project-local metadata for agent prompts, without global cluster labels."""
from collections import Counter

from .project_context import get_current_project_id


def scoped_documents(doc_ids=None):
    project_id = get_current_project_id()
    if not project_id:
        return []
    from .document_registry import get_document_registry
    records = get_document_registry().get_completed(project_id=project_id)
    return [record for record in records
            if record.project_id == project_id
            and (not doc_ids or record.doc_id in doc_ids)]


def document_topics(records, limit=12):
    # Cluster labels are synthesized across the whole registry. Even a label
    # attached to a local document can contain another tenant's metadata.
    counts = Counter()
    for record in records:
        if record.file_type == 'data':
            continue
        topics = {topic.strip() for topic in (record.llm_topics or [])
                  if isinstance(topic, str) and topic.strip()}
        counts.update(topics)
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
