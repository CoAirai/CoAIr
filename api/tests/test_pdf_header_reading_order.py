"""Regression for real Edinburgh PDFs with separately drawn header columns."""
import fitz
import pytest

from src.notice_extractor import NoticeExtractor
from src.ocr import OCRPipeline


@pytest.mark.parametrize("field,patterns", [
    ("sender", "SENDER_PATTERNS"),
    ("recipient", "RECIPIENT_PATTERNS"),
    ("subject", "SUBJECT_PATTERNS"),
])
def test_empty_header_does_not_capture_next_label(field, patterns):
    text = "From:\nSent:\nTo:\nSubject:\nAttachments:\n"
    extractor = NoticeExtractor()
    value, evidence = extractor._extract_pattern(
        text, getattr(extractor, patterns), field, {1: text},
    )
    assert value is None
    assert evidence is None


def test_native_extraction_preserves_header_label_value_pairs(tmp_path):
    path = tmp_path / "separate-columns.pdf"
    labels = ["From:", "Sent:", "To:", "Subject:"]
    values = ["Alice Example", "08 March 2011", "Bob Example", "Design change discussion"]
    with fitz.open() as document:
        page = document.new_page()
        # This is the problematic PDF content-stream order: label column,
        # then value column, though they are visually arranged in rows.
        for i, label in enumerate(labels):
            page.insert_text((40, 60 + 20 * i), label)
        for i, value in enumerate(values):
            page.insert_text((140, 60 + 20 * i), value)
        document.save(path)

    pages = OCRPipeline(mode="off").extract_text_auto(str(path))
    extractor = NoticeExtractor()
    for field, patterns, expected in (
        ("sender", extractor.SENDER_PATTERNS, values[0]),
        ("recipient", extractor.RECIPIENT_PATTERNS, values[2]),
        ("subject", extractor.SUBJECT_PATTERNS, values[3]),
    ):
        value, evidence = extractor._extract_pattern(
            pages[0].text, patterns, field, {1: pages[0].text},
        )
        assert value == expected
        assert evidence["page"] == 1
