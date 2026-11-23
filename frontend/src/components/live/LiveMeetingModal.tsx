import React, { useState, useEffect } from "react";
import {
  LiveSessionState,
  LivePoll,
  LiveParticipant,
  createLivePoll,
  closeLivePoll,
  getLiveParticipants,
  endLiveSession,
  getHostInfo,
} from "./liveApi";
import {
  Users,
  Copy,
  Check,
  Plus,
  Trash2,
  X,
  StopCircle,
  BarChart3,
  QrCode,
  ExternalLink,
  Smartphone,
  Share2,
} from "lucide-react";

interface LiveMeetingModalProps {
  session: LiveSessionState;
  currentSlideIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onSessionEnded?: () => void;
  onPollCreated?: (poll: LivePoll) => void;
  onPollClosed?: () => void;
  onToggleOnScreenQR?: () => void;
  isOnScreenQREnabled?: boolean;
}

type TabType = "qr" | "polls" | "attendees";

export const LiveMeetingModal: React.FC<LiveMeetingModalProps> = ({
  session,
  currentSlideIndex,
  isOpen,
  onClose,
  onSessionEnded,
  onPollCreated,
  onPollClosed,
  onToggleOnScreenQR,
  isOnScreenQREnabled = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("qr");
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Poll state
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>([
    "Strongly Agree",
    "Need More Discussion",
    "Disagree",
  ]);
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const [activePoll, setActivePoll] = useState<LivePoll | null>(session.active_poll || null);
  const [lanIp, setLanIp] = useState<string>("");

  useEffect(() => {
    getHostInfo().then((info) => {
      if (info?.lan_ip && info.lan_ip !== "127.0.0.1") {
        setLanIp(info.lan_ip);
      }
    });
  }, []);

  const port = typeof window !== "undefined" && window.location.port ? `:${window.location.port}` : "";
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const isLoopback =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  const effectiveHost =
    isLoopback && lanIp ? `${lanIp}${port}` : typeof window !== "undefined" ? window.location.host : "";
  const joinUrl = `${protocol}//${effectiveHost}/v/${session.presentation_id}?live=${session.session_id}`;

  // Generate QR Code data URL
  useEffect(() => {
    if (!joinUrl) return;
    import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 1,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    }))
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("QR Code generation error", err));
  }, [joinUrl]);

  // Periodic participants refresh
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    async function loadParticipants() {
      try {
        const list = await getLiveParticipants(session.session_id);
        if (isMounted) setParticipants(list);
      } catch (err) {
        // silent
      }
    }

    loadParticipants();
    const interval = setInterval(loadParticipants, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, session.session_id]);

  useEffect(() => {
    setActivePoll(session.active_poll || null);
  }, [session.active_poll]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, isLink: boolean) => {
    navigator.clipboard.writeText(text);
    if (isLink) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2) return;

    try {
      setIsCreatingPoll(true);
      const poll = await createLivePoll(
        session.session_id,
        currentSlideIndex,
        pollQuestion.trim(),
        pollOptions.filter((o) => o.trim())
      );
      setActivePoll(poll);
      onPollCreated?.(poll);
      setPollQuestion("");
    } catch (err) {
      console.error("Failed to create poll", err);
    } finally {
      setIsCreatingPoll(false);
    }
  };

  const handleEndPoll = async () => {
    if (!activePoll) return;
    try {
      await closeLivePoll(activePoll.id);
      setActivePoll(null);
      onPollClosed?.();
    } catch (err) {
      console.error("Failed to close poll", err);
    }
  };

  const handleEndMeeting = async () => {
    if (window.confirm("End this live presentation session for all connected attendees?")) {
      try {
        await endLiveSession(session.session_id, session.host_token);
        onSessionEnded?.();
        onClose();
      } catch (err) {
        console.error("Failed to end session", err);
      }
    }
  };

  const applyPreset = (q: string, opts: string[]) => {
    setPollQuestion(q);
    setPollOptions(opts);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "640px",
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "88vh",
          background: "#0D0F14",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "18px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          color: "#EDEDEF",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modern Studio Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          {/* Status Beacon */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                padding: "3px 10px",
                borderRadius: "20px",
              }}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: "#10B981",
                  boxShadow: "0 0 8px #10B981",
                }}
              />
              <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", color: "#34D399" }}>
                LIVE
              </span>
            </div>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "#94A3B8" }}>
              Slide {currentSlideIndex + 1}
            </span>
          </div>

          {/* Segmented Control Pill Tabs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.06)",
              borderRadius: "10px",
              padding: "3px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("qr")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                background: activeTab === "qr" ? "rgba(255, 255, 255, 0.15)" : "transparent",
                border: "none",
                borderRadius: "7px",
                color: activeTab === "qr" ? "#FFFFFF" : "#94A3B8",
                padding: "5px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <QrCode size={13} />
              <span>Join & QR</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("polls")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                background: activeTab === "polls" ? "rgba(255, 255, 255, 0.15)" : "transparent",
                border: "none",
                borderRadius: "7px",
                color: activeTab === "polls" ? "#FFFFFF" : "#94A3B8",
                padding: "5px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <BarChart3 size={13} />
              <span>Polls</span>
              {activePoll && (
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "#38BDF8",
                    display: "inline-block",
                  }}
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("attendees")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                background: activeTab === "attendees" ? "rgba(255, 255, 255, 0.15)" : "transparent",
                border: "none",
                borderRadius: "7px",
                color: activeTab === "attendees" ? "#FFFFFF" : "#94A3B8",
                padding: "5px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Users size={13} />
              <span>Attendees ({participants.length})</span>
            </button>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              borderRadius: "8px",
              color: "#94A3B8",
              cursor: "pointer",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {/* TAB 1: JOIN & QR CODE */}
          {activeTab === "qr" && (
            <div style={{ display: "flex", gap: "20px", alignItems: "stretch" }}>
              {/* QR Code Card */}
              <div
                style={{
                  width: "210px",
                  background: "#FFFFFF",
                  borderRadius: "14px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
                  flexShrink: 0,
                }}
              >
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="Scan to Join Presentation"
                    style={{
                      width: "178px",
                      height: "178px",
                      display: "block",
                      borderRadius: "6px",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "178px",
                      height: "178px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#64748B",
                      fontSize: "12px",
                    }}
                  >
                    Generating QR…
                  </div>
                )}
                <div
                  style={{
                    marginTop: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    color: "#0F172A",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                  }}
                >
                  <Smartphone size={13} />
                  <span>Scan to Join on Phone</span>
                </div>
              </div>

              {/* Share Details & Actions */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Meeting Code Card */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>
                      Meeting Access Code
                    </span>
                    <div style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "0.15em", color: "#F8FAFC", marginTop: "2px", fontFamily: "monospace" }}>
                      {session.meeting_code}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(session.meeting_code, false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      background: copiedCode ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: "8px",
                      color: copiedCode ? "#34D399" : "#E2E8F0",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedCode ? "Copied" : "Copy Code"}</span>
                  </button>
                </div>

                {/* Direct Link Input */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>
                    Direct Attendee URL
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      readOnly
                      value={joinUrl}
                      style={{
                        flex: 1,
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "8px",
                        padding: "7px 10px",
                        fontSize: "12px",
                        color: "#94A3B8",
                        outline: "none",
                        fontFamily: "monospace",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(joinUrl, true)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        background: copiedLink ? "#10B981" : "#2563EB",
                        border: "none",
                        borderRadius: "8px",
                        color: "#FFFFFF",
                        padding: "7px 14px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {copiedLink ? <Check size={13} /> : <Share2 size={13} />}
                      <span>{copiedLink ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                {/* On-Screen Big QR Badge Toggle */}
                {onToggleOnScreenQR && (
                  <button
                    type="button"
                    onClick={onToggleOnScreenQR}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: isOnScreenQREnabled ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.03)",
                      border: isOnScreenQREnabled ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "12px",
                      padding: "10px 14px",
                      color: isOnScreenQREnabled ? "#38BDF8" : "#94A3B8",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <QrCode size={15} />
                      <div>
                        <div>Broadcast QR on Screen</div>
                        <div style={{ fontSize: "11px", fontWeight: 400, opacity: 0.7 }}>
                          Displays floating QR badge on slide stage for room audience
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: isOnScreenQREnabled ? "#38BDF8" : "rgba(255, 255, 255, 0.1)",
                        color: isOnScreenQREnabled ? "#0F172A" : "#FFFFFF",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      {isOnScreenQREnabled ? "ON" : "OFF"}
                    </span>
                  </button>
                )}

                {/* Open in Viewer Button */}
                <a
                  href={joinUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#64748B",
                    fontSize: "12px",
                    textDecoration: "none",
                    alignSelf: "flex-start",
                    marginTop: "auto",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#94A3B8")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#64748B")}
                >
                  <ExternalLink size={12} />
                  <span>Open audience view in new tab</span>
                </a>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE POLLS */}
          {activeTab === "polls" && (
            <div>
              {activePoll ? (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "14px",
                    padding: "18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#38BDF8", textTransform: "uppercase" }}>
                        Active Poll • Slide {activePoll.slide_index + 1}
                      </span>
                      <h4 style={{ margin: "4px 0 0 0", fontSize: "15px", fontWeight: 600, color: "#F8FAFC" }}>
                        {activePoll.question}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={handleEndPoll}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        background: "rgba(239, 68, 68, 0.15)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        borderRadius: "8px",
                        color: "#FCA5A5",
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <StopCircle size={13} />
                      <span>End Poll</span>
                    </button>
                  </div>

                  {/* Real-time Vote Breakdown */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {activePoll.options.map((opt) => (
                      <div
                        key={opt.index}
                        style={{
                          position: "relative",
                          borderRadius: "10px",
                          padding: "10px 14px",
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            bottom: 0,
                            width: `${opt.percentage}%`,
                            background: "linear-gradient(90deg, rgba(56, 189, 248, 0.3) 0%, rgba(99, 102, 241, 0.3) 100%)",
                            transition: "width 0.4s ease",
                          }}
                        />
                        <div
                          style={{
                            position: "relative",
                            zIndex: 1,
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "13px",
                          }}
                        >
                          <span style={{ color: "#E2E8F0" }}>{opt.text}</span>
                          <span style={{ fontWeight: 700, color: "#FFFFFF" }}>
                            {opt.percentage}%{" "}
                            <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.6 }}>
                              ({opt.votes} votes)
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: "12px", color: "#64748B" }}>
                    Total Audience Votes: {activePoll.total_votes}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreatePoll} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Presets */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
                      Templates:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        applyPreset("Do you agree with this strategy?", [
                          "Strongly Agree",
                          "Need More Discussion",
                          "Disagree",
                        ])
                      }
                      style={{
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "6px",
                        color: "#94A3B8",
                        padding: "3px 8px",
                        fontSize: "11px",
                        cursor: "pointer",
                      }}
                    >
                      Agreement Scale
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        applyPreset("What should be our top priority?", [
                          "Speed to Market",
                          "Cost Efficiency",
                          "Feature Polish",
                        ])
                      }
                      style={{
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "6px",
                        color: "#94A3B8",
                        padding: "3px 8px",
                        fontSize: "11px",
                        cursor: "pointer",
                      }}
                    >
                      Priority Choice
                    </button>
                  </div>

                  {/* Question Field */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>
                      Poll Question
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Which product tier provides the highest ROI?"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      style={{
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "8px",
                        padding: "9px 12px",
                        fontSize: "13px",
                        color: "#FFFFFF",
                        outline: "none",
                      }}
                    />
                  </div>

                  {/* Options */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>
                      Choices
                    </label>
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} style={{ display: "flex", gap: "6px" }}>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions];
                            next[idx] = e.target.value;
                            setPollOptions(next);
                          }}
                          placeholder={`Option ${idx + 1}`}
                          style={{
                            flex: 1,
                            background: "rgba(255, 255, 255, 0.04)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: "8px",
                            padding: "7px 12px",
                            fontSize: "13px",
                            color: "#FFFFFF",
                            outline: "none",
                          }}
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                            style={{
                              background: "rgba(239, 68, 68, 0.1)",
                              border: "none",
                              borderRadius: "8px",
                              color: "#EF4444",
                              cursor: "pointer",
                              padding: "0 10px",
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {pollOptions.length < 5 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions([...pollOptions, `Option ${pollOptions.length + 1}`])}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "none",
                        border: "none",
                        color: "#38BDF8",
                        fontSize: "12px",
                        cursor: "pointer",
                        padding: "2px 0",
                        alignSelf: "flex-start",
                        fontWeight: 600,
                      }}
                    >
                      <Plus size={13} /> Add Choice
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={!pollQuestion.trim() || isCreatingPoll}
                    style={{
                      marginTop: "6px",
                      background: pollQuestion.trim() ? "#2563EB" : "rgba(255, 255, 255, 0.08)",
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px",
                      color: "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: pollQuestion.trim() ? "pointer" : "not-allowed",
                      transition: "background 0.2s ease",
                    }}
                  >
                    Launch Poll on Slide {currentSlideIndex + 1}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: ATTENDEES */}
          {activeTab === "attendees" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#94A3B8" }}>
                  Connected Devices ({participants.length})
                </span>
                <span style={{ fontSize: "11px", color: "#10B981", fontWeight: 600 }}>
                  ● Realtime Sync Active
                </span>
              </div>

              {participants.length === 0 ? (
                <div
                  style={{
                    padding: "30px",
                    textAlign: "center",
                    color: "#64748B",
                    fontSize: "13px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: "10px",
                  }}
                >
                  Waiting for attendees to connect… Share the QR code or link above!
                </div>
              ) : (
                participants.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "10px",
                      padding: "10px 14px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          backgroundColor: p.avatar_color || "#3B82F6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#FFF",
                        }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "#F8FAFC" }}>{p.name}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "12px",
                          background: p.role === "moderator" ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.08)",
                          color: p.role === "moderator" ? "#818CF8" : "#94A3B8",
                        }}
                      >
                        {p.role === "moderator" ? "Host" : "Viewer"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Studio Footer */}
        <div
          style={{
            padding: "14px 20px",
            background: "rgba(255, 255, 255, 0.02)",
            borderTop: "1px solid rgba(255, 255, 255, 0.07)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            type="button"
            onClick={handleEndMeeting}
            style={{
              background: "transparent",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              color: "#F87171",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            End Live Session
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "8px",
              color: "#FFFFFF",
              padding: "6px 18px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
