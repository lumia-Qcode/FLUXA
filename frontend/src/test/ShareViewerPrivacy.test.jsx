import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test } from "vitest";
import { ShareViewer } from "../pages/ShareViewer";
import { mockApi } from "./mockApi.js";

const NOTICE = {
  version: 1,
  retentionDays: 14,
  text: "By joining, the name you enter, your poll votes, comments and questions are shared with the presenter. They are kept for 14 days and then deleted.",
};

const DECK = {
  presentation: {
    id: 5,
    title: "Talk",
    theme: { themeId: "midnight" },
    brand: null,
    slides: [{ id: 1, slide_order: 0, title: "Hello", spec: { id: "s1", layout: "title", blocks: [] } }],
  },
};

function handlers(extra = {}) {
  return {
    "GET /api/share/tok": { body: DECK },
    "GET /api/privacy/notice?session_id=sess1": { body: NOTICE },
    "POST /api/live/sessions/sess1/ping": { body: { participants_count: 2, current_slide_index: 0 } },
    ...extra,
  };
}

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={["/share/tok?live=sess1"]}>
      <Routes>
        <Route path="/share/:id" element={<ShareViewer />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => sessionStorage.clear());

test("the join dialog shows the privacy notice and joining sends the notice version", async () => {
  const calls = mockApi(
    handlers({
      "POST /api/live/sessions/sess1/join": {
        status: 201,
        body: { participant_id: "usr_1", session_id: "sess1", name: "Sam", avatar_color: "#fff", role: "viewer" },
      },
    })
  );
  renderViewer();
  expect(await screen.findByTestId("join-privacy-notice")).toHaveTextContent("kept for 14 days");
  await userEvent.type(screen.getByPlaceholderText(/enter your name/i), "Sam");
  await userEvent.click(screen.getByRole("button", { name: "Join Presentation" }));
  await waitFor(() => expect(calls.some((c) => c.url === "/api/live/sessions/sess1/join")).toBe(true));
  const join = calls.find((c) => c.url === "/api/live/sessions/sess1/join");
  expect(join.body).toMatchObject({ name: "Sam", accept_notice: true, notice_version: 1 });
});

test("an attendee can delete their data from the Privacy panel", async () => {
  sessionStorage.setItem("fluxa_participant_id", "usr_1");
  sessionStorage.setItem("fluxa_participant_name", "Sam");
  const calls = mockApi(handlers({ "POST /api/privacy/participant/erase": { body: { deleted: { comments: 1 } } } }));
  renderViewer();
  await userEvent.click(await screen.findByTestId("viewer-privacy"));
  const panel = screen.getByRole("dialog", { name: "Privacy" });
  await waitFor(() => expect(panel).toHaveTextContent("kept for 14 days"));
  await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
  expect(await screen.findByRole("status")).toHaveTextContent("were deleted");
  const erase = calls.find((c) => c.url === "/api/privacy/participant/erase");
  expect(erase.body).toEqual({ session_id: "sess1", participant_id: "usr_1" });
  expect(sessionStorage.getItem("fluxa_participant_id")).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete my data" })).not.toBeInTheDocument();
  // the existing join dialog doesn't pop back up; the attendee can rejoin from the panel
  expect(screen.queryByTestId("join-privacy-notice")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Join again" }));
  expect(await screen.findByTestId("join-privacy-notice")).toBeInTheDocument();
});
