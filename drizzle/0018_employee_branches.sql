CREATE TABLE IF NOT EXISTS employee_branches (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, branch_id)
);
