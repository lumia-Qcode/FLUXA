import React from "react";

interface BotMessageProps {
  content: string;
  timestamp?: string;
}

export const BotMessage: React.FC<BotMessageProps> = ({ content, timestamp }) => {
  return (
    <div className="fluxa-bot-message-wrapper fluxa-msg-animated">
      <div className="fluxa-bot-bubble">
        {content}
      </div>
      {timestamp && (
        <span className="fluxa-timestamp-bot">
          {timestamp}
        </span>
      )}
    </div>
  );
};
