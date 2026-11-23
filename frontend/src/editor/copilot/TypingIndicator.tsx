import React from "react";
import { Avatar } from "./Avatar";

export const TypingIndicator: React.FC = () => {
  return (
    <div className="fluxa-typing-wrapper fluxa-msg-animated" aria-label="Copilot is typing">
      <Avatar size={28} />
      <div className="fluxa-typing-bubble">
        <span className="fluxa-dot fluxa-dot-1 fluxa-dot-animated" />
        <span className="fluxa-dot fluxa-dot-2 fluxa-dot-animated" />
        <span className="fluxa-dot fluxa-dot-3 fluxa-dot-animated" />
      </div>
    </div>
  );
};
