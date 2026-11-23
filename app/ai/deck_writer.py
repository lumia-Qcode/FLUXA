"""Research-grounded deck generation.

    user prompt -> research plan -> searches -> evidence + citation registry   (research_pipeline)
                -> outline from evidence -> slides in batches from evidence     (this module)
                -> validation (citations, numbers, charts, topic) -> repair
                -> images per slide -> numbered references -> semantic slides  -> compiler

The user's original prompt and the research dossier are passed to every model call. The
model never sees a template it could copy, and nothing here invents content: when the
model is unavailable, slides are built from verbatim evidence sentences with citations.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.ai import gateway
from app.ai.research_pipeline import (
    clean_topic,
    digest,
    format_reference,
    numbers_in,
    run_research,
    source_by_id,
    term_set,
)
from app.prompts.registry import get as get_prompt
from app.prompts.registry import render as render_prompt

logger = logging.getLogger(__name__)

VISUALS = {"image", "diagram", "chart", "timeline", "process", "comparison", "table", "kpi", "quote", "3d", "none"}
VISUAL_LAYOUT = {
    "image": "image-text", "diagram": "image-text", "3d": "image-text", "chart": "chart-text", "timeline": "timeline",
    "process": "timeline", "comparison": "comparison", "table": "table", "kpi": "big-number", "quote": "quote", "none": "bullets",
}
BATCH_SIZE = 4
POINT_MAX = 200

# Phrases from the old template decks. A slide using them outside a business deck has drifted.
GENERIC_PHRASES = re.compile(
    r"(strategic intelligence|capital commitment|stakeholder alignment|consensus validation|executive briefing|"
    r"operational efficiency gain|sector adoption velocity|key takeaways: slide|strategic horizon|empirical finding \d|"
    r"governance mandate|institutional allocation|go-to-market|tam/sam/som|^slide \d+$)",
    re.I,
)


class GenerationUnavailable(RuntimeError):
    """Neither the model nor research could produce content; nothing is saved."""


_EVIDENCE_IDS = re.compile(r"\s*[\(\[]\s*(?:S\d+(?:\.\d+)?)(?:\s*[,;]\s*S\d+(?:\.\d+)?)*\s*[\)\]]|\s*\bS\d+\.\d+\b")


def _clip(text: str, limit: int) -> str:
    """Shorten at a word boundary; also removes raw evidence ids (S3.2) the model may echo."""
    text = _EVIDENCE_IDS.sub("", " ".join(str(text or "").split())).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:-(")
    return cut + "…"


def ask(provider, prompt_id: str, **values) -> Any:
    """Render a registry prompt and get a JSON answer from any provider."""
    system, user = render_prompt(prompt_id, **values)
    prompt = get_prompt(prompt_id)
    with gateway.using_prompt(prompt.key):
        if hasattr(provider, "complete_json"):
            return provider.complete_json(system, user, prompt.max_tokens)
        return provider._call(system, user, max_tokens=prompt.max_tokens)


def model_available(provider) -> bool:
    return bool(provider is not None and getattr(provider, "is_configured", False) and getattr(provider, "name", "") != "mock")


# ---------------------------------------------------------------------------
# Evidence lookups
# ---------------------------------------------------------------------------

class Evidence:
    def __init__(self, dossier: Dict[str, Any]):
        self.dossier = dossier
        self.sources = source_by_id(dossier)
        self.items: Dict[str, Tuple[str, Dict[str, Any]]] = {}
        for sid, src in self.sources.items():
            for ev in src.get("evidence") or []:
                self.items[ev["id"]] = (sid, ev)

    def valid_source(self, ref: Any) -> Optional[str]:
        ref = str(ref or "").strip().strip("[]")
        if ref in self.sources:
            return ref
        if ref in self.items:
            return self.items[ref][0]
        m = re.match(r"(S\d+)", ref)
        return m.group(1) if m and m.group(1) in self.sources else None

    def text_of(self, source_ids: List[str]) -> str:
        return " ".join(ev["text"] for sid in source_ids for ev in self.sources[sid].get("evidence") or [])

    def find_number(self, number: str, near: set) -> List[str]:
        """Sources whose evidence states this number (in a sentence sharing words with `near`)."""
        core = _core(number)
        hits = []
        for sid, src in self.sources.items():
            for ev in src.get("evidence") or []:
                if core in {_core(n) for n in ev.get("numbers") or []} or _year_in(core, ev["text"]):
                    if not near or term_set(ev["text"]) & near:
                        hits.append(sid)
                        break
        return hits

    def number_supported(self, number: str, source_ids: List[str]) -> bool:
        core = _core(number)
        text = self.text_of(source_ids)
        return core in {_core(n) for n in numbers_in(text)} or _year_in(core, text)


def _core(number: str) -> str:
    n = re.sub(r"[^\d.]", "", str(number).split(" ")[0])
    try:
        value = float(n)
        return ("%f" % value).rstrip("0").rstrip(".")
    except ValueError:
        return n


def _year_in(core: str, text: str) -> bool:
    return bool(re.fullmatch(r"(1[5-9]|20)\d\d", core)) and core in text


def _claim_numbers(text: str) -> List[str]:
    nums = numbers_in(text)
    years = re.findall(r"(?<!\d)((?:1[5-9]|20)\d\d)(?!\d)", text)
    return nums + years


# ---------------------------------------------------------------------------
# The writer
# ---------------------------------------------------------------------------

class DeckWriter:
    def __init__(self, provider, progress: Optional[Callable[[str, Dict[str, Any]], None]] = None):
        self.provider = provider
        self.progress = progress
        self.report: Dict[str, Any] = {"removed_claims": [], "dropped_visuals": [], "repaired_slides": [], "extractive_slides": [], "model_errors": []}

    def note(self, message: str, **extra: Any) -> None:
        if self.progress:
            try:
                self.progress(message, extra)
            except Exception:
                pass

    # -- research -----------------------------------------------------------------

    def research(self, prompt: str, audience: str, slide_count: int) -> Dict[str, Any]:
        dossier = run_research(self.provider if model_available(self.provider) else None, prompt, audience, slide_count, progress=self.progress)
        if not dossier["sources"]:
            gateway.mark_fallback("No research sources could be retrieved, so the deck has no citations and no figures.")
        return dossier

    # -- outline ------------------------------------------------------------------

    def outline(self, prompt: str, slide_count: int, audience: str, language: str, dossier: Dict[str, Any]) -> Dict[str, Any]:
        plan = dossier.get("plan") or {}
        topic = dossier.get("topic") or clean_topic(prompt)
        evidence = Evidence(dossier)
        raw = None
        if model_available(self.provider):
            try:
                raw = ask(
                    self.provider, "deck.outline", prompt=prompt, topic=topic, audience=plan.get("audience") or audience,
                    purpose=plan.get("purpose") or "not stated", depth=plan.get("depth") or "intermediate", language=language,
                    slide_count=slide_count, subtopics=", ".join(s["name"] for s in plan.get("subtopics") or []) or topic,
                    evidence=digest(dossier, 9000, 3),
                )
            except Exception as exc:
                self.report["model_errors"].append(f"outline: {exc}")
                logger.warning("deck: outline call failed: %s", exc)
        slides = self._clean_outline(raw, evidence, topic)
        if not slides:
            if not dossier.get("sources"):
                raise GenerationUnavailable(
                    "The AI model is unavailable and no research sources could be retrieved, so there is nothing "
                    "reliable to build slides from. Try again later."
                )
            gateway.mark_fallback("The AI model was unavailable, so the outline was built from the research plan.")
            slides = self._outline_from_plan(plan, topic, evidence)
        slides = self._fit_count(slides, slide_count, plan, topic, evidence)
        title = _clip((raw or {}).get("title") if isinstance(raw, dict) else "", 70) or _clip(topic[:1].upper() + topic[1:], 70)
        return {"title": title, "slides": slides, "research_dossier": dossier}

    def _clean_outline(self, raw: Any, evidence: Evidence, topic: str) -> List[Dict[str, Any]]:
        if not isinstance(raw, dict) or not isinstance(raw.get("slides"), list):
            return []
        out = []
        for i, s in enumerate(raw["slides"]):
            if not isinstance(s, dict) or not str(s.get("title") or "").strip():
                continue
            visual = str(s.get("visual") or "").lower().strip()
            visual = visual if visual in VISUALS else "image"
            ev_ids = [e for e in (s.get("evidence") or []) if isinstance(e, str) and (e in evidence.items or e in evidence.sources)]
            layout = "title" if not out else VISUAL_LAYOUT.get(visual, "bullets")
            out.append({
                "title": _clip(s["title"], 70),
                "purpose": _clip(s.get("purpose") or "", 200),
                "visual": "image" if not out and visual == "none" else visual,
                "layout": layout,
                "evidence": ev_ids[:8],
                "image_query": _clip(s.get("image_query") or "", 80),
                "subtopic": _clip(s.get("subtopic") or "", 90),
            })
        return out

    def _outline_from_plan(self, plan: Dict[str, Any], topic: str, evidence: Evidence) -> List[Dict[str, Any]]:
        """Model-free outline: one slide per researched subtopic, titled with the subtopic's own name."""
        slides = [{"title": _clip(topic[:1].upper() + topic[1:], 70), "purpose": f"What this presentation covers about {topic}.", "visual": "image", "layout": "title", "evidence": [], "image_query": topic, "subtopic": ""}]
        for sub in plan.get("subtopics") or []:
            name = sub["name"]
            title = name if topic.lower() in name.lower() else f"{name}: {topic}" if len(name) < 30 else name
            slides.append({
                "title": _clip(title[:1].upper() + title[1:], 70),
                "purpose": "; ".join(sub.get("questions") or [])[:200],
                "visual": "image",
                "layout": "image-text",
                "evidence": self._evidence_for_terms(evidence, term_set(f"{name} {topic}"), 4),
                "image_query": f"{topic} {name}",
                "subtopic": name,
            })
        return slides

    @staticmethod
    def _evidence_for_terms(evidence: Evidence, wanted: set, limit: int) -> List[str]:
        scored = sorted(
            ((len(term_set(ev["text"]) & wanted), eid) for eid, (_, ev) in evidence.items.items()),
            key=lambda x: -x[0],
        )
        return [eid for score, eid in scored[:limit] if score > 0]

    def _fit_count(self, slides, count, plan, topic, evidence) -> List[Dict[str, Any]]:
        slides = slides[:count]
        if len(slides) < count:
            extra = [s for s in self._outline_from_plan(plan, topic, evidence)[1:] if s["title"].lower() not in {x["title"].lower() for x in slides}]
            slides.extend(extra[: count - len(slides)])
        if slides:
            slides[0]["layout"] = "title"
        return slides

    # -- slides -------------------------------------------------------------------

    def write(self, outline: Dict[str, Any], prompt: str, audience: str, language: str) -> List[Dict[str, Any]]:
        """Content for every outline slide, validated. Returns semantic slides (no layout geometry)."""
        dossier = outline.get("research_dossier") or {}
        evidence = Evidence(dossier)
        topic = dossier.get("topic") or clean_topic(prompt)
        items = [dict(s, _index=i + 1) for i, s in enumerate(outline.get("slides") or [])]
        outline_text = "\n".join(f"{s['_index']}. {s['title']} ({s.get('visual', '')})" for s in items)
        written: Dict[int, Dict[str, Any]] = {}

        if model_available(self.provider):
            for start in range(0, len(items), BATCH_SIZE):
                batch = items[start : start + BATCH_SIZE]
                self.note(f"Writing slides {batch[0]['_index']}-{batch[-1]['_index']} of {len(items)} from the evidence", current=batch[-1]["_index"], total=len(items))
                for slide in self._write_batch(batch, prompt, topic, audience, language, outline_text, dossier):
                    written[slide["_index"]] = slide

        position = {item["_index"]: n for n, item in enumerate(items)}
        validated = []
        for item in items:
            raw = written.get(item["_index"])
            slide = self._validate(raw, item, evidence, topic) if raw else None
            validated.append(slide if slide else None)

        # Topic and support review (one model call), then one repair pass for flagged slides.
        if model_available(self.provider) and any(validated):
            flagged = self._review(validated, prompt, topic, dossier)
            for idx, issue in list(flagged.items()):
                self.report["repaired_slides"].append({"index": idx, "issue": issue})
            if flagged:
                self.note(f"Repairing {len(flagged)} slide(s) flagged by the topic and evidence check", repaired=sorted(flagged))
                retry_items = [dict(items[position[i]], _feedback=flagged[i]) for i in sorted(flagged) if i in position]
                fixed = {s["_index"]: s for s in self._write_batch(retry_items, prompt, topic, audience, language, outline_text, dossier, feedback=True)}
                for i in flagged:
                    if i not in position:
                        continue
                    candidate = self._validate(fixed.get(i), items[position[i]], evidence, topic) if fixed.get(i) else None
                    validated[position[i]] = candidate if candidate and not self._drifted(candidate, topic, dossier) else None

        result = []
        for item, slide in zip(items, validated):
            if slide is None:
                slide = self._extractive(item, evidence, topic)
                self.report["extractive_slides"].append(item["_index"])
            result.append(slide)
        if self.report["extractive_slides"]:
            gateway.mark_fallback(
                f"{len(self.report['extractive_slides'])} slide(s) quote the research sources directly because the AI model "
                "was unavailable or its draft failed the checks."
            )
        return result

    def _write_batch(self, batch, prompt, topic, audience, language, outline_text, dossier, feedback: bool = False) -> List[Dict[str, Any]]:
        wanted_ids = {e for s in batch for e in s.get("evidence") or []}
        # Each slide sees its own evidence first, then the rest of the registry for context.
        focused = digest(dossier, 5000, 6, only=wanted_ids) if wanted_ids else ""
        general = digest(dossier, 6000 if focused else 9000, 3)
        slides_text = "\n".join(
            f"- index {s['_index']}: title \"{s['title']}\"; purpose: {s.get('purpose') or 'n/a'}; visual: {s.get('visual')}; "
            f"subtopic: {s.get('subtopic') or 'n/a'}; evidence to use: {', '.join(s.get('evidence') or []) or 'any relevant'}"
            + (f"; image_query: {s['image_query']}" if s.get("image_query") else "")
            + (f"\n  PROBLEM WITH THE PREVIOUS DRAFT, fix it: {s['_feedback']}" if s.get("_feedback") else "")
            for s in batch
        )
        try:
            raw = ask(
                self.provider, "deck.slides", prompt=prompt, topic=topic, audience=audience, language=language,
                outline=outline_text, slides=slides_text,
                evidence=(focused + "\n\n" + general) if focused else general,
                feedback="Some slides were rejected by the fact check; follow each PROBLEM note." if feedback else "",
            )
        except Exception as exc:
            self.report["model_errors"].append(f"slides {batch[0]['_index']}-{batch[-1]['_index']}: {exc}")
            logger.warning("deck: slide batch failed: %s", exc)
            return []
        slides = raw.get("slides") if isinstance(raw, dict) else raw if isinstance(raw, list) else []
        out = []
        by_index = {s["_index"]: s for s in batch}
        for pos, s in enumerate(slides or []):
            if not isinstance(s, dict):
                continue
            try:
                idx = int(s.get("index"))
            except (TypeError, ValueError):
                idx = batch[pos]["_index"] if pos < len(batch) else None
            if idx in by_index:
                out.append({**s, "_index": idx})
        return out

    # -- validation ----------------------------------------------------------------

    def _validate(self, raw: Dict[str, Any], item: Dict[str, Any], evidence: Evidence, topic: str) -> Optional[Dict[str, Any]]:
        idx = item["_index"]
        title = _clip(raw.get("title") or item["title"], 70) or item["title"]
        points = []
        for p in raw.get("points") or raw.get("bullets") or []:
            if isinstance(p, str):
                p = {"text": p, "citations": []}
            if not isinstance(p, dict) or not str(p.get("text") or "").strip():
                continue
            text = re.sub(r"\s*\[(?:S?\d+(?:\.\d+)?(?:,\s*)?)+\]", "", str(p["text"])).strip()
            cites = []
            for c in p.get("citations") or []:
                sid = evidence.valid_source(c)
                if sid and sid not in cites:
                    cites.append(sid)
            numbers = _claim_numbers(text)
            if numbers:
                near = term_set(text)
                unsupported = [n for n in numbers if not cites or not evidence.number_supported(n, cites)]
                if unsupported:
                    # The number may be right but cited to the wrong source (or not cited):
                    # attribute it to the source that actually states it, if any does.
                    found = {n: evidence.find_number(n, near) for n in unsupported}
                    if all(found.values()):
                        # A cited source that states none of the claim's numbers was the wrong source.
                        cites = [c for c in cites if any(evidence.number_supported(n, [c]) for n in numbers)]
                        for n in unsupported:
                            if found[n][0] not in cites:
                                cites.append(found[n][0])
                        unsupported = [n for n in numbers if not evidence.number_supported(n, cites)]
                if unsupported:
                    self.report["removed_claims"].append({"slide": idx, "claim": text, "reason": f"numbers not in the cited evidence: {', '.join(unsupported)}"})
                    continue
            basis = "sourced" if cites else "synthesis"
            points.append({"text": _clip(text, POINT_MAX), "citations": cites[:3], "basis": basis})
        if not points and idx != 1:
            return None

        visual = self._validate_visual(raw.get("visual") or {}, item, evidence, idx, points)
        slide = {
            "_index": idx,
            "title": title,
            "subtitle": _clip(raw.get("subtitle") or (item.get("purpose") if idx == 1 else ""), 110),
            "points": points[:5],
            "visual": visual,
            "notes": _clip(raw.get("notes") or "", 900),
            "subtopic": item.get("subtopic", ""),
        }
        return slide

    def _validate_visual(self, v: Dict[str, Any], item: Dict[str, Any], evidence: Evidence, idx: int, points) -> Dict[str, Any]:
        vtype = str(v.get("type") or item.get("visual") or "image").lower()
        vtype = vtype if vtype in VISUALS else "image"
        query = _clip(v.get("image_query") or item.get("image_query") or item["title"], 80)
        out: Dict[str, Any] = {"type": vtype, "image_query": query, "caption": _clip(v.get("caption") or "", 160)}

        def drop(reason: str) -> Dict[str, Any]:
            self.report["dropped_visuals"].append({"slide": idx, "visual": vtype, "reason": reason})
            return {"type": "image", "image_query": query, "caption": ""}

        if vtype == "chart":
            chart = v.get("chart") or {}
            rows, cites = [], []
            for d in chart.get("data") or []:
                if not isinstance(d, dict):
                    continue
                label = _clip(d.get("label") or d.get("category") or "", 40)
                try:
                    value = float(str(d.get("value")).replace(",", ""))
                except (TypeError, ValueError):
                    continue
                sid = evidence.valid_source(d.get("evidence") or d.get("citation"))
                candidates = [sid] if sid else evidence.find_number(str(value), term_set(f"{label} {chart.get('title', '')}"))
                ok = [c for c in candidates if c and evidence.number_supported(str(value), [c])]
                if not label or not ok:
                    continue
                rows.append({"category": label, "value": int(value) if value.is_integer() else value})
                cites.extend(c for c in ok[:1] if c not in cites)
            if len(rows) < 2:
                return drop("chart values were not found in the cited evidence")
            kind = chart.get("kind") if chart.get("kind") in ("bar", "line", "pie", "donut", "area") else "bar"
            out["chart"] = {"kind": kind, "title": _clip(chart.get("title") or item["title"], 80), "unit": _clip(chart.get("unit") or "", 30), "data": rows[:12], "citations": cites}
        elif vtype == "kpi":
            kpi = v.get("kpi") or {}
            value = str(kpi.get("value") or "").strip()
            sid = evidence.valid_source(kpi.get("evidence") or kpi.get("citation"))
            nums = _claim_numbers(value) or [value]
            sources = [sid] if sid else evidence.find_number(nums[0], term_set(kpi.get("label") or ""))
            if not value or not sources or not all(evidence.number_supported(n, sources[:1]) for n in nums):
                return drop("the headline number was not found in the evidence")
            out["kpi"] = {"value": _clip(value, 24), "label": _clip(kpi.get("label") or "", 90), "citations": sources[:1]}
        elif vtype in ("timeline", "process"):
            steps = []
            for st in v.get("steps") or []:
                if not isinstance(st, dict) or not (st.get("title") or st.get("body")):
                    continue
                cites = [c for c in (evidence.valid_source(x) for x in st.get("citations") or []) if c]
                text = f"{st.get('title', '')} {st.get('body', '')}"
                if _claim_numbers(text) and not all(evidence.number_supported(n, cites or list(evidence.sources)) for n in _claim_numbers(text)):
                    self.report["removed_claims"].append({"slide": idx, "claim": text, "reason": "step date or number not in the evidence"})
                    continue
                steps.append({"title": _clip(st.get("title") or "", 60), "body": _clip(st.get("body") or "", 150), "citations": cites[:2]})
            if len(steps) < 2:
                return drop("fewer than two usable steps")
            out["steps"] = steps[:6]
        elif vtype == "comparison":
            cols = [c for c in v.get("columns") or [] if isinstance(c, dict) and c.get("title") and c.get("items")]
            if len(cols) < 2:
                return drop("comparison needs two columns")
            out["columns"] = [{"title": _clip(c["title"], 50), "items": [_clip(x, 120) for x in c["items"][:4] if isinstance(x, str) and not _claim_numbers(x)]} for c in cols[:2]]
        elif vtype == "table":
            table = v.get("table") or {}
            cols = [_clip(c, 40) for c in table.get("columns") or [] if isinstance(c, str)][:4]
            cites = [c for c in (evidence.valid_source(x) for x in table.get("citations") or []) if c]
            rows = []
            for r in table.get("rows") or []:
                if not isinstance(r, list):
                    continue
                cells = [_clip(str(x), 60) for x in r[: len(cols)]]
                nums = [n for cell in cells for n in _claim_numbers(cell)]
                if nums and not all(evidence.number_supported(n, cites or list(evidence.sources)) for n in nums):
                    continue
                rows.append(cells)
            if len(cols) < 2 or len(rows) < 2:
                return drop("table values were not supported by the evidence")
            out["table"] = {"columns": cols, "rows": rows[:6], "citations": cites}
        elif vtype == "quote":
            q = v.get("quote") or {}
            text = " ".join(str(q.get("text") or "").split()).strip("\"“”")
            sid = evidence.valid_source(q.get("evidence") or q.get("citation"))
            source_text = " ".join(evidence.text_of([sid]).split()) if sid else ""
            if not text or not sid or text[:120].lower() not in source_text.lower():
                return drop("the quotation does not appear in the cited source")
            src = evidence.sources[sid]
            out["quote"] = {"text": _clip(text, 300), "attribution": _clip(q.get("attribution") or src.get("title") or "", 90), "citations": [sid]}
        return out

    def _drifted(self, slide: Dict[str, Any], topic: str, dossier: Dict[str, Any]) -> bool:
        text = f"{slide['title']} " + " ".join(p["text"] for p in slide["points"])
        domain = (dossier.get("plan") or {}).get("domain")
        if domain != "business_economics" and GENERIC_PHRASES.search(text):
            return True
        vocab = term_set(topic)
        for sub in (dossier.get("plan") or {}).get("subtopics") or []:
            vocab |= term_set(sub["name"])
        cited = [c for p in slide["points"] for c in p["citations"]]
        return not cited and not (term_set(text) & vocab)

    def _review(self, slides, prompt, topic, dossier) -> Dict[int, str]:
        flagged: Dict[int, str] = {}
        for s in slides:
            if s and self._drifted(s, topic, dossier):
                flagged[s["_index"]] = "The slide is not clearly about the requested subject; rewrite it about the subject using the evidence."
        listing = "\n".join(
            f"{s['_index']}. {s['title']}\n" + "\n".join(f"   - {p['text']} {p['citations']}" for p in s["points"])
            for s in slides if s
        )
        try:
            raw = ask(self.provider, "deck.review", prompt=prompt, topic=topic, slides=listing, evidence=digest(dossier, 7000, 3))
        except Exception as exc:
            self.report["model_errors"].append(f"review: {exc}")
            logger.warning("deck: review call failed (%s); using the rule-based checks only", exc)
            return flagged
        for r in (raw.get("slides") if isinstance(raw, dict) else []) or []:
            try:
                idx = int(r.get("index"))
            except (TypeError, ValueError, AttributeError):
                continue
            by_index = {sl["_index"]: sl for sl in slides if sl}
            if idx not in by_index:
                continue
            problems = []
            if r.get("on_topic") is False:
                problems.append("it is off-topic for the requested subject")
            unsupported = [u for u in r.get("unsupported") or [] if isinstance(u, str) and u.strip()]
            if unsupported:
                problems.append("these claims are not supported by the evidence: " + "; ".join(unsupported[:3]))
            if problems:
                flagged[idx] = ("The fact check found that " + " and ".join(problems) + ". " + str(r.get("fix") or "")).strip()
        return flagged

    # -- model-free slide ------------------------------------------------------------

    def _extractive(self, item: Dict[str, Any], evidence: Evidence, topic: str) -> Dict[str, Any]:
        """Slide made of verbatim evidence sentences (each cited). Used only when the model can't help."""
        wanted = term_set(f"{item['title']} {item.get('subtopic', '')} {item.get('purpose', '')}")
        ids = [e for e in item.get("evidence") or [] if e in evidence.items] or self._evidence_for_terms(evidence, wanted | term_set(topic), 6)
        points, used_sources = [], []
        for eid in ids:
            sid, ev = evidence.items[eid]
            if len(points) >= 4:
                break
            points.append({"text": _clip(ev["text"], POINT_MAX), "citations": [sid], "basis": "quoted"})
            used_sources.append(sid)
        return {
            "_index": item["_index"],
            "title": item["title"],
            "subtitle": item.get("purpose", "") if item["_index"] == 1 else "",
            "points": points if item["_index"] != 1 else [],
            "visual": {"type": "image", "image_query": item.get("image_query") or item["title"], "caption": ""},
            "notes": "Points on this slide are quoted from the cited sources." if points else "",
            "subtopic": item.get("subtopic", ""),
            "extractive": True,
        }


