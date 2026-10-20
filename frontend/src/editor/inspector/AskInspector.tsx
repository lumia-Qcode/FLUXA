import React, { useState, useEffect, useRef } from "react";
import { useDocument } from "../store/DocumentContext";
import { commands } from "../store/documentStore";
import { AIOperation } from "../store/opsEngine";
import { postStream } from "../../runtime/streamClient";
import { Button } from "../../ui";
import {
  Send,
  Square,
  Sparkles,
  Check,
  X,
  Undo2,
  AlertCircle,
  Maximize2,
  Minimize2,
} from "lucide-react";

interface AIMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  ops?: AIOperation[];
  applied?: boolean;
}

interface AskInspectorProps {
  isWide?: boolean;
  onToggleWide?: () => void;
}

export const AskInspector: React.FC<AskInspectorProps> = ({ isWide, onToggleWide }) => {
  const {
    doc,
    selectedSlide,
    selectedSlideId,
    selectedBlockIds,
    setSelectedBlockIds,
    execute,
    undo,
    canUndo,
  } = useDocument();

  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeOps, setActiveOps] = useState<AIOperation[] | null>(null);
  const [activeOpsSummary, setActiveOpsSummary] = useState<string>("");
  const [hasAppliedCurrentOps, setHasAppliedCurrentOps] = useState(false);
  const [targetScope, setTargetScope] = useState<"selection" | "slide" | "deck">("slide");
  const [aiConfig, setAiConfig] = useState<{ configured: boolean; message: string }>({
    configured: true,
    message: "",
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeSlideIndex = doc.slides.findIndex((s: any) => s.id === selectedSlideId);
  const selectedBlock = selectedSlide?.blocks.find((b: any) => selectedBlockIds.includes(b.id)) as any;

  // Determine current context chip label
  let contextLabel = "Slide " + ((activeSlideIndex >= 0 ? activeSlideIndex : 0) + 1);
  if (targetScope === "deck") {
    contextLabel = "Whole deck";
  } else if (targetScope === "selection" && selectedBlock) {
    contextLabel = `${selectedBlock.type}: ${selectedBlock.role || selectedBlock.id}`;
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
            setMessages(data.messages);
          }
        }
      } catch {
        // history fetch fail
      }
    }
    fetchHistory();
  }, [doc.id]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isStreaming, activeOps]);

  // Contextual suggestion pills
  const getSuggestions = () => {
    if (selectedBlock?.type === "text") {
      return [
        "Make this shorter",
        "Fix grammar",
        "Expand bullet points",
      ];
    }
    if (selectedBlock?.type === "chart") {
      return [
        "Make this interactive",
        "Add a growth rate slider",
        "Improve chart layout",
      ];
    }
    if (targetScope === "deck") {
      return [
        "Write speaker notes",
        "Check slide consistency",
        "Add summary takeaways",
      ];
    }
    // Default slide scope
    return [
      "Make this slide shorter",
      "Turn these bullets into a timeline",
      "Add a compound-interest calculator",
    ];
  };

  async function handleSendMessage(textToSend?: string) {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming) return;

    setInputMessage("");
    setHasAppliedCurrentOps(false);
    setActiveOps(null);

    // Append user message
    const newMsg: AIMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, newMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let assistantText = "";
    let receivedOps: AIOperation[] = [];

    try {
      await postStream(
        `/api/presentations/${doc.id}/ai/chat`,
        {
          message: text,
          current_slide_id: selectedSlideId,
          current_slide: selectedSlide,
          scope: targetScope,
          stream: true,
        },
        {
          onText: (textData) => {
            assistantText += textData.delta;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content: assistantText }];
              }
              return [...prev, { role: "assistant", content: assistantText }];
            });
          },
          onOps: (opsData) => {
            receivedOps = opsData.ops || [];
            setActiveOps(receivedOps);
            setActiveOpsSummary(opsData.message || assistantText);

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
          },
          onError: (err) => {
            setIsStreaming(false);
            const errStr = typeof err === "string" ? err : err.message;
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Could not process request: ${errStr}`,
              },
            ]);
          },
        },
        controller.signal
      );
    } catch {
      setIsStreaming(false);
    }
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }

  function handleApplyOps() {
    if (!activeOps || activeOps.length === 0) return;
    execute(
      `AI: ${activeOpsSummary || "Update slide"}`,
      commands.applyAIOps(activeOps, activeSlideIndex >= 0 ? activeSlideIndex : 0)
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-panel)",
        color: "var(--ink)",
        fontFamily: "var(--font-sans, sans-serif)",
      }}
    >
      {/* Top Banner if unconfigured */}
      {!aiConfig.configured && (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            background: "var(--bg-app)",
            borderBottom: "1px solid var(--line)",
            fontSize: "12px",
            color: "var(--danger)",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
          }}
        >
          <AlertCircle size={15} style={{ marginTop: "1px", flexShrink: 0 }} />
          <span>{aiConfig.message || "AI is not configured. Add API key in .env."}</span>
        </div>
      )}

      {/* Context Chips Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-app)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "11px", color: "var(--ink-2)", fontWeight: 500 }}>
            Context:
          </span>
          <button
            type="button"
            onClick={() => {
              if (targetScope === "slide" && selectedBlock) {
                setTargetScope("selection");
              } else if (targetScope === "selection") {
                setTargetScope("deck");
              } else {
                setTargetScope("slide");
              }
            }}
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--line)",
              borderRadius: "4px",
              padding: "2px 8px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--signal)",
              cursor: "pointer",
            }}
          >
            {contextLabel}
          </button>
        </div>

        {onToggleWide && (
          <button
            type="button"
            onClick={onToggleWide}
            title={isWide ? "Narrow panel" : "Widen panel"}
            style={{
              background: "none",
              border: "none",
              color: "var(--ink-2)",
              cursor: "pointer",
              padding: "2px",
            }}
          >
            {isWide ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              color: "var(--ink-2)",
              fontSize: "13px",
              textAlign: "center",
              margin: "auto 0",
              lineHeight: 1.5,
              padding: "0 8px",
            }}
          >
            <p style={{ fontWeight: 600, color: "var(--ink)", margin: "0 0 4px" }}>
              FLUXA Assistant
            </p>
            <p style={{ margin: 0, fontSize: "12px" }}>
              Ask to rewrite text, build timelines, generate live charts, or add reactive sliders.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "90%",
              background: msg.role === "user" ? "var(--signal)" : "var(--bg-app)",
              color: msg.role === "user" ? "#FFFFFF" : "var(--ink)",
              borderRadius: "6px",
              padding: "8px 12px",
              fontSize: "13px",
              lineHeight: 1.45,
              wordBreak: "break-word",
            }}
          >
            {msg.content}
          </div>
        ))}

        {/* Change Card */}
        {activeOps && activeOps.length > 0 && (
          <div
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--signal)",
              borderRadius: "6px",
              padding: "12px",
              marginTop: "4px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "8px",
              }}
            >
              <Sparkles size={14} color="var(--signal)" />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>
                Proposed Changes
              </span>
            </div>

            <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--ink-2)" }}>
              {activeOpsSummary || `${activeOps.length} operations prepared`}
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {!hasAppliedCurrentOps ? (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApplyOps}
                    style={{ display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    <Check size={13} />
                    <span>Apply</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRejectOps}
                    style={{ display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    <X size={13} />
                    <span>Reject</span>
                  </Button>
                </>
              ) : (
                <>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--ok, #1B7F4B)",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Check size={13} /> Applied
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleUndoOps}
                    style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}
                  >
                    <Undo2 size={13} />
                    <span>Undo</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Suggestions Pills */}
      <div
        style={{
          padding: "8px 12px 4px",
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          borderTop: "1px solid var(--line)",
        }}
      >
        {getSuggestions().map((sug) => (
          <button
            key={sug}
            type="button"
            onClick={() => handleSendMessage(sug)}
            disabled={isStreaming}
            style={{
              background: "var(--bg-app)",
              border: "1px solid var(--line)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              color: "var(--ink-2)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {sug}
          </button>
        ))}
      </div>

      {/* Composer Input Form */}
      <div
        style={{
          padding: "8px 12px 12px",
          display: "flex",
          gap: "6px",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={inputMessage}
          placeholder="Ask FLUXA..."
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          disabled={isStreaming}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: "13px",
            border: "1px solid var(--line)",
            borderRadius: "4px",
            background: "var(--bg-app)",
            color: "var(--ink)",
            boxSizing: "border-box",
          }}
        />

        {isStreaming ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleStop}
            title="Stop generation"
            style={{ padding: "8px 10px" }}
          >
            <Square size={13} fill="currentColor" />
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim()}
            style={{ padding: "8px 10px" }}
          >
            <Send size={13} />
          </Button>
        )}
      </div>
    </div>
  );
};
