"""AgentLoop — PLAN → RESEARCH → STRUCTURE → GENERATE → VALIDATE pipeline for Fluxa.

Runs multi-step AI-powered research and slide generation with SSE-compatible
progress callbacks.
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, List, Optional

from app.ai.quality_validator import QualityValidator
from app.ai import gateway
from app.prompts.registry import call_prompt
from app.ai.research_tools import extract_stats, fetch_url, web_search

logger = logging.getLogger(__name__)

# Valid layouts and max uses
VALID_LAYOUTS = [
    "title", "big-number", "chart-text", "image-text",
    "two-column", "timeline", "comparison", "quote",
    "swot", "market-size", "funnel", "bullets",
]
MAX_LAYOUT_USES = 2


class AgentLoop:
    """PLAN → RESEARCH → STRUCTURE → GENERATE → VALIDATE presentation pipeline."""

    def __init__(self, provider, tools: Optional[Dict[str, Any]] = None):
        """
        Args:
            provider: An AI provider instance (must implement _call, generate_slide).
            tools: Optional dict overriding default tools {web_search, fetch_url,
                   extract_stats}. Useful for testing.
        """
        self.provider = provider
        self.tools = tools or {
            "web_search": web_search,
            "fetch_url": fetch_url,
            "extract_stats": extract_stats,
        }
        self.validator = QualityValidator()

    def run(
        self,
        topic: str,
        slide_count: int = 8,
        audience: str = "General",
        language: str = "English",
        progress_cb: Optional[Callable[[str, int], None]] = None,
    ) -> Dict[str, Any]:
        """Execute the full pipeline and return structured output.

        Args:
            topic: Presentation topic.
            slide_count: Target number of slides (5–15 clamped).
            audience: Target audience description.
            language: Preferred output language.
            progress_cb: Optional callback(message: str, percent: int) for SSE streaming.

        Returns:
            {outline, slides, research_notes, citations}
        """
        slide_count = max(5, min(15, slide_count))

        def emit(msg: str, pct: int):
            if progress_cb:
                try:
                    progress_cb(msg, pct)
                except Exception:
                    pass

        # ------------------------------------------------------------------
        # 1. PLAN — generate 5-8 distinct search queries
        # ------------------------------------------------------------------
        emit("Planning research queries...", 5)
        queries = self._plan_queries(topic, slide_count, audience, language)
        logger.info("AgentLoop PLAN: %d queries for topic=%r", len(queries), topic)

        # ------------------------------------------------------------------
        # 2. RESEARCH — parallel web search + fetch + stat extraction
        # ------------------------------------------------------------------
        emit("Searching the web...", 20)
        research_notes = self._research_parallel(queries)
        emit("Extracting key statistics...", 40)

        # ------------------------------------------------------------------
        # 3. STRUCTURE — LLM produces outline with layout diversity rules
        # ------------------------------------------------------------------
        emit("Structuring presentation outline...", 55)
        outline = self._structure_outline(
            topic, slide_count, audience, language, research_notes
        )
        slides_meta = outline.get("slides", [])
        logger.info("AgentLoop STRUCTURE: %d slides planned", len(slides_meta))

        # ------------------------------------------------------------------
        # 4. GENERATE — per-slide content via designer_agent
        # ------------------------------------------------------------------
        emit("Generating slide content...", 65)
        designer = getattr(self.provider, "designer_agent", None)
        dossier = getattr(self.provider, "_last_dossier", None) or {}
        generated_slides = []

        for idx, meta in enumerate(slides_meta, start=1):
            pct = 65 + int((idx / max(1, len(slides_meta))) * 25)
            emit(f"Designing slide {idx}/{len(slides_meta)}...", pct)
            try:
                if designer:
                    slide = designer.design_slide(
                        meta,
                        {
                            "title": outline.get("title", topic),
                            "description": topic,
                        },
                        dossier=dossier,
                    )
                else:
                    slide = self.provider.generate_slide(
                        meta,
                        {"title": outline.get("title", topic), "description": topic},
                    )
                slide["layout"] = meta.get("layout", slide.get("layout", "bullets"))
                generated_slides.append(slide)
            except Exception as exc:
                logger.warning("AgentLoop GENERATE slide %d failed: %s", idx, exc)
                generated_slides.append({
                    "title": meta.get("title", f"Slide {idx}"),
                    "layout": meta.get("layout", "bullets"),
                    "bullets": ["Content unavailable — please regenerate."],
                })

        # ------------------------------------------------------------------
        # 5. VALIDATE — reject + regenerate slides that fail quality checks
        # ------------------------------------------------------------------
        emit("Validating slide quality...", 92)
        validated_slides = self._validate_and_fix(
            generated_slides, slides_meta, dossier, topic
        )

        # Collect all citations
        all_citations = []
        seen_urls: set = set()
        for note in research_notes:
            for src in note.get("sources", []):
                url = src.get("url", "")
                if url and url not in seen_urls:
                    all_citations.append({
                        "title": src.get("title", ""),
                        "url": url,
                        "snippet": src.get("snippet", ""),
                    })
                    seen_urls.add(url)

        emit("Done.", 100)
        return {
            "outline": outline,
            "slides": validated_slides,
            "research_notes": research_notes,
            "citations": all_citations,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _plan_queries(
        self,
        topic: str,
        slide_count: int,
        audience: str,
        language: str,
    ) -> List[str]:
        """Ask LLM to produce 5-8 distinct search queries."""
        num_queries = min(8, max(5, slide_count))
        try:
            if getattr(self.provider, "is_configured", False):
                result = call_prompt(
                    self.provider, "agent.plan_queries", topic=topic, audience=audience, num_queries=num_queries
                )
                if isinstance(result, dict):
                    queries = result.get("queries", [])
                    if isinstance(queries, list) and queries:
                        return [str(q) for q in queries[:8]]
        except Exception as exc:
            logger.warning("AgentLoop _plan_queries LLM failed: %s", exc)

        # Deterministic fallback
        base = [
            f"{topic} key statistics 2024 2025",
            f"{topic} market size growth rate",
            f"{topic} case study real world examples",
            f"{topic} expert analysis challenges",
            f"{topic} future trends predictions",
            f"{topic} impact benefits outcomes",
        ]
        return base[:num_queries]

    def _research_parallel(self, queries: List[str]) -> List[Dict[str, Any]]:
        """Run all queries in parallel using ThreadPoolExecutor."""
        research_notes = []

        def _research_one(query: str) -> Dict[str, Any]:
            sources = []
            try:
                search_results = self.tools["web_search"](query)
                for res in search_results[:3]:  # Fetch top 3 URLs
                    url = res.get("url", "")
                    snippet = res.get("snippet", "")
                    title = res.get("title", "")
                    page_text = ""
                    if url and url.startswith("http"):
                        page_text = self.tools["fetch_url"](url)
                    combined_text = snippet + " " + page_text
                    stats = self.tools["extract_stats"](combined_text, source_hint=url)
                    sources.append({
                        "url": url,
                        "title": title,
                        "snippet": snippet,
                        "stats": stats[:5],
                    })
            except Exception as exc:
                logger.warning("_research_one failed for query=%r: %s", query, exc)
            return {"query": query, "sources": sources}

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(_research_one, q): q for q in queries}
            for future in as_completed(futures):
                try:
                    result = future.result(timeout=20)
                    research_notes.append(result)
                except Exception as exc:
                    q = futures[future]
                    logger.warning("Research future failed for query=%r: %s", q, exc)
                    research_notes.append({"query": q, "sources": []})

        return research_notes

    def _structure_outline(
        self,
        topic: str,
        slide_count: int,
        audience: str,
        language: str,
        research_notes: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Call LLM with research notes to produce a structured slide outline."""
        # Summarize research_notes for the prompt (keep token count low)
        research_summary = []
        for note in research_notes[:6]:
            sources_text = []
            for src in note.get("sources", [])[:2]:
                stat_values = [s["value"] for s in src.get("stats", [])[:3]]
                sources_text.append(
                    f"  - {src.get('title', '')} ({src.get('url', '')}): "
                    f"{src.get('snippet', '')[:120]} | stats: {stat_values}"
                )
            research_summary.append(
                f"Query: {note['query']}\n" + "\n".join(sources_text)
            )

        research_text = "\n\n".join(research_summary[:5])


        try:
            if getattr(self.provider, "is_configured", False):
                result = call_prompt(
                    self.provider,
                    "agent.structure_outline",
                    slide_count=slide_count,
                    topic=topic,
                    audience=audience,
                    language=language,
                    layouts=", ".join(VALID_LAYOUTS),
                    max_layout_uses=MAX_LAYOUT_USES,
                    research=research_text or "(no research findings)",
                )
                if isinstance(result, dict) and result.get("slides"):
                    result["slides"] = self._enforce_layout_diversity(
                        result["slides"], slide_count
                    )
                    return result
        except Exception as exc:
            logger.warning("AgentLoop _structure_outline LLM failed: %s", exc)

        # Fallback: use designer agent's outline
        try:
            designer = getattr(self.provider, "designer_agent", None)
            if designer:
                return designer.research_and_create_outline(
                    topic, slide_count=slide_count, audience=audience, language=language
                )
        except Exception as exc:
            logger.warning("AgentLoop fallback outline failed: %s", exc)

        # No placeholder outline: generic "Slide N" decks are worse than a clear failure.
        raise RuntimeError("The AI could not produce an outline for this topic.")

    def _enforce_layout_diversity(
        self,
        slides: List[Dict[str, Any]],
        target_count: int,
    ) -> List[Dict[str, Any]]:
        """Ensure no 2 consecutive same layouts and no layout used >MAX_LAYOUT_USES times."""
        layout_counts: Dict[str, int] = {}
        prev = ""
        pool = [l for l in VALID_LAYOUTS if l != "title"]

        for i, slide in enumerate(slides):
            layout = slide.get("layout", "")
            if i == 0:
                slide["layout"] = "title"
                prev = "title"
                continue

            # Check consecutive + count constraints
            if layout == prev or layout_counts.get(layout, 0) >= MAX_LAYOUT_USES:
                # Pick from pool
                chosen = next(
                    (l for l in pool if l != prev and layout_counts.get(l, 0) < MAX_LAYOUT_USES),
                    pool[0],
                )
                slide["layout"] = chosen
                layout = chosen

            layout_counts[layout] = layout_counts.get(layout, 0) + 1
            prev = layout

        return slides[:target_count]

    def _validate_and_fix(
        self,
        slides: List[Dict[str, Any]],
        slides_meta: List[Dict[str, Any]],
        dossier: Dict[str, Any],
        topic: str,
    ) -> List[Dict[str, Any]]:
        """Validate each slide; attempt regeneration (up to 2 tries) for failures."""
        validated = []
        prev_layout = ""
        designer = getattr(self.provider, "designer_agent", None)

        for idx, (slide, meta) in enumerate(zip(slides, slides_meta)):
            is_valid, reasons = self.validator.validate_slide(slide, prev_layout)
            attempts = 0
            while not is_valid and attempts < 2:
                logger.info(
                    "Slide %d failed validation (%s); regenerating (attempt %d).",
                    idx + 1, reasons, attempts + 1
                )
                try:
                    if designer:
                        slide = designer.design_slide(
                            meta,
                            {"title": topic, "description": topic},
                            dossier=dossier,
                        )
                    else:
                        slide = self.provider.generate_slide(
                            meta, {"title": topic, "description": topic}
                        )
                    slide["layout"] = meta.get("layout", slide.get("layout", "bullets"))
                except Exception as exc:
                    logger.warning("Regeneration attempt %d failed: %s", attempts + 1, exc)
                is_valid, reasons = self.validator.validate_slide(slide, prev_layout)
                attempts += 1

            if reasons:
                logger.info("Slide %d accepted with caveats: %s", idx + 1, reasons)

            validated.append(slide)
            prev_layout = slide.get("layout", "")

        return validated
