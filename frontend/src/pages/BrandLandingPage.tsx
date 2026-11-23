import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import "./landing.css";

const W = "M37 163V37H230M37 100H205M320 37V163H540M610 37V110Q610 163 663 163H827Q880 163 880 110V37M950 37L1180 163M1180 37L950 163M1250 163V100Q1250 37 1313 37H1387Q1450 37 1450 100V163M1250 105H1450";

export const BrandLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const buildWithAI = () => navigate("/workspace");

  const blankDeck = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled presentation", description: "" }),
      });
      const data = await res.json();
      const id = data.presentation?.id ?? data.id;
      navigate(id ? `/presentations/${id}?view=edit` : "/workspace");
    } catch {
      navigate("/workspace");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lp">
      <div className="lp-frame">
        <header className="lp-top">
          <button className="lp-logo" onClick={() => navigate("/")}>FLUXA</button>
          <nav className="lp-nav">
            <button className="on">Home</button>
            <button onClick={buildWithAI}>Build with AI</button>
            <button onClick={blankDeck} disabled={busy}>Blank deck</button>
            <button onClick={buildWithAI}>My decks</button>
          </nav>
          <button className="lp-start" onClick={buildWithAI}>Start now</button>
        </header>

        <svg className="lp-word" viewBox="0 0 1490 200" role="img" aria-label="FLUXA">
          <defs>
            <linearGradient id="wg" gradientUnits="userSpaceOnUse" x1="0" x2="1490" y1="0" y2="0">
              <stop offset="0" stopColor="#ffffff" /><stop offset=".4" stopColor="#dfe5ff" /><stop offset="1" stopColor="#8aa0ff" />
            </linearGradient>
          </defs>
          <path d={W} fill="none" stroke="url(#wg)" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <p className="lp-copy">
          FLUXA is a presentation tool where slides are live. Change a number and every chart, KPI and
          calculation follows. Describe your talk, get a deck, present it anywhere.
        </p>

        <div className="lp-robot"><img src="/robot.png" alt="" /></div>

        <div className="lp-card">
          <h3>Step into the future with live slides</h3>
          <p>Type what you are presenting. FLUXA drafts the outline and the slides, then lets your audience play with the data.</p>
        </div>

        <button className="lp-ring" onClick={buildWithAI}>
          <i><ArrowUpRight size={18} /></i>
          Build with AI
        </button>
      </div>
    </div>
  );
};