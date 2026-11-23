"""Research-grounded deck writing (app/ai/deck_writer.py, app/ai/compiler.py).

No network and no real model: a fake provider answers each prompt and the dossier is a
hand-written research registry.
"""

import json

from app.ai.compiler import compile_semantic_slide
from app.ai.deck_writer import DeckWriter, GenerationUnavailable, number_citations, to_semantic
from app.ai.research_pipeline import clean_topic, cross_check, extract_evidence, format_reference, term_set

DOSSIER = {
    "topic": "human brain",
    "plan": {"topic": "human brain", "domain": "science_medicine", "audience": "students", "purpose": "", "depth": "intro",
             "subtopics": [{"name": "Brain anatomy", "questions": ["What are the major structures?"], "search_terms": "brain anatomy"},
                           {"name": "Neural communication", "questions": ["How do neurons signal?"], "search_terms": "neuron signaling"}]},
    "research_mode": "live",
    "sources": [
        {"id": "S1", "title": "Brain", "kind": "encyclopedia", "venue": "Wikipedia", "url": "https://en.wikipedia.org/wiki/Brain",
         "authors": [], "published": "2026-11-01", "doi": "",
         "evidence": [
             {"id": "S1.1", "text": "The human brain contains about 86 billion neurons connected by trillions of synapses.", "numbers": ["86 billion"]},
             {"id": "S1.2", "text": "The cerebrum is the largest part of the brain and is divided into two hemispheres.", "numbers": []},
         ]},
        {"id": "S2", "title": "Neurotransmission review", "kind": "journal", "venue": "Nature Reviews Neuroscience",
         "url": "https://doi.org/10.1/x", "authors": ["Ada Lovelace", "Alan Turing"], "published": "2019", "doi": "10.1/x",
         "evidence": [
             {"id": "S2.1", "text": "Neurons communicate through electrical impulses and chemical neurotransmitters released at synapses.", "numbers": []},
             {"id": "S2.2", "text": "The adult brain uses about 20% of the body's energy.", "numbers": ["20%"]},
         ]},
    ],
}
DOSSIER["citations"] = []


class FakeModel:
    name = "openrouter"
    is_configured = True

    def __init__(self, replies):
        self.replies = replies
        self.calls = []

    def complete_json(self, system, user, max_tokens=0):
        self.calls.append(user)
        for key, reply in self.replies.items():
            if key in system:
                return reply() if callable(reply) else reply
        raise RuntimeError("unexpected prompt")


OUTLINE = {"title": "The human brain", "slides": [
    {"title": "The human brain", "visual": "image", "evidence": ["S1.1"], "image_query": "human brain"},
    {"title": "How neurons signal", "visual": "chart", "evidence": ["S2.1", "S2.2"]},
    {"title": "Major structures of the brain", "visual": "diagram", "evidence": ["S1.2"], "image_query": "cerebrum diagram"},
]}

SLIDES = {"slides": [
    {"index": 1, "title": "The human brain", "subtitle": "Structure and signalling", "points": [], "visual": {"type": "image"}},
    {"index": 2, "title": "How neurons signal", "points": [
        {"text": "Neurons communicate with electrical impulses and chemical neurotransmitters", "citations": ["S2"]},
        {"text": "The brain uses about 20% of the body's energy", "citations": ["S1"]},  # wrong source: must be re-attributed
        {"text": "Stakeholder alignment reached 91.2% this year", "citations": []},  # invented: must be removed
    ], "visual": {"type": "chart", "chart": {"kind": "bar", "title": "Made-up growth", "data": [
        {"label": "2022", "value": 28}, {"label": "2023", "value": 46}]}}},
    {"index": 3, "title": "Major structures of the brain", "points": [
        {"text": "The cerebrum is the largest part and has two hemispheres", "citations": ["S1.2"]},
        {"text": "The brain contains about 86 billion neurons", "citations": ["S1"]},
    ], "visual": {"type": "diagram", "image_query": "cerebrum"}},
]}

REVIEW = {"slides": [{"index": 1, "on_topic": True}, {"index": 2, "on_topic": True}, {"index": 3, "on_topic": True}]}


