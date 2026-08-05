"use client";

import { useEffect, useState } from "react";

type LeaveRequest = {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
};

const leaveTypeLabels: Record<string, string> = {
  sick: "Sick Leave",
  casual: "Casual Leave",
  earned: "Earned Leave",
};

export default function LeaveTab() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaveType, setLeaveType] = useState<"sick" | "casual" | "earned">("casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("error");

  function fetchRequests() {
    fetch("/api/leave")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.requests) setRequests(d.requests); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchRequests(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveType, fromDate, toDate, reason }),
      });
      const data = await res.json() as { error?: string; id?: string };
      if (!res.ok) {
        setMessage(data.error || "Could not submit request.");
        setMessageType("error");
        return;
      }
      setMessage("Leave request submitted successfully.");
      setMessageType("success");
      setLeaveType("casual");
      setFromDate("");
      setToDate("");
      setReason("");
      fetchRequests();
    } catch {
      setMessage("Could not connect to server.");
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  // Calculate days between dates
  function dayCount(from: string, to: string): number {
    if (!from || !to) return 0;
    const diff = new Date(to).getTime() - new Date(from).getTime();
    return Math.max(1, Math.floor(diff / 86400000) + 1);
  }

  return (
    <>
      <div className="request-form-card">
        <h3>Apply for Leave</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              <span>Leave Type</span>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as "sick" | "casual" | "earned")}>
                <option value="casual">Casual Leave</option>
                <option value="sick">Sick Leave</option>
                <option value="earned">Earned Leave</option>
              </select>
            </label>
            <label>
              <span>From Date</span>
              <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); if (!toDate || e.target.value > toDate) setToDate(e.target.value); }} required />
            </label>
            <label>
              <span>To Date</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} min={fromDate || undefined} required />
            </label>
            {fromDate && toDate && (
              <label>
                <span>Duration</span>
                <input type="text" value={`${dayCount(fromDate, toDate)} day(s)`} readOnly style={{ background: "#f6f7fb" }} />
              </label>
            )}
          </div>
          <div className="form-grid full" style={{ marginTop: 14 }}>
            <label>
              <span>Reason</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="State the reason for leave (min 5 characters)" required minLength={5} />
            </label>
          </div>
          {message && <p className={`form-message ${messageType === "success" ? "success-text" : ""}`}>{message}</p>}
          <button className="primary" type="submit" disabled={submitting} style={{ marginTop: 14 }}>
            {submitting ? "Submitting..." : "Apply for Leave"}
          </button>
        </form>
      </div>

      <section className="table-card">
        <div className="table-tools">
          <div>
            <h2>Your Leave Requests</h2>
            <p>{requests.length} total</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Admin Note</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 30 }}>Loading...</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No leave requests yet.</td></tr>
              ) : requests.map((r) => (
                <tr key={r.id}>
                  <td><b>{leaveTypeLabels[r.leaveType] || r.leaveType}</b></td>
                  <td>{new Date(r.fromDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td>{new Date(r.toDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td>{dayCount(r.fromDate, r.toDate)}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.reason}</td>
                  <td><span className={`badge-${r.status}`}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></td>
                  <td>{r.adminNote || "\u2014"}</td>
                  <td><small>{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
