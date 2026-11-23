import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dataset, Slide, Variable } from "../../../shared/spec";
import { SlideStage } from "./SlideStage";
import { getTheme, Theme } from "./themes";
import { preloadDeck } from "./preload";
import {
  LiveSessionState,
  LivePoll,
  startLiveSession,
  syncSlideIndex,
  pingLiveSession,
  closeLivePoll,
} from "../components/live/liveApi";
import { LiveMeetingModal } from "../components/live/LiveMeetingModal";
import { LiveMeetingQRCodeOverlay } from "../components/live/LiveMeetingQRCodeOverlay";
import { LivePollOverlay } from "../components/live/LivePollOverlay";
import { LiveCommentsDrawer } from "../components/live/LiveCommentsDrawer";
import { AudienceChoice } from "../components/live/AudienceChoice";
import { ResumeElsewhere } from "../components/live/ResumeElsewhere";
import { PresenterVoice } from "../presenter/PresenterVoice";
import { useSpeechEngine } from "../presenter/speech";

export interface PresentModeProps {
  slides: Slide[] | any[];
  initialSlideIndex?: number;
  theme?: Theme;
  datasets?: Record<string, Dataset>;
  variables?: Record<string, Variable>;
  presentationId?: string | number;
  onClose: () => void;
  onControlChange?: (variable: string, value: any) => void;
}

