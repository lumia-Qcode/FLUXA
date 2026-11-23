"""Website ingestion: read a public page (and up to 3 of its stylesheets) for brand signals.

Uses the SSRF-safe fetcher shared with the research tools (every hop is checked against
private, loopback, link-local and metadata addresses), honours robots.txt, identifies with
a generic user agent, caps sizes and time, and never runs page scripts. Image URLs (logo,
og:image, icons) are only recorded; nothing else is downloaded.
"""

from __future__ import annotations

import re
import urllib.parse
import urllib.robotparser
from collections import Counter
from html.parser import HTMLParser
from typing import Any, Dict, List

from app.ai import research_tools as rt
from app.ingest.extract import _add_text, _norm_hex, _result, _top
from app.ingest.guards import Rejected

USER_AGENT = "Mozilla/5.0 (compatible; FluxaBrandReader/1.0)"
ROBOTS_AGENT = "FluxaBrandReader"
PAGE_MAX_BYTES = 5 * 1024 * 1024
CSS_MAX_BYTES = 1024 * 1024
MAX_STYLESHEETS = 3
TIMEOUT_S = 10

_CSS_VAR = re.compile(r"(--[A-Za-z0-9_-]+)\s*:\s*(#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\))")
_RGB = re.compile(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})")
_HEX = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
_FONT_FAMILY = re.compile(r"font-family\s*:\s*([^;}{]+)", re.IGNORECASE)
_FONT_FACE = re.compile(r"@font-face\s*{[^}]*?font-family\s*:\s*['\"]?([^;'\"}]+)", re.IGNORECASE)
_GENERIC_FONTS = {"serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "inherit", "initial",
                  "-apple-system", "blinkmacsystemfont", "ui-sans-serif", "ui-serif", "ui-monospace", "unset"}


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta: Dict[str, str] = {}
        self.stylesheets: List[str] = []
        self.icons: List[str] = []
        self.logos: List[str] = []
        self.styles: List[str] = []
        self.inline_styles: List[str] = []
        self.text: List[str] = []
        self._skip = 0
        self._in_title = False
        self._in_style = False

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if a.get("style"):
            self.inline_styles.append(a["style"])
        if tag in ("script", "noscript", "template"):
            self._skip += 1
        elif tag == "style":
            self._in_style = True
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key in ("description", "theme-color", "og:image", "og:site_name", "og:title", "twitter:image"):
                self.meta.setdefault(key, a.get("content", "")[:500])
        elif tag == "link":
            rel = a.get("rel", "").lower()
            if "stylesheet" in rel and a.get("href"):
                self.stylesheets.append(a["href"])
            if "icon" in rel and a.get("href"):
                self.icons.append(a["href"])
        elif tag == "img":
            hay = " ".join((a.get("src", ""), a.get("alt", ""), a.get("class", ""), a.get("id", ""))).lower()
            if "logo" in hay and a.get("src"):
                self.logos.append(a["src"])

    def handle_endtag(self, tag):
        if tag in ("script", "noscript", "template") and self._skip:
            self._skip -= 1
        elif tag == "style":
            self._in_style = False
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_style:
            self.styles.append(data)
        elif self._in_title:
            self.title += data
        elif not self._skip and data.strip():
            self.text.append(data.strip())


