"""Research tools for the Fluxa AI pipeline.

Tools: web_search, fetch_url, worldbank_indicator, wikipedia_summary, extract_stats,
calculator. All are synchronous and thread-safe. TOOL_DEFINITIONS describes them in the
MCP tool shape (name, description, inputSchema), so the model can choose them through
function calling and the same definitions can later be served by an MCP server.

Everything these tools return is untrusted web content: callers pass it to the model as
data, never as instructions.
"""

import ipaddress
import logging
import re
import socket
import urllib.parse
from typing import Any, Callable, Dict, List, Union

import requests

from app.config import Config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# web_search
# ---------------------------------------------------------------------------

def _tavily_search(query: str, max_results: int) -> List[Dict[str, str]]:
    resp = requests.post(
        "https://api.tavily.com/search",
        headers={"Authorization": f"Bearer {Config.TAVILY_API_KEY.strip()}"},
        json={"query": query, "max_results": max_results, "search_depth": "basic"},
        timeout=20,
    )
    resp.raise_for_status()
    return [
        {"title": r.get("title", ""), "snippet": (r.get("content") or "")[:500], "url": r.get("url", "")}
        for r in resp.json().get("results", [])
    ]


def _brave_search(query: str, max_results: int) -> List[Dict[str, str]]:
    resp = requests.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={"q": query, "count": max_results},
        headers={"X-Subscription-Token": Config.BRAVE_SEARCH_API_KEY.strip(), "Accept": "application/json"},
        timeout=20,
    )
    resp.raise_for_status()
    return [
        {
            "title": r.get("title", ""),
            "snippet": re.sub(r"<[^>]+>", "", r.get("description") or "")[:500],
            "url": r.get("url", ""),
        }
        for r in (resp.json().get("web") or {}).get("results", [])
    ]


def _duckduckgo_search(query: str, max_results: int) -> List[Dict[str, str]]:
    results = []
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0 Safari/537.36"
        )
    }
    resp = requests.get("https://html.duckduckgo.com/html/", params={"q": query}, headers=headers, timeout=10)
    resp.raise_for_status()
    html = resp.text
    titles = re.findall(
        r'class="result__title"[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>',
        html, re.DOTALL
    )
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</(?:a|span)>', html, re.DOTALL)
    if not titles:
        titles = re.findall(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL)
    for i, snippet_raw in enumerate(snippets[:max_results]):
        snippet = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", snippet_raw).strip())
        if i < len(titles):
            result_url, title_raw = titles[i]
            title = re.sub(r"<[^>]+>", "", title_raw).strip()
        else:
            result_url, title = "", f"Result {i + 1}"
        results.append({"title": title, "snippet": snippet, "url": result_url})
    return results


def search_backends() -> List[str]:
    """Names of the search backends that will be tried, in order."""
    names = []
    if Config.TAVILY_API_KEY.strip():
        names.append("tavily")
    if Config.BRAVE_SEARCH_API_KEY.strip():
        names.append("brave")
    names.append("duckduckgo")
    return names


_SEARCH_BACKENDS = {"tavily": _tavily_search, "brave": _brave_search, "duckduckgo": _duckduckgo_search}


