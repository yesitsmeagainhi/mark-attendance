"use client";

import { useEffect, useState } from "react";
import type { LeaveRow } from "./types";

const leaveTypeLabels: Record<string, string> = {
  sick: "Sick Leave",
  casual: "Casual Leave",
  earned: "Earned Leave",
};

export default function LeavesTab() {
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  function fetchRequests() {
    fetch("/api/leave")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.requests) setRequests(data.requests); })
      .catch(() => undefined);
  }

  useEffect(() => { fetchRequests(); }, []);

  async function handleReview(requestId: string, action: "approved" | "rejected") {
    setReviewingId(requestId);
    try {
      const res = await fetch("/api/leave/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (res.ok) fetchRequests();
    } catch { /* ignore */ }
    setReviewingId(null);
  }

  const pending = requests.filter((r) => r.status === "pending").length;

  return (
    <section className="table-card">
      <div className="table-tools">
        <div>
          <h2>Leave Requests {pending > 0 && <span className="badge-pending" style={{ marginLeft: 8 }}>{pending} pending</span>}</h2>
          <p>{requests.length} total</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td><b>{r.employeeName}</b><br /><small>{r.employeeId}</small></td>
                <td>{leaveTypeLabels[r.leaveType] || r.leaveType}</td>
                <td>{new Date(r.fromDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                <td>{new Date(r.toDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{r.reason}</td>
                <td><span className={`badge-${r.status}`}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></td>
                <td>
                  {r.status === "pending" ? (
                    <div className="review-actions">
                      <button className="btn-approve" disabled={reviewingId === r.id} onClick={() => handleReview(r.id, "approved")}>Approve</button>
                      <button className="btn-reject" disabled={reviewingId === r.id} onClick={() => handleReview(r.id, "rejected")}>Reject</button>
                    </div>
                  ) : "\u2014"}
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No leave requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
