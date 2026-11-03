-- Per-employee switch: allow punching from any location (field / remote staff).
-- GPS is still recorded with every punch; only the branch geo-fence is skipped.
ALTER TABLE employees ADD COLUMN punch_anywhere INTEGER NOT NULL DEFAULT 0;
