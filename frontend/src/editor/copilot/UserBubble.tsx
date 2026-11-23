import React from "react";

interface UserBubbleProps {
  content: string;
  timestamp?: string;
}

export const UserBubble: React.FC<UserBubbleProps> = ({ content, timestamp }) => {
  return (
    <div className="fluxa-user-bubble-wrapper fluxa-msg-animated">
      <div className="fluxa-user-bubble">
        {content}
      </div>
      {timestamp && (
        <span className="fluxa-timestamp-user">
          {timestamp}
        </span>
      )}
    </div>
  );
};
