import React from "react";
import { ChevronLeft, Maximize2, Minimize2 } from "lucide-react";
import { Avatar } from "./Avatar";

interface ChatHeaderProps {
  onBack?: () => void;
  isWide?: boolean;
  onToggleWide?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onBack,
  isWide,
  onToggleWide,
}) => {
  return (
    <header className="fluxa-copilot-header">
      {/* Left: Back chevron */}
      <div className="fluxa-header-left">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="fluxa-header-btn"
          title="Back"
        >
          <ChevronLeft size={22} strokeWidth={1.75} color="#1D1D1F" />
        </button>
      </div>

      {/* Center: Title + Online Status */}
      <div className="fluxa-header-center">
        <span className="fluxa-header-title">Fluxa Copilot</span>
        <div className="fluxa-header-status">
          <span className="fluxa-online-dot" />
          <span>Online</span>
        </div>
      </div>

      {/* Right: Robot avatar with thin glow ring */}
      <div className="fluxa-header-right">
        {onToggleWide && (
          <button
            type="button"
            onClick={onToggleWide}
            className="fluxa-header-btn"
            title={isWide ? "Collapse width" : "Expand width"}
            aria-label={isWide ? "Collapse width" : "Expand width"}
          >
            {isWide ? (
              <Minimize2 size={16} strokeWidth={1.75} color="#5B5B61" />
            ) : (
              <Maximize2 size={16} strokeWidth={1.75} color="#5B5B61" />
            )}
          </button>
        )}
        <Avatar size={36} withGlow={true} />
      </div>
    </header>
  );
};
