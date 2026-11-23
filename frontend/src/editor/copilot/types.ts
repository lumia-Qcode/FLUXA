import { AIOperation } from "../store/opsEngine";

export interface CopilotMessage {
  id?: number | string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  ops?: AIOperation[];
  applied?: boolean;
  slideId?: string;
  slideTitle?: string;
  isError?: boolean;
}

export type CopilotScope = "selection" | "slide" | "deck";
