"""Presentation designer used by the OpenRouter/Gemini/OpenAI/Anthropic providers.

It used to fall back to fixed consulting-style outlines ("Strategic Assessment",
"Phased Implementation Horizon") and to slides filled from a canned research dossier
whenever the model failed, which is how unrelated corporate content reached decks about
the brain. All of that is gone: outlines and slides now come from app/ai/deck_writer.py,
which researches the topic first and only falls back to verbatim, cited evidence.
"""

import logging
from typing import Any, Dict, Optional

from app.ai.deck_writer import DeckWriter, Evidence, to_semantic
from app.ai.research_agent import ResearchAgent

logger = logging.getLogger(__name__)


class ExecutiveDesignerAgent:
    """Research first, then outline and slides grounded in that research."""

    def __init__(self, provider):
        self.provider = provider
        self.research_agent = ResearchAgent(provider)
        self._dossier_cache: Dict[str, Dict[str, Any]] = {}

    def research_and_create_outline(
        self,
        topic: str,
        slide_count: int = 8,
        audience: str = "General audience",
        language: str = "English",
        progress=None,
    ) -> Dict[str, Any]:
        writer = DeckWriter(self.provider, progress=progress)
        dossier = self.research_agent.research_topic(topic, audience=audience, slide_count=slide_count, progress=progress)
        self._dossier_cache[topic] = dossier
        return writer.outline(topic, slide_count, audience, language, dossier)

    def design_slide(
        self,
        outline_item: Dict[str, Any],
        deck_context: Dict[str, Any],
        dossier: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """One slide (for callers that generate slide by slide). Researches once per deck."""
        topic = deck_context.get("description") or deck_context.get("title") or outline_item.get("title", "")
        if not dossier:
            if topic not in self._dossier_cache:
                self._dossier_cache[topic] = self.research_agent.research_topic(topic)
            dossier = self._dossier_cache[topic]
        writer = DeckWriter(self.provider)
        item = {"visual": "image", "evidence": [], **outline_item}
        item.setdefault("_index", int(outline_item.get("_index") or 2))
        outline = {"slides": [item], "research_dossier": dossier}
        # A single slide is never the title slide for the writer's purposes.
        item["_index"] = max(2, item["_index"])
        slides = writer.write(outline, topic, deck_context.get("audience", "General audience"), deck_context.get("language", "English"))
        slide = slides[0]
        slide["_index"] = item["_index"]
        semantic = to_semantic([slide], dossier, deck_context.get("title") or topic)[0]
        semantic["layout"] = semantic.get("layout") or outline_item.get("layout", "bullets")
        return semantic


__all__ = ["ExecutiveDesignerAgent", "Evidence"]
