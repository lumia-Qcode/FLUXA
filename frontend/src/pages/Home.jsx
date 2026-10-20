import { Link } from "react-router-dom";
import { usePresentations } from "../PresentationsContext.jsx";

export default function Home() {
  const { presentations, loading } = usePresentations();

  return (
    <div className="home-container">
      <section className="hero">
        <div className="create-badge">
          <span className="pulse-dot" /> Powered by OpenRouter AI Multi-Model Intelligence
        </div>
        <h1>Turn ideas into presentations</h1>
        <p className="muted">
          Describe a topic, then shape each slide with a clean editor, rich data charts, interactive AI Copilot, and a live preview.
        </p>
        <div className="hero-actions">
          <Link to="/create" className="btn btn-accent btn-lg">
            Create presentation
          </Link>
          <a href="#features" className="btn btn-outline">
            Explore Capabilities ↓
          </a>
        </div>
      </section>

      {/* Feature Pillars */}
      <section id="features" className="features-section">
        <div className="feature-grid">
          <div className="feature-card">
            <span className="feature-icon">🤖</span>
            <h3>Deep AI Generation</h3>
            <p className="muted">
              Specify your topic, slide length, and tone. OpenRouter models synthesize coherent multi-slide decks in seconds.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">📊</span>
            <h3>Data Charts & Analytics</h3>
            <p className="muted">
              Generate interactive Bar charts, Donut visuals, KPI highlights, process roadmaps, and comparison grids.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🎙️</span>
            <h3>Conversational Copilot</h3>
            <p className="muted">
              Ask AI to add, delete, or refine any slide in English or Roman Urdu. The AI updates your deck and asks for further edits!
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">▶️</span>
            <h3>Present & Export</h3>
            <p className="muted">
              Launch sleek fullscreen slideshow presentation mode with smooth transitions, or export cleanly to Markdown and PDF.
            </p>
          </div>
        </div>
      </section>

      {!loading && presentations.length > 0 && (
        <section className="recent-section">
          <h2 className="section-title">Recent presentations</h2>
          <div className="card-grid">
            {presentations.map((p) => (
              <Link key={p.id} to={`/presentations/${p.id}`} className="card card-link">
                <h3>{p.title}</h3>
                <p className="muted clamp">{p.description || "No description"}</p>
                <div className="card-meta">
                  <small className="slide-badge">
                    {p.slide_count} {p.slide_count === 1 ? "slide" : "slides"}
                  </small>
                  <span className="open-arrow">Open →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