def web_search(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """Live web search. Tries Tavily, then Brave (when their keys are set), then DuckDuckGo.

    Returns:
        list of {title, snippet, url}; empty when every backend fails.
    """
    query = (query or "").strip()[:300]
    if not query:
        return []
    try:
        max_results = max(1, min(int(max_results or 5), 10))
    except (TypeError, ValueError):
        max_results = 5
    for name in search_backends():
        try:
            results = [r for r in _SEARCH_BACKENDS[name](query, max_results) if r.get("url")]
            if results:
                return results[:max_results]
            logger.warning("web_search: %s returned no results for query=%r", name, query)
        except Exception as exc:
            logger.warning("web_search: %s failed for query=%r: %s", name, query, exc)
    return []


# ---------------------------------------------------------------------------
# fetch_url (SSRF-safe)
# ---------------------------------------------------------------------------

MAX_FETCH_BYTES = 2_000_000
_TEXT_TYPES = ("text/html", "text/plain", "application/json", "text/csv", "application/xhtml+xml", "text/markdown")


class UnsafeURLError(ValueError):
    """The URL points somewhere the research tools must not reach."""


def check_public_url(url: str) -> None:
    """Raise UnsafeURLError unless url is http(s) on a public internet address.

    Blocks localhost, private and link-local ranges (including cloud metadata at
    169.254.169.254) and non-web schemes, so model-chosen URLs cannot reach the
    server's own network. Every redirect hop is checked again by fetch_url.
    """
    parsed = urllib.parse.urlsplit(url or "")
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError(f"Only http and https URLs are allowed: {url!r}")
    host = parsed.hostname
    if not host:
        raise UnsafeURLError(f"URL has no host: {url!r}")
    if parsed.username or parsed.password:
        raise UnsafeURLError("URLs with credentials are not allowed.")
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise UnsafeURLError(f"Host does not resolve: {host}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global or ip.is_multicast:
            raise UnsafeURLError(f"Host {host} resolves to a non-public address.")


def _html_to_text(text: str) -> str:
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-zA-Z#0-9]+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def safe_get(url: str, max_bytes: int = MAX_FETCH_BYTES, timeout: float = 10, allowed_types=None,
             user_agent: str = "Mozilla/5.0 (compatible; FluxaResearch/1.0)", max_redirects: int = 3):
    """GET a public URL safely and return (final_url, content_type, body_bytes, truncated).

    Every hop, redirects included, goes through check_public_url. `allowed_types` is a
    tuple of content-type prefixes; anything else raises ValueError. The body is cut at
    max_bytes. Raises on any failure (UnsafeURLError for blocked addresses).
    Shared by the research tools and file/URL ingestion (app/ingest).
    """
    current = url
    for _ in range(max_redirects + 1):
        check_public_url(current)
        resp = requests.get(
            current, timeout=timeout, allow_redirects=False, stream=True, headers={"User-Agent": user_agent}
        )
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("Location", "")
            resp.close()
            current = urllib.parse.urljoin(current, location)
            continue
        try:
            resp.raise_for_status()
            ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if allowed_types and ctype and not ctype.startswith(tuple(allowed_types)):
                raise ValueError(f"content type {ctype} is not allowed")
            body, truncated = b"", False
            for chunk in resp.iter_content(65536):
                body += chunk
                if len(body) >= max_bytes:
                    body, truncated = body[:max_bytes], True
                    break
            resp.encoding = resp.encoding or "utf-8"
            return current, ctype, body, truncated
        finally:
            resp.close()
    raise ValueError(f"too many redirects for {url!r}")


def fetch_url(url: str, max_chars: int = 3000) -> str:
    """Fetch a public web page and return up to max_chars of plain text.

    Every hop (including redirects) is checked with check_public_url. Returns an
    empty string on any failure, including blocked URLs.
    """
    try:
        limit = max(200, min(int(max_chars or 3000), 12000))
    except (TypeError, ValueError):
        limit = 3000
    try:
        _, ctype, body, _ = safe_get(url, allowed_types=_TEXT_TYPES)
        text = body.decode("utf-8", errors="replace")
        if "html" in ctype or "<html" in text[:500].lower():
            text = _html_to_text(text)
        return text[:limit]
    except ValueError as exc:
        logger.warning("fetch_url skipped %r: %s", url, exc)
        return ""
    except Exception as exc:
        logger.warning("fetch_url failed for url=%r: %s", url, exc)
        return ""


# ---------------------------------------------------------------------------
# Data tools (keyless public APIs)
# ---------------------------------------------------------------------------

def worldbank_indicator(indicator: str, country: str = "WLD", start_year: int = 2015, end_year: int = 2025) -> Dict[str, Any]:
    """Time series from the World Bank Open Data API.

    indicator: e.g. "NY.GDP.MKTP.CD" (GDP, current US$), "SP.POP.TOTL" (population).
    country: ISO-3 code such as "USA", "PAK", or "WLD" for the world.
    """
    indicator = re.sub(r"[^A-Za-z0-9._]", "", indicator or "")[:60]
    country = re.sub(r"[^A-Za-z;]", "", country or "WLD")[:40] or "WLD"
    if not indicator:
        return {"error": "indicator is required, e.g. NY.GDP.MKTP.CD"}
    try:
        start, end = int(start_year or 2015), int(end_year or 2025)
    except (TypeError, ValueError):
        start, end = 2015, 2025
    url = f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"
    try:
        # The API hangs when ":" in the date range is percent-encoded, so build the query by hand.
        # Its first response is often slow (10-15 s), so allow one retry.
        query_url = f"{url}?format=json&date={start}:{end}&per_page=100"
        try:
            resp = requests.get(query_url, timeout=20)
        except requests.Timeout:
            resp = requests.get(query_url, timeout=20)
        resp.raise_for_status()
        payload = resp.json()
        if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
            return {"error": f"No World Bank data for {indicator} / {country}", "source_url": url}
        rows = [
            {"year": r.get("date"), "value": r.get("value"), "country": (r.get("country") or {}).get("value")}
            for r in payload[1]
            if r.get("value") is not None
        ]
        name = (payload[1][0].get("indicator") or {}).get("value", indicator)
        return {
            "indicator": name,
            "series": sorted(rows, key=lambda r: r["year"] or ""),
            "source": "World Bank Open Data",
            "source_url": f"https://data.worldbank.org/indicator/{indicator}?locations={country}",
        }
    except Exception as exc:
        logger.warning("worldbank_indicator failed for %s/%s: %s", indicator, country, exc)
        return {"error": f"World Bank request failed: {exc}", "source_url": url}


def wikipedia_summary(query: str) -> Dict[str, Any]:
    """Look up the Wikipedia article that best matches query; return its summary and URL."""
    query = (query or "").strip()[:200]
    if not query:
        return {"error": "query is required"}
    headers = {"User-Agent": "FluxaResearch/1.0 (presentation research tool)"}
    try:
        found = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params={"action": "opensearch", "search": query, "limit": 1, "namespace": 0, "format": "json"},
            headers=headers,
            timeout=10,
        )
        found.raise_for_status()
        data = found.json()
        if len(data) < 4 or not data[1]:
            return {"error": f"No Wikipedia article for {query!r}"}
        title = data[1][0]
        summ = requests.get(
            "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_")),
            headers=headers,
            timeout=10,
        )
        summ.raise_for_status()
        js = summ.json()
        return {
            "title": js.get("title", title),
            "summary": (js.get("extract") or "")[:2500],
            "source": "Wikipedia",
            "source_url": ((js.get("content_urls") or {}).get("desktop") or {}).get("page") or data[3][0],
        }
    except Exception as exc:
        logger.warning("wikipedia_summary failed for %r: %s", query, exc)
        return {"error": f"Wikipedia request failed: {exc}"}


