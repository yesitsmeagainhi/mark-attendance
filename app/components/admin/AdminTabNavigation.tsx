"use client";

import { useState } from "react";

const barTabs = [
  { id: "dashboard", label: "Home", icon: "\u{1F3E0}" },
  { id: "staff", label: "Staff", icon: "\u{1F465}" },
  { id: "requests", label: "Requests", icon: "\u{1F4E9}" },
  { id: "reports", label: "Reports", icon: "\u{1F4CA}" },
];

const moreTabs = [
  { id: "leaves", label: "Leaves", icon: "\u{1F334}" },
  { id: "payroll", label: "Payroll", icon: "\u{1F4B0}" },
  { id: "history", label: "History", icon: "\u{1F4CB}" },
  { id: "settings", label: "Settings", icon: "\u{2699}" },
];

const allTabs = [...barTabs, ...moreTabs];

export default function AdminTabNavigation({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isMoreActive = moreTabs.some((t) => t.id === activeTab);

  return (
    <>
      {/* Desktop: full horizontal tab bar */}
      <nav className="tab-nav tab-nav-desktop">
        {allTabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Mobile: 4 tabs + More button */}
      <nav className="tab-nav tab-nav-mobile">
        {barTabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
        <button
          className={isMoreActive ? "active" : ""}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="tab-icon">{"\u2026"}</span>
          <span className="tab-label">More</span>
        </button>
      </nav>

      {/* Slide-up panel */}
      {moreOpen && (
        <>
          <div className="more-overlay" onClick={() => setMoreOpen(false)} />
          <div className="more-panel">
            {moreTabs.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
              >
                <span className="more-icon">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
