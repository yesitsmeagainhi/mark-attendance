"use client";

import { useEffect } from "react";

/**
 * Full-page view inside an admin tab (used instead of a pop-up card for long
 * forms): back link, title, and the content in a full-width card that scrolls
 * with the page.
 */
export default function AdminPage({
  title,
  subtitle,
  backLabel = "Back",
  onBack,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  backLabel?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  return (
    <div className="admin-page">
      <button type="button" className="admin-page-back" onClick={onBack}>&larr; {backLabel}</button>
      <section className="table-card admin-page-card">
        <div className="admin-page-head">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="admin-page-body">{children}</div>
      </section>
    </div>
  );
}
