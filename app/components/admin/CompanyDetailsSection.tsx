"use client";

import { useEffect, useState } from "react";

/** Settings: company name and address printed at the top of payslips. */
export default function CompanyDetailsSection() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { name: string; address: string } | null) => { if (d) { setName(d.name); setAddress(d.address); } })
      .catch(() => undefined);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, address }) });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(res.ok ? "Saved. Re-publish a month's payslips to update ones already published." : d.error || "Could not save.");
    } catch {
      setMessage("Could not connect to server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="table-card" style={{ marginBottom: 24 }}>
      <div className="table-tools" style={{ paddingBottom: 4 }}>
        <div><h2>Company details</h2><p>Printed at the top of every payslip.</p></div>
      </div>
      <form onSubmit={save} className="modal-form" style={{ padding: "0 22px 18px", maxWidth: 560 }}>
        <label>
          <span>Company name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABS Educational Solutions" required maxLength={120} />
        </label>
        <label>
          <span>Address</span>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder={"Street, area\nCity, PIN"} rows={3} maxLength={400}
            style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 16, fontFamily: "inherit", resize: "vertical" }} />
        </label>
        {message && <p style={{ fontSize: 14, margin: "0 0 10px", color: message.startsWith("Saved") ? "#168052" : "#c73333" }}>{message}</p>}
        <button type="submit" className="btn-approve" style={{ fontSize: 14 }} disabled={saving}>{saving ? "Saving..." : "Save company details"}</button>
      </form>
    </section>
  );
}
