from scripts.dgx_ingestion_probe import metadata_field_error


def test_project_event_date_is_not_a_document_date_even_with_exact_quote():
    quote = "Phase 1 received Parliamentary approval in March 2006"
    item = {"name": "document_date", "value": "March 2006", "page": 1, "quote": quote}
    assert metadata_field_error(item, {1: quote}) == "document_date_requires_explicit_header"


def test_explicit_sent_header_is_accepted():
    quote = "Sent: 08 March 2011 23:46"
    item = {"name": "document_date", "value": "08 March 2011 23:46", "page": 1, "quote": quote}
    assert metadata_field_error(item, {1: quote}) is None


def test_later_embedded_letter_is_not_used_as_document_header():
    quote = "Date: 08 March 2011"
    item = {"name": "document_date", "value": "08 March 2011", "page": 4, "quote": quote}
    assert metadata_field_error(item, {4: quote}) == "document_date_requires_explicit_header"


def test_invented_quote_is_rejected():
    item = {"name": "sender", "value": "Alice", "page": 1, "quote": "From: Alice"}
    assert metadata_field_error(item, {1: "From: Bob"}) == "quotation_mismatch"
