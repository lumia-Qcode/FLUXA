import { useMemo } from "react";

const BULLET = /^[-•*]\s+/;

function parseStructuredLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }
  const inner = trimmed.slice(1, -1);
  const colonIndex = inner.indexOf(":");
  if (colonIndex === -1) return null;

  const type = inner.slice(0, colonIndex).toLowerCase();
  const rest = inner.slice(colonIndex + 1);

  try {
    if (type === "chart") {
      const secondColon = rest.indexOf(":");
      const chartType = secondColon === -1 ? "bar" : rest.slice(0, secondColon).toLowerCase();
      const rawJson = secondColon === -1 ? rest : rest.slice(secondColon + 1);
      const data = JSON.parse(rawJson);
      return { type: "chart", chartType, data };
    }

    if (type === "metric") {
      const parts = rest.split(":");
      return {
        type: "metric",
        value: parts[0] || "",
        label: parts[1] || "",
        sub: parts[2] || "",
      };
    }

    if (type === "quote") {
      const parts = rest.split(":");
      return {
        type: "quote",
        text: parts[0] || "",
        author: parts[1] || "",
      };
    }

    if (type === "compare") {
      const firstColon = rest.indexOf(":");
      const title = firstColon === -1 ? "Comparison" : rest.slice(0, firstColon);
      const rawJson = firstColon === -1 ? rest : rest.slice(firstColon + 1);
      const data = JSON.parse(rawJson);
      return { type: "compare", title, data };
    }

    if (type === "steps") {
      const firstColon = rest.indexOf(":");
      const title = firstColon === -1 ? "Process Flow" : rest.slice(0, firstColon);
      const rawJson = firstColon === -1 ? rest : rest.slice(firstColon + 1);
      let steps = [];
      try {
        const obj = JSON.parse(rawJson);
        steps = Array.isArray(obj) ? obj : Object.entries(obj).map(([k, v]) => `${k}: ${v}`);
      } catch {
        steps = rawJson.split("|").map((s) => s.trim()).filter(Boolean);
      }
      return { type: "steps", title, steps };
    }
  } catch {
    return null;
  }

  return null;
}

function RenderChart({ chartType, data }) {
  const labels = data.labels || [];
  const values = data.values || [];
  const unit = data.unit || "";
  const maxVal = Math.max(...values, 1);

  if (chartType === "donut" || chartType === "pie") {
    const total = values.reduce((a, b) => a + Number(b || 0), 0) || 1;
    const colors = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899"];
    let accumulatedAngle = 0;

    return (
      <div className="preview-chart-donut">
        <div className="donut-circle-wrap">
          <svg viewBox="0 0 42 42" className="donut-svg">
            <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
            {values.map((val, idx) => {
              const pct = (Number(val) / total) * 100;
              const strokeDasharray = `${pct} ${100 - pct}`;
              const strokeDashoffset = 100 - accumulatedAngle + 25;
              accumulatedAngle += pct;
              return (
                <circle
                  key={idx}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke={colors[idx % colors.length]}
                  strokeWidth="5"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="donut-segment"
                />
              );
            })}
          </svg>
          <div className="donut-center-info">
            <span className="donut-total">{values[0] || total}{unit}</span>
            <span className="donut-sub">{labels[0] || "Key"}</span>
          </div>
        </div>
        <div className="donut-legend">
          {labels.map((lbl, idx) => (
            <div key={idx} className="donut-legend-item">
              <span className="legend-dot" style={{ background: colors[idx % colors.length] }} />
              <span className="legend-label">{lbl}</span>
              <span className="legend-val">{values[idx]}{unit}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default: Horizontal Bar Chart
  const barColors = ["#8b5cf6", "#06b6d4", "#3b82f6", "#10b981", "#f59e0b"];

  return (
    <div className="preview-chart-bar">
      {labels.map((lbl, idx) => {
        const val = Number(values[idx] || 0);
        const percent = Math.min(Math.round((val / maxVal) * 100), 100);
        const color = barColors[idx % barColors.length];
        return (
          <div key={idx} className="bar-row">
            <div className="bar-meta">
              <span className="bar-label">{lbl}</span>
              <span className="bar-val">{val}{unit}</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${percent}%`, background: `linear-gradient(90deg, ${color}, #a78bfa)` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RenderMetric({ value, label, sub }) {
  return (
    <div className="preview-kpi-card">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function RenderCompare({ title, data }) {
  const entries = Object.entries(data || {});
  return (
    <div className="preview-compare-wrap">
      {title && <div className="compare-title">{title}</div>}
      <div className="compare-grid">
        {entries.map(([columnName, items], colIdx) => (
          <div key={colIdx} className={`compare-col ${colIdx === 0 ? "col-a" : "col-b"}`}>
            <h4>{columnName}</h4>
            <ul>
              {(Array.isArray(items) ? items : [items]).map((it, itemIdx) => (
                <li key={itemIdx}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function RenderSteps({ title, steps }) {
  return (
    <div className="preview-steps-wrap">
      {title && <div className="steps-title">{title}</div>}
      <div className="steps-timeline">
        {steps.map((st, idx) => (
          <div key={idx} className="step-item">
            <div className="step-num">{idx + 1}</div>
            <div className="step-content">{st}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RenderQuote({ text, author }) {
  return (
    <div className="preview-quote-card">
      <div className="quote-mark">“</div>
      <blockquote className="quote-text">{text}</blockquote>
      {author && <cite className="quote-author">— {author}</cite>}
    </div>
  );
}

export default function SlidePreview({
  title,
  content,
  slideNumber,
  totalSlides,
  theme = "midnight",
  layout = "standard",
}) {
  const lines = useMemo(
    () => (content || "").split("\n").filter((line) => line.trim() !== ""),
    [content]
  );

  return (
    <div
      className={`preview theme-${theme} layout-${layout}`}
      data-testid="slide-preview"
    >
      <div className="preview-decor-glow" aria-hidden="true" />
      <div className="preview-inner">
        <h2>{title || "Untitled slide"}</h2>
        <div className="preview-body">
          {lines.length === 0 && <p className="preview-empty">No content yet</p>}
          {lines.map((line, i) => {
            const structured = parseStructuredLine(line);
            if (structured) {
              if (structured.type === "chart") {
                return <RenderChart key={i} chartType={structured.chartType} data={structured.data} />;
              }
              if (structured.type === "metric") {
                return (
                  <RenderMetric
                    key={i}
                    value={structured.value}
                    label={structured.label}
                    sub={structured.sub}
                  />
                );
              }
              if (structured.type === "compare") {
                return <RenderCompare key={i} title={structured.title} data={structured.data} />;
              }
              if (structured.type === "steps") {
                return <RenderSteps key={i} title={structured.title} steps={structured.steps} />;
              }
              if (structured.type === "quote") {
                return <RenderQuote key={i} text={structured.text} author={structured.author} />;
              }
            }

            return BULLET.test(line) ? (
              <p key={i} className="bullet">
                {line.replace(BULLET, "")}
              </p>
            ) : (
              <p key={i}>{line}</p>
            );
          })}
        </div>
      </div>
      {slideNumber && totalSlides ? (
        <span className="preview-count" data-testid="preview-count">
          {slideNumber} / {totalSlides}
        </span>
      ) : null}
    </div>
  );
}