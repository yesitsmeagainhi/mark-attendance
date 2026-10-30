"use client";

import { useEffect, useState } from "react";

type Delivery = { status: string; detail: string; link?: string };
type BackupStatus = {
  at: string;
  ok: boolean;
  trigger: "scheduled" | "manual";
  fileName?: string;
  sizeBytes?: number;
  photoCount?: number;
  email: Delivery;
  drive: Delivery;
  error?: string;
};
type BackupInfo = { config: { emailConfigured: boolean; emailTo: string; driveConfigured: boolean }; last: BackupStatus | null };

function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const deliveryStyle: Record<string, string> = { sent: "", uploaded: "", skipped: "late", failed: "absent" };

export default function BackupSection() {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  function fetchInfo() {
    fetch("/api/admin/backup")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setInfo(d); })
      .catch(() => undefined);
  }

  useEffect(() => { fetchInfo(); }, []);

  async function runNow() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (data.error) setError(data.error);
      fetchInfo();
    } catch {
      setError("Could not connect to server.");
    } finally {
      setRunning(false);
    }
  }

  const last = info?.last;

  return (
    <section className="table-card" style={{ marginTop: 24 }}>
      <div className="table-tools">
        <div>
          <h2>Automatic backups</h2>
          <p>Weekly, Sunday 11:00 PM IST. Each backup has the full database, an Excel file of every table, and all photos.</p>
        </div>
        <div className="filters">
          <button className="primary" style={{ fontSize: 15, padding: "6px 14px" }} onClick={runNow} disabled={running}>
            {running ? "Backing up..." : "Back up now"}
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <tbody>
            <tr>
              <td><b>Email</b></td>
              <td>
                {info?.config.emailConfigured
                  ? <span className="status">&#9679; Sends to {info.config.emailTo}</span>
                  : <span className="status late">&#9679; Not set up (SMTP settings missing in .env on the server)</span>}
              </td>
            </tr>
            <tr>
              <td><b>Google Drive</b></td>
              <td>
                {info?.config.driveConfigured
                  ? <span className="status">&#9679; Uploads to the &quot;Attendly Backups&quot; folder</span>
                  : <span className="status late">&#9679; Not set up (Google settings missing in .env on the server)</span>}
              </td>
            </tr>
            <tr>
              <td><b>Last backup</b></td>
              <td>
                {!last ? (
                  <span style={{ color: "#8990a0" }}>No backup has run yet.</span>
                ) : (
                  <>
                    <span className={`status ${last.ok ? "" : "absent"}`}>&#9679; {last.ok ? "Successful" : "Problem"}</span>{" "}
                    {new Date(last.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {" "}({last.trigger === "manual" ? "manual" : "scheduled"})
                    {last.fileName && <small style={{ display: "block", color: "#667085" }}>{last.fileName} &middot; {formatBytes(last.sizeBytes || 0)} &middot; {last.photoCount} photos</small>}
                    {last.error && <small style={{ display: "block", color: "#c73333" }}>{last.error}</small>}
                    {!last.error && (["email", "drive"] as const).map((k) => (
                      <small key={k} style={{ display: "block", marginTop: 2 }}>
                        <span className={`status ${deliveryStyle[last[k].status] ?? ""}`}>{k === "email" ? "Email" : "Drive"}: {last[k].status}</span>{" "}
                        <span style={{ color: "#667085" }}>{last[k].detail}</span>
                        {last[k].link && <> <a href={last[k].link} target="_blank" rel="noreferrer">Open</a></>}
                      </small>
                    ))}
                  </>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {error && <p className="form-message" style={{ padding: "0 20px 16px" }}>{error}</p>}
    </section>
  );
}
