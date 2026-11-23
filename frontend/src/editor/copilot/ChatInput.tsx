import React, { useState, useRef, useEffect } from "react";
import { Send, Square, Mic } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  /** Accessible name for the text field. */
  ariaLabel?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onStop,
  disabled = false,
  isStreaming = false,
  placeholder = "Ask me something...",
  ariaLabel = "Ask Copilot",
}) => {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition if supported
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const handleMicClick = () => {
    if (!recognitionRef.current) {
      // If browser doesn't support Web Speech API, toggle state briefly for feedback
      setIsListening((prev) => !prev);
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="fluxa-input-container">
      {/* Pill-shaped capsule input */}
      <div className="fluxa-input-pill">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isStreaming}
          className="fluxa-text-input"
          aria-label={ariaLabel}
        />

        {/* Mic Icon inside pill on right */}
        <button
          type="button"
          onClick={handleMicClick}
          className={`fluxa-mic-button ${isListening ? "is-listening" : ""}`}
          title={isListening ? "Listening... click to stop" : "Use microphone"}
          aria-label="Voice input"
        >
          <Mic size={18} strokeWidth={1.75} />
        </button>
      </div>

      {/* 48px Lime Rounded-Square Send / Stop Button */}
      {isStreaming ? (
        <button
          type="button"
          onClick={onStop}
          className="fluxa-send-button"
          title="Stop response"
          aria-label="Stop response"
        >
          <Square size={16} strokeWidth={1.75} fill="#0B0B10" color="#0B0B10" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="fluxa-send-button"
          title="Send message"
          aria-label="Send message"
        >
          <Send
            size={20}
            strokeWidth={1.75}
            color="#0B0B10"
            style={{ transform: "rotate(45deg) translate(-1px, 1px)" }}
          />
        </button>
      )}
    </div>
  );
};
