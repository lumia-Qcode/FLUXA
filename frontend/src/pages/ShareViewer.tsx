import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Slide } from "../../../shared/spec";
import { SlideStage } from "../rendering/SlideStage";
import { resolveDeckTheme, Theme } from "../rendering/themes";
import {
  LivePoll,
  PrivacyNotice,
  castPollVote,
  eraseMyLiveData,
  fetchPrivacyNotice,
  joinLiveSession,
  pingLiveSession,
} from "../components/live/liveApi";
import { LivePollOverlay } from "../components/live/LivePollOverlay";
import { LiveCommentsDrawer } from "../components/live/LiveCommentsDrawer";
import { AskAnythingPanel } from "../components/live/AskAnythingPanel";
import { LiveSubtitles } from "../components/live/LiveSubtitles";
import { Users, Radio, ShieldCheck } from "lucide-react";

export const ShareViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const liveParam = searchParams.get("live");

  const [presentation, setPresentation] = useState<any>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live session state
  const [liveSessionId, setLiveSessionId] = useState<string | null>(liveParam);
  const [participantId, setParticipantId] = useState<string>(() => sessionStorage.getItem("fluxa_participant_id") || "");
  const [participantName, setParticipantName] = useState<string>(() => sessionStorage.getItem("fluxa_participant_name") || "");
  const [attendeeCount, setAttendeeCount] = useState<number>(1);
  const [activePoll, setActivePoll] = useState<LivePoll | null>(null);
  const [followPresenter, setFollowPresenter] = useState<boolean>(true);
  const [showJoinModal, setShowJoinModal] = useState<boolean>(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState<boolean>(false);
  const [joinInputName, setJoinInputName] = useState<string>("");
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [showPrivacy, setShowPrivacy] = useState<boolean>(false);
  const [privacyMessage, setPrivacyMessage] = useState<string>("");
  // After "Delete my data", don't push the join dialog again; the attendee can rejoin from the panel.
  const [erased, setErased] = useState<boolean>(false);

  // Audience privacy notice (F15): shown in the join dialog and the Privacy panel.
  useEffect(() => {
    if (!liveSessionId) return;
    fetchPrivacyNotice(liveSessionId)
      .then(setNotice)
      .catch(() => setNotice(null));
  }, [liveSessionId]);

  useEffect(() => {
    async function fetchDeck() {
      try {
        setLoading(true);
        setError(null);

        let data: any = null;
        const isNumeric = /^\d+$/.test(id || "");

        if (!isNumeric) {
          // Token-based share link
          const res = await fetch(`/api/share/${id}`);
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (res.status === 403 || errData.code === "revoked") {
              throw new Error("This presentation is no longer shared or the link has expired.");
            }
            throw new Error("This presentation is no longer shared or does not exist.");
          }
          data = await res.json();
        } else {
          // Numeric ID: check public share route first, then direct presentation endpoint
          let res = await fetch(`/api/share/${id}`);
          if (res.ok) {
            data = await res.json();
          } else {
            res = await fetch(`/api/presentations/${id}`);
            if (res.ok) {
              data = await res.json();
            } else {
              throw new Error("Presentation not found or no longer shared.");
            }
          }
        }

        if (!data || !data.presentation) {
          throw new Error("Presentation not found or no longer shared.");
        }

        setPresentation(data.presentation);
        setSlides(data.presentation.slides || []);
      } catch (err: any) {
        setError(err.message || "Failed to load presentation.");
      } finally {
        setLoading(false);
      }
    }
    fetchDeck();
  }, [id]);

  // Live meeting detection
  useEffect(() => {
    if (liveParam) {
      setLiveSessionId(liveParam);
      if (!participantId && !erased) {
        setShowJoinModal(true);
      }
    } else if (presentation?.id) {
      // Check if an active session exists for this presentation
      fetch(`/api/live/sessions?presentation_id=${presentation.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.session_id && data?.status === "active") {
            setLiveSessionId(data.session_id);
            if (!participantId && !erased) {
              setShowJoinModal(true);
            }
          }
        })
        .catch(() => {});
    }
  }, [liveParam, presentation?.id, participantId, erased]);

  // Live heartbeat polling
  useEffect(() => {
    if (!liveSessionId) return;

    let isMounted = true;
    async function heartbeat() {
      try {
        const state = await pingLiveSession(liveSessionId!, participantId || undefined);
        if (!isMounted) return;

        if (state.participants_count) {
          setAttendeeCount(state.participants_count);
        }

        // Auto-sync slide if follower mode enabled
        if (followPresenter && typeof state.current_slide_index === "number") {
          setCurrentIndex(state.current_slide_index);
        }

        // Update active poll
        setActivePoll(state.active_poll || null);
      } catch (err) {
        // silent ping fail
      }
    }

    heartbeat();
    const interval = setInterval(heartbeat, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [liveSessionId, participantId, followPresenter]);

  const handleJoinSession = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!liveSessionId) return;

    const chosenName = joinInputName.trim() || `Guest ${Math.floor(Math.random() * 900 + 100)}`;
    try {
      const res = await joinLiveSession(liveSessionId, chosenName, undefined, notice?.version ?? 1);
      setParticipantId(res.participant_id);
      setParticipantName(res.name);
      sessionStorage.setItem("fluxa_participant_id", res.participant_id);
      sessionStorage.setItem("fluxa_participant_name", res.name);
      setShowJoinModal(false);
      setErased(false);
    } catch (err) {
      console.error("Failed to join meeting", err);
    }
  };

  const handleEraseMyData = async () => {
    if (!liveSessionId || !participantId) return;
    try {
      await eraseMyLiveData(liveSessionId, participantId);
      sessionStorage.removeItem("fluxa_participant_id");
      sessionStorage.removeItem("fluxa_participant_name");
      setParticipantId("");
      setParticipantName("");
      setErased(true);
      setPrivacyMessage("Your name, votes and comments were deleted from this session.");
    } catch (err) {
      setPrivacyMessage(err instanceof Error ? err.message : "Couldn't delete your data.");
    }
  };

  const handleVote = async (optionIndex: number) => {
    if (!activePoll || !participantId) return;
    try {
      const updated = await castPollVote(activePoll.id, participantId, optionIndex);
      setActivePoll((prev) =>
        prev
          ? {
              ...prev,
              options: updated.options,
              total_votes: updated.total_votes,
              has_voted: true,
              voted_option: optionIndex,
            }
          : null
      );
    } catch (err) {
      console.error("Failed to cast vote", err);
    }
  };

  const slidesCount = slides.length;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (slidesCount === 0) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setFollowPresenter(false);
        setCurrentIndex((i) => Math.min(slidesCount - 1, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setFollowPresenter(false);
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slidesCount]);

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#111", color: "#FFF" }}>
        Loading presentation…
      </div>
    );
  }

  if (error || !presentation || slides.length === 0) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#111", color: "#FFF", flexDirection: "column", gap: "1rem" }}>
        <h2>Presentation Unavailable</h2>
        <p style={{ color: "#9CA3AF" }}>{error || "No slides found in this presentation."}</p>
      </div>
    );
  }

  const themeId = typeof presentation.theme === "string" ? presentation.theme : presentation.theme?.themeId;
  const theme: Theme = resolveDeckTheme(themeId, presentation.brand, presentation.theme?.fontPairing);
  const currentSlide = slides[currentIndex];

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Live Meeting Top Bar Banner */}
      {liveSessionId && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "20px",
            zIndex: 9980,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "rgba(18, 20, 28, 0.88)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "30px",
            padding: "6px 14px",
            color: "#FFFFFF",
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#10B981",
                boxShadow: "0 0 8px #10B981",
              }}
            />
            <span style={{ fontWeight: 700, letterSpacing: "0.05em", color: "#A5B4FC" }}>LIVE MEETING</span>
          </div>

          <div style={{ height: "12px", width: "1px", background: "rgba(255,255,255,0.2)" }} />

          <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#CBD5E1" }}>
            <Users size={14} />
            <span>{attendeeCount} online</span>
          </div>

          <div style={{ height: "12px", width: "1px", background: "rgba(255,255,255,0.2)" }} />

          {followPresenter ? (
            <span style={{ color: "#34D399", fontWeight: 500, fontSize: "11px" }}>
              Synced with Presenter
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setFollowPresenter(true)}
              style={{
                background: "rgba(99, 102, 241, 0.25)",
                border: "1px solid rgba(99, 102, 241, 0.5)",
                color: "#A5B4FC",
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Catch up with Presenter
            </button>
          )}

          <div style={{ height: "12px", width: "1px", background: "rgba(255,255,255,0.2)" }} />

          <button
            type="button"
            data-testid="viewer-privacy"
            aria-expanded={showPrivacy}
            onClick={() => {
              setPrivacyMessage("");
              setShowPrivacy((v) => !v);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "none",
              border: "none",
              color: "#CBD5E1",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <ShieldCheck size={13} />
            Privacy
          </button>
        </div>
      )}

      {/* Audience privacy panel (F15) */}
      {liveSessionId && showPrivacy && (
        <div
          role="dialog"
          aria-label="Privacy"
          style={{
            position: "absolute",
            top: "60px",
            left: "20px",
            zIndex: 9985,
            width: "320px",
            maxWidth: "calc(100vw - 32px)",
            background: "#161824",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "16px",
            padding: "16px",
            color: "#FFFFFF",
            fontSize: "12px",
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "6px" }}>Your data in this session</div>
          <p style={{ margin: "0 0 12px 0", color: "#94A3B8" }}>
            {notice?.text || "Your name, votes and comments are shared with the presenter and attendees."}
          </p>
          {privacyMessage && (
            <p role="status" style={{ margin: "0 0 12px 0", color: "#34D399" }}>
              {privacyMessage}
            </p>
          )}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            {!participantId && erased && (
              <button
                type="button"
                onClick={() => {
                  setShowPrivacy(false);
                  setShowJoinModal(true);
                }}
                style={{
                  background: "rgba(99, 102, 241, 0.25)",
                  border: "1px solid rgba(99, 102, 241, 0.5)",
                  color: "#A5B4FC",
                  padding: "6px 10px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Join again
              </button>
            )}
            {participantId && (
              <button
                type="button"
                onClick={handleEraseMyData}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.45)",
                  color: "#FCA5A5",
                  padding: "6px 10px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Delete my data
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPrivacy(false)}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#FFFFFF",
                padding: "6px 10px",
                borderRadius: "10px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Main Slide Stage */}
      <div style={{ flex: 1, width: "100%", height: "100%" }}>
        {currentSlide && (
          <SlideStage
            slide={currentSlide}
            theme={theme}
            datasets={presentation.datasets}
            mode="present"
          />
        )}
      </div>

      {/* Interactive Live Poll Overlay */}
      {liveSessionId && activePoll && (
        <LivePollOverlay
          poll={activePoll}
          participantId={participantId}
          onVote={handleVote}
        />
      )}

      {/* #10 Live translated subtitles */}
      {liveSessionId && <LiveSubtitles sessionId={liveSessionId} />}

      {/* #7 Ask Anything: audience questions answered from the deck */}
      {presentation?.is_shared !== false && id && (
        <AskAnythingPanel
          shareId={id}
          participantId={participantId || undefined}
          onGoToSlide={(i) => {
            setFollowPresenter(false);
            setCurrentIndex(Math.max(0, Math.min(slides.length - 1, i)));
          }}
        />
      )}

      {/* Live Comments and Reactions Drawer */}
      {liveSessionId && (
        <LiveCommentsDrawer
          sessionId={liveSessionId}
          participantId={participantId}
          participantName={participantName || "Guest"}
          currentSlideIndex={currentIndex}
          isOpen={isCommentsOpen}
          onToggle={() => setIsCommentsOpen(!isCommentsOpen)}
        />
      )}

      {/* Attendee Join Meeting Dialog */}
      {showJoinModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
            fontFamily: "var(--font-sans, system-ui, sans-serif)",
          }}
        >
          <div
            style={{
              width: "400px",
              maxWidth: "calc(100vw - 32px)",
              background: "#161824",
              border: "1px solid rgba(99, 102, 241, 0.35)",
              borderRadius: "20px",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(99, 102, 241, 0.2)",
              padding: "28px",
              color: "#FFFFFF",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
              }}
            >
              <Radio size={24} color="#FFF" />
            </div>

            <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 700 }}>
              Join Live Presentation Meeting
            </h3>
            <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#94A3B8", lineHeight: 1.5 }}>
              Vote in live polls, chat with attendees, and stay in sync with the presenter.
            </p>

            <p
              data-testid="join-privacy-notice"
              style={{
                margin: "0 0 16px 0",
                padding: "10px 12px",
                fontSize: "12px",
                color: "#94A3B8",
                lineHeight: 1.5,
                textAlign: "left",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "10px",
              }}
            >
              {notice?.text ||
                "By joining, the name you enter, your poll votes and comments are shared with the presenter and other attendees, and deleted after a set period."}
            </p>

            <form onSubmit={handleJoinSession} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                type="text"
                placeholder="Enter your name (e.g., Sarah Jenkins)"
                value={joinInputName}
                onChange={(e) => setJoinInputName(e.target.value)}
                autoFocus
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  fontSize: "14px",
                  color: "#FFFFFF",
                  outline: "none",
                }}
              />

              <button
                type="submit"
                style={{
                  background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
                  border: "none",
                  borderRadius: "10px",
                  padding: "12px",
                  color: "#FFF",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(79, 70, 229, 0.4)",
                }}
              >
                Join Presentation
              </button>

              <button
                type="button"
                onClick={() => handleJoinSession()}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94A3B8",
                  fontSize: "12px",
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: "4px",
                }}
              >
                Join as Anonymous Guest
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating HUD navigation */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          background: "rgba(20, 20, 24, 0.85)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "20px",
          padding: "6px 16px",
          color: "#FFFFFF",
          fontSize: "13px",
        }}
      >
        <button
          type="button"
          data-testid="viewer-prev"
          aria-label="Previous slide"
          disabled={currentIndex <= 0}
          onClick={() => {
            setFollowPresenter(false);
            setCurrentIndex((i) => Math.max(0, i - 1));
          }}
          style={{ background: "none", border: "none", color: currentIndex <= 0 ? "#555" : "#FFF", cursor: "pointer" }}
        >
          ◀
        </button>
        <span style={{ fontWeight: 600 }} data-testid="viewer-counter">
          {currentIndex + 1} / {slides.length}
        </span>
        <button
          type="button"
          data-testid="viewer-next"
          aria-label="Next slide"
          disabled={currentIndex >= slides.length - 1}
          onClick={() => {
            setFollowPresenter(false);
            setCurrentIndex((i) => Math.min(slides.length - 1, i + 1));
          }}
          style={{ background: "none", border: "none", color: currentIndex >= slides.length - 1 ? "#555" : "#FFF", cursor: "pointer" }}
        >
          ▶
        </button>
      </div>
    </div>
  );
};
