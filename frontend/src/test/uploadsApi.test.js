import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

afterEach(() => vi.unstubAllGlobals());

describe("upload API calls", () => {
  it("sends files as multipart form data without a JSON content type", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 201, headers: { "Content-Type": "application/json" } })),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const file = new File(["%PDF-1.4"], "guide.pdf", { type: "application/pdf" });
    await api.uploadFiles([file], "brand");
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/uploads");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({});
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get("area")).toBe("brand");
    expect(opts.body.getAll("files")).toHaveLength(1);
  });

  it("asks the server to read a website", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ upload: { id: 1 } }), { status: 201 })));
    vi.stubGlobal("fetch", fetchSpy);
    await api.ingestUrl("https://acme.example/", "brand");
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/uploads/url");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ url: "https://acme.example/", area: "brand" });
  });
});
