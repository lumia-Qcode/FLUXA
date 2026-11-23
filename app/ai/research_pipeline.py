"""Research stage of deck generation: plan -> search -> retrieve -> extract -> verify -> registry.

This runs before any slide is written. Its output (the "dossier") is the only place slide
facts, numbers and citations may come from:

- `sources`: a citation registry. Every entry is a document a tool actually retrieved
  (Wikipedia article, OpenAlex/PubMed record, or a fetched web page), with the metadata the
  service returned (title, authors, venue, date, URL, DOI). Nothing here is written by a model.
- each source carries `evidence`: sentences extracted verbatim from the retrieved text,
  ranked by relevance to the topic and its subtopics.
- numeric evidence is cross-checked against the other sources; matches are recorded in
  `corroborated_by`.

Search backends need no keys (Wikipedia, OpenAlex, PubMed, Bing RSS). Tavily or Brave are
used first when their keys are configured. Everything retrieved is untrusted data: prompts
wrap it in <untrusted_data> and never follow instructions inside it.
"""

from __future__ import annotations

import logging
import re
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

import requests

from app.ai.net import USER_AGENT, prefer_ipv4

logger = logging.getLogger(__name__)
prefer_ipv4()

HEADERS = {"User-Agent": USER_AGENT}
# Publishers' sites reject non-browser agents with 403; the product token still identifies us.
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 " + USER_AGENT.split(" ")[0]
WIKI_API = "https://en.wikipedia.org/w/api.php"
HTTP_TIMEOUT = 12
TOTAL_BUDGET_S = 75

STOPWORDS = set(
    """a an the and or of to in on for with by from at as is are was were be been being this that these those it its
    into about over under between through during how what why when where which who whom whose than then there their
    they them we our you your i me my he she his her not no but if so do does did can could should would may might
    will shall must also more most less least very much many such any each other some all both few own same just
    presentation slides slide deck briefing board overview introduction intro talk lecture report make create give
    please explain explaining about regarding topic audience general students executives""".split()
)

