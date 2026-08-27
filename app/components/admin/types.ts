export type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  jobRole: string;
  mobileNumber: string;
  workStartTime: string;
  workEndTime: string;
  office: string;
  department: string;
  active: boolean;
  monthlySalary: number;
  flexibleHours: boolean;
  assignedBranchIds: string[];
  createdAt: string;
};

export type FlexSession = {
  inTime: string;
  outTime: string | null;
  inPhotoKey: string;
  outPhotoKey: string | null;
  durationMinutes: number | null;
  office: string;
};

export type DailyEmployee = {
  id: string;
  name: string;
  workStartTime: string;
  flexibleHours: boolean;
  punchIn: { time: string; photoKey: string; source: string; office: string; latitude: string | null; longitude: string | null } | null;
  punchOut: { time: string; photoKey: string; source: string; office: string; latitude: string | null; longitude: string | null } | null;
  durationMinutes: number | null;
  sessions: FlexSession[];
  status: string;
  source: string | null;
};

export type MissPunchRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  punchType: string;
  requestedTime: string;
  reason: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
};

export type LeaveRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
};

export type DepartmentRow = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
};

export type BranchRow = {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  active: boolean;
  createdAt: string;
  radius: number;
};