# ---------------------------------------------------------------------------
# extract_stats
# ---------------------------------------------------------------------------

def extract_stats(text: str, source_hint: str = "") -> List[Dict[str, Any]]:
    """Extract numbers, percentages, and dollar amounts with ±15-word context.

    Returns:
        list of {value, context, source_hint}
    """
    # Pattern: dollar amounts, percentages, plain numbers with units
    pattern = re.compile(
        r"""
        (?:
            \$\s*[\d,]+(?:\.\d+)?(?:\s*(?:billion|million|trillion|B|M|T|K))?  # $amounts
            |
            [\d,]+(?:\.\d+)?\s*%                                                 # percentages
            |
            [\d,]+(?:\.\d+)?\s*(?:billion|million|trillion|percent|kg|km|mi|GW|kWh|MW|units)?  # numbers+units
        )
        """,
        re.VERBOSE | re.IGNORECASE,
    )

    words = text.split()
    results = []
    seen_values = set()

    for match in pattern.finditer(text):
        value = match.group(0).strip()
        if value in seen_values or not re.search(r'\d', value):
            continue
        seen_values.add(value)

        # Find word offset
        char_start = match.start()
        # Count words before match
        prefix = text[:char_start]
        word_idx = len(prefix.split())

        ctx_start = max(0, word_idx - 15)
        ctx_end = min(len(words), word_idx + 15)
        context = " ".join(words[ctx_start:ctx_end])

        results.append({
            "value": value,
            "context": context,
            "source_hint": source_hint,
        })

    return results


