import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import App from "../App.jsx";
import { safeNext } from "../auth/AuthContext";
import { mockApi, SIGNED_IN } from "./mockApi.js";

const SIGNED_OUT = { status: 401, body: { error: "Not signed in.", code: "auth_required" } };

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

test("signed-out visitors to an app page are sent to sign in", async () => {
  mockApi({ "GET /api/auth/me": SIGNED_OUT });
  renderAt("/create");
  expect(await screen.findByRole("heading", { name: "Sign in to FLUXA" })).toBeInTheDocument();
  expect(screen.queryByLabelText(/topic or prompt/i)).not.toBeInTheDocument();
});

test("signing in returns to the page the visitor asked for", async () => {
  const calls = mockApi({
    "GET /api/auth/me": SIGNED_OUT,
    "POST /api/auth/login": SIGNED_IN,
    "GET /api/presentations": { body: { count: 0, presentations: [] } },
  });
  renderAt("/login?next=%2Fcreate");

  await userEvent.type(await screen.findByLabelText("Email"), "tester@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

  // The create page loads on demand (route splitting), so allow it a moment to arrive.
  expect(await screen.findByLabelText(/topic or prompt/i, {}, { timeout: 5000 })).toBeInTheDocument();
  const login = calls.find((c) => c.url === "/api/auth/login");
  expect(login.body).toEqual({ email: "tester@example.com", password: "correct-horse" });
});

test("a failed sign-in shows the server's message", async () => {
  mockApi({
    "GET /api/auth/me": SIGNED_OUT,
    "POST /api/auth/login": { status: 401, body: { error: "Email or password is incorrect." } },
  });
  renderAt("/login");
  await userEvent.type(await screen.findByLabelText("Email"), "x@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "wrong-pass");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
});

test("create account sends name, email and password", async () => {
  const calls = mockApi({
    "GET /api/auth/me": SIGNED_OUT,
    "POST /api/auth/signup": { status: 201, body: SIGNED_IN.body },
    "GET /api/presentations": { body: { count: 0, presentations: [] } },
  });
  renderAt("/login");
  await userEvent.click(await screen.findByRole("tab", { name: "Create account" }));
  await userEvent.type(screen.getByLabelText("Name"), "Ada");
  await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "long-enough");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByRole("banner");
  expect(calls.find((c) => c.url === "/api/auth/signup").body).toEqual({
    email: "ada@example.com",
    password: "long-enough",
    name: "Ada",
  });
});

test("the landing page never calls the private deck API when signed out", async () => {
  const calls = mockApi({ "GET /api/auth/me": SIGNED_OUT });
  renderAt("/");
  await screen.findAllByText(/fluxa/i);
  expect(calls.some((c) => c.url === "/api/presentations")).toBe(false);
});

test("post-login redirects stay on this site", () => {
  expect(safeNext("/presentations/4")).toBe("/presentations/4");
  expect(safeNext("https://evil.example")).toBe("/workspace");
  expect(safeNext("//evil.example")).toBe("/workspace");
  expect(safeNext("/\\evil.example")).toBe("/workspace");
  expect(safeNext(null)).toBe("/workspace");
});
