import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver;

// Window dimensions default
Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });

// Mock matchMedia for jsdom
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.ResizeObserver = MockResizeObserver;
  window.innerWidth = 1280;
  window.innerHeight = 800;
});
