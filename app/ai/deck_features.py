"""Part B deck features that read the whole deck and return structured results.

Each request makes one model call through the prompt registry. If the model is
unavailable (no key, quota used up, error) the route answers 503 with a plain reason:
these features never show made-up template content.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List

from flask import Blueprint, current_app, g, request

import app.prompts.features  # noqa: F401  (registers the feature prompts)
from app.ai import gateway
from app.ai.factory import get_provider
from app.ai.openrouter_provider import summarize_block
from app.database import get_connection
from app.prompts.registry import call_prompt

logger = logging.getLogger(__name__)
features_bp = Blueprint("deck_features", __name__)

MAX_DIGEST_CHARS = 9000
DEFAULT_PERSONAS = ["Skeptical CFO", "Domain expert", "First-time listener"]


class AIUnavailable(Exception):
    pass


def deck_slides(conn, presentation_id: int) -> List[Dict[str, Any]]:
    pres = conn.execute("SELECT datasets FROM presentations WHERE id = ?", (presentation_id,)).fetchone()
    datasets = json.loads(pres["datasets"]) if pres and pres["datasets"] else {}
    rows = conn.execute(
        "SELECT id, slide_order, title, spec FROM slides WHERE presentation_id = ? ORDER BY slide_order, id",
        (presentation_id,),
    ).fetchall()
    slides = []
    for n, r in enumerate(rows, start=1):
        try:
            spec = json.loads(r["spec"]) if r["spec"] else {}
        except (TypeError, ValueError):
            spec = {}
        blocks = [summarize_block(b, datasets) for b in spec.get("blocks") or [] if isinstance(b, dict)]
        title = next((b.get("text") for b in blocks if b.get("role") == "title" and b.get("text")), r["title"] or "")
        slides.append({"number": n, "db_id": r["id"], "slide_id": f"slide-{r['id']}",  # the id the editor and present mode use
                       "title": title, "notes": spec.get("notes") or "", "blocks": blocks, "layout": spec.get("layout")})
    return slides


def digest(slides: List[Dict[str, Any]], limit: int = MAX_DIGEST_CHARS) -> str:
    """Compact plain-text view of the deck for prompts."""
    parts = []
    for s in slides:
        lines = [f"Slide {s['number']}: {s['title']}"]
        for b in s["blocks"]:
            if b.get("role") == "title":
                continue
            if b.get("type") == "chart" and b.get("labels"):
                pairs = ", ".join(f"{l}={v}" for l, v in zip(b.get("labels") or [], b.get("values") or []))
                lines.append(f"  chart ({b.get('kind')}): {pairs}")
            elif b.get("type") == "kpi":
                lines.append(f"  KPI: {b.get('value')} {b.get('label') or ''}")
            elif b.get("text"):
                lines.append("  " + b["text"].replace("\n", " / ")[:500])
        parts.append("\n".join(lines))
    text = "\n\n".join(parts)
    return text[:limit] + ("\n[deck truncated]" if len(text) > limit else "")


def run_prompt(prompt_id: str, **values) -> Dict[str, Any]:
    provider = get_provider()
    if not getattr(provider, "is_configured", False) or not hasattr(provider, "_call"):
        raise AIUnavailable("AI isn't configured. Add an API key in .env.")
    try:
        result = call_prompt(provider, prompt_id, **values)
    except Exception as exc:
        logger.warning("%s failed: %s", prompt_id, exc)
        msg = str(exc)
        if "429" in msg or "rate" in msg.lower() or "quota" in msg.lower():
            raise AIUnavailable("The free AI quota is used up for today. Try again after 00:00 UTC.") from None
        raise AIUnavailable("The AI didn't respond. Try again in a moment.") from None
    if not isinstance(result, dict):
        raise AIUnavailable("The AI returned something unreadable. Try again.")
    return result


def unavailable(exc: AIUnavailable):
    return {"error": str(exc), "code": "ai_unavailable"}, 503


def _load(presentation_id: int):
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        slides = deck_slides(conn, presentation_id)
    finally:
        conn.close()
    return slides


def _slide_ref(slides, n):
    try:
        n = int(n)
    except (TypeError, ValueError):
        return None
    return slides[n - 1]["slide_id"] if 1 <= n <= len(slides) else None


# --- #1 Audience Twin -------------------------------------------------------------------

@features_bp.post("/<int:presentation_id>/ai/rehearse")
@gateway.feature("rehearse.audience")
def rehearse(presentation_id):
    data = request.get_json(silent=True) or {}
    personas = [str(p).strip()[:60] for p in (data.get("personas") or DEFAULT_PERSONAS) if str(p).strip()][:4]
    slides = _load(presentation_id)
    if not slides:
        return {"error": "Add some slides first.", "code": "empty_deck"}, 400
    try:
        result = run_prompt("rehearse.audience", personas=", ".join(personas), deck=digest(slides))
    except AIUnavailable as exc:
        return unavailable(exc)
    out = []
    for p in (result.get("personas") or [])[:4]:
        if not isinstance(p, dict):
            continue
        qs = [
            {"question": str(q.get("question", ""))[:400], "slide": q.get("slide"), "slideId": _slide_ref(slides, q.get("slide")),
             "why": str(q.get("why", ""))[:300]}
            for q in (p.get("questions") or []) if isinstance(q, dict) and q.get("question")
        ][:5]
        conf = [{"slide": c.get("slide"), "slideId": _slide_ref(slides, c.get("slide")), "reason": str(c.get("reason", ""))[:300]}
                for c in (p.get("confusing_slides") or []) if isinstance(c, dict)][:3]
        weak = [{"slide": w.get("slide"), "slideId": _slide_ref(slides, w.get("slide")), "argument": str(w.get("argument", ""))[:300],
                 "howToStrengthen": str(w.get("how_to_strengthen", ""))[:300]}
                for w in (p.get("weak_arguments") or []) if isinstance(w, dict)][:3]
        out.append({"persona": str(p.get("persona", ""))[:60], "questions": qs, "confusingSlides": conf, "weakArguments": weak})
    return {"personas": out}


# --- #4 Debate Mode ---------------------------------------------------------------------

@features_bp.post("/<int:presentation_id>/ai/stress-test")
@gateway.feature("rehearse.debate")
def stress_test(presentation_id):
    slides = _load(presentation_id)
    if not slides:
        return {"error": "Add some slides first.", "code": "empty_deck"}, 400
    try:
        result = run_prompt("rehearse.debate", deck=digest(slides))
    except AIUnavailable as exc:
        return unavailable(exc)
    order = {"high": 0, "medium": 1, "low": 2}
    challenges = [
        {
            "slide": c.get("slide"),
            "slideId": _slide_ref(slides, c.get("slide")),
            "claim": str(c.get("claim", ""))[:400],
            "challenge": str(c.get("challenge", ""))[:500],
            "counter": str(c.get("counter", ""))[:500],
            "evidenceNeeded": str(c.get("evidence_needed", ""))[:400],
            "severity": c.get("severity") if c.get("severity") in order else "medium",
        }
        for c in (result.get("challenges") or []) if isinstance(c, dict) and c.get("claim")
    ][:8]
    challenges.sort(key=lambda c: order[c["severity"]])
    return {"verdict": str(result.get("verdict", ""))[:400], "challenges": challenges}


# --- #2 Time Machine --------------------------------------------------------------------

@features_bp.post("/<int:presentation_id>/ai/time-plan")
@gateway.feature("timing.plan")
def time_plan(presentation_id):
    data = request.get_json(silent=True) or {}
    try:
        minutes = float(data.get("minutes"))
    except (TypeError, ValueError):
        return {"error": "Say how many minutes you have.", "code": "minutes_required"}, 400
    if not 1 <= minutes <= 240:
        return {"error": "Minutes must be between 1 and 240.", "code": "bad_minutes"}, 400
    slides = _load(presentation_id)
    if not slides:
        return {"error": "Add some slides first.", "code": "empty_deck"}, 400
    try:
        result = run_prompt("timing.plan", minutes=f"{minutes:g}", deck=digest(slides))
    except AIUnavailable as exc:
        return unavailable(exc)
    by_number = {}
    for item in result.get("slides") or []:
        if isinstance(item, dict):
            try:
                by_number[int(item.get("slide"))] = item
            except (TypeError, ValueError):
                continue
    plan = []
    for s in slides:
        item = by_number.get(s["number"], {})
        keep = bool(item.get("keep", True))
        # Never drop the first or last slide (opening and close).
        if s["number"] in (1, len(slides)):
            keep = True
        try:
            mins = max(0.0, float(item.get("minutes") or 0)) if keep else 0.0
        except (TypeError, ValueError):
            mins = 0.0
        plan.append({"slide": s["number"], "slideId": s["slide_id"], "title": s["title"][:120], "keep": keep,
                     "minutes": round(mins, 1), "note": str(item.get("note", ""))[:240]})
    total = round(sum(p["minutes"] for p in plan), 1)
    return {"minutes": minutes, "totalMinutes": total, "summary": str(result.get("summary", ""))[:300],
            "bridge": str(result.get("bridge", ""))[:300], "slides": plan}


# --- #8 Live Demo Generator -------------------------------------------------------------

MAX_CODE = 20000
_BAD_CODE = re.compile(r"\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|localStorage|sessionStorage|document\.cookie|window\.top|window\.parent\.location)\b")


@features_bp.post("/<int:presentation_id>/ai/demo")
@gateway.feature("demo.generate")
def generate_demo(presentation_id):
    data = request.get_json(silent=True) or {}
    ask = str(data.get("request") or "").strip()[:500]
    if len(ask) < 3:
        return {"error": "Describe the demo, e.g. 'a compound interest calculator with sliders'.", "code": "request_required"}, 400
    slides = _load(presentation_id)
    topic = slides[0]["title"] if slides else ""
    try:
        result = run_prompt("demo.generate", request=ask, slide_title=str(data.get("slideTitle") or "")[:200], topic=topic[:200])
    except AIUnavailable as exc:
        return unavailable(exc)
    code = {k: str(result.get(k) or "")[:MAX_CODE] for k in ("html", "css", "js")}
    if not code["html"].strip() and not code["js"].strip():
        return {"error": "The AI didn't return a working demo. Try describing it differently.", "code": "empty_demo"}, 502
    # The iframe sandbox and CSP already block network and parent access; also strip the obvious attempts.
    code["js"] = _BAD_CODE.sub("void 0 /* blocked */", code["js"])
    code["html"] = re.sub(r"<script\b[^>]*\bsrc\s*=[^>]*>\s*</script>", "", code["html"], flags=re.I)
    return {"title": str(result.get("title") or "Demo")[:80], "explanation": str(result.get("explanation") or "")[:300], "code": code}


# --- #13 Decision Rooms -----------------------------------------------------------------

@features_bp.post("/<int:presentation_id>/ai/decision")
@gateway.feature("decision.model")
def decision_room(presentation_id):
    import uuid

    data = request.get_json(silent=True) or {}
    question = str(data.get("question") or "").strip()[:200]
    options = [str(o).strip()[:80] for o in (data.get("options") or []) if str(o).strip()][:4]
    if len(question) < 3 or len(options) < 2:
        return {"error": "Give the decision and 2 to 4 options.", "code": "bad_decision"}, 400
    slides = _load(presentation_id)
    try:
        result = run_prompt("decision.model", question=question, options=" | ".join(options), deck=digest(slides))
    except AIUnavailable as exc:
        return unavailable(exc)
    by_name = {str(o.get("option", "")).strip().lower(): o for o in (result.get("options") or []) if isinstance(o, dict)}
    columns, notes = [], []
    for i, name in enumerate(options):
        o = by_name.get(name.lower()) or ((result.get("options") or [])[i] if i < len(result.get("options") or []) else {})
        o = o if isinstance(o, dict) else {}
        items = [str(c)[:120] for c in (o.get("consequences") or [])][:3]
        if o.get("main_risk"):
            items.append(f"Risk: {str(o['main_risk'])[:110]}")
        columns.append({"title": name, "items": items or ["(no projection)"]})
        notes.append(f"{name}: confidence {o.get('confidence', 'medium')}.")
    uid = uuid.uuid4().hex[:8]
    title = str(result.get("title") or question)[:90]
    n = len(columns)
    slide = {
        "id": f"slide-decision-{uid}",
        "layout": "comparison",
        "notes": " ".join(notes) + " " + str(result.get("facilitator_note") or "Go Live and run a poll with these options."),
        "transition": {"effect": "fade", "duration": 300},
        "decision": {"question": question, "options": options},
        "blocks": [
            {"id": f"blk-title-{uid}", "type": "text", "role": "title", "x": 100, "y": 80, "w": 1720, "h": 120,
             "content": title, "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": title}]}]},
             "style": {"fontSize": 48, "fontWeight": 700}},
            {"id": f"blk-decision-{uid}", "type": "comparison", "role": "body", "x": 100, "y": 240, "w": 1720, "h": 700,
             "columns": columns, "props": {"columns": columns}},
            {"id": f"blk-vote-{uid}", "type": "text", "role": "footer", "x": 100, "y": 975, "w": 1720, "h": 60,
             "content": f"Vote live: {' / '.join(options)}" + (" (projections are estimates)" if n else ""),
             "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": f"Vote live: {' / '.join(options)} (projections are estimates)"}]}]},
             "style": {"fontSize": 20, "color": "var(--ink-2)"}},
        ],
    }
    return {"slide": slide, "options": options}


# --- #14 Visual Memory ------------------------------------------------------------------

@features_bp.get("/<int:presentation_id>/ai/memory-map")
@gateway.feature("map.generate")
def memory_map(presentation_id):
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        pres = conn.execute("SELECT title, revision FROM presentations WHERE id = ?", (presentation_id,)).fetchone()
        slides = deck_slides(conn, presentation_id)
    finally:
        conn.close()
    if pres is None:
        return {"error": "Presentation not found."}, 404
    if not slides:
        return {"error": "Add some slides first.", "code": "empty_deck"}, 400

    def compute():
        return run_prompt("map.generate", deck=digest(slides))

    try:
        # One call per deck version: reopening the map doesn't spend AI quota again.
        result = gateway.cached("map.generate", {"pid": presentation_id, "rev": pres["revision"], "n": len(slides)}, compute)
    except AIUnavailable as exc:
        return unavailable(exc)
    concepts = []
    seen = set()
    for c in (result.get("concepts") or [])[:12]:
        if isinstance(c, dict) and c.get("id") and c.get("label") and c["id"] not in seen:
            seen.add(c["id"])
            try:
                imp = max(1, min(3, int(c.get("importance") or 2)))
            except (TypeError, ValueError):
                imp = 2
            concepts.append({"id": str(c["id"])[:20], "label": str(c["label"])[:40], "slide": c.get("slide"),
                             "slideId": _slide_ref(slides, c.get("slide")), "importance": imp})
    links = [{"from": str(l.get("from")), "to": str(l.get("to")), "label": str(l.get("label", ""))[:20]}
             for l in (result.get("links") or [])[:20] if isinstance(l, dict) and l.get("from") in seen and l.get("to") in seen]
    numbers = [{"value": str(n.get("value", ""))[:16], "label": str(n.get("label", ""))[:80], "slide": n.get("slide")}
               for n in (result.get("numbers") or [])[:6] if isinstance(n, dict) and n.get("value")]
    return {"deckTitle": pres["title"], "title": str(result.get("title") or pres["title"])[:80], "concepts": concepts,
            "links": links, "numbers": numbers, "takeaways": [str(t)[:200] for t in (result.get("takeaways") or [])[:3]]}


# --- #7 Ask Anything (audience, no account) -----------------------------------------------

import threading as _threading
import time as _time

_ASK_LOCK = _threading.Lock()
_ASK_LAST: Dict[str, float] = {}
_ASK_DECK: Dict[int, List[float]] = {}
ASK_GAP_S = 5          # one question per person every 5 s
ASK_PER_HOUR = 60      # per deck, to protect the AI quota


def _ask_allowed(who: str, pres_id: int) -> bool:
    now = _time.time()
    with _ASK_LOCK:
        if now - _ASK_LAST.get(who, 0) < ASK_GAP_S:
            return False
        recent = [t for t in _ASK_DECK.get(pres_id, []) if now - t < 3600]
        if len(recent) >= ASK_PER_HOUR:
            return False
        recent.append(now)
        _ASK_DECK[pres_id] = recent
        _ASK_LAST[who] = now
        return True


@features_bp.post("/share/<identifier>/ask", endpoint="ask_anything")
def ask_anything(identifier):
    data = request.get_json(silent=True) or {}
    question = str(data.get("question") or "").strip()[:300]
    if len(question) < 3:
        return {"error": "Type a question first.", "code": "question_required"}, 400
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        row = conn.execute(
            "SELECT id, org_id, is_shared FROM presentations WHERE share_token = ? OR (CAST(id AS TEXT) = ? AND is_shared = 1)",
            (identifier, identifier),
        ).fetchone()
        if row is None or not row["is_shared"]:
            return {"error": "This presentation isn't shared.", "code": "not_shared"}, 404
        slides = deck_slides(conn, row["id"])
    finally:
        conn.close()
    who = str(data.get("participant_id") or request.remote_addr or "anon")[:64]
    if not _ask_allowed(f"{row['id']}:{who}", row["id"]):
        return {"error": "Please wait a few seconds before asking again.", "code": "rate_limited"}, 429
    try:
        with gateway.session("audience.ask", org_id=row["org_id"], db_path=current_app.config["DATABASE_PATH"]):
            result = run_prompt("audience.ask", question=question, deck=digest(slides, 6000))
    except AIUnavailable as exc:
        return unavailable(exc)
    used = []
    for n in result.get("slides") or []:
        try:
            n = int(n)
        except (TypeError, ValueError):
            continue
        if 1 <= n <= len(slides) and n not in used:
            used.append(n)
    return {"question": question, "answer": str(result.get("answer") or "")[:700], "slides": used[:5],
            "covered": bool(result.get("covered", True))}


# --- #9 Presentation Memory (keyword retrieval over the org's other decks; no AI call) ------

_STOP = set("a an the and or of for to in on at by with from is are was were be this that these those it its our your "
            "their as into how what why when which who we you they i not no yes can will may more most less very "
            "slide slides deck presentation briefing board overview".split())


def _tokens(text: str) -> List[str]:
    return [w for w in re.findall(r"[a-z0-9]{3,}", (text or "").lower()) if w not in _STOP]


@features_bp.get("/<int:presentation_id>/related-slides")
def related_slides(presentation_id):
    import math
    from collections import Counter

    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        own = conn.execute("SELECT title FROM presentations WHERE id = ?", (presentation_id,)).fetchone()
        query = (request.args.get("q") or "").strip()[:200] or (own["title"] if own else "")
        rows = conn.execute(
            """
            SELECT s.id, s.spec, s.title AS slide_title, p.id AS pid, p.title AS deck_title, p.datasets
            FROM slides s JOIN presentations p ON p.id = s.presentation_id
            WHERE p.org_id = ? AND p.id != ? AND s.spec IS NOT NULL
            ORDER BY p.updated_at DESC LIMIT 2000
            """,
            (g.org_id, presentation_id),
        ).fetchall()
    finally:
        conn.close()
    q = Counter(_tokens(query))
    if not q:
        return {"query": query, "slides": []}
    docs = []
    for r in rows:
        try:
            spec = json.loads(r["spec"])
        except (TypeError, ValueError):
            continue
        blocks = [summarize_block(b, {}) for b in spec.get("blocks") or [] if isinstance(b, dict)]
        title = next((b.get("text") for b in blocks if b.get("role") == "title" and b.get("text")), r["slide_title"] or "")
        body = " ".join(b.get("text", "") for b in blocks)
        docs.append((r, spec, title, Counter(_tokens(f"{title} {title} {body} {r['deck_title']}"))))
    df_counts = Counter(t for *_, toks in docs for t in set(toks))
    n = max(1, len(docs))
    scored = []
    for r, spec, title, toks in docs:
        score = sum(q[t] * toks[t] * math.log(1 + n / (1 + df_counts[t])) for t in q if t in toks)
        if score > 0:
            scored.append((score, r, spec, title))
    scored.sort(key=lambda x: -x[0])
    out, seen_titles = [], set()
    for score, r, spec, title in scored:
        key = (title or "").strip().lower()
        if key in seen_titles:
            continue
        seen_titles.add(key)
        datasets = json.loads(r["datasets"]) if r["datasets"] else {}
        used = {b.get("dataset") for b in spec.get("blocks") or [] if isinstance(b, dict) and b.get("dataset")}
        out.append({"deckId": r["pid"], "deckTitle": r["deck_title"], "slideTitle": title[:120], "score": round(score, 2),
                    "spec": spec, "datasets": {k: v for k, v in datasets.items() if k in used}})
        if len(out) >= 8:
            break
    return {"query": query, "slides": out}


# --- #12 Live Data Injection (public CSV/JSON URL -> dataset rows; no AI call) ------------

LIVE_MAX_BYTES = 1024 * 1024
LIVE_MAX_ROWS = 500


def parse_table(body: bytes, ctype: str) -> List[Dict[str, Any]]:
    """Rows from CSV or JSON (a list of objects, or {"rows"|"data"|"items": [...]})."""
    import csv
    import io

    text = body.decode("utf-8-sig", errors="replace").strip()
    if "json" in ctype or text[:1] in "[{":
        data = json.loads(text)
        if isinstance(data, dict):
            data = next((data[k] for k in ("rows", "data", "items", "records", "results") if isinstance(data.get(k), list)), [])
        return [r for r in data if isinstance(r, dict)][:LIVE_MAX_ROWS]
    reader = csv.DictReader(io.StringIO(text))
    return [dict(r) for r, _ in zip(reader, range(LIVE_MAX_ROWS))]


def _norm(s) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def map_rows(rows: List[Dict[str, Any]], columns: List[Dict[str, Any]]):
    """Match incoming fields to the dataset's columns by key or label, ignoring case, spaces and symbols."""
    incoming = list(rows[0].keys()) if rows else []
    lookup = {_norm(k): k for k in incoming}
    mapping = {}
    for col in columns:
        src = lookup.get(_norm(col.get("key"))) or lookup.get(_norm(col.get("label")))
        if src:
            mapping[col["key"]] = src
    out = []
    for r in rows:
        row = {}
        for col in columns:
            src = mapping.get(col["key"])
            val = r.get(src) if src else None
            if col.get("type") == "number" and val not in (None, ""):
                try:
                    val = float(str(val).replace(",", "").replace("%", "").strip())
                    val = int(val) if val.is_integer() else val
                except ValueError:
                    val = None
            row[col["key"]] = val
        out.append(row)
    return out, mapping


