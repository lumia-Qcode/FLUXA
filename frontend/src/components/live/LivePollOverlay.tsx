import React, { useState } from "react";
import { LivePoll } from "./liveApi";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

interface LivePollOverlayProps {
  poll: LivePoll;
  participantId?: string;
  isModerator?: boolean;
  onVote: (optionIndex: number) => Promise<void>;
  onClosePoll?: () => Promise<void>;
}

export const LivePollOverlay: React.FC<LivePollOverlayProps> = ({
  poll,
  isModerator,
  onVote,
  onClosePoll,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const hasVoted = Boolean(poll.has_voted);
  const votedOption = poll.voted_option;

  const handleVoteSubmit = async (idx: number) => {
    if (hasVoted || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onVote(idx);
    } catch (err) {
      console.error("Voting failed", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        width: collapsed ? "240px" : "360px",
        maxWidth: "calc(100vw - 48px)",
        background: "rgba(18, 20, 29, 0.94)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(99, 102, 241, 0.35)",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5), 0 0 24px rgba(99, 102, 241, 0.2)",
        borderRadius: "16px",
        color: "#FFFFFF",
        zIndex: 9999,
        overflow: "hidden",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {/* Poll Header */}
      <div
        style={{
          padding: "12px 16px",
          background: "linear-gradient(90deg, rgba(99, 102, 241, 0.25) 0%, rgba(168, 85, 247, 0.15) 100%)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: poll.status === "active" ? "#10B981" : "#EF4444",
              boxShadow: poll.status === "active" ? "0 0 8px #10B981" : "none",
            }}
          />
          <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#A5B4FC" }}>
            {poll.status === "active" ? "Live Poll" : "Poll Closed"}
          </span>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
            • Slide {poll.slide_index + 1}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "none",
              borderRadius: "6px",
              color: "#E2E8F0",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
            title={collapsed ? "Expand Poll" : "Collapse Poll"}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: "16px" }}>
          {/* Question */}
          <h4
            style={{
              margin: "0 0 14px 0",
              fontSize: "15px",
              fontWeight: 600,
              lineHeight: 1.4,
              color: "#F8FAFC",
            }}
          >
            {poll.question}
          </h4>

          {/* Options */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {poll.options.map((opt) => {
              const isSelected = hasVoted && votedOption === opt.index;

              if (hasVoted || poll.status === "closed") {
                // Show vote results with animated progress bar
                return (
                  <div
                    key={opt.index}
                    style={{
                      position: "relative",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      background: isSelected ? "rgba(99, 102, 241, 0.22)" : "rgba(255, 255, 255, 0.05)",
                      border: isSelected ? "1px solid rgba(99, 102, 241, 0.6)" : "1px solid rgba(255, 255, 255, 0.08)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Background Progress Bar */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: `${opt.percentage || 0}%`,
                        background: isSelected
                          ? "linear-gradient(90deg, rgba(99, 102, 241, 0.35), rgba(139, 92, 246, 0.35))"
                          : "rgba(255, 255, 255, 0.12)",
                        transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                        zIndex: 0,
                      }}
                    />

                    {/* Content */}
                    <div
                      style={{
                        position: "relative",
                        zIndex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "13px",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: isSelected ? 600 : 400, color: isSelected ? "#A5B4FC" : "#F1F5F9" }}>
                        {isSelected && <CheckCircle2 size={14} color="#818CF8" />}
                        {opt.text}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: "13px", color: isSelected ? "#FFFFFF" : "#CBD5E1" }}>
                        {opt.percentage}%
                        <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.6, marginLeft: "4px" }}>
                          ({opt.votes})
                        </span>
                      </span>
                    </div>
                  </div>
                );
              }

              // Vote option button
              return (
                <button
                  key={opt.index}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleVoteSubmit(opt.index)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    background: "rgba(255, 255, 255, 0.07)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#FFFFFF",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)";
                    e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.07)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
                  }}
                >
                  <span>{opt.text}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: "rgba(255, 255, 255, 0.1)",
                      color: "#A5B4FC",
                    }}
                  >
                    Vote
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer info */}
          <div
            style={{
              marginTop: "12px",
              paddingTop: "10px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "rgba(255, 255, 255, 0.6)",
            }}
          >
            <span>
              {poll.total_votes} {poll.total_votes === 1 ? "response" : "responses"}
            </span>

            {isModerator && onClosePoll && poll.status === "active" && (
              <button
                type="button"
                onClick={onClosePoll}
                style={{
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#FCA5A5",
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                End Poll
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
