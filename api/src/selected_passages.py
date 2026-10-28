"""Stream every page of owned selected documents without growing prompt memory."""
from __future__ import annotations


def selected_passages(con, registry, project_id: str, doc_id: str, file_name: str):
    rows = con.execute(
        "SELECT page_number,text FROM chunks WHERE project_id=? AND doc_id=? "
        "ORDER BY page_number,chunk_id", [project_id, doc_id],
    )
    first = rows.fetchmany(32)
    if not first:
        # Legacy IDs may differ, but an ambiguous filename is never an identity.
        owned = [r for r in registry.get_all(project_id=project_id)
                 if r.file_name == file_name]
        if len(owned) != 1 or owned[0].doc_id != doc_id:
            return
        rows = con.execute(
            "SELECT page_number,text FROM chunks WHERE project_id=? AND file_name=? "
            "ORDER BY page_number,chunk_id", [project_id, file_name],
        )
        first = rows.fetchmany(32)
    while first:
        for page, text in first:
            text = text or ""
            # Overlap keeps phrases at window boundaries available for ranking.
            for offset in range(0, len(text), 1600):
                passage = text[offset:offset + 1800].strip()
                if passage:
                    yield page or 1, passage
        first = rows.fetchmany(32)
