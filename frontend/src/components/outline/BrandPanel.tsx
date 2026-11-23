import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Brand = { id: number; name: string; status: string; activeVersionId: number | null };

/** Brand choice for the deck about to be generated: its own section on the outline screen. */
export const BrandPanel: React.FC<{ value: number | null; onChange: (id: number | null) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  useEffect(() => {
    fetch("/api/brands")
      .then((r) => (r.ok ? r.json() : { brands: [] }))
      .then((d) => setBrands((d.brands || []).filter((b: Brand) => b.status !== "archived" && b.activeVersionId)))
      .catch(() => setBrands([]));
  }, []);

  return (
    <section className="fx-brand" aria-label="Brand">
      <div className="fx-brand-head">
        <h3>Brand</h3>
        <Link to="/brands" className="fx-brand-manage">Manage brands</Link>
      </div>
      {brands === null ? (
        <p className="fx-brand-muted">Loading brands…</p>
      ) : (
        <div className="fx-brand-options" role="radiogroup" aria-label="Brand for this deck">
          <button type="button" role="radio" aria-checked={value === null} className={value === null ? "is-on" : ""} onClick={() => onChange(null)} disabled={disabled}>
            No brand
          </button>
          {brands.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={value === b.id} className={value === b.id ? "is-on" : ""} onClick={() => onChange(b.id)} disabled={disabled}>
              {b.name}
            </button>
          ))}
        </div>
      )}
      {brands !== null && brands.length === 0 && (
        <p className="fx-brand-muted">No brands yet. Create one in Brands to use your colours and fonts.</p>
      )}
      <style>{`
        .fx-brand{border:1px solid var(--line,#26262b);border-radius:12px;padding:14px 16px;background:var(--bg-panel,#101013)}
        .fx-brand-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
        .fx-brand h3{margin:0;font-size:14px;font-weight:600}
        .fx-brand-manage{font-size:12px;color:var(--signal,#aebfff)}
        .fx-brand-options{display:flex;flex-wrap:wrap;gap:6px}
        .fx-brand-options button{border:1px solid var(--line,#3a3a40);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
        .fx-brand-options button.is-on{background:var(--signal,#aebfff);border-color:var(--signal,#aebfff);color:#0a0a0c}
        .fx-brand-muted{margin:8px 0 0;font-size:12px;color:var(--ink-3,#a4a4ac)}
      `}</style>
    </section>
  );
};
