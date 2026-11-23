import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    PORT = int(os.getenv("PORT", "5000"))
    DATABASE_PATH = os.getenv("DATABASE_PATH", "instance/fluxa.db")

    # Session cookie signing key. Set SECRET_KEY in .env for any shared or deployed
    # server; without it a random key is generated once and kept in instance/secret_key.
    SECRET_KEY = os.getenv("SECRET_KEY", "")
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "False").lower() == "true"
    PERMANENT_SESSION_LIFETIME = 14 * 24 * 3600
    # Browser origins allowed to send state-changing requests besides the server's own host.
    # The default covers the Vite dev server, whose proxy rewrites Host but not Origin.
    TRUSTED_ORIGINS = [
        o.strip().rstrip("/")
        for o in os.getenv("TRUSTED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if o.strip()
    ]

    AI_PROVIDER = os.getenv("AI_PROVIDER", "").lower()
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219")

    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "")
    OPENROUTER_FALLBACK_MODEL = os.getenv("OPENROUTER_FALLBACK_MODEL", "")
    OPENROUTER_BASE_URL = os.getenv(
        "OPENROUTER_BASE_URL",
        "https://openrouter.ai/api/v1",
    )

    # Live web search for research. Tavily is tried first, then Brave, then a keyless
    # DuckDuckGo scrape (often blocked). Keys belong in .env only.
    TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
    BRAVE_SEARCH_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY", "")
    RESEARCH_MAX_TOOL_STEPS = int(os.getenv("RESEARCH_MAX_TOOL_STEPS", "8"))
    # Live web research loop: "auto" runs it only when a search key (Tavily/Brave) is set. Without one,
    # free search returns nothing and the loop spends several AI requests for no sources.
    RESEARCH_LIVE = os.getenv("RESEARCH_LIVE", "auto").strip().lower()

    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "")

    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
