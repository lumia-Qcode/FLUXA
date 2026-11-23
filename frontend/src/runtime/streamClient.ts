/**
 * SSE Stream Client for reading Server-Sent Events over POST with fetch and ReadableStream.
 */

export interface StreamEvent {
  event: string;
  data: any;
}

export interface StreamCallbacks {
  onResearchStart?: (data: { status: string; topic: string }) => void;
  onResearchComplete?: (data: { status: string; citations: any[]; summary?: string; kpi?: any }) => void;
  onOutline?: (outline: any) => void;
  onSlide?: (slideData: { index: number; slide: any; datasets?: any }) => void;
  onProgress?: (progress: { current: number; total: number }) => void;
  onText?: (textData: { delta: string }) => void;
  onOps?: (opsData: { ops: any[]; message: string }) => void;
  onDone?: (doneData: any) => void;
  onError?: (error: Error | string) => void;
}

export async function postStream(
  url: string,
  payload: any,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      let errText = response.statusText;
      try {
        const errJson = await response.json();
        errText = errJson.error || errJson.message || errText;
      } catch {
        // use statusText
      }
      const err = new Error(errText);
      callbacks.onError?.(err);
      throw err;
    }

    if (!response.body) {
      throw new Error("ReadableStream not supported by browser.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep unfinished line in buffer
      buffer = lines.pop() || "";

      let currentEvent = "message";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
          currentEvent = "message";
          continue;
        }

        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          const rawData = line.slice(5).trim();
          let parsedData: any = rawData;
          try {
            parsedData = JSON.parse(rawData);
          } catch {
            // Keep rawData as string
          }

          if (currentEvent === "research_start") {
            callbacks.onResearchStart?.(parsedData);
          } else if (currentEvent === "research_complete") {
            callbacks.onResearchComplete?.(parsedData);
          } else if (currentEvent === "outline") {
            callbacks.onOutline?.(parsedData);
          } else if (currentEvent === "slide") {
            callbacks.onSlide?.(parsedData);
          } else if (currentEvent === "progress") {
            callbacks.onProgress?.(parsedData);
          } else if (currentEvent === "text") {
            callbacks.onText?.(parsedData);
          } else if (currentEvent === "ops") {
            callbacks.onOps?.(parsedData);
          } else if (currentEvent === "done") {
            callbacks.onDone?.(parsedData);
          } else if (currentEvent === "error") {
            callbacks.onError?.(parsedData.error || parsedData);
          }
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted) {
      callbacks.onError?.(new Error("Generation cancelled by user."));
    } else {
      callbacks.onError?.(err);
    }
    throw err;
  }
}