# ---------------------------------------------------------------------------
# Citations, images and the semantic slides handed to the compiler
# ---------------------------------------------------------------------------

def number_citations(slides: List[Dict[str, Any]], dossier: Dict[str, Any]) -> Dict[str, int]:
    """Reference numbers in order of first citation across the deck (stable after reordering)."""
    numbers: Dict[str, int] = {}

    def add(sid: str) -> None:
        if sid not in numbers:
            numbers[sid] = len(numbers) + 1

    for s in slides:
        for p in s.get("points") or []:
            for sid in p.get("citations") or []:
                add(sid)
        v = s.get("visual") or {}
        for key in ("chart", "kpi", "table", "quote"):
            for sid in (v.get(key) or {}).get("citations") or []:
                add(sid)
        for st in v.get("steps") or []:
            for sid in st.get("citations") or []:
                add(sid)
    return numbers


def _marks(cites: List[str], numbers: Dict[str, int]) -> str:
    return "".join(f"[{numbers[c]}]" for c in cites if c in numbers)


def to_semantic(slides: List[Dict[str, Any]], dossier: Dict[str, Any], deck_title: str, image_finder=None) -> List[Dict[str, Any]]:
    """Validated slides -> semantic slides for compile_semantic_slide, plus reference slides."""
    numbers = number_citations(slides, dossier)
    sources = source_by_id(dossier)
    short = {sid: _short_ref(sources[sid], n) for sid, n in numbers.items()}
    out = []
    for s in slides:
        v = s.get("visual") or {}
        vtype = v.get("type", "image")
        layout = "title" if s["_index"] == 1 else VISUAL_LAYOUT.get(vtype, "bullets")
        sem: Dict[str, Any] = {
            "title": s["title"],
            "subtitle": s.get("subtitle", ""),
            "layout": layout,
            "bullets": [f"{p['text']} {_marks(p['citations'], numbers)}".strip() for p in s.get("points") or []],
            "points": [{**p, "refs": [numbers[c] for c in p["citations"] if c in numbers]} for p in s.get("points") or []],
            "notes": s.get("notes", ""),
            "deck_topic": dossier.get("topic") or deck_title,
            "visual_type": vtype,
            "image_query": v.get("image_query", ""),
            "extractive": bool(s.get("extractive")),
        }
        if vtype == "chart" and v.get("chart"):
            ch = v["chart"]
            unit = f" ({ch['unit']})" if ch.get("unit") else ""
            sem["chart"] = {"kind": ch["kind"], "title": ch["title"] + unit, "xField": "category", "yField": "value", "data": ch["data"],
                            "source": "research", "citations": [numbers[c] for c in ch["citations"] if c in numbers]}
        if vtype == "kpi" and v.get("kpi"):
            k = v["kpi"]
            sem["kpi"] = {"value": k["value"], "label": f"{k['label']} {_marks(k['citations'], numbers)}".strip(), "delta": ""}
        if vtype in ("timeline", "process") and v.get("steps"):
            sem["timeline"] = {"steps": [{"step": str(i + 1), "title": st["title"], "desc": f"{st['body']} {_marks(st['citations'], numbers)}".strip()} for i, st in enumerate(v["steps"])]}
        if vtype == "comparison" and v.get("columns"):
            a, b = v["columns"][0], v["columns"][1]
            sem["comparison"] = {"leftTitle": a["title"], "leftItems": a["items"], "rightTitle": b["title"], "rightItems": b["items"]}
        if vtype == "table" and v.get("table"):
            sem["table"] = {**v["table"], "title": s["title"], "marks": _marks(v["table"].get("citations") or [], numbers)}
        if vtype == "quote" and v.get("quote"):
            q = v["quote"]
            sem["quote"] = {"text": q["text"], "author": f"{q['attribution']} {_marks(q['citations'], numbers)}".strip()}
        # Images: title slide and slides whose visual is an image, diagram or 3D model.
        if layout in ("title", "image-text") and image_finder is not None:
            img = image_finder.find(v.get("image_query") or s["title"], s["title"])
            if img:
                sem["image"] = img
            else:
                sem["image_missing"] = True
        cited_here = []
        for p in s.get("points") or []:
            cited_here.extend(c for c in p["citations"] if c not in cited_here)
        for key in ("chart", "kpi", "table", "quote"):
            cited_here.extend(c for c in (v.get(key) or {}).get("citations") or [] if c not in cited_here)
        for st in v.get("steps") or []:
            cited_here.extend(c for c in st.get("citations") or [] if c not in cited_here)
        sem["citations"] = [short[c] for c in sorted(cited_here, key=lambda c: numbers.get(c, 999)) if c in short]
        sem["citation_links"] = [sources[c].get("url") for c in sorted(cited_here, key=lambda c: numbers.get(c, 999)) if c in sources]
        out.append(sem)
    out.extend(reference_slides(numbers, sources))
    return out


