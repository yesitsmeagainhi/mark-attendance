"use client";

import AttendanceRulesSection from "./AttendanceRulesSection";
import ShiftsSection from "./ShiftsSection";

/** Admin "Rules" tab: shift timings plus every rule that feeds automatic salary. */
export default function RulesTab() {
  return (
    <>
      <ShiftsSection />
      <div style={{ height: 20 }} />
      <AttendanceRulesSection />
    </>
  );
}
