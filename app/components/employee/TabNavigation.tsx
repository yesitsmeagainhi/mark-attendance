"use client";

const tabs = [
  { id: "attendance", label: "Attendance" },
  { id: "miss-punch", label: "Miss Punch" },
  { id: "leave", label: "Leave" },
  { id: "history", label: "History" },
  { id: "timesheet", label: "Timesheet" },
  { id: "profile", label: "Profile" },
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
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
