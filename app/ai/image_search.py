"""Slide images from Wikimedia, chosen per slide and credited.

Images come from the Wikipedia articles the research already read (their figures are
usually the best illustrations of the subject: anatomy diagrams, molecular models,
satellite images), plus a targeted article search when a slide needs something the pool
lacks. Every image keeps its author, licence and file page so the slide can credit it.

All lookups go through en.wikipedia.org (which also serves Commons file metadata) and the
research pipeline's per-host rate limiter, because commons.wikimedia.org is not reachable
from every network and Wikipedia rejects bursts.
"""

from __future__ import annotations

import logging
import re
import urllib.parse
from typing import Any, Dict, Iterable, List, Optional

from app.ai.research_pipeline import WIKI_API, _get_json, term_set

logger = logging.getLogger(__name__)

# File names that are interface icons, logos, maps of where something is, or audio/video.
_JUNK = re.compile(
    r"(icon|logo|flag[_ ]of|symbol|commons-|wiktionary|wikiquote|wikibooks|wikisource|wikiversity|wikinews|"
    r"question[_ ]book|edit-clear|padlock|ambox|disambig|stub|portal|crystal[_ ]clear|nuvola|gnome-|oojs|"
    r"red[_ ]pencil|increase|decrease|steady|loudspeaker|speaker[_ ]icon|signature|barnstar|folder|"
    r"blank|placeholder|\.ogg|\.ogv|\.webm|\.mp3|\.wav|\.mid|\.gif$|location[_ ]map|locator|orthographic[_ ]projection)",
    re.I,
)
# Words that say what kind of slide it is, not what to show; matching on them picks unrelated figures.
_GENERIC = term_set(
    "diagram image photo illustration picture structure structures overview introduction basics basic role roles "
    "function functions types type key core main major process processes system systems model models today modern "
    "future current concepts concept understanding practice practical applications application impact impacts"
)
_ALLOWED_MIME = ("image/jpeg", "image/png", "image/svg+xml", "image/webp", "image/tiff")


