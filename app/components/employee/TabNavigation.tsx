"use client";

const tabs = [
  { id: "attendance", label: "Attend", icon: "\u{1F4F7}" },
  { id: "miss-punch", label: "Miss", icon: "\u{1F514}" },
  { id: "leave", label: "Leave", icon: "\u{1F4C5}" },
  { id: "history", label: "History", icon: "\u{1F4CB}" },
  { id: "timesheet", label: "Sheet", icon: "\u{1F552}" },
  { id: "profile", label: "Profile", icon: "\u{1F464}" },
];

export default function TabNavigation({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) {
  return (
    <nav className="tab-nav">
      {tabs.map((tab) => (
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
  );
}