def _short_ref(src: Dict[str, Any], n: int) -> str:
    authors = src.get("authors") or []
    who = (authors[0].split()[-1] + (" et al." if len(authors) > 1 else "")) if authors else (src.get("venue") or src.get("organization") or "")
    year = re.search(r"(1[5-9]|20)\d\d", src.get("published") or "")
    when = f" ({year.group(0)})" if year and src.get("kind") != "encyclopedia" else ""
    return f"[{n}] {who}{when}: {_clip(src.get('title') or '', 70)}".strip()


def reference_slides(numbers: Dict[str, int], sources: Dict[str, Dict[str, Any]], per_slide: int = 10) -> List[Dict[str, Any]]:
    ordered = sorted(numbers.items(), key=lambda kv: kv[1])
    lines = [format_reference(sources[sid], n) for sid, n in ordered if sid in sources]
    slides = []
    for i in range(0, len(lines), per_slide):
        chunk = lines[i : i + per_slide]
        slides.append({
            "title": "References" if i == 0 else "References (continued)",
            "layout": "references",
            "references": chunk,
            "reference_links": [sources[sid].get("url") for sid, _ in ordered[i : i + per_slide]],
            "bullets": [],
            "notes": "Full references for the numbered citations used in this presentation.",
        })
    return slides


def outline_summary(outline: Dict[str, Any]) -> str:
    return json.dumps([{k: s.get(k) for k in ("title", "visual", "layout")} for s in outline.get("slides") or []])