def _clean(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html or "")
    text = re.sub(r"&[a-zA-Z#0-9]+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _image_records(data: Dict[str, Any], article: str) -> List[Dict[str, Any]]:
    out = []
    for page in ((data.get("query") or {}).get("pages") or {}).values():
        title = page.get("title", "")
        info = (page.get("imageinfo") or [{}])[0]
        if not info or _JUNK.search(title) or info.get("mime") not in _ALLOWED_MIME:
            continue
        width = int(info.get("width") or 0)
        if width and width < 360:
            continue
        meta = info.get("extmetadata") or {}
        url = info.get("thumburl") or info.get("url")
        if not url:
            continue
        description = _clean((meta.get("ImageDescription") or {}).get("value", ""))[:400]
        out.append({
            "file": title,
            "url": url,
            "width": int(info.get("thumbwidth") or width or 0),
            "height": int(info.get("thumbheight") or info.get("height") or 0),
            "description": description,
            "author": re.split(r"\.\s+(?:When|If|Please|This)\b", _clean((meta.get("Artist") or {}).get("value", "")))[0][:90].strip(" ."),
            "license": _clean((meta.get("LicenseShortName") or {}).get("value", ""))[:60],
            "license_url": _clean((meta.get("LicenseUrl") or {}).get("value", ""))[:200],
            "attribution_required": (meta.get("AttributionRequired") or {}).get("value", "") == "true",
            "file_page": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
            "article": article,
            # Only the file's own name and description: one API call returns images for several
            # articles without saying which, so article titles would make every image "match".
            "terms": term_set(f"{title.split(':', 1)[-1].rsplit('.', 1)[0].replace('_', ' ')} {description}"),
        })
    return out


def images_of_articles(titles: Iterable[str]) -> List[Dict[str, Any]]:
    """All usable images used in the given articles, with licence metadata (one API call)."""
    titles = [t for t in titles if t][:5]
    if not titles:
        return []
    data = _get_json(
        WIKI_API,
        {
            "action": "query", "generator": "images", "titles": "|".join(titles), "gimlimit": 80, "prop": "imageinfo",
            "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 1280, "iiextmetadatafilter": "ImageDescription|Artist|LicenseShortName|LicenseUrl|AttributionRequired",
            "redirects": 1, "format": "json",
        },
        timeout=15,
    )
    return _image_records(data, " ".join(titles))


def search_article_images(query: str) -> List[Dict[str, Any]]:
    """Images of the best-matching article for a query (two API calls)."""
    data = _get_json(WIKI_API, {"action": "query", "list": "search", "srsearch": query, "srlimit": 1, "format": "json"})
    hits = (data.get("query") or {}).get("search") or []
    return images_of_articles([hits[0]["title"]]) if hits else []


class ImageFinder:
    """Picks a distinct, relevant, credited image for each slide of one deck."""

    def __init__(self, topic: str, article_titles: Iterable[str], max_searches: int = 4):
        self.topic_terms = term_set(topic)
        self.pool: List[Dict[str, Any]] = []
        self.used: set = set()
        self.searches_left = max_searches
        self.searched: set = set()
        self.errors: List[str] = []
        try:
            self.pool = images_of_articles(list(article_titles))
        except Exception as exc:
            self.errors.append(f"image pool: {exc}")
            logger.warning("images: could not read article images: %s", exc)

    def _score(self, image: Dict[str, Any], wanted: set) -> float:
        overlap = len(image["terms"] & wanted)
        topical = len(image["terms"] & self.topic_terms)
        landscape = 0.3 if image["width"] and image["height"] and image["width"] >= image["height"] else 0
        return overlap * 2 + topical * 0.5 + landscape + (0.2 if image["description"] else 0)

    @staticmethod
    def _family(image: Dict[str, Any]) -> str:
        """Files that are versions of one figure share a name stem ("..._Fig_3.3" and "..._Fig_3.3_-_single")."""
        stem = re.sub(r"[^a-z0-9]", "", image["file"].split(":", 1)[-1].rsplit(".", 1)[0].lower())
        return stem[:28]

    def _best(self, candidates: List[Dict[str, Any]], wanted: set, min_overlap: int) -> Optional[Dict[str, Any]]:
        used_families = {self._family(img) for img in self.pool if img["url"] in self.used}
        ranked = sorted(
            (img for img in candidates if img["url"] not in self.used and self._family(img) not in used_families
             and len(img["terms"] & wanted) >= min_overlap),
            key=lambda img: -self._score(img, wanted),
        )
        return ranked[0] if ranked else None

    def find(self, query: str, slide_title: str = "") -> Optional[Dict[str, Any]]:
        """An unused image for this slide, or None. Never returns a generic stand-in."""
        wanted = term_set(f"{query} {slide_title}") - _GENERIC
        if not wanted:
            wanted = set(self.topic_terms)
        choice = self._best(self.pool, wanted, 2) or self._best(self.pool, wanted - self.topic_terms, 1)
        if choice is None and self.searches_left > 0 and query and query.lower() not in self.searched:
            self.searches_left -= 1
            self.searched.add(query.lower())
            try:
                found = search_article_images(query)
                self.pool.extend(found)
                choice = self._best(found, wanted, 1)
            except Exception as exc:
                self.errors.append(f"{query}: {exc}")
                logger.warning("images: search for %r failed: %s", query, exc)
        if choice is None:
            choice = self._best(self.pool, wanted, 1)
        if choice is None:
            return None
        self.used.add(choice["url"])
        return public_view(choice)


def public_view(image: Dict[str, Any]) -> Dict[str, Any]:
    credit_parts = [p for p in (image.get("author"), image.get("license")) if p]
    return {
        "url": image["url"],
        "alt": (image.get("description") or image["file"].split(":", 1)[-1].rsplit(".", 1)[0].replace("_", " "))[:200],
        "credit": ("Image: " + ", ".join(credit_parts) + " via Wikimedia Commons") if credit_parts else "Image via Wikimedia Commons",
        "license": image.get("license", ""),
        "license_url": image.get("license_url", ""),
        "source_page": image.get("file_page", ""),
        "width": image.get("width", 0),
        "height": image.get("height", 0),
    }
