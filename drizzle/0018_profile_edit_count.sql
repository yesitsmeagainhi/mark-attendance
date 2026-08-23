-- Counts the date-of-birth edits an employee has made to their own profile.
-- An employee gets two; after that the server refuses and points them at Head
-- Office, who can reset this back to 0. Admin edits never touch this counter,
-- so every existing row starts at 0 with its full allowance intact.
ALTER TABLE employees ADD COLUMN profile_edit_count INTEGER NOT NULL DEFAULT 0;
