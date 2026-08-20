"use client";

import { useEffect, useState } from "react";
import type { MissPunchRow } from "./types";

export default function RequestsTab() {
  const [requests, setRequests] = useState<MissPunchRow[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  function fetchRequests() {
    fetch("/api/miss-punch")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.requests) setRequests(data.requests); })
      .catch(() => undefined);
  }

  useEffect(() => { fetchRequests(); }, []);

  async function handleReview(requestId: string, action: "approved" | "rejected") {
    setReviewingId(requestId);
    try {
      const res = await fetch("/api/miss-punch/review", {
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
          <h2>Miss Punch Requests {pending > 0 && <span className="badge-pending" style={{ marginLeft: 8 }}>{pending} pending</span>}</h2>
          <p>{requests.length} total</p>
        </div>
        <div className="attendance-filters">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee or ID"
            aria-label="Search requests"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Date</th><th>Type</th><th>Time</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {requests.filter((r) => {
              if (statusFilter !== "all" && r.status !== statusFilter) return false;
              if (!search.trim()) return true;
              const q = search.trim().toLowerCase();
              return `${r.employeeName} ${r.employeeId}`.toLowerCase().includes(q);
            }).map((r) => (
              <tr key={r.id}>
                <td><b>{r.employeeName}</b><br /><small>{r.employeeId}</small></td>
                <td>{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                <td>{r.punchType}</td>
                <td>{r.requestedTime}</td>
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
            {requests.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No miss punch requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
