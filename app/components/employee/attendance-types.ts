export type FaceEvalStatus = "no-face" | "multiple" | "too-far" | "too-close" | "off-center" | "eyes-closed" | "ready";

/** `pending` = a miss-punch request awaiting admin approval (counts as the punch until reviewed) */
export type PunchRecord = { type: "IN" | "OUT"; time: string; office: string; photoKey?: string; pending?: boolean };

export type TodayStatus = {
  workStartTime: string;
  workEndTime: string;
  office: string;
  flexibleHours: boolean;
  assignedBranchIds: string[];
  punchAnywhere?: boolean;
  punchIn: { time: string; office: string; photoKey?: string; pending?: boolean } | null;
  punchOut: { time: string; office: string; photoKey?: string; pending?: boolean } | null;
  punches: PunchRecord[];
  /** Miss-punch requests for today still waiting for admin approval */
  pendingPunches?: { type: "IN" | "OUT"; time: string }[];
  rules: { gracePeriod: number; lunchBreakEnabled: boolean; lunchBreakMinHours: number };
  nextPunchType: "IN" | "OUT" | null;
  canPunchIn: boolean;
  canPunchOut: boolean;
};
