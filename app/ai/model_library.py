"""Topic-matched 3D models from Sketchfab's public library.

Sketchfab's search API needs no key for public models, and every public model can be
shown through Sketchfab's own embeddable viewer, so a slide about the heart gets a real
heart model. Results are cached in memory per query. Any failure (offline, rate limit,
no match) returns nothing, and callers fall back to the built-in procedural scenes.
"""

from __future__ import annotations

import logging
import math
import re
import threading
import time
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

SEARCH_URL = "https://api.sketchfab.com/v3/search"
UID_RE = re.compile(r"^[0-9a-f]{32}$")
TIMEOUT_S = 5
CACHE_TTL_S = 6 * 60 * 60
MAX_FACES = 1_500_000  # very heavy scenes load slowly in a live demo

_CACHE: Dict[str, tuple] = {}
_LOCK = threading.Lock()

_FILLER = re.compile(
    r"\b(a|an|the|it|works|board|briefing|presentation|deck|pitch|overview|introduction|intro|report|on|about|of|for|to|"
    r"and|in|how|why|what|its|their|our|your|with|from|into|is|are|explained|worldwide|global|effects?|"
    r"impact|adopting|adoption|strategy|update|q[1-4]|fy\d*|20\d\d|executive|summary|analysis|key|insights?)\b",
    re.IGNORECASE,
)


def keywords(text: str, limit: int = 4) -> str:
    """'A board briefing on how hospitals are adopting AI.' -> 'hospitals ai'."""
    words = re.sub(r"[^A-Za-z0-9\s-]", " ", text or "")
    words = _FILLER.sub(" ", words)
    parts = [w for w in words.split() if len(w) > 1]
    return " ".join(parts[:limit]).lower()


def _summary(r: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    uid = r.get("uid") or ""
    if not UID_RE.match(uid) or r.get("isAgeRestricted"):
        return None
    if (r.get("faceCount") or 0) > MAX_FACES:
        return None
    thumbs = sorted(
        (t for t in (r.get("thumbnails") or {}).get("images", []) if t.get("url")),
        key=lambda t: abs((t.get("width") or 0) - 640),
    )
    lic = r.get("license")
    user = r.get("user") or {}
    return {
        "uid": uid,
        "name": (r.get("name") or "3D model")[:120],
        "author": (user.get("displayName") or user.get("username") or "")[:80],
        "authorUrl": user.get("profileUrl") or "",
        "license": (lic.get("label") if isinstance(lic, dict) else lic) or "",
        "thumbnail": thumbs[0]["url"] if thumbs else "",
        "viewerUrl": r.get("viewerUrl") or f"https://sketchfab.com/3d-models/{uid}",
        "likes": r.get("likeCount") or 0,
        "animated": bool(r.get("animationCount")),
    }


def search_models(query: str, count: int = 8) -> List[Dict[str, Any]]:
    """Public Sketchfab models for a query, best match first. Never raises."""
    query = re.sub(r"\s+", " ", (query or "").strip())[:80]
    if not query:
        return []
    key = query.lower()
    now = time.time()
    with _LOCK:
        hit = _CACHE.get(key)
        if hit and hit[0] > now:
            return hit[1][:count]
    try:
        resp = requests.get(
            SEARCH_URL,
            params={"type": "models", "q": query, "count": 24},
            headers={"User-Agent": "FLUXA/1.0 (presentation builder)"},
            timeout=TIMEOUT_S,
        )
        resp.raise_for_status()
        raw = resp.json().get("results") or []
    except Exception as exc:
        logger.warning("3D model search failed for %r: %s", query, exc)
        return []
    words = [w for w in key.split() if len(w) > 2]
    results = []
    for r in raw:
        s = _summary(r)
        if not s:
            continue
        name = s["name"].lower()
        tags = " ".join(t.get("name", "") for t in (r.get("tags") or [])).lower()
        score = sum(10 for w in words if w in name) + sum(3 for w in words if w in tags) + math.log1p(s["likes"])
        results.append((score, s))
    results.sort(key=lambda x: -x[0])
    ranked = [s for _, s in results]
    with _LOCK:
        _CACHE[key] = (now + CACHE_TTL_S, ranked)
    return ranked[:count]


def model_for_slide(deck_topic: str, slide_title: str, exclude: Optional[set] = None) -> Optional[Dict[str, Any]]:
    """Pick a model for a slide: the slide's subject within the deck topic, else the topic itself."""
    exclude = exclude or set()
    topic = keywords(deck_topic, 3)
    title = keywords(slide_title, 3)
    queries = []
    if title and topic and title != topic:
        extra = " ".join(w for w in title.split() if w not in topic.split())
        if extra:
            queries.append(f"{topic} {extra}".strip())
    queries += [q for q in (topic, title) if q]
    for q in dict.fromkeys(queries):
        for model in search_models(q, count=8):
            if model["uid"] not in exclude:
                return {**model, "query": q}
    return None
