"use client";

import { useEffect, useState } from "react";

export default function TimesheetTab() {
  const today = new Date().toISOString().slice(0, 10);

  // Journal state
  const [journalDate, setJournalDate] = useState(today);
  const [tasks, setTasks] = useState("");
  const [todos, setTodos] = useState<string[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalMsg, setJournalMsg] = useState("");

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

  return (
    <section className="request-form-card">
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
  );
}
