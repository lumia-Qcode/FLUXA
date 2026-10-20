import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import { PresentationsProvider } from "./PresentationsContext.jsx";
import { ToastProvider } from "./ui";
import { WorkspacePage } from "./pages/WorkspacePage";
import { EditorRoute } from "./editor/EditorRoute";
import { ShareViewer } from "./pages/ShareViewer";
import { PrintRoute } from "./pages/PrintRoute";
import { PresenterPage } from "./pages/PresenterPage";
import CreatePresentation from "./pages/CreatePresentation.jsx";

function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "var(--bg-app, #090A0D)",
        color: "var(--ink, #FFFFFF)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        gap: 16,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Page not found</h1>
      <p style={{ margin: 0, color: "var(--ink-secondary, #9CA3AF)", fontSize: 14 }}>
        The page you are looking for does not exist.
      </p>
      <Link
        to="/"
        style={{
          padding: "8px 16px",
          backgroundColor: "var(--signal, #3B82F6)",
          color: "#FFF",
          borderRadius: "var(--radius-md, 6px)",
          textDecoration: "none",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Back to workspace
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <PresentationsProvider>
        <Routes>
          {/* Workspace screen */}
          <Route index element={<WorkspacePage />} />

          {/* Editor route */}
          <Route path="presentations/:id" element={<EditorRoute />} />

          {/* AI Generator create page */}
          <Route path="create" element={<CreatePresentation />} />

          {/* Full-bleed viewer & print routes */}
          <Route path="v/:id" element={<ShareViewer />} />
          <Route path="print/:id" element={<PrintRoute />} />
          <Route path="presenter/:id" element={<PresenterPage />} />

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </PresentationsProvider>
    </ToastProvider>
  );
}
