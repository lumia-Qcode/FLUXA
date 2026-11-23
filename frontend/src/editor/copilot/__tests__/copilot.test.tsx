import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatHeader } from "../ChatHeader";
import { UserBubble } from "../UserBubble";
import { BotMessage } from "../BotMessage";
import { ResultCard } from "../ResultCard";
import { TypingIndicator } from "../TypingIndicator";
import { ChatInput } from "../ChatInput";
import { MessageList } from "../MessageList";

describe("Fluxa Copilot UI Components", () => {
  it("renders ChatHeader with title, online status, and avatar", () => {
    const handleBack = vi.fn();
    render(<ChatHeader onBack={handleBack} />);

    expect(screen.getByText("Fluxa Copilot")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();

    const backButton = screen.getByLabelText("Back");
    expect(backButton).toBeInTheDocument();
    fireEvent.click(backButton);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("renders UserBubble with content and timestamp", () => {
    render(
      <UserBubble
        content="Do you have any tips for designing a great user interface?"
        timestamp="11:32 AM"
      />
    );

    expect(
      screen.getByText("Do you have any tips for designing a great user interface?")
    ).toBeInTheDocument();
    expect(screen.getByText("11:32 AM")).toBeInTheDocument();
  });

  it("renders BotMessage with dark bubble and timestamp", () => {
    render(<BotMessage content="Here is a recommended approach for the deck." timestamp="11:33 AM" />);

    expect(screen.getByText("Here is a recommended approach for the deck.")).toBeInTheDocument();
    expect(screen.getByText("11:33 AM")).toBeInTheDocument();
  });

  it("renders ResultCard with lavender header, title, summary, and lime links", () => {
    const handleViewSlide = vi.fn();
    const handleUndo = vi.fn();

    render(
      <ResultCard
        title="Slide 3 updated"
        summary="Refined chart layout and added interactive sliders."
        slideNumber={3}
        applied={true}
        timestamp="11:34 AM"
        onViewSlide={handleViewSlide}
        onUndo={handleUndo}
      />
    );

    expect(screen.getByText("Slide 3 updated")).toBeInTheDocument();
    expect(screen.getByText("Refined chart layout and added interactive sliders.")).toBeInTheDocument();
    expect(screen.getByText("SLIDE 3")).toBeInTheDocument();

    const viewBtn = screen.getByText("View slide");
    const undoBtn = screen.getByText("Undo");
    expect(viewBtn).toBeInTheDocument();
    expect(undoBtn).toBeInTheDocument();

    fireEvent.click(viewBtn);
    expect(handleViewSlide).toHaveBeenCalledTimes(1);

    fireEvent.click(undoBtn);
    expect(handleUndo).toHaveBeenCalledTimes(1);
  });

  it("renders TypingIndicator with 3 dots", () => {
    const { container } = render(<TypingIndicator />);
    expect(screen.getByLabelText("Copilot is typing")).toBeInTheDocument();
    const dots = container.querySelectorAll(".fluxa-dot");
    expect(dots.length).toBe(3);
  });

  it("renders ChatInput with mic and lime send button", () => {
    const handleSend = vi.fn();
    render(<ChatInput onSend={handleSend} placeholder="Ask me something..." />);

    const input = screen.getByPlaceholderText("Ask me something...");
    expect(input).toBeInTheDocument();
    expect(screen.getByLabelText("Voice input")).toBeInTheDocument();

    const sendBtn = screen.getByLabelText("Send message");
    expect(sendBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "Make slide 2 more visual" } });
    expect(sendBtn).not.toBeDisabled();

    fireEvent.click(sendBtn);
    expect(handleSend).toHaveBeenCalledWith("Make slide 2 more visual");
  });

  it("renders MessageList empty state with 3 suggestion chips", () => {
    const handleSelect = vi.fn();
    render(
      <MessageList
        messages={[]}
        isStreaming={false}
        activeOps={null}
        onSelectSuggestion={handleSelect}
      />
    );

    expect(screen.getByText("Make slide 2 more visual")).toBeInTheDocument();
    expect(screen.getByText("Add a slider to the chart")).toBeInTheDocument();
    expect(screen.getByText("Translate deck to Roman Urdu")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Make slide 2 more visual"));
    expect(handleSelect).toHaveBeenCalledWith("Make slide 2 more visual");
  });

  it("renders error card with retry button in MessageList", () => {
    const handleRetry = vi.fn();
    render(
      <MessageList
        messages={[]}
        isStreaming={false}
        activeOps={null}
        lastError="API connection timed out"
        onRetry={handleRetry}
        onSelectSuggestion={vi.fn()}
      />
    );

    expect(screen.getByText("Unable to complete request")).toBeInTheDocument();
    expect(screen.getByText("API connection timed out")).toBeInTheDocument();

    const retryBtn = screen.getByText("Retry");
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});
