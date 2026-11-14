"use client";

import { useState } from "react";
import AttendanceRulesSection from "./AttendanceRulesSection";
import AssignShiftPage from "./AssignShiftPage";
import ShiftsSection from "./ShiftsSection";

/** Admin "Rules" tab: shift timings plus every rule that feeds automatic salary. */
export default function RulesTab() {
  // Assigning staff opens as its own page in place of the tab content
  const [assignShiftId, setAssignShiftId] = useState<string | null>(null);

  if (assignShiftId) {
    return <AssignShiftPage shiftId={assignShiftId} onBack={() => { setAssignShiftId(null); window.scrollTo({ top: 0 }); }} />;
  }

  return (
    <>
      <ShiftsSection onAssign={setAssignShiftId} />
      <div style={{ height: 20 }} />
      <AttendanceRulesSection />
    </>
  );
}
