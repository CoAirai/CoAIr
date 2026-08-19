from src.ai_reports import _source_id, _to_evidence


def test_source_id_hashes_the_persisted_excerpt_not_only_its_prefix():
    prefix = "letterhead " * 30
    first = _to_evidence("p", {
        "doc_id": "d", "file_name": "letter.pdf", "page_number": 1,
        "text": prefix + "first substantive ending",
    })
    second = _to_evidence("p", {
        "doc_id": "d", "file_name": "letter.pdf", "page_number": 1,
        "text": prefix + "second substantive ending",
    })
    assert first is not None and second is not None
    assert first.source_id != second.source_id


def test_persisted_evidence_reproduces_its_source_id():
    item = _to_evidence("p", {
        "doc_id": "d", "file_name": "letter.pdf", "page_number": 7,
        "text": "dated event evidence",
    })
    assert item is not None
    assert item.source_id == _source_id("p", "d", "page:7", item.excerpt)


def test_table_anchor_is_part_of_source_identity():
    base = {
        "doc_id": "sheet-doc", "file_name": "register.xlsx", "sheet": "Period 01",
        "text": "14 March 2025 progress",
    }
    first = _to_evidence("p", {**base, "row_from": 1, "row_to": 2})
    second = _to_evidence("p", {**base, "row_from": 3, "row_to": 4})
    assert first is not None and second is not None
    assert first.source_id != second.source_id
