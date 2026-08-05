"use client";

const tabs = [
  { id: "dashboard", label: "Dashboard" },
  { id: "staff", label: "Staff" },
  { id: "requests", label: "Requests" },
  { id: "leaves", label: "Leaves" },
  { id: "reports", label: "Reports" },
  { id: "payroll", label: "Payroll" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

export default function AdminTabNavigation({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
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