def _robots_allows(url: str) -> bool:
    parts = urllib.parse.urlsplit(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    try:
        _, _, body, _ = rt.safe_get(robots_url, max_bytes=512 * 1024, timeout=TIMEOUT_S, user_agent=USER_AGENT,
                                    allowed_types=("text/plain",))
    except Exception:
        return True  # no robots.txt (or unreadable) means no rules
    parser = urllib.robotparser.RobotFileParser()
    parser.parse(body.decode("utf-8", "replace").splitlines())
    return parser.can_fetch(ROBOTS_AGENT, url)


def _abs(base: str, href: str) -> str:
    url = urllib.parse.urljoin(base, href.strip())
    return url if url.startswith(("http://", "https://")) else ""


def analyse_css(css: str, colors: Counter, variables: Dict[str, str], fonts: Counter) -> None:
    for name, value in _CSS_VAR.findall(css):
        hexv = _to_hex(value)
        if hexv:
            variables.setdefault(name, hexv)
    for m in _HEX.findall(css):
        colors[_norm_hex(m)] += 1
    for r, g, b in _RGB.findall(css):
        if max(int(r), int(g), int(b)) <= 255:
            colors["#%02X%02X%02X" % (int(r), int(g), int(b))] += 1
    for fam in _FONT_FACE.findall(css):
        fonts[fam.strip()] += 5
    for decl in _FONT_FAMILY.findall(css):
        first = decl.split(",")[0].strip().strip("'\"")
        if first and first.lower() not in _GENERIC_FONTS and not first.startswith("var("):
            fonts[first[:80]] += 1


def _to_hex(value: str) -> str:
    m = _HEX.fullmatch(value.strip())
    if m:
        return _norm_hex(m.group(1))
    m = _RGB.match(value.strip())
    if m and max(map(int, m.groups())) <= 255:
        return "#%02X%02X%02X" % tuple(map(int, m.groups()))
    return ""


def ingest_url(url: str, progress=lambda *a, **k: None) -> Dict[str, Any]:
    """Read a public page for brand signals. Raises Rejected with a user-facing message."""
    try:
        rt.check_public_url(url)
    except rt.UnsafeURLError:
        raise Rejected("That address can't be read: only public http(s) websites are allowed.") from None
    progress(0.1, "Checking robots.txt")
    if not _robots_allows(url):
        raise Rejected("The site's robots.txt doesn't allow automated reading of this page.")
    progress(0.25, "Reading the page")
    try:
        final_url, ctype, body, truncated = rt.safe_get(
            url, max_bytes=PAGE_MAX_BYTES, timeout=TIMEOUT_S, user_agent=USER_AGENT,
            allowed_types=("text/html", "application/xhtml+xml"),
        )
    except rt.UnsafeURLError:
        raise Rejected("The page redirected to an address that can't be read.") from None
    except ValueError as exc:
        raise Rejected(f"The page couldn't be read ({exc}).") from None
    except Exception:
        raise Rejected("The website didn't respond or returned an error.") from None

    page = _PageParser()
    page.feed(body.decode("utf-8", "replace"))
    out = _result("url")
    colors: Counter = Counter()
    fonts: Counter = Counter()
    variables: Dict[str, str] = {}
    for css in page.styles + page.inline_styles:
        analyse_css(css, colors, variables, fonts)

    fetched = []
    for i, href in enumerate(page.stylesheets[:MAX_STYLESHEETS]):
        css_url = _abs(final_url, href)
        if not css_url:
            continue
        progress(0.4 + 0.15 * i, "Reading stylesheets")
        try:
            _, _, css_body, _ = rt.safe_get(css_url, max_bytes=CSS_MAX_BYTES, timeout=TIMEOUT_S,
                                            user_agent=USER_AGENT, allowed_types=("text/css", "text/plain"))
            analyse_css(css_body.decode("utf-8", "replace"), colors, variables, fonts)
            fetched.append(css_url)
        except Exception:
            out["warnings"].append(f"stylesheet not readable: {css_url[:200]}")

    theme_color = _to_hex(page.meta.get("theme-color", ""))
    if theme_color:
        colors[theme_color] += 50
    for value in variables.values():
        colors[value] += 10
    out["meta"] = {
        "final_url": final_url,
        "title": page.title.strip()[:200],
        "description": page.meta.get("description", ""),
        "site_name": page.meta.get("og:site_name", ""),
        "theme_color": theme_color or None,
        "og_image": _abs(final_url, page.meta.get("og:image") or page.meta.get("twitter:image") or "") or None,
        "icons": [u for u in (_abs(final_url, h) for h in page.icons[:5]) if u],
        "logo_candidates": [u for u in (_abs(final_url, h) for h in page.logos[:5]) if u],
        "css_variables": dict(list(variables.items())[:40]),
        "stylesheets_read": fetched,
        "truncated": truncated,
    }
    out["colors"] = _top(colors, "css", "hex", 24)
    out["fonts"] = _top(fonts, "css", "family", 10)
    _add_text(out, "page", "\n".join(page.text)[:20000])
    progress(0.9, "Done reading")
    return out
