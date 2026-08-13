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
};

export default function ProfileTab({ onSignOut }: { onSignOut: () => void }) {
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
  const convertTo12Hour = (timeStr: string) => {
    if (!timeStr) return '';

    let [hours, minutes] = timeStr.trim().split(':');
    let hoursInt = parseInt(hours, 10);

    const ampm = hoursInt >= 12 ? 'PM' : 'AM';
    hoursInt = hoursInt % 12 || 12;

    return `${hoursInt}:${minutes} ${ampm}`;
  };


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
      <button className="signout" onClick={onSignOut} style={{ marginTop: 24, width: "100%" }}>Sign out</button>
    </div>
  );
}