# ---------------------------------------------------------------------------
# calculator
# ---------------------------------------------------------------------------

def calculator(expr: str) -> Union[float, str]:
    """Safely evaluate a math expression containing only digits, operators, parens, dots.

    Returns the float result or an error string.
    """
    # Whitelist: digits, whitespace, operators (+,-,*,/,**,%), dots, parens
    if not re.fullmatch(r'[\d\s\+\-\*\/\%\.\(\)\^e]+', expr.strip()):
        return f"Error: expression contains disallowed characters: {expr!r}"
    # Replace ^ with ** for exponentiation
    safe_expr = expr.replace('^', '**')
    try:
        result = eval(safe_expr, {"__builtins__": {}}, {})  # noqa: S307
        return float(result)
    except ZeroDivisionError:
        return "Error: division by zero"
    except Exception as exc:
        return f"Error: {exc}"


# ---------------------------------------------------------------------------
# Tool registry (MCP tool shape)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "name": "web_search",
        "description": (
            "Search the live web. Returns up to 10 results with title, url and snippet. "
            "Use specific queries with a year, e.g. 'US specialty coffee market size 2025'."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "description": "1 to 10, default 5"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_url",
        "description": (
            "Fetch a public web page (for example a search result) and return its plain text, "
            "to read the actual figures and their context."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "http(s) URL"},
                "max_chars": {"type": "integer", "description": "200 to 12000, default 3000"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "worldbank_indicator",
        "description": (
            "Official time-series data from the World Bank, e.g. NY.GDP.MKTP.CD (GDP, US$), "
            "SP.POP.TOTL (population), NY.GDP.MKTP.KD.ZG (GDP growth %), IT.NET.USER.ZS (internet users %)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "indicator": {"type": "string"},
                "country": {"type": "string", "description": "ISO-3 code like USA or PAK, or WLD for the world"},
                "start_year": {"type": "integer"},
                "end_year": {"type": "integer"},
            },
            "required": ["indicator"],
        },
    },
    {
        "name": "wikipedia_summary",
        "description": "Summary and URL of the Wikipedia article that best matches a query. Good for definitions and background.",
        "inputSchema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "calculator",
        "description": "Evaluate arithmetic, e.g. growth rates or shares: '(52.1-41.3)/41.3*100'.",
        "inputSchema": {
            "type": "object",
            "properties": {"expr": {"type": "string"}},
            "required": ["expr"],
        },
    },
]

TOOL_FUNCTIONS: Dict[str, Callable[..., Any]] = {
    "web_search": web_search,
    "fetch_url": fetch_url,
    "worldbank_indicator": worldbank_indicator,
    "wikipedia_summary": wikipedia_summary,
    "calculator": calculator,
}


def openai_tool_specs(definitions: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Convert MCP-shaped definitions to the function-calling format OpenRouter accepts."""
    return [
        {
            "type": "function",
            "function": {"name": d["name"], "description": d["description"], "parameters": d["inputSchema"]},
        }
        for d in (definitions or TOOL_DEFINITIONS)
    ]
