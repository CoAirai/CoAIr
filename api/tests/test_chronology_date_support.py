"""Dates must match both their wording and the event they purport to date."""
import json
from types import SimpleNamespace
import pytest
from src.chronology_v2 import _date_proven, _enforce_event_date, verify_claims, PreparedChronologyQuery
from src.evidence_model import EvidenceItem


@pytest.mark.parametrize("normalized,quote,expected", [
    ("2007-12-04", "4 December 2007", True),
    ("2008-07-03", "03-Jul-08", True),
    ("2008-09-10", "10-Sep-08", True),
    ("2008-07-03", "03/07/08", True),
    ("1908-07-03", "03-Jul-08", False),
    ("2007-12-04", "December 4, 2007", True),
    ("2007-12-04", "04/12/2007", True),
    ("2007-12-05", "4 December 2007", False),
    ("2007-12-04", "December 2007", False),
    ("2007-02-30", "30 February 2007", False),
    ("2007-03-01", "delay 2007", False),
])
def test_normalized_date_must_be_proven_by_quotation(normalized, quote, expected):
    event = dict(event_date=normalized, date_precision="exact", date_source="content_body",
                 date_evidence=quote, claims=[dict(text="Work completed", source_ids=["s1"])])
    evidence = [EvidenceItem("s1", "d1", "a.pdf", excerpt=quote)]
    assert _date_proven(event, evidence) is expected
    result = _enforce_event_date(event, evidence)
    if expected:
        assert result["event_date"] == normalized
    else:
        assert result["event_date"] != normalized
        if result["event_date"]:
            assert _date_proven(result, evidence)
    assert result["claims"] == event["claims"]


def test_verifier_receives_temporal_link_and_keeps_facts_separate(monkeypatch):
    chronology = {"overview_claims":[{"text":"The programme was reviewed", "source_ids":["s1"]}],
        "entries":[{"event_date":"2007-12-04", "date_precision":"exact", "date_source":"content_body",
            "date_evidence":"4 December 2007", "claims":[{"text":"Ground investigations totalled 59000m", "source_ids":["s1"]}]}]}
    def generate(prompt, **kwargs):
        claims = json.loads(prompt.split("CLAIMS:\n")[1].split("\n\nEVIDENCE BEGIN")[0])
        date = next(c for c in claims if c["claim_ref"] == "date:0")
        assert date["event_date"] == "2007-12-04"
        assert "59000m" in date["text"]
        assert "ALL the event's assertions" in prompt
        return SimpleNamespace(raw={"decisions":[{"claim_ref":c["claim_ref"],
            "supported":c["claim_ref"] != "date:0"} for c in claims]})
    monkeypatch.setattr("src.llm_client.generate_response_json", generate)
    result = verify_claims(prepared=PreparedChronologyQuery("q","q",(),(),(),(),(),("q",)),
        chronology=chronology, evidence=[EvidenceItem("s1","d1","a.pdf", excerpt="Design programme: 4 December 2007. Later ground investigations totalled 59000m.")], cache_context="test")
    assert result["event:0:0"] is True and result["date:0"] is False


def test_structured_retry_gets_cardinality_feedback_without_extra_budget(monkeypatch):
    from src import llm_client
    from src.chronology_v2 import OverviewModel
    monkeypatch.setattr(llm_client.time, "sleep", lambda _: None)
    prompts = []
    def native(**kwargs):
        prompts.append(kwargs["prompt"])
        raw = {"overview_claims":[{"text":"Fact", "source_ids":["s1"]}] * (6 if len(prompts)==1 else 5)}
        response = SimpleNamespace(candidates=[SimpleNamespace(finish_reason=SimpleNamespace(name="STOP"))], raw=True)
        return json.dumps(raw), 10, 10, 0, 0, response
    monkeypatch.setattr(llm_client, "_gemini_generate_native", native)
    result = llm_client.generate_response_json("Evidence stays here",system="Use supplied evidence",schema=OverviewModel.model_json_schema(),
        schema_name="overview",validation_model=OverviewModel,task_type="chronology_synthesis",ttl_s=0)
    assert len(result.raw["overview_claims"]) == 5
    assert len(prompts) == 2
    assert "previous output failed validation" in prompts[1]
    assert '"maxItems": 5' in prompts[1]
    assert prompts[1].startswith(prompts[0])


def test_word_report_keeps_supported_claim_when_its_event_date_is_rejected(monkeypatch):
    from src import ai_reports, chronology_v2
    claim = {"text":"Engineer issued notice 17.", "source_ids":["s1"]}
    event = {"event_date":"2007-12-04", "date_precision":"exact", "date_source":"content_body",
             "date_evidence":"4 December 2007", "claims":[claim]}
    monkeypatch.setattr(chronology_v2, "evidence_from_documents", lambda *a: [
        EvidenceItem("s1","d1","notice.pdf",excerpt="4 December 2007: Engineer issued notice 17.")])
    monkeypatch.setattr(chronology_v2, "extract_batches", lambda *a, **k: [event])
    monkeypatch.setattr(chronology_v2, "synthesize", lambda **k: {"overview_claims":[claim], "entries":[event]})
    monkeypatch.setattr(chronology_v2, "verify_claims", lambda **k: {"overview:0":True,"event:0:0":True,"date:0":False})
    original = ai_reports.build_ai_chronology_docx
    def build(**kwargs):
        entry = kwargs["entries"][1]
        assert entry.event_date == "" and entry.date_source == "unresolved"
        assert entry.claims[0].text == claim["text"]
        assert not entry.claims[0].is_inference
        return original(**kwargs)
    monkeypatch.setattr(ai_reports, "build_ai_chronology_docx", build)
    result = ai_reports._generate_chronology_v2(project_id="a", project_name="Qualification", topic="Notice 17", source_doc_ids=["d1"],
        preparation={"prepared":{"original_query":"Notice 17","english_query":"Notice 17"}})
    assert result["docx"].startswith(b"PK")
