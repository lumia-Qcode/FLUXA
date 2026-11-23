import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Archive, Plus, RotateCcw } from "lucide-react";

/**
 * Brands: the organisation's brand kits (colours and fonts) in their own section.
 * A kit is saved as a brand version and activated; decks generated with a brand are pinned to
 * that version, so later edits to the kit never change decks already made.
 */

type BrandSummary = { id: number; name: string; status: string; activeVersionId: number | null; activeVersion: number | null };
type Kit = { name: string; primary: string; accent: string; background: string; text: string; heading: string; body: string };

const FONTS = ["IBM Plex Sans", "Archivo", "Work Sans", "Public Sans", "Source Serif 4", "Literata", "Lexend", "Fira Sans", "Barlow", "Atkinson Hyperlegible"];
const EMPTY: Kit = { name: "", primary: "#2352F5", accent: "#AEBFFF", background: "#0B1120", text: "#F8FAFC", heading: "IBM Plex Sans", body: "IBM Plex Sans" };
const HEX = /^#[0-9A-Fa-f]{6}$/;

function toTokens(k: Kit) {
  return {
    schemaVersion: 1,
    colors: {
      primary: [{ hex: k.primary.toUpperCase() }],
      accent: [{ hex: k.accent.toUpperCase() }],
      neutrals: [k.background.toUpperCase(), k.text.toUpperCase()],
    },
    typography: { heading: { family: k.heading }, body: { family: k.body } },
  };
}

