"use client";

import { useEffect, useRef, useState } from "react";
import type { PayslipData } from "../../../lib/payslips";
import { payslipDetails, payslipTable, rupees } from "../../../lib/payslip-layout";
import styles from "./Payslip.module.css";

type Summary = { month: string; monthLabel: string; netPay: number; publishedAt: string };
type Payslip = PayslipData & { publishedAt: string };

/** Employee's monthly payslips, published by the admin after each month ends. */
export default function PayslipTab() {
  const [list, setList] = useState<Summary[] | null>(null);
  const [month, setMonth] = useState("");
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [loadingSlip, setLoadingSlip] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  // Ignore answers for a month the employee has already switched away from
  const latestMonth = useRef("");

  function loadSlip(m: string) {
    latestMonth.current = m;
    setMonth(m);
    setLoadingSlip(true);
    setError("");
    fetch(`/api/payslips?month=${m}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { payslip: Payslip }) => { if (latestMonth.current === m) setSlip(d.payslip); })
      .catch(() => { if (latestMonth.current === m) { setSlip(null); setError("Could not load this payslip."); } })
      .finally(() => { if (latestMonth.current === m) setLoadingSlip(false); });
  }

  useEffect(() => {
    fetch("/api/payslips", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { payslips: Summary[] }) => {
        setList(d.payslips);
        if (d.payslips.length > 0) loadSlip(d.payslips[0].month);
      })
      .catch(() => { setList([]); setError("Could not load your payslips."); });
  }, []);

  async function download() {
    if (!slip) return;
    setDownloading(true);
    try {
      const { generatePayslipPDF } = await import("../../../lib/reports/generate-payslip-pdf");
      await generatePayslipPDF(slip);
    } finally {
      setDownloading(false);
    }
  }

  if (list === null) {
    return <div className="request-form-card" style={{ textAlign: "center", color: "var(--muted)" }}>Loading payslips...</div>;
  }

  if (list.length === 0) {
    return (
      <div className="request-form-card" style={{ textAlign: "center" }}>
        <h3 style={{ margin: "0 0 6px" }}>No payslips yet</h3>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 15 }}>
          {error || "Your payslip for last month appears here on the 1st of each month and stays until the 15th. Download it as a PDF to keep a copy."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <select
          value={month}
          onChange={(e) => loadSlip(e.target.value)}
          aria-label="Payslip month"
          style={{ flex: "1 1 180px", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 16, background: "#fff" }}
        >
          {list.map((p) => <option key={p.month} value={p.month}>{p.monthLabel}</option>)}
        </select>
        <button type="button" className="primary" style={{ width: "auto", margin: 0, padding: "12px 18px" }} onClick={download} disabled={!slip || downloading}>
          {downloading ? "Preparing..." : "Download PDF"}
        </button>
      </div>

      {error && <p className="form-message">{error}</p>}
      {loadingSlip && !slip && <div className="request-form-card" style={{ textAlign: "center", color: "var(--muted)" }}>Loading...</div>}
      {slip && <PayslipDocument slip={slip} dimmed={loadingSlip} />}
    </>
  );
}

/** Black-and-white payslip: details, what was earned, what was deducted, and the net pay once. */
function PayslipDocument({ slip, dimmed }: { slip: Payslip; dimmed: boolean }) {
  const t = payslipTable(slip);
  const d = payslipDetails(slip);

  const section = (title: string, rows: { label: string; note: string; amount: number }[], totalLabel: string, total: number, sign: string) => (
    <table className={styles.table}>
      <thead><tr><th>{title}</th><th className={styles.num}>Amount</th></tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={2} className={styles.none}>No {title.toLowerCase()} this month</td></tr>}
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}{r.note && <span className={styles.note}>{r.note}</span>}</td>
            <td className={styles.num}>{sign}{rupees(r.amount)}</td>
          </tr>
        ))}
        <tr className={styles.total}><td>{totalLabel}</td><td className={styles.num}>{sign}{rupees(total)}</td></tr>
      </tbody>
    </table>
  );

  return (
    <article className={styles.doc} style={{ opacity: dimmed ? 0.5 : 1 }}>
      <header className={styles.head}>
        <h2>Payslip</h2>
        <div className={styles.company}>{slip.company?.name || "Company"}</div>
        {slip.company?.address && <div className={styles.address}>{slip.company.address}</div>}
      </header>

      <div className={styles.details}>
        {[d.left, d.right].map((col, ci) => (
          <dl key={ci}>
            {col.map(([k, v]) => (
              <div key={k} className={styles.pair}><dt>{k}</dt><dd>: {v}</dd></div>
            ))}
          </dl>
        ))}
      </div>

      <div className={styles.columns}>
        {section("Earnings", t.earnings, "Total earnings", t.totalEarnings, "")}
        {section("Deductions", t.deductions, "Total deductions", t.totalDeductions, "−")}
      </div>

      <div className={styles.netBox}>
        <div className={styles.netLabel}>Net Pay</div>
        <div className={styles.netAmount}>{rupees(t.netPay)}</div>
        <div className={styles.netCalc}>
          {rupees(t.totalEarnings)} earned &minus; {rupees(t.totalDeductions)} deducted
        </div>
        <div className={styles.netWords}>{t.netPayWords}</div>
      </div>

      <footer className={styles.foot}>This is system generated payslip</footer>
    </article>
  );
}
