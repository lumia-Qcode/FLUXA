"""Deck generation service: research -> outline -> grounded slides -> compiled specs.

Used by the generation routes for every real provider. The mock provider (tests and the
offline demo) keeps its own canned path in the routes.
"""

from __future__ import annotations

import contextvars
import queue
import threading
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

from app.ai.compiler import compile_semantic_slide
from app.ai.deck_writer import DeckWriter, to_semantic
from app.ai.image_search import ImageFinder
from app.ai.research_agent import ResearchAgent

Progress = Callable[[str, Dict[str, Any]], None]


def research_and_outline(provider, values: Dict[str, Any], progress: Optional[Progress] = None) -> Dict[str, Any]:
    dossier = ResearchAgent(provider).research_topic(values["topic"], values["audience"], values["slide_count"], progress=progress)
    if progress:
        progress("Planning the slides from the evidence", {})
    return DeckWriter(provider, progress).outline(values["topic"], values["slide_count"], values["audience"], values["language"], dossier)


def build_deck(
    provider,
    values: Dict[str, Any],
    outline: Optional[Dict[str, Any]],
    progress: Optional[Progress] = None,
) -> Dict[str, Any]:
    """Returns {"outline", "slides": [{slide_order,title,content,spec}], "datasets", "dossier", "report"}."""
    if not (isinstance(outline, dict) and outline.get("slides")):
        outline = research_and_outline(provider, values, progress)
    dossier = outline.get("research_dossier") or {}
    if not dossier.get("sources") and "sources" not in dossier:
        # An outline from an older client or the API, without research attached.
        dossier = ResearchAgent(provider).research_topic(values["topic"], values["audience"], values["slide_count"], progress=progress)
        outline = {**outline, "research_dossier": dossier}

    writer = DeckWriter(provider, progress)
    written = writer.write(outline, values["topic"], values["audience"], values["language"])

    if progress:
        progress("Choosing images for each slide", {})
    articles = [s["title"] for s in dossier.get("sources") or [] if s.get("kind") == "encyclopedia"]
    finder = ImageFinder(dossier.get("topic") or values["topic"], articles[:4])
    semantic = to_semantic(written, dossier, values["title"] or outline.get("title", ""), image_finder=finder)

    compiled, datasets = [], {}
    used_3d: set = set()
    last_3d = [0]
    for idx, sem in enumerate(semantic, start=1):
        spec, ds = compile_semantic_slide(sem, idx, used_3d_models=used_3d, total_slides=len(semantic), last_3d_slide=last_3d)
        datasets.update(ds or {})
        compiled.append({
            "slide_order": idx,
            "title": sem.get("title") or f"Slide {idx}",
            "content": "\n".join(f"- {b}" for b in sem.get("bullets") or sem.get("references") or []),
            "spec": spec,
        })

    report = writer.report
    report["images"] = {"placed": sum(1 for s in semantic if s.get("image")), "missing": sum(1 for s in semantic if s.get("image_missing")), "errors": finder.errors[:5]}
    dossier_saved = {**dossier, "generation_report": report, "outline_titles": [s.get("title") for s in outline.get("slides") or []]}
    return {"outline": outline, "slides": compiled, "datasets": datasets, "dossier": dossier_saved, "report": report}


def run_with_events(work: Callable[[Progress], Any]) -> Iterator[Tuple[str, Any]]:
    """Run `work(progress)` in a thread; yield ("progress", (msg, extra)) events, then ("result", value).

    The worker inherits the request's context (the AI gateway session lives in a ContextVar).
    Exceptions are re-raised in the consuming generator.
    """
    events: "queue.Queue[Tuple[str, Any]]" = queue.Queue()

    def progress(message: str, extra: Dict[str, Any]) -> None:
        events.put(("progress", (message, extra)))

    ctx = contextvars.copy_context()

    def target() -> None:
        try:
            events.put(("result", ctx.run(work, progress)))
        except BaseException as exc:  # handed to the consumer
            events.put(("error", exc))

    threading.Thread(target=target, daemon=True).start()
    while True:
        kind, payload = events.get()
        if kind == "error":
            raise payload
        yield kind, payload
        if kind == "result":
            return


def slide_events(slides: List[Dict[str, Any]], datasets: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for i, slide in enumerate(slides):
        names = {b.get("dataset") for b in slide["spec"]["blocks"] if b.get("dataset")}
        out.append({"index": i, "slide": slide, "datasets": {k: v for k, v in datasets.items() if k in names}})
    return out
