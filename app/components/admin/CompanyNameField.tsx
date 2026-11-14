"use client";

import { useEffect, useId, useState } from "react";

/**
 * Company the employee works for. Free text with suggestions from companies
 * already in use; left blank, the default company from Settings → Company details
 * is used (e.g. on payslips).
 */
export default function CompanyNameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listId = useId();
  const [defaultName, setDefaultName] = useState("");
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/admin/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { name?: string; companies?: string[] } | null) => {
        if (!d) return;
        setDefaultName(d.name || "");
        setOptions([...new Set([d.name || "", ...(d.companies || [])].filter(Boolean))]);
      })
      .catch(() => undefined);
  }, []);

  return (
    <label>
      <span>Company name</span>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultName ? `Default: ${defaultName}` : "e.g. ASM Vikas Pvt Ltd"}
        maxLength={120}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
      <small style={{ color: "#9ca3af", fontWeight: 400 }}>Shown on this employee&apos;s payslip. Leave blank to use the default company.</small>
    </label>
  );
}
