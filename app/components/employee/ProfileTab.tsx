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
};

export default function ProfileTab() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employee/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.profile) setProfile(data.profile);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="profile-card" style={{ textAlign: "center", padding: 48 }}>Loading profile...</div>;
  if (!profile) return <div className="profile-card" style={{ textAlign: "center", padding: 48 }}>Could not load profile.</div>;

  const initials = profile.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

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
          <dd>{profile.workStartTime} | {profile.workEndTime}</dd>
        </div>
        <div className="profile-field">
          <dt>Date Joined</dt>
          <dd>{new Date(profile.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</dd>
        </div>
        <div className="profile-field">
          <dt>Role</dt>
          <dd>{profile.role === "admin" ? "Administrator" : "Employee"}</dd>
        </div>
      </dl>
    </div>
  );
}
