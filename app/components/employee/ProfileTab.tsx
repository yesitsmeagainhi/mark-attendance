"use client";

import { useEffect, useState } from "react";

type Profile = {
  id: string;
  name: string;
  email: string;
  jobRole: string;
  mobileNumber: string;
  workStartTime: string;
  workEndTime: string;
  office: string;
  role: string;
  createdAt: string;
  workShift: string; // Added workShift property
  dateOfBirth: string; // "YYYY-MM-DD", or "" when never set
  profileEditCount: number;
  editsRemaining: number;
};

// Shown once both self-edits are spent; the server sends this exact sentence too.
const noEditsMessage = "You have used both of your profile edits. Please contact Head Office — Pooja Maam.";

// Matches the server default, so the link is never labelled with a blank string.
const defaultFormLabel = "Employee information form";
// Same cap the PATCH endpoint applies, so a longer row can never stretch the card.
const maxFormLabelLength = 80;

// The office-wide link is rendered as a real clickable anchor for all 71 employees,
// so the PATCH rule is repeated here rather than trusted: parse it and demand an
// http(s) protocol. React only neutralises "javascript:"; "data:", "file:",
// "vbscript:", "intent:" and protocol-relative "//evil.com" would otherwise render
// as live links if such a value ever reached the table (a direct DB write, a
// restored backup, a bug in a future endpoint). Anything else returns "" and the
// whole link disappears — no dead button is left behind.
function safeFormUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    // href is the parser's own canonical form, so what renders is exactly what passed.
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export default function ProfileTab({ onSignOut }: { onSignOut: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [formUrl, setFormUrl] = useState("");
  const [formLabel, setFormLabel] = useState(defaultFormLabel);
  const [loading, setLoading] = useState(true);
  const [editingDob, setEditingDob] = useState(false);
  const [dobInput, setDobInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("error");

  function loadProfile() {
    return fetch("/api/employee/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.profile) setProfile(data.profile);
      })
      .catch(() => undefined);
  }

  // The office-wide form link is a nice-to-have; every failure path below just
  // leaves formUrl empty so the profile still renders normally.
  function loadFormLink() {
    return fetch("/api/app-settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const settings: { employeeFormUrl?: unknown; employeeFormLabel?: unknown } = data?.settings ?? {};
        const url = safeFormUrl(settings.employeeFormUrl);
        if (!url) return;
        const label = typeof settings.employeeFormLabel === "string" ? settings.employeeFormLabel.trim() : "";
        setFormUrl(url);
        setFormLabel(label.slice(0, maxFormLabelLength) || defaultFormLabel);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    // The profile alone decides when the screen is ready. The office-wide link is a
    // nice-to-have, so a slow or hanging /api/app-settings must never hold the whole
    // tab on "Loading profile..." — it fills the link in later, or never.
    loadProfile().finally(() => setLoading(false));
    loadFormLink();
  }, []);

  function startEditingDob(current: string) {
    setDobInput(current);
    setMessage("");
    setEditingDob(true);
  }

  function cancelEditingDob() {
    setEditingDob(false);
    setMessage("");
  }

  async function saveDateOfBirth() {
    setMessage("");
    setSaving(true);
    try {
      const res = await fetch("/api/employee/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateOfBirth: dobInput }),
      });
      // A proxy page or an expired-session redirect answers with HTML, not JSON.
      // That must not be read as a network failure, or the 403 branch never runs.
      const data: { error?: string; unchanged?: boolean } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Could not save date of birth.");
        setMessageType("error");
        // Another device may have spent the last edit, so re-read the real count.
        if (res.status === 403) {
          setEditingDob(false);
          await loadProfile();
        }
        return;
      }
      setMessage(data.unchanged ? "Date of birth is already set to that date." : "Date of birth updated.");
      setMessageType("success");
      setEditingDob(false);
      await loadProfile();
    } catch {
      setMessage("Could not connect to server.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="profile-card" style={{ textAlign: "center", padding: 48 }}>Loading profile...</div>;
  if (!profile) return <div className="profile-card" style={{ textAlign: "center", padding: 48 }}>Could not load profile.</div>;

  const initials = profile.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const convertTo12Hour = (timeStr: string) => {
    if (!timeStr) return '';

    let [hours, minutes] = timeStr.trim().split(':');
    let hoursInt = parseInt(hours, 10);

    const ampm = hoursInt >= 12 ? 'PM' : 'AM';
    hoursInt = hoursInt % 12 || 12;

    return `${hoursInt}:${minutes} ${ampm}`;
  };

  // Built from the parts so a "YYYY-MM-DD" birthday never slips a day across time zones.
  const formatDateOfBirth = (value: string) => {
    if (!value) return "Not set";
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
  };

  // Same rule as the birthdays API: "today" is the office's calendar day, not the
  // device's, and not UTC (which is a day behind for the first hours of an IST day).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const earliestDob = "1900-01-01";
  // min/max only mark a typed date invalid; nothing here submits a form, so the
  // range is re-checked before Save may spend one of the two permanent edits.
  const dobOutOfRange = Boolean(dobInput) && (dobInput > today || dobInput < earliestDob);
  const editsRemaining = profile.editsRemaining;
  const saveDisabled = saving || !dobInput || dobOutOfRange || dobInput === profile.dateOfBirth;

  return (
    <div className="profile-card">
      <div className="profile-avatar">{initials}</div>
      <div className="profile-name">
        <h2>{profile.name}</h2>
        <p>{profile.jobRole || profile.role === "admin" ? "Administrator" : "Employee"}</p>
      </div>
      <dl className="profile-grid">
        <div className="profile-field">
          <dt>Employee ID</dt>
          <dd>{profile.id}</dd>
        </div>
        <div className="profile-field">
          <dt>Email Address</dt>
          <dd>{profile.email}</dd>
        </div>
        <div className="profile-field">
          <dt>Mobile Number</dt>
          <dd>{profile.mobileNumber || "\u2014"}</dd>
        </div>
        <div className="profile-field">
          <dt>Job Role</dt>
          <dd>{profile.jobRole || "HR/Manager"}</dd>
        </div>
        <div className="profile-field">
          <dt>Office Location</dt>
          <dd>{profile.office}</dd>
        </div>
        <div className="profile-field">
          <dt>Work Shift</dt>
          <dd>
            {profile.workStartTime && profile.workEndTime
              ? `${convertTo12Hour(profile.workStartTime)} | ${convertTo12Hour(profile.workEndTime)}`
              : 'No shift assigned'}
          </dd>
        </div>

        <div className="profile-field" style={{ gridColumn: "1 / -1" }}>
          <dt>Date of Birth</dt>
          <dd>
            {editingDob ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <input
                    type="date"
                    value={dobInput}
                    min={earliestDob}
                    max={today}
                    aria-label="Date of birth"
                    onChange={(e) => setDobInput(e.target.value)}
                    style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff", outline: "none" }}
                  />
                  <button
                    className="primary"
                    type="button"
                    onClick={saveDateOfBirth}
                    disabled={saveDisabled}
                    style={{ width: "auto", padding: "10px 18px", fontSize: 13, ...(saveDisabled ? { background: "var(--line)", color: "var(--muted)" } : null) }}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={cancelEditingDob}
                    disabled={saving}
                    style={{ width: "auto", padding: "10px 18px", fontSize: 13, opacity: saving ? .6 : 1 }}
                  >
                    Cancel
                  </button>
                </div>
                {dobOutOfRange && (
                  <p className="form-message" style={{ textAlign: "left", margin: "6px 0 0", fontWeight: 400 }}>Enter a real date of birth on or before today.</p>
                )}
              </>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <span>{formatDateOfBirth(profile.dateOfBirth)}</span>
                {editsRemaining > 0 && (
                  <button className="secondary" type="button" onClick={() => startEditingDob(profile.dateOfBirth)} style={{ width: "auto", padding: "8px 14px", fontSize: 12 }}>
                    Edit
                  </button>
                )}
              </div>
            )}
            {editsRemaining > 0 ? (
              <p style={{ margin: "8px 0 0", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
                You can change this {editsRemaining} more {editsRemaining === 1 ? "time" : "times"}.
              </p>
            ) : (
              <p style={{ margin: "8px 0 0", fontSize: 11, fontWeight: 400, color: "#c73333" }}>{noEditsMessage}</p>
            )}
            {/* Hide the server's refusal only while the standing red notice above is
                actually on screen, so a failed refresh still leaves the user told. */}
            {message && (editsRemaining > 0 || message !== noEditsMessage) && (
              <p className={`form-message ${messageType === "success" ? "success-text" : ""}`} style={{ textAlign: "left", margin: "6px 0 0", fontWeight: 400 }}>{message}</p>
            )}
          </dd>
        </div>

        <div className="profile-field">
          <dt>Date Joined</dt>
          <dd>
            {/* This fixes your Date Joined back to a valid date format */}
            {new Date(profile.createdAt).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "long",
              year: "numeric"
            })}
          </dd>
          {/* <dd>{new Date(profile.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", hour12: true })}</dd> */}
        </div>
        <div className="profile-field">
          <dt>Role</dt>
          <dd>{profile.role === "admin" ? "Administrator" : "Employee"}</dd>
        </div>
      </dl>
      {/* Nothing at all is shown here until Head Office sets the link. */}
      {formUrl && (
        <a className="primary login-link" href={formUrl} target="_blank" rel="noopener noreferrer">
          {formLabel}
        </a>
      )}
      <button className="signout" onClick={onSignOut} style={{ marginTop: 24, width: "100%" }}>Sign out</button>
    </div>
  );
}
