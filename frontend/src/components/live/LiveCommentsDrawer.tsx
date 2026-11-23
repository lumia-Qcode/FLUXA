import React, { useState, useEffect, useRef } from "react";
import { LiveComment, postLiveComment, getLiveComments } from "./liveApi";
import { MessageSquare, Send, Sparkles, X } from "lucide-react";

interface LiveCommentsDrawerProps {
  sessionId: string;
  participantId?: string;
  participantName: string;
  currentSlideIndex: number;
  isOpen: boolean;
  onToggle: () => void;
}

const QUICK_REACTIONS = ["👏", "🔥", "💡", "❤️", "🚀", "👍"];

export const LiveCommentsDrawer: React.FC<LiveCommentsDrawerProps> = ({
  sessionId,
  participantId = "guest",
  participantName,
  currentSlideIndex,
  isOpen,
  onToggle,
}) => {
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll comments periodically
  useEffect(() => {
    let isMounted = true;
    async function fetchLatest() {
      try {
        const list = await getLiveComments(sessionId);
        if (isMounted) setComments(list);
      } catch (err) {
        // silent ping
      }
    }

    fetchLatest();
    const interval = setInterval(fetchLatest, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  // Auto-scroll when new comments arrive
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments, isOpen]);

  const handleSend = async (reactionEmoji?: string) => {
    if ((!inputText.trim() && !reactionEmoji) || isSending) return;
    try {
      setIsSending(true);
      const newCmt = await postLiveComment(
        sessionId,
        participantId,
        participantName,
        currentSlideIndex,
        inputText.trim(),
        reactionEmoji
      );
      setComments((prev) => [...prev, newCmt]);
      if (!reactionEmoji) setInputText("");
    } catch (err) {
      console.error("Failed to post comment", err);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
          color: "#FFFFFF",
          border: "none",
          borderRadius: "30px",
          padding: "10px 18px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(79, 70, 229, 0.4)",
          zIndex: 9990,
          transition: "transform 0.2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        <MessageSquare size={16} />
        <span>Live Chat & Q&A</span>
        {comments.length > 0 && (
          <span
            style={{
              background: "rgba(255, 255, 255, 0.25)",
              borderRadius: "10px",
              padding: "1px 6px",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            {comments.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "360px",
        maxWidth: "calc(100vw - 40px)",
        height: "500px",
        maxHeight: "calc(100vh - 80px)",
        background: "rgba(18, 20, 28, 0.96)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "20px",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 24px 48px rgba(0, 0, 0, 0.6), 0 0 30px rgba(99, 102, 241, 0.25)",
        zIndex: 9995,
        overflow: "hidden",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          background: "linear-gradient(90deg, rgba(79, 70, 229, 0.2) 0%, rgba(124, 58, 237, 0.2) 100%)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MessageSquare size={16} color="#818CF8" />
          <span style={{ fontSize: "14px", fontWeight: 600 }}>Live Q&A & Reactions</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          style={{
            background: "none",
            border: "none",
            color: "#94A3B8",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Quick Reaction Pills */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "rgba(255, 255, 255, 0.03)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          overflowX: "auto",
        }}
      >
        <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>
          React:
        </span>
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleSend(emoji)}
            disabled={isSending}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "16px",
              padding: "4px 8px",
              fontSize: "14px",
              cursor: "pointer",
              transition: "transform 0.1s ease",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.85)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Messages Stream */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          padding: "12px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {comments.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748B",
              fontSize: "13px",
              textAlign: "center",
              padding: "20px",
            }}
          >
            <Sparkles size={28} color="#6366F1" style={{ marginBottom: "8px", opacity: 0.8 }} />
            <span>No comments yet. Be the first to ask a question or drop a reaction!</span>
          </div>
        ) : (
          comments.map((c) => {
            const isMe = c.participant_id === participantId;
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignSelf: isMe ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "3px",
                    fontSize: "11px",
                    color: isMe ? "#A5B4FC" : "#94A3B8",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{isMe ? "You" : c.participant_name}</span>
                  <span style={{ opacity: 0.6 }}>• Slide {c.slide_index + 1}</span>
                </div>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "12px",
                    background: isMe
                      ? "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)"
                      : "rgba(255, 255, 255, 0.08)",
                    border: isMe ? "none" : "1px solid rgba(255, 255, 255, 0.08)",
                    color: "#FFFFFF",
                    fontSize: "13px",
                    wordBreak: "break-word",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }}
                >
                  {c.reaction && (
                    <span style={{ fontSize: "18px", marginRight: c.text ? "6px" : "0" }}>
                      {c.reaction}
                    </span>
                  )}
                  {c.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input box */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(0, 0, 0, 0.2)",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={inputText}
          placeholder="Ask a question or comment…"
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{
            flex: 1,
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "10px",
            padding: "8px 12px",
            fontSize: "13px",
            color: "#FFFFFF",
            outline: "none",
          }}
        />
        <button
          type="button"
          disabled={!inputText.trim() || isSending}
          onClick={() => handleSend()}
          style={{
            background: inputText.trim() ? "#4F46E5" : "rgba(255, 255, 255, 0.1)",
            border: "none",
            borderRadius: "10px",
            padding: "8px 12px",
            color: "#FFFFFF",
            cursor: inputText.trim() ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.2s ease",
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
};