def writer_with(replies):
    return DeckWriter(FakeModel(replies))


def test_outline_comes_from_the_model_and_keeps_only_real_evidence_ids():
    w = writer_with({"Design the structure": {**OUTLINE, "slides": [*OUTLINE["slides"][:2], {**OUTLINE["slides"][2], "evidence": ["S9.9", "S1.2"]}]}})
    out = w.outline("A board briefing on brain", 3, "Board", "English", DOSSIER)
    assert [s["title"] for s in out["slides"]] == ["The human brain", "How neurons signal", "Major structures of the brain"]
    assert out["slides"][2]["evidence"] == ["S1.2"]  # S9.9 does not exist
    assert out["slides"][0]["layout"] == "title" and out["slides"][1]["layout"] == "chart-text"


def test_outline_without_the_model_uses_research_subtopics_not_templates():
    w = writer_with({})  # every call fails
    out = w.outline("A board briefing on brain", 3, "Board", "English", DOSSIER)
    titles = " ".join(s["title"] for s in out["slides"]).lower()
    assert "brain anatomy" in titles and "neural communication" in titles
    for banned in ("strategic", "stakeholder", "capital", "executive", "roadmap"):
        assert banned not in titles


def test_no_model_and_no_research_is_an_error_not_a_template_deck():
    try:
        writer_with({}).outline("brain", 3, "Board", "English", {**DOSSIER, "sources": []})
        raise AssertionError("expected GenerationUnavailable")
    except GenerationUnavailable:
        pass


def test_slides_drop_invented_numbers_reattribute_misplaced_citations_and_unsupported_charts():
    w = writer_with({"Write the content": SLIDES, "Check a generated presentation": REVIEW})
    outline = {**OUTLINE, "research_dossier": DOSSIER, "slides": [dict(s, layout="x") for s in OUTLINE["slides"]]}
    slides = w.write(outline, "A board briefing on brain", "Board", "English")
    s2 = slides[1]
    texts = [p["text"] for p in s2["points"]]
    assert not any("91.2" in t for t in texts), "invented statistic must be removed"
    energy = next(p for p in s2["points"] if "20%" in p["text"])
    assert energy["citations"] == ["S2"], "the number is only in S2, so S2 is the citation"
    assert s2["visual"]["type"] == "image", "a chart whose values are not in the evidence is dropped"
    assert any(r["visual"] == "chart" for r in w.report["dropped_visuals"])
    assert any("91.2" in r["claim"] for r in w.report["removed_claims"])


def test_semantic_slides_carry_numbered_claim_citations_and_a_reference_slide():
    w = writer_with({"Write the content": SLIDES, "Check a generated presentation": REVIEW})
    outline = {**OUTLINE, "research_dossier": DOSSIER}
    slides = w.write(outline, "brain", "Board", "English")
    sem = to_semantic(slides, DOSSIER, "The human brain")
    numbers = number_citations(slides, DOSSIER)
    assert numbers == {"S2": 1, "S1": 2}
    assert sem[1]["bullets"][0].endswith("[1]")
    refs = sem[-1]
    assert refs["layout"] == "references" and refs["title"] == "References"
    assert refs["references"][0].startswith("[1] Ada Lovelace, Alan Turing. (2019). Neurotransmission review")
    assert "doi:10.1/x" in refs["references"][0]
    assert refs["references"][1].startswith("[2] Wikipedia contributors") or "[2]" in refs["references"][1]


def test_drifted_slide_is_repaired_or_replaced_with_cited_evidence():
    corporate = {"slides": [
        {"index": 1, "title": "The human brain", "points": [], "visual": {"type": "image"}},
        {"index": 2, "title": "Strategic intelligence briefing", "points": [{"text": "Capital commitment remains strong", "citations": []}], "visual": {"type": "none"}},
        {"index": 3, "title": "Major structures of the brain", "points": [{"text": "The cerebrum has two hemispheres", "citations": ["S1"]}], "visual": {"type": "image"}},
    ]}
    w = writer_with({"Write the content": corporate, "Check a generated presentation": {"slides": []}})
    slides = w.write({**OUTLINE, "research_dossier": DOSSIER}, "brain", "Board", "English")
    s2 = slides[1]
    assert "strategic" not in s2["title"].lower()
    assert all(p["citations"] for p in s2["points"]) and s2.get("extractive")
    assert 2 in w.report["extractive_slides"]


