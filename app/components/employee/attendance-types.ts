export type FaceEvalStatus = "no-face" | "multiple" | "too-far" | "too-close" | "off-center" | "eyes-closed" | "ready";

export type PunchRecord = { type: "IN" | "OUT"; time: string; office: string; photoKey?: string };

export type TodayStatus = {
  workStartTime: string;
  workEndTime: string;
  office: string;
  flexibleHours: boolean;
  punchIn: { time: string; office: string; photoKey?: string } | null;
  punchOut: { time: string; office: string; photoKey?: string } | null;
  punches: PunchRecord[];
  rules: { gracePeriod: number; lunchBreakEnabled: boolean; lunchBreakMinHours: number };
  nextPunchType: "IN" | "OUT" | null;
  canPunchIn: boolean;
  canPunchOut: boolean;
};
