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

  if (response.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    // Session ended: sign in again, then come back here.
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?next=${next}`);
  }

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
  getJob: (id) => request(`/jobs/${id}`),
  cancelJob: (id) => request(`/jobs/${id}/cancel`, send("POST")),
  // F13 uploads: files are checked and read in a background job (follow it with useJob(upload.jobId)).
  uploadFiles: (files, area = "general") => {
    const form = new FormData();
    form.append("area", area);
    Array.from(files).forEach((f) => form.append("files", f));
    return request("/uploads", { method: "POST", body: form, headers: {} });
  },
  ingestUrl: (url, area = "general") => request("/uploads/url", send("POST", { url, area })),
  listUploads: (area) => request(`/uploads${area ? `?area=${encodeURIComponent(area)}` : ""}`),
  getUpload: (id) => request(`/uploads/${id}`),
  deleteUpload: (id) => request(`/uploads/${id}`, send("DELETE")),
  // F15 consent: speaker consents (voice_translation, voice_clone, transcript_storage, mic_capture).
  listConsents: () => request("/privacy/consents"),
  grantConsent: (purpose, scope) => request("/privacy/consents", send("POST", { purpose, scope, confirm: true })),
  withdrawConsent: (purpose) => request(`/privacy/consents/${purpose}`, send("DELETE")),
  getPrivacySettings: () => request("/privacy/settings"),
  // Topic-matched 3D models from Sketchfab's public library.
  searchModels3d: (q) => request(`/ai/models3d/search?q=${encodeURIComponent(q)}`),
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
