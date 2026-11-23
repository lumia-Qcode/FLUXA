import React, { useEffect, useState } from "react";

interface Props {
  presentationId: number | string;
  slideId?: string;
}

/**
 * #5 Instant Recovery: if this laptop fails, scan the code (or open the link) on another
 * signed-in device and the deck opens in present mode on the same slide. Edits are already
 * autosaved to the server, so nothing is lost.
 */
export const ResumeElsewhere: React.FC<Props> = ({ presentationId, slideId }) => {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState("");
  const url = `${window.location.origin}/presentations/${presentationId}?view=edit&present=1${slideId ? `&slide=${encodeURIComponent(slideId)}` : ""}`;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#0F172A", light: "#FFFFFF" } }))
      .then((d) => alive && setQr(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, url]);

  return (
    <span style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ background: "transparent", border: "none", color: "#FFF", cursor: "pointer", fontSize: 12, padding: "4px 8px", opacity: 0.9, whiteSpace: "nowrap" }}
        title="Continue this presentation on another device"
      >
        Other device
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Continue on another device"
          style={{
            position: "absolute", bottom: "calc(100% + 12px)", right: 0, width: 260, background: "#FFFFFF", color: "#1D1D1F",
            borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", fontSize: 12,
          }}
        >
          {qr ? <img src={qr} alt="QR code to continue on another device" width={180} height={180} /> : <div style={{ height: 180 }} />}
          <div style={{ textAlign: "center", lineHeight: 1.4 }}>
            Scan on a phone or laptop signed in to FLUXA. It opens this deck in present mode on the current slide.
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(url)}
            style={{ border: "1px solid #D9D9DD", background: "#FFFFFF", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
          >
            Copy link
          </button>
        </div>
      )}
    </span>
  );
};
