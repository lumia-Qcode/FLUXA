# Running FLUXA (Windows, demo day)

Two processes: the Flask API on port 5000 and the Vite frontend on port 5173 (it forwards `/api` to 5000).

## First time only

```powershell
cd C:\Users\kingm\Videos\fluxa-10-11-26\fluxa
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
npm install
```

Copy `.env.example` to `.env` and fill in `OPENROUTER_API_KEY` (free tier, about 50 requests a day). Optional: `GEMINI_API_KEY` as a second free backend, and `TAVILY_API_KEY` or `BRAVE_SEARCH_API_KEY` for live web research.

## Every time

Terminal 1 (backend):

```powershell
cd C:\Users\kingm\Videos\fluxa-10-11-26\fluxa
.\venv\Scripts\Activate.ps1
python run.py
```

Terminal 2 (frontend):

```powershell
cd C:\Users\kingm\Videos\fluxa-10-11-26\fluxa
npm run dev --workspace=frontend
```

Open http://localhost:5173. The first account you create becomes the owner and receives the decks already in the database.

Or both in one terminal (with the venv active): `npm run dev`.

## Notes for the demo

- Use Chrome or Edge: voice commands, Autopilot, captions and the video download use browser features Firefox lacks.
- Voice and Autopilot need a microphone and a one-time consent click in present mode.
- When the free AI quota runs out (resets at midnight UTC), generation falls back to template slides and AI features say "AI unavailable". Generate your demo decks ahead of time.
- Tests: `python -m pytest -q tests` and `npm run test --workspace=frontend`. They never call a real model.