# Phrases that wrap a topic in a request ("a board briefing on brain") - removed by the fallback planner.
_REQUEST_WRAPPERS = re.compile(
    r"^(?:please\s+)?(?:(?:make|create|generate|build|prepare|write|give)\s+(?:me\s+)?)?"
    r"(?:an?\s+|the\s+)?(?:\d+[- ]slide\s+)?(?:short\s+|brief\s+|detailed\s+)?"
    r"(?:board\s+|executive\s+|investor\s+|class\s+)?"
    r"(?:presentation|deck|briefing|talk|lecture|overview|report|pitch)s?\s+(?:on|about|of|for|covering)\s+",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def clean_topic(text: str) -> str:
    """Strip request wording so "A board briefing on brain" searches for "brain"."""
    first = (text or "").strip().splitlines()[0] if (text or "").strip() else ""
    stripped = _REQUEST_WRAPPERS.sub("", first).strip().rstrip(".?!")
    return stripped or first.strip()


def terms(text: str) -> List[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", (text or "").lower())
    return [w for w in words if w not in STOPWORDS]


def _stem(word: str) -> str:
    for suffix in ("ations", "ation", "ings", "ing", "ies", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def term_set(text: str) -> set:
    return {_stem(w) for w in terms(text)}


def split_sentences(text: str) -> List[str]:
    text = re.sub(r"\s+", " ", text or "").strip()
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", text)
    return [p.strip() for p in parts if p.strip()]


_NUMBER = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(%|percent|per cent|billion|million|trillion|thousand))?", re.I)


def numbers_in(text: str) -> List[str]:
    """Numbers in a sentence, normalised (commas removed). Bare 4-digit years are skipped."""
    out = []
    for m in _NUMBER.finditer(text or ""):
        raw = m.group(1).replace(",", "")
        unit = (m.group(2) or "").lower()
        if not unit and re.fullmatch(r"(1[5-9]|20)\d\d", raw):
            continue  # a year, not a measurement
        out.append(raw + ("%" if unit in ("%", "percent", "per cent") else (" " + unit if unit else "")))
    return out


def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"&[a-zA-Z#0-9]+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------------------
# Source credibility
# ---------------------------------------------------------------------------

_DOMAIN_RULES: List[Tuple[re.Pattern, float, str, str]] = [
    (re.compile(r"(^|\.)(who\.int|un\.org|ipcc\.ch|oecd\.org|worldbank\.org|imf\.org|unep\.org|wmo\.int)$"), 0.95, "government", "intergovernmental organisation"),
    (re.compile(r"(^|\.)(nih\.gov|ncbi\.nlm\.nih\.gov|cdc\.gov|nasa\.gov|noaa\.gov|nist\.gov|epa\.gov|energy\.gov|census\.gov|bls\.gov|federalreserve\.gov|cisa\.gov|europa\.eu|gov\.uk|nhs\.uk|gov)$"), 0.92, "government", "government or public research agency"),
    (re.compile(r"(^|\.)(nature\.com|science\.org|sciencedirect\.com|cell\.com|thelancet\.com|nejm\.org|bmj\.com|pnas\.org|plos\.org|springer\.com|wiley\.com|ieee\.org|acm\.org|arxiv\.org|frontiersin\.org|mdpi\.com|oup\.com|jamanetwork\.com|annualreviews\.org|royalsocietypublishing\.org|tandfonline\.com|sagepub\.com|biorxiv\.org)$"), 0.9, "journal", "scholarly publisher"),
    (re.compile(r"(^|\.)(edu|ac\.uk|ac\.jp|ac\.in|edu\.au|edu\.pk|uni-[a-z]+\.de|ethz\.ch|mpg\.de|cnrs\.fr)$"), 0.85, "academic", "university or research institute"),
    (re.compile(r"(^|\.)(britannica\.com|nationalgeographic\.com|scientificamerican\.com|newscientist\.com|smithsonianmag\.com)$"), 0.75, "reference", "established reference or science publication"),
    (re.compile(r"(^|\.)(wikipedia\.org)$"), 0.7, "encyclopedia", "encyclopedia (secondary source)"),
    (re.compile(r"(^|\.)(reuters\.com|apnews\.com|bbc\.co\.uk|bbc\.com|ft\.com|economist\.com|nytimes\.com|theguardian\.com|wsj\.com|bloomberg\.com|hbr\.org|mckinsey\.com|brookings\.edu|pewresearch\.org|statista\.com)$"), 0.7, "media", "established news or research organisation"),
    (re.compile(r"(^|\.)(nist\.gov|owasp\.org|mitre\.org|ietf\.org|w3\.org|iso\.org|python\.org|mozilla\.org|developer\.mozilla\.org|microsoft\.com|google\.com|aws\.amazon\.com|openai\.com|anthropic\.com|deepmind\.google)$"), 0.78, "documentation", "standards body or official technical documentation"),
]
_LOW_VALUE = re.compile(
    r"(^|\.)(pinterest\.|quora\.com|reddit\.com|youtube\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|"
    r"merriam-webster\.com|dictionary\.|thesaurus\.|vocabulary\.com|wiktionary\.org|answers\.com|brainly\.|chegg\.com|"
    r"coursehero\.com|scribd\.com|slideshare\.net|amazon\.|ebay\.|etsy\.com|linkedin\.com|medium\.com|github\.com)"
)


def credibility_for(url: str) -> Tuple[float, str, str]:
    host = (urllib.parse.urlsplit(url or "").hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    for pattern, score, kind, reason in _DOMAIN_RULES:
        if pattern.search(host):
            return score, kind, reason
    if _LOW_VALUE.search(host):
        return 0.15, "low", "user-generated, commercial or dictionary site"
    return 0.45, "web", "general website (not independently verified)"


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

# Per-host politeness. Wikipedia's API allows a burst of about nine requests and then
# answers 429 for ~30 s, so it gets a token bucket; NCBI allows ~3 requests/s without a key.
_HOST_LIMITS = {"en.wikipedia.org": (1, 0.2), "eutils.ncbi.nlm.nih.gov": (1, 0.4), "api.openalex.org": (3, 0.1)}
_BUCKETS = {"en.wikipedia.org": (8.0, 1 / 3.2)}  # capacity, tokens per second
_bucket_state: Dict[str, List[float]] = {}
_host_locks: Dict[str, Any] = {}
_host_last: Dict[str, float] = {}
_locks_guard = threading.Lock()


def _take_token(host: str) -> None:
    if host not in _BUCKETS:
        return
    capacity, rate = _BUCKETS[host]
    while True:
        with _locks_guard:
            tokens, stamp = _bucket_state.get(host, [capacity, time.time()])
            now = time.time()
            tokens = min(capacity, tokens + (now - stamp) * rate)
            if tokens >= 1:
                _bucket_state[host] = [tokens - 1, now]
                return
            _bucket_state[host] = [tokens, now]
            wait = (1 - tokens) / rate
        time.sleep(min(wait, 3.5))


def _drain_bucket(host: str, seconds: float) -> None:
    """After a 429, stop spending tokens until the server's Retry-After has passed."""
    if host in _BUCKETS:
        capacity, rate = _BUCKETS[host]
        with _locks_guard:
            _bucket_state[host] = [-seconds * rate, time.time()]


def _throttle(url: str):
    host = urllib.parse.urlsplit(url).hostname or ""
    limit, spacing = _HOST_LIMITS.get(host, (4, 0.0))
    with _locks_guard:
        if host not in _host_locks:
            _host_locks[host] = (threading.BoundedSemaphore(limit), threading.Lock())
    sem, spacing_lock = _host_locks[host]

    class _Slot:
        def __enter__(self):
            sem.acquire()
            _take_token(host)
            if spacing:
                with spacing_lock:
                    wait = _host_last.get(host, 0) + spacing - time.time()
                    if wait > 0:
                        time.sleep(wait)
                    _host_last[host] = time.time()

        def __exit__(self, *exc):
            sem.release()

    return _Slot()


def polite_get(url: str, params: Optional[Dict[str, Any]] = None, timeout: float = HTTP_TIMEOUT, headers=None) -> requests.Response:
    """GET with per-host throttling and up to two retries on 429/503 (honouring Retry-After)."""
    for attempt in range(3):
        with _throttle(url):
            resp = requests.get(url, params=params, headers=headers or HEADERS, timeout=timeout)
        if resp.status_code not in (429, 503) or attempt == 2:
            resp.raise_for_status()
            return resp
        try:
            retry_after = float(resp.headers.get("Retry-After") or 0)
        except ValueError:
            retry_after = 0
        host = urllib.parse.urlsplit(url).hostname or ""
        if retry_after:
            _drain_bucket(host, retry_after)
        if retry_after > 12:
            resp.raise_for_status()  # don't stall the whole run; the caller records the miss
        time.sleep(retry_after or 1.5 * (attempt + 1))
    raise RuntimeError("unreachable")


def _get_json(url: str, params: Dict[str, Any], timeout: float = HTTP_TIMEOUT) -> Any:
    return polite_get(url, params=params, timeout=timeout).json()


# ---------------------------------------------------------------------------
# Backends
# ---------------------------------------------------------------------------

_memo: Dict[Tuple[str, str], Any] = {}
_memo_lock = threading.Lock()


def _memoised(kind: str, key: str, compute: Callable[[], Any]) -> Any:
    """Process-wide cache for encyclopedia lookups (subtopic searches often hit the same article)."""
    with _memo_lock:
        if (kind, key) in _memo:
            return _memo[(kind, key)]
    value = compute()
    with _memo_lock:
        if len(_memo) > 2000:
            _memo.clear()
        _memo[(kind, key)] = value
    return value


def wikipedia_search(query: str, limit: int = 3) -> List[str]:
    return _memoised("search", f"{limit}:{query.lower()}", lambda: _wikipedia_search(query, limit))


def _wikipedia_search(query: str, limit: int = 3) -> List[str]:
    data = _get_json(WIKI_API, {"action": "query", "list": "search", "srsearch": query, "srlimit": limit, "format": "json"})
    return [hit["title"] for hit in (data.get("query") or {}).get("search", [])]


def wikipedia_lookup(query: str) -> Optional[Dict[str, Any]]:
    """Best-matching article for a query, full text included, in a single API call."""
    return _memoised("lookup", query.lower(), lambda: _wikipedia_parse_pages(_get_json(
        WIKI_API,
        {
            "action": "query", "generator": "search", "gsrsearch": query, "gsrlimit": 1, "prop": "extracts|info|revisions",
            "explaintext": 1, "exsectionformat": "wiki", "inprop": "url", "rvprop": "timestamp", "redirects": 1, "format": "json",
        },
    ), query))


def wikipedia_article(title: str) -> Optional[Dict[str, Any]]:
    """Plain-text article with section headings, canonical URL and last-edit date."""
    return _memoised("article", title, lambda: _wikipedia_article(title))


def _wikipedia_article(title: str) -> Optional[Dict[str, Any]]:
    data = _get_json(
        WIKI_API,
        {
            "action": "query", "prop": "extracts|info|revisions", "explaintext": 1, "exsectionformat": "wiki",
            "inprop": "url", "rvprop": "timestamp", "titles": title, "redirects": 1, "format": "json",
        },
    )
    return _wikipedia_parse_pages(data, title)


def _wikipedia_parse_pages(data: Dict[str, Any], title: str) -> Optional[Dict[str, Any]]:
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        text = page.get("extract") or ""
        if not text or "missing" in page:
            continue
        if " may refer to" in text[:400] or " may also refer to" in text[:400]:
            return None  # disambiguation page
        sections = re.findall(r"^==\s*([^=].*?)\s*==\s*$", text, flags=re.M)
        body = re.split(r"^==\s*(?:See also|References|External links|Notes|Further reading|Bibliography|Sources|Citations)\s*==\s*$", text, flags=re.M)[0]
        revs = page.get("revisions") or [{}]
        return {
            "title": page.get("title", title),
            "url": page.get("fullurl") or f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
            "text": re.sub(r"^=+.*?=+\s*$", " ", body, flags=re.M),
            "sections": [s for s in sections if s.lower() not in {"see also", "references", "external links", "notes", "further reading", "bibliography", "sources", "citations", "gallery"}],
            "updated": (revs[0].get("timestamp") or "")[:10],
        }
    return None


def _openalex_abstract(inv: Optional[Dict[str, List[int]]]) -> str:
    if not inv:
        return ""
    positions = [(pos, word) for word, poss in inv.items() for pos in poss]
    return " ".join(word for _, word in sorted(positions))


def openalex_search(query: str, limit: int = 4) -> List[Dict[str, Any]]:
    data = _get_json(
        "https://api.openalex.org/works",
        {"search": query, "per-page": limit, "filter": "has_abstract:true,is_retracted:false", "sort": "relevance_score:desc"},
        timeout=15,
    )
    out = []
    for work in data.get("results") or []:
        abstract = _openalex_abstract(work.get("abstract_inverted_index"))
        if len(abstract) < 200:
            continue
        loc = work.get("primary_location") or {}
        src = loc.get("source") or {}
        doi = (work.get("doi") or "").replace("https://doi.org/", "")
        url = work.get("doi") or loc.get("landing_page_url") or work.get("id")
        authors = [((a.get("author") or {}).get("display_name") or "") for a in work.get("authorships") or []]
        venue = src.get("display_name") or ""
        if re.search(r"not found|unknown|^n/?a$", venue, re.I):
            venue = ""  # repository placeholders such as "NOT FOUND REPOSITORY"
        out.append({
            "title": work.get("display_name") or work.get("title") or "",
            "authors": [a for a in authors if a][:6],
            "venue": venue,
            "published": work.get("publication_date") or str(work.get("publication_year") or ""),
            "url": url,
            "doi": doi,
            "text": abstract,
            "kind": "journal" if (work.get("type") in ("article", "review") and src.get("type") == "journal") else "scholarly",
            "cited_by": work.get("cited_by_count") or 0,
            "work_type": work.get("type") or "",
        })
    return out


def pubmed_search(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    import defusedxml.ElementTree as ET

    ids = _get_json(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        {"db": "pubmed", "term": query, "retmode": "json", "retmax": limit, "sort": "relevance"},
    ).get("esearchresult", {}).get("idlist", [])
    if not ids:
        return []
    resp = polite_get(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        params={"db": "pubmed", "id": ",".join(ids), "retmode": "xml"},
    )
    root = ET.fromstring(resp.content)
    out = []
    for art in root.findall(".//PubmedArticle"):
        pmid = art.findtext(".//PMID") or ""
        abstract = " ".join("".join(node.itertext()) for node in art.findall(".//AbstractText"))
        if len(abstract) < 200:
            continue
        authors = []
        for a in art.findall(".//AuthorList/Author")[:6]:
            name = " ".join(x for x in (a.findtext("ForeName"), a.findtext("LastName")) if x)
            if name:
                authors.append(name)
        doi = ""
        for eid in art.findall(".//ELocationID"):
            if eid.get("EIdType") == "doi":
                doi = eid.text or ""
        year = art.findtext(".//PubDate/Year") or art.findtext(".//PubDate/MedlineDate") or ""
        out.append({
            "title": "".join(art.find(".//ArticleTitle").itertext()) if art.find(".//ArticleTitle") is not None else "",
            "authors": authors,
            "venue": art.findtext(".//Journal/Title") or "",
            "published": year[:4],
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "doi": doi,
            "text": abstract,
            "kind": "journal",
        })
    return out


def wikipedia_cited_links(title: str, limit: int = 60) -> List[str]:
    """External links an article cites (its references): the primary sources behind it."""
    data = _get_json(WIKI_API, {"action": "query", "prop": "extlinks", "titles": title, "ellimit": 500, "redirects": 1, "format": "json"})
    links: List[str] = []
    for page in ((data.get("query") or {}).get("pages") or {}).values():
        for item in page.get("extlinks") or []:
            url = item.get("*") or item.get("url") or ""
            if url.startswith("//"):
                url = "https:" + url
            if url.startswith("http") and not re.search(r"(archive\.org/web|wikipedia\.org|wikimedia\.org|wikidata\.org|worldcat\.org|books\.google|jstor\.org/stable|doi\.org|pubmed|ncbi\.nlm\.nih\.gov/pmc|semanticscholar|ui\.adsabs|api\.|\.pdf($|\?))", url, re.I):
                links.append(url)
    return links[:limit] if limit else links


def web_search(query: str, limit: int = 8) -> Tuple[str, List[Dict[str, str]]]:
    """Live web search through Tavily or Brave when a key is configured.

    Returns (backend, results). Without a key there is no general web search: the
    public keyless endpoints tried earlier either block automated clients (DuckDuckGo
    answers 202 with a challenge) or ignore the query (Bing RSS), so they would feed
    unrelated pages into the research. The caller then uses the primary sources cited
    by the relevant Wikipedia articles instead.
    """
    from app.ai import research_tools
    from app.config import Config

    for name, key in (("tavily", Config.TAVILY_API_KEY), ("brave", Config.BRAVE_SEARCH_API_KEY)):
        if not (key or "").strip():
            continue
        try:
            results = research_tools._SEARCH_BACKENDS[name](query, limit)
            if results:
                return name, results
        except Exception as exc:  # keep going with the next backend
            logger.warning("research: %s search failed: %s", name, exc)
    return "none", []


def fetch_page(url: str, max_chars: int = 20000) -> Dict[str, str]:
    """Public page text plus metadata (title, date, author) read from its HTML head."""
    from app.ai.research_tools import _TEXT_TYPES, safe_get

    final_url, ctype, body, _ = safe_get(url, allowed_types=_TEXT_TYPES, timeout=HTTP_TIMEOUT, user_agent=BROWSER_UA)
    html = body.decode("utf-8", errors="replace")

    def meta(*names: str) -> str:
        for name in names:
            m = re.search(rf'<meta[^>]+(?:name|property)=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)', html, flags=re.I)
            if not m:
                m = re.search(rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:name|property)=["\']{re.escape(name)}["\']', html, flags=re.I)
            if m:
                return _strip_html(m.group(1))
        return ""

    title = meta("citation_title", "og:title", "dc.title") or _strip_html((re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.S | re.I) or [None, ""])[1])
    # Prefer the main article text when the page marks it.
    main = re.search(r"<(article|main)[^>]*>(.*?)</\1>", html, flags=re.S | re.I)
    content = main.group(2) if main else html
    content = re.sub(r"<(script|style|nav|footer|header|aside|form|noscript)[^>]*>.*?</\1>", " ", content, flags=re.S | re.I)
    text = _strip_html(content) if ("html" in ctype or "<html" in html[:500].lower()) else html
    return {
        "url": final_url,
        "title": title[:300],
        "published": (meta("citation_publication_date", "article:published_time", "dc.date", "date", "citation_date") or "")[:10],
        "author": meta("citation_author", "author", "article:author", "dc.creator")[:120],
        "venue": meta("citation_journal_title", "og:site_name")[:120],
        "doi": meta("citation_doi", "dc.identifier"),
        "text": text[:max_chars],
    }


# ---------------------------------------------------------------------------
# Planning
# ---------------------------------------------------------------------------

DOMAINS = ("science_medicine", "technology", "environment", "business_economics", "history_humanities", "general")


def _guess_domain(topic: str) -> str:
    t = topic.lower()
    rules = [
        ("science_medicine", r"brain|neuro|dna|gene|cell|biolog|medic|health|disease|cancer|vaccine|protein|anatomy|heart|physics|chemistr|molecul|virus|immun"),
        ("environment", r"climate|carbon|emission|warming|ocean|biodivers|pollut|smog|forest|weather|glacier|renewable|energy"),
        ("technology", r"\bai\b|artificial intelligence|machine learning|software|cyber|security|network|computer|robot|blockchain|cloud|data|internet|algorithm"),
        ("business_economics", r"business|strategy|market|econom|financ|startup|company|management|marketing|trade|invest|bank"),
        ("history_humanities", r"history|ancient|empire|war|century|civili[sz]ation|philosoph|literature|religion|art\b"),
    ]
    for name, pattern in rules:
        if re.search(pattern, t):
            return name
    return "general"


def fallback_plan(topic: str, audience: str, slide_count: int) -> Dict[str, Any]:
    """Plan without the model: the topic's own Wikipedia sections become the subtopics."""
    subject = clean_topic(topic)
    subtopics: List[Dict[str, Any]] = []
    try:
        article = wikipedia_lookup(subject)
        for section in (article or {}).get("sections", [])[: max(4, min(8, slide_count))]:
            subtopics.append({"name": section, "questions": [f"{section} of {subject}"], "search_terms": f"{subject} {section}"})
    except Exception as exc:
        logger.warning("research: fallback plan could not read Wikipedia: %s", exc)
    if not subtopics:
        subtopics = [{"name": subject, "questions": [subject], "search_terms": subject}]
    return {
        "topic": subject,
        "domain": _guess_domain(subject),
        "audience": audience,
        "purpose": "",
        "depth": "intermediate",
        "subtopics": subtopics,
        "planned_by": "fallback",
    }


def normalise_plan(raw: Any, topic: str, audience: str, slide_count: int) -> Dict[str, Any]:
    if not isinstance(raw, dict) or not raw.get("subtopics"):
        return fallback_plan(topic, audience, slide_count)
    subtopics = []
    for s in raw.get("subtopics") or []:
        if isinstance(s, str):
            s = {"name": s}
        if not isinstance(s, dict) or not str(s.get("name") or "").strip():
            continue
        name = str(s["name"]).strip()[:90]
        qs = [str(q)[:160] for q in (s.get("questions") or []) if str(q).strip()][:3]
        subtopics.append({"name": name, "questions": qs or [name], "search_terms": str(s.get("search_terms") or name)[:120]})
    if not subtopics:
        return fallback_plan(topic, audience, slide_count)
    domain = raw.get("domain") if raw.get("domain") in DOMAINS else _guess_domain(str(raw.get("topic") or topic))
    return {
        "topic": str(raw.get("topic") or clean_topic(topic)).strip()[:120],
        "domain": domain,
        "audience": str(raw.get("audience") or audience)[:120],
        "purpose": str(raw.get("purpose") or "")[:200],
        "depth": str(raw.get("depth") or "intermediate")[:20],
        "subtopics": subtopics[:10],
        "scholarly_queries": [str(q)[:160] for q in raw.get("scholarly_queries") or []][:6],
        "web_queries": [str(q)[:160] for q in raw.get("web_queries") or []][:6],
        "planned_by": "model",
    }


def plan_research(provider, topic: str, audience: str, slide_count: int) -> Dict[str, Any]:
    """One model call that turns the prompt into subtopics and search queries."""
    if provider is not None and getattr(provider, "is_configured", False) and getattr(provider, "name", "") != "mock":
        try:
            from app.prompts.registry import call_prompt

            raw = call_prompt(provider, "research.plan", topic=topic, audience=audience, slide_count=slide_count)
            return normalise_plan(raw, topic, audience, slide_count)
        except Exception as exc:
            logger.warning("research: planning call failed (%s); planning from Wikipedia sections.", exc)
    return fallback_plan(topic, audience, slide_count)


# ---------------------------------------------------------------------------
# Evidence extraction and cross-checking
# ---------------------------------------------------------------------------

_STATEMENT = re.compile(
    r"\b(is|are|was|were|has|have|had|can|may|will|could|would|include[sd]?|consists?|contains?|shows?|shown|found|"
    r"suggests?|reduce[sd]?|increase[sd]?|cause[sd]?|leads?|led|makes?|uses?|used|allows?|provide[sd]?|occurs?|"
    r"becomes?|became|remains?|accounts?|estimate[sd]?|reach(?:es|ed)?|rose|fell|grew|involves?|requires?|helps?|"
    r"protects?|controls?|regulates?|produces?|forms?|formed)\b",
    re.I,
)


def extract_evidence(text: str, focus: set, subject: set, limit: int) -> List[Dict[str, Any]]:
    """Verbatim sentences from a source, ranked by relevance to the topic and subtopics."""
    scored = []
    seen = set()
    for sentence in split_sentences(text):
        if not 50 <= len(sentence) <= 420:
            continue
        if re.search(r"(cookie|subscribe|sign up|newsletter|all rights reserved|click here|javascript|copyright ©)", sentence, re.I):
            continue
        letters = [c for c in sentence if c.isalpha()]
        if len(sentence.split()) < 8 or (letters and sum(c.isupper() for c in letters) / len(letters) > 0.35):
            continue  # headings, tables of contents, author lists
        if not _STATEMENT.search(sentence):
            continue  # not a statement
        key = sentence[:80].lower()
        if key in seen:
            continue
        seen.add(key)
        words = term_set(sentence)
        if not words:
            continue
        subject_hits = len(words & subject)
        focus_hits = len(words & focus)
        if subject_hits == 0 and focus_hits < 2:
            continue
        score = 2.0 * subject_hits + focus_hits + (0.5 if numbers_in(sentence) else 0)
        scored.append((score, sentence))
    scored.sort(key=lambda x: -x[0])
    return [{"text": s, "numbers": numbers_in(s)} for _, s in scored[:limit]]


def cross_check(sources: List[Dict[str, Any]]) -> None:
    """Mark numeric evidence that another, independent source also states."""
    index: Dict[str, List[Tuple[str, set]]] = {}
    for src in sources:
        for ev in src["evidence"]:
            for num in ev.get("numbers") or []:
                index.setdefault(num, []).append((src["id"], term_set(ev["text"])))
    for src in sources:
        for ev in src["evidence"]:
            support = set()
            words = term_set(ev["text"])
            for num in ev.get("numbers") or []:
                for other_id, other_words in index.get(num, []):
                    if other_id != src["id"] and len(words & other_words) >= 2:
                        support.add(other_id)
            ev["corroborated_by"] = sorted(support)


# ---------------------------------------------------------------------------
# The research run
# ---------------------------------------------------------------------------

def _queries(plan: Dict[str, Any]) -> Dict[str, List[Tuple[str, str]]]:
    """(query, subtopic) lists per backend."""
    subject = plan["topic"]
    subs = plan["subtopics"]
    encyclopedia = [(subject, "")] + [(f"{subject} {s['name']}" if subject.lower() not in s["name"].lower() else s["name"], s["name"]) for s in subs]
    scholarly = [(q, "") for q in plan.get("scholarly_queries") or []] or [(s["search_terms"], s["name"]) for s in subs[:5]]
    web = [(q, "") for q in plan.get("web_queries") or []] or [(f"{s['search_terms']}", s["name"]) for s in subs[:4]]
    return {"encyclopedia": encyclopedia[:8], "scholarly": scholarly[:6], "web": web[:5]}


def run_research(
    provider,
    topic: str,
    audience: str = "General audience",
    slide_count: int = 8,
    progress: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """Research `topic` and return the dossier described in the module docstring."""
    started = time.time()

    def note(message: str, **extra: Any) -> None:
        if progress:
            try:
                progress(message, extra)
            except Exception:
                pass

    plan = plan_research(provider, topic, audience, slide_count)
    subject = plan["topic"]
    subject_terms = term_set(subject)
    focus_terms = set(subject_terms)
    for s in plan["subtopics"]:
        focus_terms |= term_set(s["name"]) | term_set(" ".join(s.get("questions") or []))
    note("Research plan ready", subtopics=[s["name"] for s in plan["subtopics"]], planned_by=plan.get("planned_by"))

    queries = _queries(plan)
    log: List[Dict[str, Any]] = []
    raw_docs: List[Dict[str, Any]] = []
    medical = plan["domain"] == "science_medicine"
    deep = slide_count >= 10
    from app.config import Config

    web_enabled = bool(Config.TAVILY_API_KEY.strip() or Config.BRAVE_SEARCH_API_KEY.strip())

    seen_titles: set = set()
    seen_lock = threading.Lock()

    def run_query(backend: str, query: str, subtopic: str) -> List[Dict[str, Any]]:
        docs: List[Dict[str, Any]] = []
        if backend == "encyclopedia":
            art = wikipedia_lookup(query)
            if art:
                with seen_lock:
                    duplicate = art["title"] in seen_titles
                    seen_titles.add(art["title"])
                if not duplicate:
                    docs.append({**art, "kind": "encyclopedia", "venue": "Wikipedia", "authors": [], "organization": "Wikipedia contributors", "published": art.get("updated", ""), "via": "wikipedia", "subtopic": subtopic})
        elif backend == "scholarly":
            for rec in openalex_search(query, 4 if deep else 3):
                docs.append({**rec, "via": "openalex", "subtopic": subtopic})
            if medical:
                for rec in pubmed_search(query, 2):
                    docs.append({**rec, "via": "pubmed", "subtopic": subtopic})
        elif backend == "web":
            engine, results = web_search(query, 8)
            for r in sorted(results, key=lambda r: -credibility_for(r.get("url", ""))[0])[:4]:
                if credibility_for(r.get("url", ""))[0] >= 0.4 and "wikipedia.org" not in r.get("url", ""):
                    doc = fetch_web_doc(r["url"], f"web:{engine}", subtopic, r.get("title", ""))
                    if doc:
                        docs.append(doc)
        elif backend == "cited":
            doc = fetch_web_doc(query, "wikipedia-cited", subtopic, "")
            if doc:
                docs.append(doc)
        return docs

    def fetch_web_doc(url: str, via: str, subtopic: str, fallback_title: str) -> Optional[Dict[str, Any]]:
        try:
            page = fetch_page(url)
        except Exception as exc:
            log.append({"backend": "fetch", "query": url, "ok": False, "error": str(exc)[:120]})
            return None
        if len(page["text"]) < 400:
            return None
        return {
            "title": page["title"] or fallback_title,
            "authors": [page["author"]] if page["author"] and not page["author"].startswith("http") else [],
            "organization": (urllib.parse.urlsplit(page["url"]).hostname or "").replace("www.", ""),
            "venue": page["venue"],
            "published": page["published"],
            "url": page["url"],
            "doi": page["doi"] if page["doi"] and "/" in page["doi"] else "",
            "text": page["text"],
            "kind": credibility_for(page["url"])[1],
            "via": via,
            "subtopic": subtopic,
        }

    def run_jobs(jobs: List[Tuple[str, str, str]], budget: float) -> None:
        pool = ThreadPoolExecutor(max_workers=8)
        futures = {pool.submit(run_query, b, q, s): (b, q) for b, q, s in jobs}
        try:
            for fut in as_completed(futures, timeout=max(5.0, budget)):
                backend, query = futures[fut]
                try:
                    docs = fut.result()
                    raw_docs.extend(docs)
                    log.append({"backend": backend, "query": query, "ok": True, "documents": len(docs)})
                except Exception as exc:
                    log.append({"backend": backend, "query": query, "ok": False, "error": str(exc)[:160]})
                    logger.warning("research: %s query %r failed: %s", backend, query, exc)
        except Exception:
            log.append({"backend": "all", "query": "", "ok": False, "error": "research time budget reached; slow requests were abandoned"})
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

    jobs = [(b, q, s) for b, items in queries.items() for q, s in items if b != "web" or web_enabled]
    note("Searching encyclopedic and scholarly sources" + (" and the web" if web_enabled else ""), queries=len(jobs))
    run_jobs(jobs, TOTAL_BUDGET_S * 0.6 - (time.time() - started))

    # Primary sources: the references cited by the encyclopedia articles we read. Used when no
    # web-search key is configured, and as extra primary evidence otherwise.
    articles = [d for d in raw_docs if d.get("via") == "wikipedia"]
    candidates: List[Tuple[float, str, str]] = []
    seen_links = set()
    for art in articles[:4]:
        try:
            for url in wikipedia_cited_links(art["title"]):
                host = urllib.parse.urlsplit(url).hostname or ""
                score = credibility_for(url)[0]
                if score >= 0.75 and url not in seen_links:
                    seen_links.add(url)
                    candidates.append((score, url, art.get("subtopic") or ""))
        except Exception as exc:
            log.append({"backend": "cited-links", "query": art["title"], "ok": False, "error": str(exc)[:120]})
    # Spread the fetches across hosts so one site doesn't dominate the evidence.
    picked, per_host = [], {}
    for score, url, sub in sorted(candidates, key=lambda c: -c[0]):
        host = urllib.parse.urlsplit(url).hostname or ""
        if per_host.get(host, 0) >= 2:
            continue
        per_host[host] = per_host.get(host, 0) + 1
        picked.append(("cited", url, sub))
        if len(picked) >= (10 if deep else 7):
            break
    if picked:
        note("Reading primary sources cited by encyclopedia articles", queries=len(picked))
        run_jobs(picked, TOTAL_BUDGET_S - (time.time() - started))
    jobs = jobs + picked

    # Deduplicate, extract evidence, score.
    by_key: Dict[str, Dict[str, Any]] = {}
    for doc in raw_docs:
        key = (doc.get("doi") or doc.get("url") or doc.get("title") or "").lower().rstrip("/")
        if not key:
            continue
        if key in by_key:
            if doc.get("subtopic"):
                by_key[key].setdefault("subtopics", set()).add(doc["subtopic"])
            continue
        doc["subtopics"] = {doc["subtopic"]} if doc.get("subtopic") else set()
        by_key[key] = doc

    sources: List[Dict[str, Any]] = []
    for doc in by_key.values():
        per_source = 10 if doc["kind"] == "encyclopedia" else 6
        evidence = extract_evidence(doc.get("text", ""), focus_terms, subject_terms, per_source)
        if not evidence:
            continue
        cred, kind_from_domain, reason = credibility_for(doc.get("url", ""))
        if doc["kind"] in ("journal", "scholarly"):
            cred, reason = max(cred, 0.88 if doc["kind"] == "journal" else 0.8), "peer-reviewed or scholarly record" if doc["kind"] == "journal" else "scholarly record"
        relevance = sum(len(term_set(e["text"]) & focus_terms) for e in evidence) / max(1, len(evidence))
        title_rel = len(term_set(doc.get("title", "")) & subject_terms)
        if doc["kind"] in ("journal", "scholarly") and title_rel == 0 and relevance < 2.5:
            continue  # off-topic scholarly hit
        sources.append({
            "title": (doc.get("title") or "").strip()[:300],
            "authors": doc.get("authors") or [],
            "organization": doc.get("organization") or "",
            "venue": doc.get("venue") or "",
            "published": doc.get("published") or "",
            "url": doc.get("url") or "",
            "doi": doc.get("doi") or "",
            "kind": doc["kind"] if doc["kind"] != "web" else kind_from_domain,
            "credibility": round(cred, 2),
            "credibility_reason": reason,
            "retrieved_via": doc.get("via", ""),
            "subtopics": sorted(doc.get("subtopics") or []),
            "evidence": evidence,
            "_rank": cred * 2 + relevance + 0.5 * title_rel,
        })

    sources.sort(key=lambda s: -s["_rank"])
    cap = max(10, min(24, slide_count * 2 + 4))
    sources = sources[:cap]
    for i, src in enumerate(sources, start=1):
        src["id"] = f"S{i}"
        src.pop("_rank", None)
        for j, ev in enumerate(src["evidence"], start=1):
            ev["id"] = f"S{i}.{j}"
    cross_check(sources)

    ok_queries = sum(1 for entry in log if entry.get("ok"))
    research_mode = "live" if sources else "unavailable"
    limitations = []
    if not sources:
        limitations.append("No sources could be retrieved, so no facts or figures in this deck are sourced.")
    elif len(sources) < 4:
        limitations.append(f"Only {len(sources)} sources were retrieved; coverage of the topic is limited.")
    if not web_enabled:
        limitations.append(
            "General web search is not configured (no TAVILY_API_KEY or BRAVE_SEARCH_API_KEY), so research used "
            "Wikipedia, OpenAlex, PubMed and the primary sources cited by the Wikipedia articles."
        )
    if not any(s["kind"] in ("journal", "scholarly", "government") for s in sources):
        limitations.append("No peer-reviewed or official sources were found; evidence is from secondary sources.")

    dossier = {
        "topic": subject,
        "original_prompt": topic,
        "plan": plan,
        "research_mode": research_mode,
        "verified": bool(sources),
        "sources": sources,
        "citations": [citation_view(s) for s in sources],
        "key_statistics": [
            {"metric": ev["text"][:90], "value": ", ".join(ev["numbers"][:2]), "finding": ev["text"], "source_url": s["url"], "source_id": s["id"], "evidence_id": ev["id"], "corroborated_by": ev.get("corroborated_by", [])}
            for s in sources for ev in s["evidence"] if ev.get("numbers")
        ][:20],
        "executive_summary": "",
        "limitations": limitations,
        "research_trace": {
            "queries": log,
            "query_count": len(jobs),
            "successful_queries": ok_queries,
            "documents_retrieved": len(raw_docs),
            "sources_kept": len(sources),
            "web_search": web_enabled,
            "seconds": round(time.time() - started, 1),
        },
    }
    note("Research complete", sources=len(sources), queries=len(jobs))
    return dossier


def citation_view(src: Dict[str, Any]) -> Dict[str, Any]:
    """The shape the create page and older code read (source/title/year/url/finding)."""
    year = re.search(r"(1[5-9]|20)\d\d", src.get("published") or "")
    publisher = src.get("venue") or src.get("organization") or (urllib.parse.urlsplit(src.get("url") or "").hostname or "")
    return {
        "id": src["id"],
        "source": publisher,
        "title": src.get("title", ""),
        "year": int(year.group(0)) if year else None,
        "url": src.get("url", ""),
        "doi": src.get("doi", ""),
        "kind": src.get("kind", ""),
        "finding": (src.get("evidence") or [{}])[0].get("text", ""),
    }


def format_reference(src: Dict[str, Any], number: int) -> str:
    """One numbered reference line, built only from retrieved metadata."""
    parts = []
    authors = src.get("authors") or []
    if authors:
        parts.append(", ".join(authors[:3]) + (" et al." if len(authors) > 3 else ""))
    elif src.get("organization"):
        parts.append(src["organization"])
    year = re.search(r"(1[5-9]|20)\d\d", src.get("published") or "")
    if year and src.get("kind") != "encyclopedia":
        parts.append(f"({year.group(0)})")
    parts.append(src.get("title") or "Untitled")
    if src.get("venue") and src.get("venue") != src.get("title"):
        parts.append(src["venue"])
    line = ". ".join(p.rstrip(".") for p in parts if p) + "."
    if src.get("doi"):
        line += f" doi:{src['doi']}"
    else:
        line += f" {src.get('url', '')}"
    if src.get("kind") == "encyclopedia" and src.get("published"):
        line += f" (accessed revision of {src['published']})"
    return f"[{number}] {line}".strip()


def digest(dossier: Dict[str, Any], max_chars: int = 9000, evidence_per_source: int = 4, only: Optional[Iterable[str]] = None) -> str:
    """Compact evidence listing for prompts: source header lines plus their evidence sentences."""
    wanted = set(only) if only else None
    lines: List[str] = []
    total = 0
    for src in dossier.get("sources") or []:
        evidence = [e for e in src["evidence"] if wanted is None or e["id"] in wanted or src["id"] in wanted]
        if not evidence:
            continue
        year = re.search(r"(1[5-9]|20)\d\d", src.get("published") or "")
        header = f"[{src['id']}] {src['kind']}, {src.get('venue') or src.get('organization') or ''} {year.group(0) if year else ''}: \"{src['title'][:120]}\""
        block = [header] + [
            f"  ({e['id']}{' corroborated by ' + ','.join(e['corroborated_by']) if e.get('corroborated_by') else ''}) {e['text']}"
            for e in evidence[:evidence_per_source]
        ]
        size = sum(len(x) + 1 for x in block)
        if total + size > max_chars:
            break
        lines.extend(block)
        total += size
    return "\n".join(lines) or "(no sources were retrieved)"


def source_by_id(dossier: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {s["id"]: s for s in dossier.get("sources") or []}
