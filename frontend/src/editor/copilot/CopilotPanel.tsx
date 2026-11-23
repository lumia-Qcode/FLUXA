import React, { useState, useEffect, useRef } from "react";
import { useDocument } from "../store/DocumentContext";
import { commands } from "../store/documentStore";
import { AIOperation } from "../store/opsEngine";
import { postStream } from "../../runtime/streamClient";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { CopilotMessage, CopilotScope } from "./types";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import "./copilot.css";

interface CopilotPanelProps {
  onBack?: () => void;
  isWide?: boolean;
  onToggleWide?: () => void;
}

export function formatTimestamp(date: Date = new Date()): string {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

const CO_ROLES = [
  { id: "", label: "Co-author", hint: "General help with any change" },
  { id: "researcher", label: "Researcher", hint: "Sharper claims, figures and sources" },
  { id: "designer", label: "Designer", hint: "Layout, hierarchy, charts and visuals" },
  { id: "storyteller", label: "Storyteller", hint: "Takeaway headlines and narrative flow" },
  { id: "critic", label: "Critic", hint: "Finds and fixes the weakest points" },
  { id: "coach", label: "Coach", hint: "Speaker notes and delivery tips" },
];

export const CopilotPanel: React.FC<CopilotPanelProps> = ({
  onBack,
  isWide = false,
  onToggleWide,
}) => {
  const [coRole, setCoRole] = useState<string>("");
  // Apply Copilot's changes as soon as they arrive (one undo step each). Off = review each change first.
  const [autoApply, setAutoApply] = useState<boolean>(() => {
    try {
      return localStorage.getItem("fluxa.copilot.autoApply") !== "0";
    } catch {
      return true;
    }
  });
  const toggleAutoApply = () => {
    setAutoApply((v) => {
      try {
        localStorage.setItem("fluxa.copilot.autoApply", v ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !v;
    });
  };
  const {
    doc,
    selectedSlide,
    selectedSlideId,
    selectedBlockIds,
    setSelectedBlockIds,
    setSelectedSlideId,
    execute,
    undo,
    canUndo,
  } = useDocument();

  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeOps, setActiveOps] = useState<AIOperation[] | null>(null);
  const [activeOpsSummary, setActiveOpsSummary] = useState<string>("");
  const [hasAppliedCurrentOps, setHasAppliedCurrentOps] = useState(false);
  const [targetScope, setTargetScope] = useState<CopilotScope>("slide");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSentPrompt, setLastSentPrompt] = useState<string>("");
  const [streamingStatus, setStreamingStatus] = useState<string>("");
  const [aiConfig, setAiConfig] = useState<{
    configured: boolean;
    message: string;
    provider?: string;
  }>({
    configured: true,
    message: "",
    provider: "",
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  // The slide a request was sent from: its changes are applied there even if the user moves on.
  const proposalSlideRef = useRef<{ id?: string; index: number; label: string } | null>(null);

  const activeSlideIndex = doc.slides.findIndex((s: any) => s.id === selectedSlideId);
  const activeSlideNumber = (activeSlideIndex >= 0 ? activeSlideIndex : 0) + 1;
  const selectedBlock = selectedSlide?.blocks.find((b: any) =>
    selectedBlockIds.includes(b.id)
  ) as any;

  // Determine current scope label
  let scopeLabel = `Slide ${activeSlideNumber}`;
  if (targetScope === "deck") {
    scopeLabel = "Whole deck";
  } else if (targetScope === "selection" && selectedBlock) {
    scopeLabel = `${selectedBlock.type}: ${selectedBlock.role || selectedBlock.id}`;
  }

  // Check AI configuration status
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/ai/status");
        if (res.ok) {
          const data = await res.json();
          setAiConfig({
            configured: data.configured,
            message: data.message,
            provider: data.provider,
          });
        }
      } catch {
        // network issue
      }
    }
    checkStatus();
  }, []);

  // Fetch persisted chat history for presentation
  useEffect(() => {
    async function fetchHistory() {
      if (!doc.id) return;
      try {
        const res = await fetch(`/api/presentations/${doc.id}/ai/messages`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            setMessages(
              data.messages.map((m: any) => ({
                ...m,
                timestamp: m.timestamp || formatTimestamp(),
              }))
            );
          }
        }
      } catch {
        // history fetch fail
      }
    }
    fetchHistory();
  }, [doc.id]);

  const toggleScope = () => {
    if (targetScope === "slide" && selectedBlock) {
      setTargetScope("selection");
    } else if (targetScope === "selection") {
      setTargetScope("deck");
    } else {
      setTargetScope("slide");
    }
  };

  async function handleSendMessage(textToSend?: string) {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming) return;

    setInputMessage("");
    setLastError(null);
    setLastSentPrompt(text);
    // Keep the previous reply's change card in the history with its real state.
    if (activeOps && activeOps.length > 0) {
      const archived = { ops: activeOps, applied: hasAppliedCurrentOps, slideId: proposalSlideRef.current?.id, slideTitle: proposalSlideRef.current?.label };
      setMessages((prev) => {
        const i = [...prev].reverse().findIndex((m) => m.role === "assistant");
        if (i === -1) return prev;
        const idx = prev.length - 1 - i;
        return prev.map((m, j) => (j === idx ? { ...m, ...archived } : m));
      });
    }
    setHasAppliedCurrentOps(false);
    setActiveOps(null);
    const sentSlideIndex = activeSlideIndex >= 0 ? activeSlideIndex : 0;
    proposalSlideRef.current = { id: selectedSlideId || undefined, index: sentSlideIndex, label: `Slide ${sentSlideIndex + 1}` };

    // Append user message with exact AM/PM timestamp
    const userMsg: CopilotMessage = {
      role: "user",
      content: text,
      timestamp: formatTimestamp(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let assistantText = "";
    let receivedOps: AIOperation[] = [];
    const botTimestamp = formatTimestamp();

    try {
      await postStream(
        `/api/presentations/${doc.id}/ai/chat`,
        {
          message: text,
          current_slide_id: selectedSlideId,
          current_slide: selectedSlide,
          scope: targetScope,
          selected_block_ids: selectedBlockIds,
          role: coRole || undefined,
          stream: true,
        },
        {
          onText: (textData) => {
            const delta = textData.delta;
            // Intercept progress markers like [PROGRESS: Searching the web...]
            const progressMatch = delta.match(/^\[PROGRESS:\s*(.+?)\]\s*$/);
            if (progressMatch) {
              setStreamingStatus(progressMatch[1].trim());
              return; // don't accumulate into message text
            }
            assistantText += delta;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: assistantText, timestamp: botTimestamp },
                ];
              }
              return [
                ...prev,
                { role: "assistant", content: assistantText, timestamp: botTimestamp },
              ];
            });
          },
          onOps: (opsData) => {
            receivedOps = opsData.ops || [];
            setActiveOps(receivedOps);
            setActiveOpsSummary(opsData.message || assistantText);
            if (autoApply && receivedOps.length > 0) {
              execute(`AI: ${opsData.message || "Update slide"}`, commands.applyAIOps(receivedOps, proposalSlideRef.current?.index ?? 0));
              setHasAppliedCurrentOps(true);
            }

            // Highlight affected blocks on canvas
            const blockIds = receivedOps
              .map((o) => o.block_id || o.block?.id)
              .filter(Boolean) as string[];
            if (blockIds.length > 0) {
              setSelectedBlockIds(blockIds);
            }
          },
          onDone: () => {
            setIsStreaming(false);
            setStreamingStatus("");
          },
          onError: (err) => {
            setIsStreaming(false);
            const errStr = typeof err === "string" ? err : err.message;
            setLastError(errStr);
          },
        },
        controller.signal
      );
    } catch (e: any) {
      setIsStreaming(false);
      setLastError(e?.message || "Failed to reach Copilot service.");
    }
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setStreamingStatus("");
    }
  }

  function handleApplyOps() {
    if (!activeOps || activeOps.length === 0) return;
    execute(
      `AI: ${activeOpsSummary || "Update slide"}`,
      commands.applyAIOps(activeOps, proposalSlideRef.current?.index ?? (activeSlideIndex >= 0 ? activeSlideIndex : 0))
    );
    setHasAppliedCurrentOps(true);
  }

  function handleRejectOps() {
    setActiveOps(null);
    setHasAppliedCurrentOps(false);
  }

  function handleUndoOps() {
    if (canUndo) {
      undo();
      setHasAppliedCurrentOps(false);
    }
  }

  function handleViewSlide(slideId?: string) {
    const targetId = slideId || selectedSlideId;
    if (targetId) {
      setSelectedSlideId(targetId);
    }
  }

  function handleRetry() {
    if (lastSentPrompt) {
      handleSendMessage(lastSentPrompt);
    }
  }

  return (
    <div className={`fluxa-copilot-panel ${isWide ? "is-wide" : ""}`}>
      {/* 1. Header */}
      <ChatHeader
        onBack={onBack}
        isWide={isWide}
        onToggleWide={onToggleWide}
      />

      {/* Scope Pill Bar */}
      <div className="fluxa-scope-bar">
        <button
          type="button"
          onClick={toggleScope}
          className="fluxa-scope-pill"
          title="Click to cycle scope: Slide -> Selection -> Whole deck"
        >
          <SlidersHorizontal size={11} strokeWidth={1.75} />
          <span>Scope: {scopeLabel}</span>
          <ChevronDown size={11} strokeWidth={1.75} style={{ opacity: 0.6 }} />
        </button>

        <label className="fluxa-scope-pill" title="Apply changes as soon as Copilot replies (each can be undone). Turn off to review each change first.">
          <input type="checkbox" checked={autoApply} onChange={toggleAutoApply} style={{ margin: 0 }} />
          <span>Apply automatically</span>
        </label>
        {/* No provider/vendor name in the product UI (AGENTS.md 6.6). */}
      </div>

      {/* 2 & 3 & 4. Message List, Result Cards & Typing Indicator */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        activeOps={activeOps}
        activeOpsSummary={activeOpsSummary}
        hasAppliedCurrentOps={hasAppliedCurrentOps}
        activeSlideNumber={activeSlideNumber}
        activeSlideId={selectedSlideId || undefined}
        lastError={lastError}
        streamingStatus={streamingStatus}
        onRetry={handleRetry}
        onSelectSuggestion={(sug) => handleSendMessage(sug)}
        onApplyOps={handleApplyOps}
        onRejectOps={handleRejectOps}
        onUndoOps={handleUndoOps}
        onViewSlide={handleViewSlide}
      />

      {/* 5. Input Bar Pinned to Bottom */}
      {/* #11 Co-Author roles: who Copilot acts as for the next requests */}
      <div role="radiogroup" aria-label="Copilot role" className="fluxa-role-row">
        {CO_ROLES.map((r) => (
          <button
            key={r.id || "general"}
            type="button"
            role="radio"
            aria-checked={coRole === r.id}
            title={r.hint}
            className={`fluxa-role-chip${coRole === r.id ? " is-on" : ""}`}
            onClick={() => setCoRole(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <ChatInput
        onSend={(text) => handleSendMessage(text)}
        onStop={handleStop}
        disabled={!aiConfig.configured}
        isStreaming={isStreaming}
        placeholder="Ask me something..."
      />
    </div>
  );
};
