import React from "react";
import { ArrowLeft, Bell, Check, ChevronDown, User } from "lucide-react";

const STEPS = ["Describe", "Outline", "Slides"];

export interface ChipSelect {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  hideOnSmall?: boolean;
}

export interface TopBarProps {
  title: string;
  subtitle?: string;
  step: 1 | 2 | 3;
  onBack: () => void;
  backLabel: string;
  chips?: ChipSelect[];
  action?: React.ReactNode;
  notificationCount?: number;
  userInitials?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  step,
  onBack,
  backLabel,
  chips = [],
  action,
  notificationCount = 0,
  userInitials,
}) => (
  <header className="fx-topbar">
    <div className="fx-topbar-in">
      <button type="button" className="fx-round" onClick={onBack} aria-label={backLabel} title={backLabel}>
        <ArrowLeft size={17} />
      </button>
      <div className="fx-crumb">
        <strong title={title}>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>

      <ol className="fx-steps" aria-label="Progress">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const state = n < step ? "is-done" : n === step ? "is-current" : "";
          return (
            <li key={s} className={state} aria-current={n === step ? "step" : undefined}>
              <span className="fx-step-n" aria-hidden="true">
                {n < step ? <Check size={12} /> : n}
              </span>
              {s}
            </li>
          );
        })}
      </ol>

      <div className="fx-topbar-end">
        {chips.map((c) => (
          <label key={c.label} className={`fx-chip ${c.hideOnSmall ? "fx-hide-sm" : ""}`}>
            <span>{c.label}</span>
            <select value={c.value} onChange={(e) => c.onChange(e.target.value)} disabled={c.disabled} aria-label={c.label}>
              {c.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </label>
        ))}
        {action}
        <button
          type="button"
          className="fx-round fx-hide-sm"
          aria-label={notificationCount > 0 ? `Notifications, ${notificationCount} new` : "Notifications, none new"}
          title="Notifications"
        >
          <Bell size={16} />
          {notificationCount > 0 && <span className="fx-badge">{notificationCount}</span>}
        </button>
        <span className="fx-avatar" role="img" aria-label="Your account">
          {userInitials ? userInitials.slice(0, 2).toUpperCase() : <User size={17} aria-hidden="true" />}
        </span>
      </div>
    </div>
  </header>
);