export const PresentMode: React.FC<PresentModeProps> = ({
  slides: allSlides,
  initialSlideIndex = 0,
  theme,
  datasets,
  variables,
  presentationId,
  onClose,
  onControlChange,
}) => {
  // Slides skipped for this talk only (voice "I have 5 minutes left"); the deck is untouched.
  const [skipIds, setSkipIds] = useState<Set<string>>(new Set());
  const slides = useMemo(() => allSlides.filter((s: any) => !skipIds.has(s.id)), [allSlides, skipIds]);
  const [currentIndex, setCurrentIndex] = useState(initialSlideIndex);
  const speech = useSpeechEngine("en-US");
  const [buildStep, setBuildStep] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isBlanked, setIsBlanked] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const totalSlides = slides.length;
  const currentSlide = slides[currentIndex] || slides[0];
  const activeTheme = theme || getTheme();

  // Live session state
  const [liveSession, setLiveSession] = useState<LiveSessionState | null>(null);
  const [isLiveModalOpen, setIsLiveModalOpen] = useState<boolean>(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState<boolean>(false);
  const [attendeeCount, setAttendeeCount] = useState<number>(1);
  const [activePoll, setActivePoll] = useState<LivePoll | null>(null);
  const [showOnScreenQR, setShowOnScreenQR] = useState<boolean>(false);

  const channelRef = useRef<BroadcastChannel | null>(null);

  // BroadcastChannel 2-way sync with Presenter View
  useEffect(() => {
    if (!presentationId || typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(`fluxa_presentation_${presentationId}`);
    channelRef.current = channel;

    channel.onmessage = (e) => {
      const msg = e.data;
      if (!msg) return;

      if (msg.type === "navigate") {
        if (typeof msg.slideIndex === "number") setCurrentIndex(msg.slideIndex);
        if (typeof msg.buildStep === "number") setBuildStep(msg.buildStep);
      } else if (msg.type === "request_sync") {
        // Send current state
        channel.postMessage({
          type: "sync",
          slideIndex: currentIndex,
          buildStep,
          variables,
          datasets,
          slides,
        });
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [presentationId, currentIndex, buildStep, variables, datasets, slides]);

  // Whenever state changes, broadcast to presenter window and live session
  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: "sync",
        slideIndex: currentIndex,
        buildStep,
        variables,
        datasets,
        slides,
      });
    }
    if (liveSession?.session_id) {
      syncSlideIndex(liveSession.session_id, currentIndex, liveSession.host_token).catch(() => {});
    }
  }, [currentIndex, buildStep, variables, datasets, slides, liveSession]);

  const handleStartOrOpenLive = async () => {
    if (liveSession) {
      setIsLiveModalOpen(true);
      return;
    }
    if (!presentationId) return;
    try {
      const sess = await startLiveSession(presentationId, "Presenter");
      setLiveSession(sess);
      setIsLiveModalOpen(true);
    } catch (err) {
      console.error("Failed to start live session", err);
    }
  };

  // Heartbeat for live session
  useEffect(() => {
    if (!liveSession?.session_id) return;
    let isMounted = true;

    async function ping() {
      try {
        const state = await pingLiveSession(liveSession!.session_id);
        if (!isMounted) return;
        setAttendeeCount(state.participants_count || 1);
        setActivePoll(state.active_poll || null);
      } catch (err) {
        // silent
      }
    }

    ping();
    const interval = setInterval(ping, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [liveSession?.session_id]);

  // Download every slide's images now (current and next first) so each slide appears instantly.
  useEffect(() => {
    preloadDeck(slides, currentIndex);
  }, [slides, currentIndex]);

  // Request Fullscreen on mount
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }

    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Advance builds or slides
  const handleAdvance = () => {
    if (!currentSlide) return;

    if (prefersReducedMotion) {
      // Reduced motion: advance slide directly
      if (currentIndex < totalSlides - 1) {
        setCurrentIndex((i) => i + 1);
        setBuildStep(0);
      }
      return;
    }

    const animatedBlocks = (currentSlide.blocks || []).filter(
      (b: any) => b.animation && b.animation.length > 0
    );

    if (buildStep < animatedBlocks.length) {
      setBuildStep((s) => s + 1);
    } else if (currentIndex < totalSlides - 1) {
      setCurrentIndex((i) => i + 1);
      setBuildStep(0);
    }
  };

  const handleGoBack = () => {
    if (!currentSlide) return;

    if (prefersReducedMotion) {
      if (currentIndex > 0) {
        setCurrentIndex((i) => i - 1);
        setBuildStep(0);
      }
      return;
    }

    if (buildStep > 0) {
      setBuildStep((s) => s - 1);
    } else if (currentIndex > 0) {
      const prevSlide = slides[currentIndex - 1];
      const prevAnimated = (prevSlide?.blocks || []).filter(
        (b: any) => b.animation && b.animation.length > 0
      );
      setCurrentIndex((i) => i - 1);
      setBuildStep(prevAnimated.length);
    }
  };

  // Keyboard navigation
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

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        handleAdvance();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        handleGoBack();
      } else if (e.key === "b" || e.key === "B") {
        setIsBlanked((b) => !b);
      } else if (e.key === "f" || e.key === "F") {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalSlides, onClose, buildStep, currentIndex, currentSlide, prefersReducedMotion]);

  // Mouse activity auto-hiding HUD after 2 seconds
  useEffect(() => {
    const handleMouseMove = () => {
      setControlsVisible(true);
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2000);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const progressPercent = totalSlides > 0 ? ((currentIndex + 1) / totalSlides) * 100 : 0;

  const handleOpenPresenterWindow = () => {
    if (presentationId) {
      window.open(`/presenter/${presentationId}`, "_blank", "width=1200,height=800");
    }
  };

  return createPortal(
    <div
      className="fluxa-present-portal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "#000000",
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        cursor: controlsVisible ? "default" : "none",
        overflow: "hidden",
      }}
      onClick={() => {
        // Advance on slide background click
        handleAdvance();
      }}
    >
      {/* Blackout Blank Overlay (B hotkey) */}
      {isBlanked ? (
        <div style={{ flex: 1, background: "#000000" }} />
      ) : (
        <div style={{ flex: 1, width: "100%", height: "100%", position: "relative" }}>
          {currentSlide && (
            <SlideStage
              slide={currentSlide}
              theme={activeTheme}
              datasets={datasets}
              variables={variables}
              mode="present"
              buildStep={buildStep}
              onControlChange={onControlChange}
              onNavigateSlide={(slideId) => {
                const idx = slides.findIndex((s) => s.id === slideId);
                if (idx !== -1) {
                  setCurrentIndex(idx);
                  setBuildStep(0);
                }
              }}
            />
          )}
        </div>
      )}

      {/* Auto-Hiding Controls HUD (No backdrop blur per Section 6.7) */}
      <div
        className="present-controls-hud"
        style={{
          position: "absolute",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          background: "#18181A",
          border: "1px solid #2C2C30",
          borderRadius: "24px",
          padding: "6px 16px",
          color: "#FFFFFF",
          fontSize: "13px",
          fontFamily: "system-ui, sans-serif",
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? "auto" : "none",
          transition: "opacity 0.25s ease-out",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={currentIndex <= 0 && buildStep <= 0}
          onClick={handleGoBack}
          style={{
            background: "transparent",
            border: "none",
            color: currentIndex <= 0 && buildStep <= 0 ? "#666" : "#FFF",
            cursor: currentIndex <= 0 && buildStep <= 0 ? "default" : "pointer",
            fontSize: "15px",
            padding: "4px 8px",
          }}
          aria-label="Previous slide"
        >
          ◀
        </button>

        <span style={{ fontWeight: 600, minWidth: "55px", textAlign: "center" }}>
          {currentIndex + 1} / {totalSlides}
        </span>

        <button
          type="button"
          disabled={currentIndex >= totalSlides - 1}
          onClick={handleAdvance}
          style={{
            background: "transparent",
            border: "none",
            color: currentIndex >= totalSlides - 1 ? "#666" : "#FFF",
            cursor: currentIndex >= totalSlides - 1 ? "default" : "pointer",
            fontSize: "15px",
            padding: "4px 8px",
          }}
          aria-label="Next slide"
        >
          ▶
        </button>

        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)", margin: "0 4px" }} />

        {/* Live Broadcast Pill */}
        {presentationId && (
          <button
            type="button"
            onClick={handleStartOrOpenLive}
            style={{
              background: liveSession ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.08)",
              border: liveSession ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(255, 255, 255, 0.15)",
              color: liveSession ? "#34D399" : "#E2E8F0",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: liveSession ? "#10B981" : "#94A3B8",
                boxShadow: liveSession ? "0 0 8px #10B981" : "none",
              }}
            />
            <span>{liveSession ? `Live Hub (${attendeeCount})` : "Go Live"}</span>
          </button>
        )}

        {/* #3 Audience-Controlled: let the audience vote on what comes next */}
        {liveSession?.session_id && (
          <AudienceChoice
            slides={slides}
            currentIndex={currentIndex}
            sessionId={liveSession.session_id}
            activePoll={activePoll}
            onPollCreated={(poll) => setActivePoll(poll)}
            onPollClosed={() => setActivePoll(null)}
            onGoTo={(i) => {
              setCurrentIndex(i);
              setBuildStep(0);
            }}
          />
        )}

        {/* Voice commands + #15 Autopilot */}
        <PresenterVoice
          engine={speech}
          slides={slides}
          allSlides={allSlides}
          currentIndex={currentIndex}
          presentationId={presentationId}
          live={liveSession}
          onGoTo={(i) => {
            setCurrentIndex(Math.max(0, Math.min(slides.length - 1, i)));
            setBuildStep(0);
          }}
          onSkip={(ids) => {
            const currentId = slides[currentIndex]?.id;
            const next = new Set(ids.filter((id) => id !== currentId));
            setSkipIds(next);
            const remaining = allSlides.filter((s: any) => !next.has(s.id));
            const idx = remaining.findIndex((s: any) => s.id === currentId);
            setCurrentIndex(idx >= 0 ? idx : 0);
          }}
        />

        {/* #5 Instant Recovery: continue on another device */}
        {presentationId && <ResumeElsewhere presentationId={presentationId} slideId={currentSlide?.id} />}

        {/* Presenter View Button */}
        {presentationId && (
          <button
            type="button"
            onClick={handleOpenPresenterWindow}
            style={{
              background: "transparent",
              border: "none",
              color: "#FFF",
              cursor: "pointer",
              fontSize: "12px",
              padding: "4px 8px",
              opacity: 0.9,
            }}
          >
            Presenter View
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#FFF",
            cursor: "pointer",
            fontSize: "12px",
            padding: "4px 8px",
            opacity: 0.8,
          }}
        >
          Exit (Esc)
        </button>
      </div>

      {/* Hairline Progress Indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: "rgba(255, 255, 255, 0.12)",
        }}
      >
        <div
          style={{
            width: `${progressPercent}%`,
            height: "100%",
            background: "var(--signal, #2352F5)",
            transition: "width 0.2s ease-out",
          }}
        />
      </div>

      {/* Live Meeting Moderator Modal */}
      {liveSession && (
        <LiveMeetingModal
          session={liveSession}
          currentSlideIndex={currentIndex}
          isOpen={isLiveModalOpen}
          onClose={() => setIsLiveModalOpen(false)}
          onSessionEnded={() => setLiveSession(null)}
          onPollCreated={(poll) => setActivePoll(poll)}
          onPollClosed={() => setActivePoll(null)}
          onToggleOnScreenQR={() => setShowOnScreenQR((prev) => !prev)}
          isOnScreenQREnabled={showOnScreenQR}
        />
      )}

      {/* On-Screen QR Code Badge for Room Audience */}
      {liveSession && showOnScreenQR && (
        <LiveMeetingQRCodeOverlay
          presentationId={liveSession.presentation_id}
          sessionId={liveSession.session_id}
          meetingCode={liveSession.meeting_code}
          onClose={() => setShowOnScreenQR(false)}
        />
      )}

      {/* Live Poll Overlay for Presenter view */}
      {liveSession && activePoll && (
        <LivePollOverlay
          poll={activePoll}
          isModerator={true}
          onVote={async () => {}}
          onClosePoll={async () => {
            if (activePoll) await closeLivePoll(activePoll.id);
            setActivePoll(null);
          }}
        />
      )}

      {/* Live Comments and Reactions Drawer */}
      {liveSession && (
        <LiveCommentsDrawer
          sessionId={liveSession.session_id}
          participantId={liveSession.host_token}
          participantName="Presenter (Host)"
          currentSlideIndex={currentIndex}
          isOpen={isCommentsOpen}
          onToggle={() => setIsCommentsOpen(!isCommentsOpen)}
        />
      )}
    </div>,
    document.body
  );
};