@features_bp.post("/<int:presentation_id>/datasets/live-refresh")
def live_refresh(presentation_id):
    from datetime import datetime, timezone

    from app.ai import research_tools as rt

    data = request.get_json(silent=True) or {}
    url = str(data.get("url") or "").strip()
    columns = data.get("columns") or []
    if not url.startswith(("http://", "https://")) or len(url) > 2000:
        return {"error": "Enter a public https:// link to a CSV or JSON file.", "code": "bad_url"}, 400
    if not isinstance(columns, list) or not columns or not all(isinstance(c, dict) and c.get("key") for c in columns):
        return {"error": "The dataset has no columns to fill.", "code": "bad_columns"}, 400
    try:
        _, ctype, body, truncated = rt.safe_get(
            url, max_bytes=LIVE_MAX_BYTES, timeout=10,
            allowed_types=("text/csv", "text/plain", "application/json", "application/vnd.ms-excel"),
        )
    except rt.UnsafeURLError:
        return {"error": "That address can't be read: only public websites are allowed.", "code": "unsafe_url"}, 400
    except Exception as exc:
        return {"error": f"Couldn't read the data ({str(exc)[:120]}).", "code": "fetch_failed"}, 502
    try:
        rows = parse_table(body, ctype)
    except ValueError:
        return {"error": "The link didn't return a CSV or JSON table.", "code": "not_a_table"}, 422
    if not rows:
        return {"error": "No rows found at that link.", "code": "empty"}, 422
    mapped, mapping = map_rows(rows, columns)
    if not mapping:
        return {"error": "None of the columns matched. Name the source columns like the dataset's columns.",
                "code": "no_match", "sourceColumns": list(rows[0].keys())[:20]}, 422
    return {"rows": mapped, "matched": mapping, "unmatched": [c["key"] for c in columns if c["key"] not in mapping],
            "truncated": truncated, "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}


# --- #10 Live captions + translation ----------------------------------------------------------
# Captions are kept in memory only (last 60 lines per session), never written to the database:
# transcripts are not stored unless an org opts in (F15 store_transcripts).

from collections import deque as _deque

CAPTION_LANGS = {"ur": "Urdu", "ar": "Arabic", "hi": "Hindi", "es": "Spanish", "fr": "French", "de": "German",
                 "zh": "Chinese (Simplified)", "tr": "Turkish", "en": "English"}
_CAPTIONS: Dict[str, Any] = {}          # session_id -> deque of {"seq", "text", "at"}
_CAPTION_SEQ: Dict[str, int] = {}
_TRANSLATIONS: Dict[tuple, str] = {}    # (session_id, seq, lang) -> text
_TRANSLATE_LOCKS: Dict[tuple, Any] = {}
_LAST_TRANSLATE: Dict[tuple, float] = {}
TRANSLATE_MIN_GAP_S = 2.0


@features_bp.post("/live/<session_id>/captions", endpoint="post_caption")
def post_caption(session_id):
    data = request.get_json(silent=True) or {}
    text = re.sub(r"\s+", " ", str(data.get("text") or "")).strip()[:400]
    if not text:
        return {"error": "Empty caption."}, 400
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        sess = conn.execute("SELECT host_token, status FROM live_sessions WHERE id = ?", (session_id,)).fetchone()
    finally:
        conn.close()
    if sess is None:
        return {"error": "Live session not found."}, 404
    if sess["host_token"] != data.get("host_token"):
        return {"error": "Only the presenter can send captions."}, 403
    with _ASK_LOCK:
        seq = _CAPTION_SEQ.get(session_id, 0) + 1
        _CAPTION_SEQ[session_id] = seq
        _CAPTIONS.setdefault(session_id, _deque(maxlen=60)).append({"seq": seq, "text": text, "at": _time.time()})
    return {"seq": seq}, 201


def _translate_pending(session_id: str, lang: str, lines: List[Dict[str, Any]], org_id) -> None:
    key = (session_id, lang)
    with _ASK_LOCK:
        lock = _TRANSLATE_LOCKS.setdefault(key, _threading.Lock())
    if not lock.acquire(blocking=False):
        return  # another request is translating this batch; this poll shows originals meanwhile
    try:
        todo = [l for l in lines if (session_id, l["seq"], lang) not in _TRANSLATIONS]
        if not todo or _time.time() - _LAST_TRANSLATE.get(key, 0) < TRANSLATE_MIN_GAP_S:
            return
        _LAST_TRANSLATE[key] = _time.time()
        numbered = "\n".join(f"{i + 1}. {l['text']}" for i, l in enumerate(todo[-8:]))
        with gateway.session("captions.translate", org_id=org_id, db_path=current_app.config["DATABASE_PATH"]):
            result = run_prompt("captions.translate", language=CAPTION_LANGS[lang], lines=numbered)
        out = result.get("translations") or []
        for l, t in zip(todo[-8:], out):
            if isinstance(t, str) and t.strip():
                _TRANSLATIONS[(session_id, l["seq"], lang)] = t.strip()[:600]
    except AIUnavailable:
        pass
    finally:
        lock.release()


@features_bp.get("/live/<session_id>/captions", endpoint="get_captions")
def get_captions(session_id):
    try:
        after = int(request.args.get("after") or 0)
    except ValueError:
        after = 0
    lang = (request.args.get("lang") or "en").lower()
    if lang not in CAPTION_LANGS:
        return {"error": "Unsupported language.", "code": "bad_lang"}, 400
    lines = [l for l in list(_CAPTIONS.get(session_id) or []) if l["seq"] > after]
    if lang != "en" and lines:
        conn = get_connection(current_app.config["DATABASE_PATH"])
        try:
            row = conn.execute(
                "SELECT p.org_id FROM live_sessions s JOIN presentations p ON p.id = s.presentation_id WHERE s.id = ?",
                (session_id,),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return {"error": "Live session not found."}, 404
        _translate_pending(session_id, lang, lines, row["org_id"])
    out = []
    for l in lines:
        translated = _TRANSLATIONS.get((session_id, l["seq"], lang)) if lang != "en" else l["text"]
        out.append({"seq": l["seq"], "original": l["text"], "text": translated, "translated": translated is not None})
    return {"lang": lang, "captions": out, "machineTranslated": lang != "en"}


# --- #6 Slide-to-Video: narration script (one call, cached per deck version) -----------------

@features_bp.get("/<int:presentation_id>/ai/narration")
@gateway.feature("narration.generate")
def narration(presentation_id):
    conn = get_connection(current_app.config["DATABASE_PATH"])
    try:
        pres = conn.execute("SELECT title, revision FROM presentations WHERE id = ?", (presentation_id,)).fetchone()
        slides = deck_slides(conn, presentation_id)
    finally:
        conn.close()
    if pres is None:
        return {"error": "Presentation not found."}, 404
    if not slides:
        return {"error": "Add some slides first.", "code": "empty_deck"}, 400

    def compute():
        return run_prompt("narration.script", deck=digest(slides))

    try:
        result = gateway.cached("narration.generate", {"pid": presentation_id, "rev": pres["revision"], "n": len(slides)}, compute)
    except AIUnavailable as exc:
        return unavailable(exc)
    by_number = {}
    for item in result.get("slides") or []:
        if isinstance(item, dict):
            try:
                by_number[int(item.get("slide"))] = str(item.get("script") or "").strip()[:900]
            except (TypeError, ValueError):
                continue
    out = []
    for s in slides:
        script = by_number.get(s["number"]) or s["notes"][:600] or s["title"]
        out.append({"slide": s["number"], "slideId": s["slide_id"], "title": s["title"][:120], "script": script})
    return {"title": pres["title"], "slides": out}
