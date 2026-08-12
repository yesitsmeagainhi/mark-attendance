CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS otp_requests (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    otp_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sessions_employee ON sessions(employee_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_otp_employee_status ON otp_requests(employee_id, status);
