"""Research agent: the research stage of deck generation, plus dossier helpers."""

import logging
from typing import Any, Dict, Optional

from app.ai import gateway

logger = logging.getLogger(__name__)


def extract_csv_from_text(text: str) -> Optional[Dict[str, Any]]:
    """Detect and parse embedded CSV or tabular data within user prompts."""
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    csv_lines = [l for l in lines if "," in l or "\t" in l]
    if len(csv_lines) < 2:
        return None

    delimiter = "\t" if "\t" in csv_lines[0] else ","
    headers = [h.strip().replace('"', "") for h in csv_lines[0].split(delimiter)]
    if len(headers) < 2:
        return None

    rows = []
    for l in csv_lines[1:]:
        cells = [c.strip().replace('"', "") for c in l.split(delimiter)]
        if len(cells) >= 2:
            try:
                val = float(cells[1])
                rows.append({"category": cells[0], "value": val})
            except ValueError:
                try:
                    val = float(cells[0])
                    rows.append({"category": cells[1], "value": val})
                except ValueError:
                    continue

    if len(rows) >= 2:
        col_name = headers[1] if len(headers) > 1 else "Imported Metric"
        title = col_name.replace("_", " ").title()
        return {
            "title": title,
            "data": rows,
            "headers": headers,
        }
    return None


def _norm_url(url: Any) -> str:
    if not isinstance(url, str):
        return ""
    url = url.strip().split("#", 1)[0]
    return url[:-1] if url.endswith("/") else url


def verify_dossier(raw: Dict[str, Any], visited_urls: Any) -> Dict[str, Any]:
    """Keep only figures and citations whose URL a tool actually returned this run."""
    seen = {_norm_url(u) for u in visited_urls}

    def ok(url: Any) -> bool:
        return bool(url) and _norm_url(url) in seen

    dossier = dict(raw)
    dossier["citations"] = [c for c in raw.get("citations") or [] if isinstance(c, dict) and ok(c.get("url"))]
    dossier["key_statistics"] = [
        s for s in raw.get("key_statistics") or [] if isinstance(s, dict) and ok(s.get("source_url"))
    ]
    for key in ("chart_datasets", "kpi", "market_size"):
        section = raw.get(key)
        if not (isinstance(section, dict) and ok(section.get("source_url"))):
            dossier.pop(key, None)
    # A statistic's source is a citation too, even if the model forgot to list it.
    cited = {_norm_url(c["url"]) for c in dossier["citations"]}
    for stat in dossier["key_statistics"]:
        if _norm_url(stat["source_url"]) not in cited:
            cited.add(_norm_url(stat["source_url"]))
            dossier["citations"].append(
                {"source": stat.get("metric", "Source"), "title": stat.get("metric", ""), "finding": stat.get("finding", ""), "url": stat["source_url"]}
            )
    dossier["verified"] = bool(dossier["citations"])
    dossier["research_mode"] = "live"
    return dossier



def live_research_enabled() -> bool:
    """Run the AI-driven web research loop? "auto": only with a real search key (saves free AI quota)."""
    from app.config import Config

    mode = getattr(Config, "RESEARCH_LIVE", "auto")
    if mode in ("on", "1", "true", "always"):
        return True
    if mode in ("off", "0", "false", "never"):
        return False
    return bool(Config.TAVILY_API_KEY.strip() or Config.BRAVE_SEARCH_API_KEY.strip())

class ResearchAgent:
    """Researches a topic before a deck is written (see app/ai/research_pipeline.py).

    The old fallbacks are gone: there is no "answer from memory" path that produced
    unverifiable citations, and no built-in dossier of example statistics. When nothing can
    be retrieved the dossier says so (research_mode "unavailable", no sources) and the deck
    is written without figures or citations rather than with invented ones.
    """

    def __init__(self, openrouter_provider=None):
        self.provider = openrouter_provider

    def research_topic(
        self,
        topic: str,
        audience: str = "General audience",
        slide_count: int = 8,
        progress=None,
    ) -> Dict[str, Any]:
        from app.ai.research_pipeline import run_research

        provider = self.provider if (self.provider is not None and getattr(self.provider, "is_configured", False)) else None
        dossier = run_research(provider, topic, audience, slide_count, progress=progress)
        csv_parsed = extract_csv_from_text(topic)
        if csv_parsed:
            # Data the user pasted is used exactly as given and labelled as theirs.
            dossier["user_dataset"] = {"title": csv_parsed["title"], "data": csv_parsed["data"], "source": "user"}
        if not dossier.get("sources"):
            gateway.mark_fallback("No research sources could be retrieved; the deck will contain no citations or figures.")
        return dossier
