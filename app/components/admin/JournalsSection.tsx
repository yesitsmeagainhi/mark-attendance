"use client";

import { useEffect, useState } from "react";

type Journal = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  tasks: string;
  todos: string[];
  updatedAt: string;
};

export default function JournalsSection() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/journals?date=${date}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.journals) setJournals(d.journals); else setJournals([]); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [date]);

  const filtered = journals.filter((j) =>
    `${j.employeeName} ${j.employeeId}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <section className="table-card" style={{ marginTop: 22 }}>
      <div className="table-tools">
        <div>
          <h2>Daily Journals</h2>
          <p>{filtered.length} of {journals.length} entries</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee..."
            style={{ padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, width: 160 }}
          />
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
          />
        </div>
      </div>

      <div style={{ padding: "0 20px 20px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>
            {journals.length === 0 ? "No journals for this date." : "No match found."}
          </p>
        ) : (
          <div className="journal-list">
            {filtered.map((j) => {
              const isOpen = expandedId === j.id;
              const initials = j.employeeName.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
              const color = ["#7c3aed", "#2563eb", "#059669", "#db2777", "#ea580c"][j.employeeId.charCodeAt(j.employeeId.length - 1) % 5];
              const time = new Date(j.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

              return (
                <div key={j.id} className={`journal-card ${isOpen ? "open" : ""}`}>
                  <button
                    className="journal-card-header"
                    onClick={() => setExpandedId(isOpen ? null : j.id)}
                  >
                    <span className="person" style={{ background: color, width: 32, height: 32, fontSize: 10 }}>{initials}</span>
                    <span className="journal-card-name">
                      <b>{j.employeeName}</b>
                      <small>{j.employeeId}</small>
                    </span>
                    <span className="journal-card-meta">
                      <small>{time}</small>
                      {j.todos.length > 0 && <span className="journal-todo-badge">{j.todos.length} to-do</span>}
                    </span>
                    <span className="journal-chevron">{isOpen ? "\u25B2" : "\u25BC"}</span>
                  </button>

                  {isOpen && (
                    <div className="journal-card-body">
                      <div className="journal-field">
                        <span className="journal-field-label">Tasks</span>
                        <p className="journal-field-value">{j.tasks}</p>
                      </div>
                      {j.todos.length > 0 && (
                        <div className="journal-field">
                          <span className="journal-field-label">To-do list</span>
                          <ul className="journal-todo-list">
                            {j.todos.map((t, i) => <li key={i}>{t}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
