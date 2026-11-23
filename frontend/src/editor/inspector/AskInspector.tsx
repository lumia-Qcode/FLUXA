import React from "react";
import { CopilotPanel } from "../copilot/CopilotPanel";

export interface AskInspectorProps {
  isWide?: boolean;
  onToggleWide?: () => void;
  onBack?: () => void;
}

export const AskInspector: React.FC<AskInspectorProps> = ({
  isWide,
  onToggleWide,
  onBack,
}) => {
  return (
    <CopilotPanel
      isWide={isWide}
      onToggleWide={onToggleWide}
      onBack={onBack}
    />
  );
};

export default AskInspector;
