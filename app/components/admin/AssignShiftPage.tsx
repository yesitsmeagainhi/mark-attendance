"use client";

import { useEffect, useMemo, useState } from "react";
import type { ShiftRow } from "./types";

type StaffRow = {
  id: string;
  name: string;
  department: string;
  workStartTime: string;
  workEndTime: string;
  shiftId: string | null;
  flexibleHours: boolean;
};

type Filter = "all" | "on" | "off";

function to12h(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10,
  fontSize: 16, outline: "none", fontFamily: "inherit", background: "#fff",
};

/** Full-page view for choosing which staff are on a shift. */
export default function AssignShiftPage({ shiftId, onBack }: { shiftId: string; onBack: () => void }) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0 });
    fetch("/api/admin/shifts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { setError("Could not load staff."); return; }
        const rows: StaffRow[] = data.employees || [];
        setShifts(data.shifts || []);
        setStaff(rows);
        setSelected(new Set(rows.filter((e) => e.shiftId === shiftId).map((e) => e.id)));
      })
      .catch(() => setError("Could not connect to server."))
      .finally(() => setLoaded(true));
  }, [shiftId]);

  const shift = shifts.find((s) => s.id === shiftId);
  const shiftName = useMemo(() => new Map(shifts.map((s) => [s.id, s.name])), [shifts]);

  const visible = staff.filter((e) => {
    if (filter === "on" && !selected.has(e.id)) return false;
    if (filter === "off" && selected.has(e.id)) return false;
    const q = search.trim().toLowerCase();
    return !q || `${e.name} ${e.id} ${e.department}`.toLowerCase().includes(q);
  });
  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));
  const movingFromOther = staff.filter((e) => selected.has(e.id) && e.shiftId && e.shiftId !== shiftId).length;
  const original = staff.filter((e) => e.shiftId === shiftId).map((e) => e.id);
  const changed = original.length !== selected.size || original.some((id) => !selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of visible) {
        if (allVisibleSelected) next.delete(e.id); else next.add(e.id);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/shifts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId, employeeIds: [...selected] }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not save.");
        return;
      }
      onBack();
    } catch {
      setError("Could not connect to server.");
    } finally {
      setSaving(false);
    }
  }

  function back() {
    if (changed && !confirm("Discard your changes to this shift's staff?")) return;
    onBack();
  }

  return (
    <>
      <button
        type="button"
        onClick={back}
        style={{ border: 0, background: "none", color: "var(--purple)", fontWeight: 700, fontSize: 15, padding: "4px 0", marginBottom: 12, cursor: "pointer" }}
      >
        &larr; Back to Rules
      </button>

      <section className="table-card" style={{ overflow: "visible" }}>
        <div className="table-tools" style={{ paddingBottom: 12 }}>
          <div>
            <h2>Assign staff to {shift?.name ?? "shift"}</h2>
            <p>
              {shift ? <>Ticked staff get <b>{to12h(shift.startTime)} &ndash; {to12h(shift.endTime)}</b>. </> : null}
              Unticked staff keep their current timings.
            </p>
          </div>
        </div>

        <div style={{ padding: "0 22px 14px", display: "grid", gap: 10 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID or department"
            aria-label="Search staff"
            style={inputStyle}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {([["all", `All (${staff.length})`], ["on", `Ticked (${selected.size})`], ["off", `Not ticked (${staff.length - selected.size})`]] as [Filter, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`btn-action ${filter === id ? "btn-present" : "btn-undo"}`}
                aria-pressed={filter === id}
              >
                {label}
              </button>
            ))}
            {visible.length > 0 && (
              <button type="button" className="btn-action btn-undo" style={{ marginLeft: "auto" }} onClick={toggleAllVisible}>
                {allVisibleSelected ? "Untick shown" : "Tick all shown"}
              </button>
            )}
          </div>
        </div>

        <div>
          {!loaded && <p style={{ textAlign: "center", color: "#8990a0", padding: 30, margin: 0 }}>Loading staff...</p>}
          {visible.map((e) => (
            <label
              key={e.id}
              style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 22px", borderTop: "1px solid #f0f0f3",
                cursor: "pointer", background: selected.has(e.id) ? "#f6f3ff" : undefined,
              }}
            >
              <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} style={{ width: 20, height: 20, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 16 }}>{e.name}</b>
                {e.flexibleHours && <span style={{ marginLeft: 6, fontSize: 11, background: "#ede9fe", color: "#7c3aed", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>FLEX</span>}
                <br />
                <small style={{ color: "#8990a0", fontSize: 14 }}>
                  {e.id}{e.department ? ` · ${e.department}` : ""} &middot; {e.shiftId ? shiftName.get(e.shiftId) ?? "Shift" : "Custom"} {to12h(e.workStartTime)}&ndash;{to12h(e.workEndTime)}
                </small>
              </span>
            </label>
          ))}
          {loaded && visible.length === 0 && (
            <p style={{ textAlign: "center", color: "#8990a0", padding: 30, margin: 0, borderTop: "1px solid #f0f0f3" }}>No staff match.</p>
          )}
        </div>
      </section>

      {/* Save bar stays on screen while scrolling the list */}
      <div className="sticky-save-bar">
        {error && <p className="form-message" style={{ margin: "0 0 8px" }}>{error}</p>}
        {movingFromOther > 0 && (
          <p style={{ fontSize: 13, color: "#a86400", margin: "0 0 8px" }}>{movingFromOther} ticked employee(s) will move from another shift.</p>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="secondary" style={{ flex: 1, margin: 0 }} onClick={back}>Cancel</button>
          <button type="button" className="primary" style={{ flex: 2, margin: 0 }} disabled={saving || !loaded} onClick={save}>
            {saving ? "Saving…" : `Save (${selected.size} staff)`}
          </button>
        </div>
      </div>
    </>
  );
}
