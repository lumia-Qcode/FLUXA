import React, { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { getHostInfo } from "./liveApi";

interface LiveMeetingQRCodeOverlayProps {
  presentationId: number | string;
  sessionId: string;
  meetingCode: string;
  onClose?: () => void;
}

export const LiveMeetingQRCodeOverlay: React.FC<LiveMeetingQRCodeOverlayProps> = ({
  presentationId,
  sessionId,
  meetingCode,
  onClose,
}) => {
  const [qrUrl, setQrUrl] = useState<string>("");

  useEffect(() => {
    async function generate() {
      let host = typeof window !== "undefined" ? window.location.host : "";
      const isLoopback =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

      if (isLoopback) {
        const info = await getHostInfo();
        if (info?.lan_ip && info.lan_ip !== "127.0.0.1") {
          const port = window.location.port ? `:${window.location.port}` : "";
          host = `${info.lan_ip}${port}`;
        }
      }

      const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
      const joinUrl = `${protocol}//${host}/v/${presentationId}?live=${sessionId}`;

      import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(joinUrl, {
        width: 220,
        margin: 1,
        color: {
          dark: "#0F172A",
          light: "#FFFFFF",
        },
      }))
        .then((url) => setQrUrl(url))
        .catch((err) => console.error("Error generating slide QR", err));
    }

    generate();
  }, [presentationId, sessionId]);

  if (!qrUrl) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "24px",
        background: "rgba(13, 15, 20, 0.92)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        boxShadow: "0 16px 36px rgba(0, 0, 0, 0.6), 0 0 24px rgba(56, 189, 248, 0.15)",
        borderRadius: "16px",
        padding: "12px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        zIndex: 9990,
        color: "#FFFFFF",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {/* White QR Card */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "8px",
          padding: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={qrUrl}
          alt="Scan to join meeting"
          style={{ width: "90px", height: "90px", display: "block" }}
        />
      </div>

      {/* Info & Code */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#38BDF8", fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          <Smartphone size={13} />
          <span>Join from Phone</span>
        </div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#F8FAFC" }}>
          Scan QR to Vote & Chat
        </div>
        <div style={{ fontSize: "11px", color: "#94A3B8" }}>
          Code: <span style={{ fontWeight: 700, color: "#FFFFFF", fontFamily: "monospace" }}>{meetingCode}</span>
        </div>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "6px",
            right: "6px",
            background: "none",
            border: "none",
            color: "#64748B",
            cursor: "pointer",
            padding: "2px",
            display: "flex",
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
