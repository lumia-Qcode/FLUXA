async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

const send = (method, body) => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  listPresentations: () => request("/presentations"),
  getPresentation: (id) => request(`/presentations/${id}`),
  createPresentation: (body) => request("/presentations", send("POST", body)),
  updatePresentation: (id, body) => request(`/presentations/${id}`, send("PUT", body)),
  deletePresentation: (id) => request(`/presentations/${id}`, send("DELETE")),
  duplicatePresentation: (id) => request(`/presentations/${id}/duplicate`, send("POST")),
  generateOutline: (body) => request("/presentations/generate/outline", send("POST", body)),
  generatePresentation: (body) => request("/presentations/generate", send("POST", body)),
  addSlide: (pid, body) => request(`/presentations/${pid}/slides`, send("POST", body)),
  updateSlide: (pid, sid, body) =>
    request(`/presentations/${pid}/slides/${sid}`, send("PUT", body)),
  deleteSlide: (pid, sid) => request(`/presentations/${pid}/slides/${sid}`, send("DELETE")),
  duplicateSlide: (pid, sid) => request(`/presentations/${pid}/slides/${sid}/duplicate`, send("POST")),
  reorderSlides: (pid, slideIds) => request(`/presentations/${pid}/slides/reorder`, send("POST", { slide_ids: slideIds })),
  copilot: (pid, body) => request(`/presentations/${pid}/copilot`, send("POST", body)),
  aiEnhanceSlide: (pid, sid, body) =>
    request(`/presentations/${pid}/slides/${sid}/ai-enhance`, send("POST", body)),
};