def test_compiler_never_invents_charts_kpis_citations_or_images():
    spec, ds = compile_semantic_slide({"title": "Neurons", "layout": "chart-text", "bullets": ["Neurons signal"]}, 2)
    assert spec["layout"] == "text" and not ds
    types = [b["type"] for b in spec["blocks"]]
    assert "chart" not in types and "citation" not in types and "control" not in types
    spec, _ = compile_semantic_slide({"title": "Neurons", "layout": "big-number", "bullets": ["x"]}, 2)
    assert "kpi" not in [b["type"] for b in spec["blocks"]]
    spec, _ = compile_semantic_slide({"title": "Neurons", "layout": "image-text", "bullets": ["x"], "visual_type": "image"}, 2)
    assert "image" not in [b["type"] for b in spec["blocks"]], "no generic stand-in image"


def test_compiler_keeps_research_chart_with_its_source_and_image_credit():
    spec, ds = compile_semantic_slide({
        "title": "Energy use", "layout": "chart-text", "bullets": ["The brain uses 20% of energy [1]"],
        "chart": {"kind": "bar", "title": "Share (%)", "data": [{"category": "Brain", "value": 20}, {"category": "Rest", "value": 80}], "source": "research", "citations": [1]},
        "citations": ["[1] Lovelace et al. (2019): Neurotransmission review"],
    }, 2)
    (name, dataset), = ds.items()
    assert dataset["source"] == "research" and dataset["citations"] == ["[1]"]
    chart = next(b for b in spec["blocks"] if b["type"] == "chart")
    assert chart["props"]["sourceNote"] == "Source: [1]"
    spec, _ = compile_semantic_slide({"title": "Cerebrum", "layout": "image-text", "bullets": ["x"], "visual_type": "image",
                                      "image": {"url": "https://upload.wikimedia.org/a.png", "credit": "Image: A, CC BY-SA 4.0 via Wikimedia Commons", "alt": "Cerebrum"}}, 3)
    img = next(b for b in spec["blocks"] if b["type"] == "image")
    assert img["props"]["credit"].startswith("Image: A") and img["assetId"].startswith("https://upload.wikimedia.org")


def test_research_helpers():
    assert clean_topic("A board briefing on brain") == "brain"
    assert clean_topic("Make a presentation about DNA structure") == "DNA structure"
    ev = extract_evidence("The human brain contains about 86 billion neurons. Click here to subscribe to our newsletter today now.",
                          term_set("neurons"), term_set("brain"), 5)
    assert [e["text"] for e in ev] == ["The human brain contains about 86 billion neurons."]
    sources = [
        {"id": "S1", "evidence": [{"text": "Global temperature rose 1.1 degrees since preindustrial times", "numbers": ["1.1"]}]},
        {"id": "S2", "evidence": [{"text": "Since preindustrial times global temperature increased 1.1 degrees", "numbers": ["1.1"]}]},
    ]
    cross_check(sources)
    assert sources[0]["evidence"][0]["corroborated_by"] == ["S2"]
    line = format_reference({"title": "Brain", "kind": "encyclopedia", "organization": "Wikipedia contributors", "venue": "Wikipedia",
                             "url": "https://en.wikipedia.org/wiki/Brain", "published": "2026-11-01", "authors": []}, 3)
    assert line.startswith("[3] Wikipedia contributors. Brain. Wikipedia. https://en.wikipedia.org/wiki/Brain")


def test_prompts_carry_the_original_request_to_every_stage():
    w = writer_with({"Write the content": SLIDES, "Check a generated presentation": REVIEW, "Design the structure": OUTLINE})
    w.outline("A board briefing on brain", 3, "Board", "English", DOSSIER)
    w.write({**OUTLINE, "research_dossier": DOSSIER}, "A board briefing on brain", "Board", "English")
    assert w.provider.calls and all("A board briefing on brain" in c for c in w.provider.calls)
    json.dumps(DOSSIER)  # the dossier stays JSON-serialisable for storage
