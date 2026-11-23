import React, { useRef, useEffect } from "react";
import { AlertCircle, ArrowUpRight } from "lucide-react";
import { CopilotMessage } from "./types";
import { UserBubble } from "./UserBubble";
import { BotMessage } from "./BotMessage";
import { ResultCard } from "./ResultCard";
import { TypingIndicator } from "./TypingIndicator";
import { Avatar } from "./Avatar";
import { AIOperation } from "../store/opsEngine";

interface MessageListProps {
  messages: CopilotMessage[];
  isStreaming: boolean;
  activeOps: AIOperation[] | null;
  activeOpsSummary?: string;
  hasAppliedCurrentOps?: boolean;
  activeSlideNumber?: number;
  activeSlideId?: string;
  lastError?: string | null;
  streamingStatus?: string;
  onRetry?: () => void;
  onSelectSuggestion: (text: string) => void;
  onApplyOps?: () => void;
  onRejectOps?: () => void;
  onUndoOps?: () => void;
  onViewSlide?: (slideId?: string) => void;
}

const DEFAULT_SUGGESTIONS = [
  "Make slide 2 more visual",
  "Add a slider to the chart",
  "Translate deck to Roman Urdu",
];

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming,
  activeOps,
  activeOpsSummary,
  hasAppliedCurrentOps = false,
  activeSlideNumber = 1,
  activeSlideId,
  lastError,
  streamingStatus,
  onRetry,
  onSelectSuggestion,
  onApplyOps,
  onRejectOps,
  onUndoOps,
  onViewSlide,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming, activeOps, lastError]);

  return (
    <div ref={scrollRef} className="fluxa-message-list">
      {/* Empty State */}
      {messages.length === 0 && !isStreaming && (
        <div className="fluxa-empty-state">
          <Avatar size={48} withGlow={true} />
          <p className="fluxa-empty-subtitle">
            Ask in English or Roman Urdu to rewrite slides, add charts, metrics, timelines, or interactive controls.
          </p>

          <div className="fluxa-suggestions-container">
            {DEFAULT_SUGGESTIONS.map((sug, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectSuggestion(sug)}
                className="fluxa-suggestion-chip"
              >
                <span>{sug}</span>
                <ArrowUpRight size={15} strokeWidth={1.75} color="#5B5B61" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Stream */}
      {messages.map((msg, index) => {
        if (msg.role === "user") {
          return (
            <UserBubble
              key={msg.id || index}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          );
        }

        // Assistant Message
        return (
          <React.Fragment key={msg.id || index}>
            {msg.content && (
              <BotMessage
                content={msg.content}
                timestamp={!msg.ops ? msg.timestamp : undefined}
              />
            )}

            {/* If message contained operations */}
            {msg.ops && msg.ops.length > 0 && (
              <ResultCard
                title={
                  msg.applied === true
                    ? `${msg.slideTitle || "Slide"} updated`
                    : msg.applied === false
                    ? `Not applied${msg.slideTitle ? ` to ${msg.slideTitle.toLowerCase()}` : ""}`
                    : "Earlier suggestion"
                }
                summary={msg.content || ""}
                slideNumber={activeSlideNumber}
                slideId={msg.slideId || activeSlideId}
                ops={msg.ops}
                applied
                timestamp={msg.timestamp}
                onViewSlide={msg.slideId ? () => onViewSlide?.(msg.slideId) : undefined}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Active Proposed Changes Card */}
      {activeOps && activeOps.length > 0 && (
        <ResultCard
          title={hasAppliedCurrentOps ? `Slide ${activeSlideNumber} updated` : `Proposed change to slide ${activeSlideNumber}`}
          summary={activeOpsSummary || `${activeOps.length} change(s) proposed.`}
          slideNumber={activeSlideNumber}
          slideId={activeSlideId}
          ops={activeOps}
          applied={hasAppliedCurrentOps}
          timestamp="Just now"
          onApply={onApplyOps}
          onReject={onRejectOps}
          onViewSlide={() => onViewSlide?.(activeSlideId)}
          onUndo={onUndoOps}
        />
      )}

      {/* Typing Indicator */}
      {isStreaming && streamingStatus && (
        <div className="fluxa-streaming-status">
          <div className="fluxa-streaming-dot" />
          <span>{streamingStatus}</span>
        </div>
      )}
      {isStreaming && <TypingIndicator />}

      {/* Error Card */}
      {lastError && (
        <div className="fluxa-error-card" role="alert">
          <div className="fluxa-error-header">
            <AlertCircle size={16} strokeWidth={1.75} />
            <span>Unable to complete request</span>
          </div>
          <p className="fluxa-error-text">{lastError}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="fluxa-retry-link"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
};
