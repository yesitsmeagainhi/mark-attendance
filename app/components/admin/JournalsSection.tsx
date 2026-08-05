"use client";

import { useEffect, useState } from "react";
import type { EmployeeRow } from "./types";

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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/journals?date=${date}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.journals) setJournals(d.journals); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [date]);

  return (
    <section className="table-card" style={{ marginTop: 22 }}>
      <div className="table-tools">
        <div>
          <h2>Daily Journals</h2>
          <p>{journals.length} entries</p>
        </div>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Employee</th><th>Tasks</th><th>To-do</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: "center", padding: 30 }}>Loading...</td></tr>
            ) : journals.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "#8990a0", padding: 30 }}>No journals for this date.</td></tr>
            ) : journals.map((j) => (
              <tr key={j.id}>
                <td><b>{j.employeeName}</b><br /><small>{j.employeeId}</small></td>
                <td style={{ whiteSpace: "pre-wrap", maxWidth: 300 }}>{j.tasks}</td>
                <td>
                  {j.todos.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
                      {j.todos.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  ) : "\u2014"}
                </td>
                <td><small>{new Date(j.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
