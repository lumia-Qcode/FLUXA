import React, { useEffect, useId, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { safeNext, useAuth } from "../auth/AuthContext";
import "./signin.css";

type Mode = "signin" | "signup";

interface InviteInfo {
  org: string;
  role: string;
  email: string | null;
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin", brand_manager: "Brand manager", employee: "Employee" };

// Same FLUXA wordmark path and gradient as the landing page.
const WORDMARK =
  "M37 163V37H230M37 100H205M320 37V163H540M610 37V110Q610 163 663 163H827Q880 163 880 110V37M950 37L1180 163M1180 37L950 163M1250 163V100Q1250 37 1313 37H1387Q1450 37 1450 100V163M1250 105H1450";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

const Input: React.FC<InputProps> = ({ label, hint, ...props }) => {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="si-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hint ? hintId : undefined} {...props} />
      {hint && (
        <span id={hintId} className="si-hint">
          {hint}
        </span>
      )}
    </div>
  );
};

export const SignInPage: React.FC = () => {
  const { account, loading, setAccount } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteToken = params.get("invite") || "";
  const next = safeNext(params.get("next"));

  const [mode, setMode] = useState<Mode>(inviteToken ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<InviteInfo | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/auth/invites/${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "This invite link is invalid or has expired.");
        setInvite(data);
        if (data.email) setEmail(data.email);
      })
      .catch((e: Error) => setError(e.message));
  }, [inviteToken]);

  if (!loading && account) return <Navigate to={next} replace />;

  const isSignup = mode === "signup";

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const path = isSignup ? "/api/auth/signup" : "/api/auth/login";
      const body = isSignup
        ? { email, password, name, ...(inviteToken ? { invite: inviteToken } : {}) }
        : { email, password };
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setAccount(data);
      navigate(next, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot reach the server. Is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="si">
      <header className="si-top">
        <button type="button" className="si-logo" onClick={() => navigate("/")}>
          FLUXA
        </button>
        <button type="button" className="si-home" onClick={() => navigate("/")}>
          Back to home
        </button>
      </header>

      <main className="si-main">
        <div className="si-wrap">
          <svg className="si-word" viewBox="0 0 1490 200" aria-hidden="true">
            <defs>
              <linearGradient id="si-wg" gradientUnits="userSpaceOnUse" x1="0" x2="1490" y1="0" y2="0">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset=".4" stopColor="#dfe5ff" />
                <stop offset="1" stopColor="#8aa0ff" />
              </linearGradient>
            </defs>
            <path d={WORDMARK} fill="none" stroke="url(#si-wg)" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          <div className="si-card">
            <h1>{isSignup ? "Create your FLUXA account" : "Sign in to FLUXA"}</h1>
            <p className="si-sub">
              {invite
                ? `You've been invited to join ${invite.org} as ${ROLE_LABEL[invite.role] || invite.role}.`
                : isSignup
                  ? "Your decks, brands and team live in your organisation."
                  : "Welcome back. Sign in to open your decks."}
            </p>

            {!inviteToken && (
              <div className="si-tabs" role="tablist" aria-label="Account">
                <button type="button" role="tab" aria-selected={!isSignup} onClick={() => switchMode("signin")}>
                  Sign in
                </button>
                <button type="button" role="tab" aria-selected={isSignup} onClick={() => switchMode("signup")}>
                  Create account
                </button>
              </div>
            )}

            <form className="si-form" onSubmit={handleSubmit}>
              {error && (
                <div role="alert" className="si-error">
                  {error}
                </div>
              )}
              {isSignup && (
                <Input
                  label="Name"
                  autoComplete="name"
                  value={name}
                  maxLength={120}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                value={email}
                disabled={busy || Boolean(invite?.email)}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label="Password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
                minLength={isSignup ? 8 : undefined}
                hint={isSignup ? "At least 8 characters." : undefined}
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" className="si-submit" disabled={busy}>
                {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
              </button>
            </form>
          </div>

          {!inviteToken && (
            <p className="si-foot">
              {isSignup ? "Already have an account? " : "New to FLUXA? "}
              <button type="button" onClick={() => switchMode(isSignup ? "signin" : "signup")}>
                {isSignup ? "Sign in" : "Create an account"}
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
};
