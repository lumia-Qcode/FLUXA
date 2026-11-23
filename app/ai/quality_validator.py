"""Quality validator for AI-generated slides.

Checks:
(a) Has numeric/factual content (numbers, %, dates, $amounts)
(b) No placeholder text
(c) Not the same layout as previous slide
(d) No bullets longer than 18 words
(e) Charts must have >= 3 data points
"""

import re
from typing import Any, Dict, List, Optional, Tuple


class QualityValidator:
    PLACEHOLDER_PATTERNS = [
        'lorem', 'ipsum', 'item a', 'item b', 'item c',
        'label 1', 'label 2', 'label 3',
        'placeholder', 'your title', 'slide title',
        'tbd', 'coming soon', 'insert text', 'click to edit',
        'category a', 'category b',
        'example text', 'sample text',
    ]

    _NUMERIC_PATTERN = re.compile(
        r'(?:\$[\d,]+(?:\.\d+)?(?:\s*(?:B|M|K|billion|million|trillion))?'
        r'|[\d,]+(?:\.\d+)?\s*%'
        r'|\b\d{4}\b'           # years
        r'|\b\d+(?:\.\d+)?\b)',
        re.IGNORECASE,
    )

    def _slide_text(self, slide: dict) -> str:
        """Collect all visible text from a slide dict."""
        parts = []
        parts.append(slide.get("title", ""))
        parts.append(slide.get("subtitle", ""))
        for b in slide.get("bullets", []):
            parts.append(str(b))
        for block in slide.get("blocks", []):
            if isinstance(block, dict):
                props = block.get("props") or {}
                parts.append(str(props.get("text", "")))
                for bullet in props.get("bullets", []):
                    parts.append(str(bullet))
        # chart labels
        chart = slide.get("chart", {})
        if isinstance(chart, dict):
            for row in chart.get("data", []):
                if isinstance(row, dict):
                    parts.append(str(row.get("category", "")))
        return " ".join(parts)

    def validate_slide(
        self,
        slide: dict,
        prev_layout: Optional[str] = None,
    ) -> Tuple[bool, List[str]]:
        """Return (is_valid, [rejection_reasons])."""
        reasons: List[str] = []
        all_text = self._slide_text(slide)
        lower_text = all_text.lower()

        # (a) Has numeric/factual content
        if not self._NUMERIC_PATTERN.search(all_text):
            reasons.append("Slide has no numeric or factual content (numbers, %, dates, $amounts).")

        # (b) No placeholder text
        for ph in self.PLACEHOLDER_PATTERNS:
            if ph in lower_text:
                reasons.append(f"Slide contains placeholder text: '{ph}'.")
                break

        # (c) Not same layout as previous slide
        layout = slide.get("layout", "")
        if prev_layout and layout and layout == prev_layout:
            reasons.append(
                f"Consecutive slides with the same layout '{layout}'; diversify layouts."
            )

        # (d) No bullets longer than 18 words (> 18 → reject; i.e., 19+ words)
        all_bullets = list(slide.get("bullets", []))
        for block in slide.get("blocks", []):
            if isinstance(block, dict):
                all_bullets.extend(
                    (block.get("props") or {}).get("bullets", [])
                )
        for bullet in all_bullets:
            word_count = len(str(bullet).split())
            if word_count >= 18:  # 18 words is already borderline; reject 18+
                reasons.append(
                    f"Bullet has {word_count} words (max 17): '{str(bullet)[:60]}...'"
                )
                break

        # (e) Charts must have >= 3 data points
        chart = slide.get("chart") or {}
        if isinstance(chart, dict) and chart:
            data_points = chart.get("data", [])
            if isinstance(data_points, list) and len(data_points) < 3:
                reasons.append(
                    f"Chart has only {len(data_points)} data point(s); minimum 3 required."
                )
        # Also check blocks for embedded charts
        for block in slide.get("blocks", []):
            if isinstance(block, dict) and block.get("type") == "chart":
                props = block.get("props") or {}
                vals = props.get("values", [])
                if isinstance(vals, list) and len(vals) < 3:
                    reasons.append(
                        f"Chart block has only {len(vals)} data value(s); minimum 3 required."
                    )

        is_valid = len(reasons) == 0
        return is_valid, reasons

    def rewrite_title_as_insight(self, title: str, dossier: dict) -> str:
        """Turn a weak topic label into a data-driven insight statement.

        Uses numeric data from the dossier to craft a lead-in action title.
        """
        kpi = dossier.get("kpi") or {}
        stats = dossier.get("key_statistics") or []

        # If title already looks like an insight (has a number or colon), return as-is
        if re.search(r'\d', title) or ':' in title or len(title.split()) > 6:
            return title

        # Try to find the most prominent stat
        if kpi.get("value") and kpi.get("label"):
            value = kpi["value"]
            label = kpi["label"]
            delta = kpi.get("delta", "")
            return f"{title}: {value} {label} ({delta})" if delta else f"{title}: {value} {label}"

        if stats:
            top = stats[0]
            metric = top.get("metric", "")
            value = top.get("value", "")
            finding = top.get("finding", "")[:60]
            if metric and value:
                return f"{metric} Reaches {value} — {finding}" if finding else f"{metric}: {value}"

        return title
