"use client";

import { useEffect, useState } from "react";
import { formatTimeIST } from "../../../lib/time-utils";

type DayData = {
  date: string;
  dayOfWeek: number;
  status: string;
  punchIn: string | null;
  punchOut: string | null;
  duration: number | null;
};

type TimesheetData = {
  month: string;
  days: DayData[];
  totalHoursWorked: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  uhDays: number;
};

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function TimesheetTab() {
  const now = new Date();
  const today = new Date().toISOString().slice(0, 10);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<TimesheetData | null>(null);
  const [loading, setLoading] = useState(true);

  // Journal state
  const [journalDate, setJournalDate] = useState(today);
  const [tasks, setTasks] = useState("");
  const [todos, setTodos] = useState<string[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalMsg, setJournalMsg] = useState("");

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/attendance/timesheet?month=${monthStr}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [monthStr]);

  // Fetch journal when date changes
  useEffect(() => {
    fetch(`/api/attendance/journal?date=${journalDate}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.journal) {
          setTasks(d.journal.tasks);
          setTodos(d.journal.todos || []);
        } else {
          setTasks("");
          setTodos([]);
        }
      })
      .catch(() => undefined);
  }, [journalDate]);

  // Save journal
  async function saveJournal() {
    setJournalSaving(true);
    setJournalMsg("");
    try {
      const res = await fetch("/api/attendance/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: journalDate, tasks, todos }),
      });
      if (!res.ok) throw new Error("Failed to save.");
      setJournalMsg("Journal saved.");
    } catch {
      setJournalMsg("Could not save journal.");
    } finally {
      setJournalSaving(false);
    }
  }

  // Add/remove todo helpers
  function addTodo() {
    if (newTodo.trim()) {
      setTodos([...todos, newTodo.trim()]);
      setNewTodo("");
    }
  }
  function removeTodo(index: number) {
    setTodos(todos.filter((_, i) => i !== index));
  }

  function prevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  }

  function nextMonth() {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  }

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  // Shift to Monday start: Mon=0, Tue=1, ..., Sun=6
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const calendarCells: Array<DayData | null> = [];
  for (let i = 0; i < startOffset; i++) calendarCells.push(null);
  if (data) {
    for (const day of data.days) calendarCells.push(day);
  } else {
    for (let d = 1; d <= daysInMonth; d++) {
      calendarCells.push({ date: `${monthStr}-${String(d).padStart(2, "0")}`, dayOfWeek: 0, status: "future", punchIn: null, punchOut: null, duration: null });
    }
  }
  // Pad to fill last row
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  return (
    <>
      <div className="timesheet-header">
        <h3>Monthly Timesheet</h3>
        <div className="month-nav">
          <button onClick={prevMonth}>&larr;</button>
          <span>{monthNames[month - 1]} {year}</span>
          <button onClick={nextMonth}>&rarr;</button>
        </div>
      </div>

      {loading ? (
        <div className="table-card" style={{ padding: 48, textAlign: "center" }}>Loading timesheet...</div>
      ) : (
        <>
          <div className="calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="calendar-header">{d}</div>
            ))}
            {calendarCells.map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} className="calendar-day empty"></div>;
              const dayNum = parseInt(cell.date.slice(-2), 10);
              return (
                <div key={cell.date} className={`calendar-day ${cell.status}`}>
                  <div className="day-num">{dayNum}</div>
                  {cell.status === "present" && cell.punchIn && (
                    <div className="day-times">
                      {formatTimeIST(cell.punchIn)}
                      {cell.punchOut ? ` - ${formatTimeIST(cell.punchOut)}` : ""}
                    </div>
                  )}
                  {cell.status === "leave" && <div className="day-times">Leave</div>}
                  {cell.status === "holiday" && <div className="day-times">Holiday</div>}
                  {cell.status === "uh" && <div className="day-times">UH</div>}
                  {cell.status === "absent" && <div className="day-times">Absent</div>}
                </div>
              );
            })}
          </div>

          {data && (
            <section className="timesheet-summary">
              <article className="emp-status-card">
                <div className="emp-status-header"><b>Hours Worked</b></div>
                <div className="emp-status-detail"><strong>{data.totalHoursWorked}h</strong></div>
              </article>
              <article className="emp-status-card">
                <div className="emp-status-header"><b>Present</b></div>
                <div className="emp-status-detail"><strong>{data.presentDays}</strong><span className="pending-text">days</span></div>
              </article>
              <article className="emp-status-card">
                <div className="emp-status-header"><b>Absent</b></div>
                <div className="emp-status-detail"><strong>{data.absentDays}</strong><span className="pending-text">days</span></div>
              </article>
              <article className="emp-status-card">
                <div className="emp-status-header"><b>Leave</b></div>
                <div className="emp-status-detail"><strong>{data.leaveDays}</strong><span className="pending-text">days</span></div>
              </article>
              {data.uhDays > 0 && (
                <article className="emp-status-card">
                  <div className="emp-status-header"><b>UH</b></div>
                  <div className="emp-status-detail"><strong>{data.uhDays}</strong><span className="pending-text">days</span></div>
                </article>
              )}
            </section>
          )}

          <section className="request-form-card" style={{ marginTop: 22 }}>
            <h3>Daily Journal</h3>
            <div className="form-grid">
              <label>
                <span>Date</span>
                <input type="date" value={journalDate} max={today} onChange={(e) => setJournalDate(e.target.value)} />
              </label>
            </div>

            <div className="form-grid full" style={{ marginTop: 14 }}>
              <label>
                <span>Tasks completed</span>
                <textarea
                  value={tasks}
                  onChange={(e) => setTasks(e.target.value)}
                  placeholder="Describe what you worked on today..."
                  rows={4}
                />
              </label>
            </div>

            <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>To-do list</span>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  type="text"
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTodo(); } }}
                  placeholder="Add a to-do item..."
                  style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }}
                />
                <button type="button" className="secondary" onClick={addTodo} style={{ padding: "8px 16px" }}>Add</button>
              </div>
              {todos.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
                  {todos.map((todo, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                      <span style={{ flex: 1, fontSize: 13 }}>{todo}</span>
                      <button type="button" onClick={() => removeTodo(i)} style={{ background: "none", border: "none", color: "#c73333", cursor: "pointer", fontSize: 16 }}>&times;</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {journalMsg && <p className={`form-message ${journalMsg.includes("saved") ? "success-text" : ""}`}>{journalMsg}</p>}
            <button className="primary" onClick={saveJournal} disabled={journalSaving || !tasks.trim()} style={{ marginTop: 14 }}>
              {journalSaving ? "Saving..." : "Save Journal"}
            </button>
          </section>
        </>
      )}
    </>
  );
}
