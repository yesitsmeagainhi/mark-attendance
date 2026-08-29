"use client";

import { useEffect, useState } from "react";

type MissPunchRequest = {
  id: string;
  date: string;
  punchType: string;
  requestedTime: string;
  reason: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
};

export default function MissPunchTab() {
  const [requests, setRequests] = useState<MissPunchRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [punchType, setPunchType] = useState<"IN" | "OUT" | "BOTH">("IN");
  const [requestedTime, setRequestedTime] = useState("");
  const [requestedTimeOut, setRequestedTimeOut] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("error");

  function fetchRequests() {
    fetch("/api/miss-punch")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.requests) setRequests(d.requests); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchRequests();
    const id = setInterval(fetchRequests, 30000);
    return () => clearInterval(id);
  }, []);

  async function submitOne(type: "IN" | "OUT", time: string) {
    const res = await fetch("/api/miss-punch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, punchType: type, requestedTime: time, reason }),
    });
    const data = await res.json() as { error?: string; id?: string };
    if (!res.ok) throw new Error(data.error || `Could not submit ${type} request.`);
    return data;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      if (punchType === "BOTH") {
        await submitOne("IN", requestedTime);
        await submitOne("OUT", requestedTimeOut);
        setMessage("Both punch IN and OUT requests submitted successfully.");
      } else {
        await submitOne(punchType, requestedTime);
        setMessage("Miss punch request submitted successfully.");
      }
      setMessageType("success");
      setDate("");
      setPunchType("IN");
      setRequestedTime("");
      setRequestedTimeOut("");
      setReason("");
      fetchRequests();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not connect to server.");
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // Helper function to handle single or multiple 24-hour times ("HH:MM" or "HH:MM, HH:MM")
  function formatTo12Hour(timeStr: string): string {
    if (!timeStr) return "—";

    // Split by comma in case the API returns combined times for BOTH requests
    return timeStr
      .split(",")
      .map((item) => {
        const cleanTime = item.trim();
        const [hoursStr, minutesStr] = cleanTime.split(":");
        const hours = parseInt(hoursStr, 10);
        if (isNaN(hours)) return cleanTime;

        const ampm = hours >= 12 ? "PM" : "AM";
        const formattedHours = hours % 12 || 12;
        const paddedHours = formattedHours.toString().padStart(2, "0");

        return `${paddedHours}:${minutesStr} ${ampm}`;
      })
      .join(" / "); // Joins multiple times with a clean separator (e.g., "09:00 AM / 06:00 PM")
  }
  return (
    <>
      <div className="request-form-card">
        <h3>Submit Miss Punch Request</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} required />
            </label>
            <label>
              <span>Punch Type</span>
              <select value={punchType} onChange={(e) => setPunchType(e.target.value as "IN" | "OUT" | "BOTH")}>
                <option value="IN">Punch IN</option>
                <option value="OUT">Punch OUT</option>
                <option value="BOTH">Both (IN + OUT)</option>
              </select>
            </label>
            {punchType === "BOTH" ? (
              <>
                <label>
                  <span>Punch In Time</span>
                  <input type="time" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} required />
                </label>
                <label>
                  <span>Punch Out Time</span>
                  <input type="time" value={requestedTimeOut} onChange={(e) => setRequestedTimeOut(e.target.value)} required />
                </label>
              </>
            ) : (
              <label>
                <span>Approximate Time</span>
                <input type="time" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} required />
              </label>
            )}
          </div>
          <div className="form-grid full" style={{ marginTop: 14 }}>
            <label>
              <span>Reason</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why the punch was missed (min 5 characters)" required minLength={5} />
            </label>
          </div>
          {message && <p className={`form-message ${messageType === "success" ? "success-text" : ""}`}>{message}</p>}
          <button className="primary" type="submit" disabled={submitting} style={{ marginTop: 14 }}>
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </div>

      <section className="table-card">
        <div className="table-tools">
          <div>
            <h2>Your Requests</h2>
            <p>{requests.length} total</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Time</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Admin Note</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 30 }}>
                    Loading...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: "center", color: "#8990a0", padding: 30 }}
                  >
                    No miss punch requests yet.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>
                          {new Date(r.date).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </b>
                      </td>

                      <td>{r.punchType}</td>

                      <td>
                        {formatTo12Hour(r.requestedTime)}
                      </td>

                      <td
                        style={{
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {r.reason}
                      </td>

                      <td>
                        <span className={`badge-${r.status}`}>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                      </td>

                      <td>{r.adminNote || "—"}</td>

                      <td>
                        <small>
                          {new Date(r.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </small>
                      </td>
                    </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