function fromTokens(name: string, t: any): Kit {
  const c = t?.colors || {};
  return {
    name,
    primary: c.primary?.[0]?.hex || EMPTY.primary,
    accent: c.accent?.[0]?.hex || EMPTY.accent,
    background: c.neutrals?.[0] || EMPTY.background,
    text: c.neutrals?.[1] || EMPTY.text,
    heading: t?.typography?.heading?.family || EMPTY.heading,
    body: t?.typography?.body?.family || EMPTY.body,
  };
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const BrandsPage: React.FC = () => {
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [tokensById, setTokensById] = useState<Record<number, any>>({});
  const [editing, setEditing] = useState<{ id: number | null; kit: Kit } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api("/api/brands");
      setBrands(data.brands || []);
      const details = await Promise.all((data.brands || []).map((b: BrandSummary) => api(`/api/brands/${b.id}`).catch(() => null)));
      const map: Record<number, any> = {};
      details.forEach((d: any) => d && (map[d.brand.id] = d.activeTokens));
      setTokensById(map);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    const k = editing.kit;
    if (!k.name.trim()) return setError("Give the brand a name.");
    if (![k.primary, k.accent, k.background, k.text].every((h) => HEX.test(h))) return setError("Colours must be #RRGGBB.");
    setBusy(true);
    setError("");
    try {
      let brandId = editing.id;
      let versionId: number;
      if (brandId == null) {
        const created = await api("/api/brands", { method: "POST", body: JSON.stringify({ name: k.name.trim(), tokens: toTokens(k) }) });
        brandId = created.brand.id;
        versionId = created.version.id;
      } else {
        await api(`/api/brands/${brandId}`, { method: "PATCH", body: JSON.stringify({ name: k.name.trim() }) });
        const v = await api(`/api/brands/${brandId}/versions`, { method: "POST", body: JSON.stringify({ tokens: toTokens(k) }) });
        versionId = v.version.id;
      }
      await api(`/api/brands/${brandId}/versions/${versionId}/activate`, { method: "POST", body: "{}" });
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (b: BrandSummary, status: "active" | "archived") => {
    setError("");
    try {
      await api(`/api/brands/${b.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const kit = editing?.kit;
  const set = (patch: Partial<Kit>) => editing && setEditing({ ...editing, kit: { ...editing.kit, ...patch } });
  const active = useMemo(() => brands.filter((b) => b.status !== "archived"), [brands]);
  const archived = useMemo(() => brands.filter((b) => b.status === "archived"), [brands]);

  return (
    <div className="br">
      <style>{BR_CSS}</style>
      <header className="br-top">
        <div className="br-row">
          <Link to="/workspace" className="br-icon" aria-label="Back to workspace" title="Back to workspace">
            <ArrowLeft size={17} strokeWidth={1.75} />
          </Link>
          <span className="br-logo">FLUXA</span>
        </div>
        <button type="button" className="br-start" onClick={() => setEditing({ id: null, kit: { ...EMPTY } })}>
          <Plus size={14} strokeWidth={2} /> New brand
        </button>
      </header>

      <main className="br-main">
        <h1 className="br-title">BRANDS</h1>
        <p className="br-lede">Colours and fonts your presentations use. Pick a brand on the outline screen before generating; each deck keeps the version it was made with.</p>
        {error && <p role="alert" className="br-error">{error}</p>}

        {editing && kit && (
          <section className="br-editor" aria-label={editing.id ? "Edit brand" : "New brand"}>
            <div className="br-form">
              <label>
                Name
                <input value={kit.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. University of Lahore" autoFocus />
              </label>
              <div className="br-colors">
                {(["primary", "accent", "background", "text"] as const).map((key) => (
                  <label key={key}>
                    {key === "text" ? "Text" : key[0].toUpperCase() + key.slice(1)}
                    <span className="br-color">
                      <input type="color" value={HEX.test(kit[key]) ? kit[key] : "#000000"} onChange={(e) => set({ [key]: e.target.value } as Partial<Kit>)} aria-label={`${key} colour`} />
                      <input value={kit[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<Kit>)} maxLength={7} />
                    </span>
                  </label>
                ))}
              </div>
              <div className="br-colors">
                <label>
                  Heading font
                  <select value={kit.heading} onChange={(e) => set({ heading: e.target.value })}>
                    {FONTS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </label>
                <label>
                  Body font
                  <select value={kit.body} onChange={(e) => set({ body: e.target.value })}>
                    {FONTS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </label>
              </div>
              <div className="br-row">
                <button type="button" className="br-start" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save brand"}</button>
                <button type="button" className="br-ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
              </div>
            </div>
            <div className="br-preview" style={{ background: kit.background, color: kit.text }} aria-label="Preview">
              <span style={{ fontFamily: kit.body, color: kit.accent, fontSize: 13, fontWeight: 600 }}>{kit.name || "Your brand"}</span>
              <h2 style={{ fontFamily: kit.heading, margin: "8px 0 10px", fontSize: 34, lineHeight: 1.1 }}>How the brain stores memories</h2>
              <p style={{ fontFamily: kit.body, margin: 0, fontSize: 15, lineHeight: 1.5, opacity: 0.9 }}>Short-term memories are consolidated during sleep. [1]</p>
              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                <span style={{ background: kit.primary, width: 64, height: 10, borderRadius: 999 }} />
                <span style={{ background: kit.accent, width: 40, height: 10, borderRadius: 999 }} />
              </div>
            </div>
          </section>
        )}

        <section aria-label="Brands" className="br-grid">
          {active.length === 0 && !editing && <p className="br-muted">No brands yet. Create one to use it in your presentations.</p>}
          {active.map((b) => {
            const k = fromTokens(b.name, tokensById[b.id]);
            return (
              <article key={b.id} className="br-card">
                <div className="br-swatch" style={{ background: k.background }}>
                  <span style={{ fontFamily: k.heading, color: k.text }}>Aa</span>
                  <span className="br-dots"><i style={{ background: k.primary }} /><i style={{ background: k.accent }} /></span>
                </div>
                <div className="br-card-body">
                  <strong>{b.name}</strong>
                  <span className="br-muted">{b.activeVersion ? `Version ${b.activeVersion}` : "No active version"}, {k.heading}</span>
                  <div className="br-row">
                    <button type="button" className="br-ghost" onClick={() => setEditing({ id: b.id, kit: k })}>Edit</button>
                    <button type="button" className="br-ghost" onClick={() => setStatus(b, "archived")} title="Archive: hide it from the brand picker">
                      <Archive size={13} strokeWidth={1.75} /> Archive
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {archived.length > 0 && (
          <section aria-label="Archived brands" style={{ marginTop: 32 }}>
            <h2 className="br-h2">Archived</h2>
            <div className="br-grid">
              {archived.map((b) => (
                <article key={b.id} className="br-card is-archived">
                  <div className="br-card-body">
                    <strong>{b.name}</strong>
                    <button type="button" className="br-ghost" onClick={() => setStatus(b, "active")}>
                      <RotateCcw size={13} strokeWidth={1.75} /> Restore
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

const BR_CSS = `
.br{min-height:100vh;background:#000;color:#fff;font-family:'IBM Plex Sans',system-ui,sans-serif;--peri:#aebfff}
.br *{box-sizing:border-box}
.br-top{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:14px 28px;background:rgba(0,0,0,.9);border-bottom:1px solid #141417}
.br-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.br-logo{font-weight:700;font-size:18px;letter-spacing:.02em}
.br-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:999px;color:#fff;background:#1b1b1e}
.br-start{display:inline-flex;align-items:center;gap:6px;background:var(--peri);color:#0a0a0c;border:0;border-radius:999px;padding:9px 20px;font:600 13px inherit;font-family:inherit;cursor:pointer}
.br-start:disabled{opacity:.6;cursor:default}
.br-ghost{display:inline-flex;align-items:center;gap:6px;background:transparent;color:#e7e7ea;border:1px solid #3a3a40;border-radius:999px;padding:7px 14px;font:500 13px inherit;font-family:inherit;cursor:pointer}
.br-ghost:hover{border-color:var(--peri)}
.br-main{max-width:1200px;margin:0 auto;padding:48px 28px 80px;position:relative}
.br-main::before{content:"";position:absolute;inset:0 0 auto;height:360px;z-index:-1;background:radial-gradient(50% 80% at 80% 0%,rgba(90,110,255,.35),transparent 70%)}
.br-title{margin:0;font-size:clamp(56px,9vw,128px);line-height:.9;font-weight:700;letter-spacing:-.02em;background:linear-gradient(180deg,#fff 0%,#dfe5ff 55%,#8aa0ff 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.br-lede{max-width:620px;color:#c9c9d0;font-size:15px;line-height:1.6;margin:16px 0 28px}
.br-error{color:#ffb4b4;background:#2a1215;border:1px solid #5b1f25;border-radius:12px;padding:10px 14px}
.br-muted{color:#a4a4ac;font-size:13px}
.br-h2{font-size:22px;margin:0 0 14px;font-weight:600}
.br-editor{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;background:#101013;border:1px solid #26262b;border-radius:20px;padding:22px;margin-bottom:28px}
.br-form{display:flex;flex-direction:column;gap:16px}
.br-form label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#a4a4ac}
.br-form input,.br-form select{background:#1b1b1e;border:1px solid #2f2f35;color:#fff;border-radius:10px;padding:9px 11px;font:14px inherit;font-family:inherit}
.br-form input:focus,.br-form select:focus{outline:2px solid var(--peri);outline-offset:1px}
.br-colors{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.br-color{display:flex;gap:6px}
.br-color input[type=color]{width:42px;height:38px;padding:3px;flex-shrink:0}
.br-color input:not([type=color]){min-width:0;flex:1;font-variant-numeric:tabular-nums}
.br-preview{border-radius:14px;padding:28px;display:flex;flex-direction:column;justify-content:center;min-height:240px;border:1px solid #26262b}
.br-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.br-card{background:#101013;border:1px solid #26262b;border-radius:18px;overflow:hidden}
.br-card.is-archived{opacity:.75}
.br-swatch{height:120px;display:flex;align-items:flex-end;justify-content:space-between;padding:16px;font-size:40px;font-weight:700}
.br-dots{display:flex;gap:6px}.br-dots i{width:22px;height:22px;border-radius:50%;display:block;border:2px solid rgba(255,255,255,.25)}
.br-card-body{display:flex;flex-direction:column;gap:10px;padding:14px 16px}
@media(max-width:860px){.br-editor{grid-template-columns:1fr}}
`;
