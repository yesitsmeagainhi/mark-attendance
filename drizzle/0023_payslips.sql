-- Monthly payslips. Publishing a month stores a frozen copy of each employee's
-- salary for that month, so what the employee sees doesn't change when
-- attendance or rules are edited later (the admin re-publishes to update it).
CREATE TABLE IF NOT EXISTS payslips (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    month TEXT NOT NULL,
    data TEXT NOT NULL,
    net_pay INTEGER NOT NULL DEFAULT 0,
    published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_by TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payslips_employee_month ON payslips(employee_id, month);
