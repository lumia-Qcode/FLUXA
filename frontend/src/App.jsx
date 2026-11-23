import React, { Suspense, lazy } from "react";
import { Routes, Route, Link } from "react-router-dom";
import { PresentationsProvider } from "./PresentationsContext.jsx";
import { ToastProvider } from "./ui";
import { BrandLandingPage } from "./pages/BrandLandingPage";
import { AuthProvider, RequireAuth } from "./auth/AuthContext";
// Sign-in stays in the main chunk (~3 KB): every signed-out visit lands there first.
import { SignInPage } from "./pages/SignInPage";

// Every page except the landing page loads on demand (D3), so visiting one page no longer
// downloads the editor, exporters, 3D and charts for all of them.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const WorkspacePage = named(() => import("./pages/WorkspacePage"), "WorkspacePage");
const EditorRoute = named(() => import("./editor/EditorRoute"), "EditorRoute");
const ShareViewer = named(() => import("./pages/ShareViewer"), "ShareViewer");
const PrintRoute = named(() => import("./pages/PrintRoute"), "PrintRoute");
const BrandsPage = named(() => import("./pages/BrandsPage"), "BrandsPage");
const PresenterPage = named(() => import("./pages/PresenterPage"), "PresenterPage");
const CreatePresentation = lazy(() => import("./pages/CreatePresentation.jsx"));
const MemoryMapPage = named(() => import("./pages/MemoryMapPage"), "MemoryMapPage");
const WatchPage = named(() => import("./pages/WatchPage"), "WatchPage");

/** Shown for the moment a page's code is loading: the app background, no spinner flash. */
function PageLoading() {
  return <div aria-busy="true" style={{ minHeight: "100vh", backgroundColor: "var(--bg-app, #090A0D)" }} />;
}

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
        Back to home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
      <PresentationsProvider>
        <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* 1. Extraordinary Brand Landing Page */}
          <Route index element={<BrandLandingPage />} />

          {/* 2. "What are you presenting?" Workspace Page */}
          <Route path="workspace" element={<RequireAuth><WorkspacePage /></RequireAuth>} />
          <Route path="ai" element={<RequireAuth><WorkspacePage /></RequireAuth>} />

          {/* 3. Editor route (Page 2 Overview & Page 3 Slide Editor) */}
          <Route path="presentations/:id" element={<RequireAuth><EditorRoute /></RequireAuth>} />

          {/* AI Generator create page */}
          <Route path="create" element={<RequireAuth><CreatePresentation /></RequireAuth>} />
          <Route path="brands" element={<RequireAuth><BrandsPage /></RequireAuth>} />

          {/* Full-bleed viewer & print routes */}
          <Route path="v/:id" element={<ShareViewer />} />
          <Route path="print/:id" element={<RequireAuth><PrintRoute /></RequireAuth>} />
          <Route path="presenter/:id" element={<RequireAuth><PresenterPage /></RequireAuth>} />
          <Route path="map/:id" element={<RequireAuth><MemoryMapPage /></RequireAuth>} />
          <Route path="watch/:id" element={<RequireAuth><WatchPage /></RequireAuth>} />

          {/* Sign in / create account (public) */}
          <Route path="login" element={<SignInPage />} />

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </PresentationsProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
