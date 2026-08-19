"""Rebuildable dense index for canonical event observations.

Canonical truth remains in PostgreSQL. Qdrant receives a separate collection;
Pinecone receives a separate namespace so chunk retrieval can never return an
event narrative by accident.
"""
from __future__ import annotations

import os
import uuid
from typing import Dict, Mapping, Sequence

from .config import EMBEDDING_DIMENSION, QDRANT_COLLECTION


EVENT_COLLECTION = os.getenv("EVENT_VECTOR_COLLECTION", f"{QDRANT_COLLECTION}_events")
EVENT_NAMESPACE = os.getenv("EVENT_VECTOR_NAMESPACE", "__events__")


def validate_event_vector_boundary() -> None:
    if EVENT_COLLECTION == QDRANT_COLLECTION:
        raise RuntimeError("event_vector_collection_must_be_separate")
    if EVENT_NAMESPACE in {"", "__default__"}:
        raise RuntimeError("event_vector_namespace_must_be_separate")


class EventVectorIndex:
    def __init__(self):
        validate_event_vector_boundary()
        from .document_rag import get_document_rag
        self.rag = get_document_rag()
        self.backend = self.rag.backend
        if self.backend == "qdrant":
            self._ensure_qdrant()

    def _ensure_qdrant(self) -> None:
        from qdrant_client.http import models as qmodels
        client = self.rag.qdrant_client
        if not client.collection_exists(EVENT_COLLECTION):
            client.create_collection(
                collection_name=EVENT_COLLECTION,
                vectors_config=qmodels.VectorParams(
                    size=EMBEDDING_DIMENSION, distance=qmodels.Distance.COSINE,
                    on_disk=True,
                ),
            )
        info = client.get_collection(EVENT_COLLECTION)
        schema = getattr(info, "payload_schema", {}) or {}
        for field in ("project_id", "doc_id", "version_id", "observation_id", "cluster_id",
                      "event_type", "normalized_date", "actor", "materiality", "active"):
            if field not in schema:
                client.create_payload_index(
                    collection_name=EVENT_COLLECTION, field_name=field,
                    field_schema=qmodels.PayloadSchemaType.KEYWORD, wait=True,
                )

    @staticmethod
    def _vectors(texts: Sequence[str]):
        from llama_index.core import Settings
        return Settings.embed_model.get_text_embedding_batch(list(texts))

    def index_observations(self, *, project_id: str, doc_id: str, version_id: str,
                           observations: Sequence[Mapping]) -> int:
        if not observations:
            return 0
        vectors = self._vectors([str(item["search_text"]) for item in observations])
        records = []
        for item, vector in zip(observations, vectors):
            date = item.get("date") or {}
            payload = {
                "project_id": project_id, "doc_id": doc_id, "version_id": version_id,
                "observation_id": item["observation_id"],
                "cluster_id": item["cluster"]["cluster_id"], "event_type": item["event_type"],
                "normalized_date": date.get("normalized_date", ""), "actor": item.get("actor", ""),
                "materiality": item.get("materiality", "medium"), "active": "true",
            }
            records.append((item, vector, payload))
        if self.backend == "qdrant":
            from qdrant_client.http import models as qmodels
            self.rag.qdrant_client.upsert(
                collection_name=EVENT_COLLECTION, wait=True,
                points=[qmodels.PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"coair:event:{item['observation_id']}")),
                    vector=vector, payload=payload,
                ) for item, vector, payload in records],
            )
        else:
            self.rag.pinecone_index.upsert(
                vectors=[{"id": str(item["observation_id"]), "values": vector, "metadata": payload}
                         for item, vector, payload in records],
                namespace=EVENT_NAMESPACE,
            )
        return len(records)

    def search(self, *, project_id: str, query: str, limit: int = 240) -> Dict[str, float]:
        from llama_index.core import Settings
        vector = Settings.embed_model.get_query_embedding(query)
        if self.backend == "qdrant":
            from qdrant_client.http import models as qmodels
            result = self.rag.qdrant_client.query_points(
                collection_name=EVENT_COLLECTION, query=vector, limit=limit,
                query_filter=qmodels.Filter(must=[
                    qmodels.FieldCondition(key="project_id", match=qmodels.MatchValue(value=project_id)),
                    qmodels.FieldCondition(key="active", match=qmodels.MatchValue(value="true")),
                ]), with_payload=True,
            )
            return {str(point.payload.get("observation_id")): float(point.score or 0)
                    for point in result.points if point.payload}
        result = self.rag.pinecone_index.query(
            vector=vector, top_k=limit, include_metadata=True, namespace=EVENT_NAMESPACE,
            filter={"project_id": {"$eq": project_id}, "active": {"$eq": "true"}},
        )
        matches = result.get("matches") if isinstance(result, dict) else getattr(result, "matches", [])
        output: Dict[str, float] = {}
        for match in matches or []:
            metadata = match.get("metadata") if isinstance(match, dict) else getattr(match, "metadata", {})
            score = match.get("score") if isinstance(match, dict) else getattr(match, "score", 0)
            if metadata and metadata.get("observation_id"):
                output[str(metadata["observation_id"])] = float(score or 0)
        return output

    def delete_document(self, *, project_id: str, doc_id: str) -> None:
        if self.backend == "qdrant":
            from qdrant_client.http import models as qmodels
            self.rag.qdrant_client.delete(
                collection_name=EVENT_COLLECTION, wait=True,
                points_selector=qmodels.FilterSelector(filter=qmodels.Filter(must=[
                    qmodels.FieldCondition(key="project_id", match=qmodels.MatchValue(value=project_id)),
                    qmodels.FieldCondition(key="doc_id", match=qmodels.MatchValue(value=doc_id)),
                ])),
            )
        else:
            self.rag.pinecone_index.delete(
                namespace=EVENT_NAMESPACE,
                filter={"project_id": {"$eq": project_id}, "doc_id": {"$eq": doc_id}},
            )


_instance = None


def get_event_vector_index() -> EventVectorIndex:
    global _instance
    if _instance is None:
        _instance = EventVectorIndex()
    return _instance


__all__ = [
    "EVENT_COLLECTION", "EVENT_NAMESPACE", "EventVectorIndex", "get_event_vector_index",
    "validate_event_vector_boundary",
]
