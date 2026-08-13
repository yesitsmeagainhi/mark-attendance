"use client";

import { useEffect, useState } from "react";

type Activity = {
  id: string;
  actionType: string;
  performedBy: string;
  performedByName: string;
  targetId: string | null;
  targetName: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
};

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  admin_login:        { label: "Admin Login",       color: "#2563eb", icon: "\u{1F511}" },
  employee_login:     { label: "Employee Login",    color: "#3b82f6", icon: "\u{1F464}" },
  mark_present:       { label: "Marked Present",    color: "#059669", icon: "\u2714" },
  mark_absent:        { label: "Marked Absent",     color: "#dc2626", icon: "\u2716" },
  mark_uh:            { label: "Marked UH",         color: "#7c3aed", icon: "\u{1F6AB}" },
  mark_all_present:   { label: "Mark All Present",  color: "#059669", icon: "\u2714\u2714" },
  mark_all_uh:        { label: "Mark All UH",       color: "#7c3aed", icon: "\u{1F6AB}" },
  undo_mark:          { label: "Undo Mark",         color: "#ea580c", icon: "\u21A9" },
  leave_request:      { label: "Leave Request",     color: "#0891b2", icon: "\u{1F4CB}" },
  leave_approved:     { label: "Leave Approved",    color: "#059669", icon: "\u2705" },
  leave_rejected:     { label: "Leave Rejected",    color: "#dc2626", icon: "\u274C" },
  misspunch_request:  { label: "Miss Punch Request",color: "#d97706", icon: "\u23F0" },
  misspunch_approved: { label: "Miss Punch Approved",color: "#059669",icon: "\u2705" },
  misspunch_rejected: { label: "Miss Punch Rejected",color: "#dc2626",icon: "\u274C" },
};

const FILTER_GROUPS = [
  { label: "All Activities", value: "" },
  { label: "Logins", value: "admin_login,employee_login" },
  { label: "Attendance", value: "mark_present,mark_absent,mark_uh,mark_all_present,mark_all_uh,undo_mark" },
  { label: "Leave", value: "leave_request,leave_approved,leave_rejected" },
  { label: "Miss Punch", value: "misspunch_request,misspunch_approved,misspunch_rejected" },
];

function timeAgo(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function HistoryTab() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "30" });
    if (actionFilter) params.set("actionType", actionFilter);
    if (search) params.set("search", search);

    fetch(`/api/admin/activity-log?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setActivities(data.activities);
          setTotalPages(data.pages);
          setTotal(data.total);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [page, actionFilter, search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [actionFilter, search]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <>
      {/* Filter bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 200 }}>
          {FILTER_GROUPS.map((fg) => (
            <button
              key={fg.value}
              onClick={() => setActionFilter(fg.value)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: actionFilter === fg.value ? "2px solid #7c3aed" : "1px solid #e2e4ea",
                background: actionFilter === fg.value ? "#f3f0ff" : "#fff",
                color: actionFilter === fg.value ? "#7c3aed" : "#555",
                fontWeight: actionFilter === fg.value ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                transition: "all .15s",
              }}
            >
              {fg.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            placeholder="Search activities..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              padding: "8px 14px",
              border: "1px solid #e2e4ea",
              borderRadius: 10,
              fontSize: 13,
              width: 200,
              background: "#fff",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #e2e4ea",
              background: "#f9fafb",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>
      </div>

      {/* Activity feed */}
      <section className="table-card">
        <div className="table-tools">
          <div><h2>Activity Log</h2><p>{total} activities</p></div>
        </div>

        <div style={{ padding: "0 20px 20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "#8990a0", padding: 40 }}>Loading activities...</div>
          ) : activities.length === 0 ? (
            <div style={{ textAlign: "center", color: "#8990a0", padding: 40 }}>No activities found.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {activities.map((a, i) => {
                const cfg = ACTION_CONFIG[a.actionType] || { label: a.actionType, color: "#666", icon: "\u{1F4CC}" };
                const initials = a.performedByName.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      gap: 14,
                      padding: "14px 0",
                      borderBottom: i < activities.length - 1 ? "1px solid #f0f1f3" : "none",
                      alignItems: "flex-start",
                    }}
                  >
                    {/* Icon */}
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: cfg.color + "14",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        flexShrink: 0,
                      }}
                    >
                      {cfg.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: cfg.color,
                            background: cfg.color + "14",
                            padding: "2px 8px",
                            borderRadius: 6,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {cfg.label}
                        </span>
                        <span
                          style={{ fontSize: 12, color: "#8990a0" }}
                          title={new Date(a.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        >
                          {timeAgo(a.timestamp)}
                        </span>
                      </div>

                      <p style={{ margin: "4px 0 0", fontSize: 14, color: "#1a1d26", lineHeight: 1.5 }}>
                        {a.description}
                      </p>

                      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12, color: "#8990a0" }}>
                        <span>by <b style={{ color: "#555" }}>{a.performedByName}</b></span>
                        {a.targetName && <span>&#x2192; <b style={{ color: "#555" }}>{a.targetName}</b></span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 20 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid #e2e4ea",
                  background: page <= 1 ? "#f9fafb" : "#fff",
                  color: page <= 1 ? "#c9cbd4" : "#333",
                  fontSize: 13,
                  cursor: page <= 1 ? "default" : "pointer",
                }}
              >
                Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: page === pageNum ? "2px solid #7c3aed" : "1px solid #e2e4ea",
                      background: page === pageNum ? "#f3f0ff" : "#fff",
                      color: page === pageNum ? "#7c3aed" : "#333",
                      fontWeight: page === pageNum ? 700 : 400,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid #e2e4ea",
                  background: page >= totalPages ? "#f9fafb" : "#fff",
                  color: page >= totalPages ? "#c9cbd4" : "#333",
                  fontSize: 13,
                  cursor: page >= totalPages ? "default" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
