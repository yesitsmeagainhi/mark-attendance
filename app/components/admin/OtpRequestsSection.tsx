"use client";

import { useEffect, useState, useCallback } from "react";

type OtpRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  otpCode: string;
  createdAt: string;
  expiresAt: string;
};

export default function OtpRequestsSection() {
  const [requests, setRequests] = useState<OtpRequest[]>([]);

  const fetchRequests = useCallback(() => {
    fetch("/api/admin/otp-requests")
      .then((r) => (r.ok ? r.json() : { otpRequests: [] }))
      .then((data: { otpRequests: OtpRequest[] }) => setRequests(data.otpRequests))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 10000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  if (requests.length === 0) return null;

  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>&#128272;</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Pending Login Requests</h3>
        <span style={{
          background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 700,
          padding: "3px 10px", borderRadius: 99, minWidth: 20, textAlign: "center",
          animation: "pulse-glow 2s ease-in-out infinite"
        }}>{requests.length}</span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 14,
      }}>
        {requests.map((req) => (
          <OtpCard key={req.id} request={req} />
        ))}
      </div>
    </section>
  );
}

function OtpCard({ request }: { request: OtpRequest }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(request.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Expired");
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${mins}:${String(secs).padStart(2, "0")}`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [request.expiresAt]);

  const isExpired = remaining === "Expired";

  return (
    <article style={{
      background: isExpired ? "#fafafa" : "linear-gradient(135deg, #f8f5ff 0%, #fff 100%)",
      border: isExpired ? "1px solid #e7e9ee" : "2px solid #6d45e5",
      borderRadius: 16,
      padding: 20,
      boxShadow: isExpired ? "none" : "0 4px 20px rgba(109,69,229,.12)",
      opacity: isExpired ? 0.5 : 1,
      transition: "all .3s",
    }}>
      {/* Header row: avatar + name + timer */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{
          width: 42, height: 42, borderRadius: "50%", background: "#6d45e5", color: "#fff",
          display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>
          {request.employeeName.slice(0, 2).toUpperCase()}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{request.employeeName}</div>
          <div style={{ fontSize: 11, color: "#667085" }}>{request.employeeId}</div>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: isExpired ? "#c73333" : "#6d45e5",
          background: isExpired ? "#ffeded" : "#eee9ff",
          padding: "5px 12px", borderRadius: 99, whiteSpace: "nowrap",
        }}>
          {isExpired ? "Expired" : `${remaining} left`}
        </span>
      </div>

      {/* OTP code display */}
      <div style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 36, fontWeight: 800, letterSpacing: ".3em",
        textAlign: "center", color: isExpired ? "#999" : "#6d45e5",
        background: isExpired ? "#f3f4f8" : "#f0ecff",
        borderRadius: 12, padding: "14px 8px", marginBottom: 10,
        border: isExpired ? "none" : "1px dashed #c4b5fd",
      }}>
        {request.otpCode}
      </div>

      {/* Hint */}
      <div style={{
        textAlign: "center", fontSize: 11, color: "#667085", fontWeight: 500,
      }}>
        {isExpired ? "This OTP has expired" : "Share this code with the employee"}
      </div>
    </article>
  );
}
