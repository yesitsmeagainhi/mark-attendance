-- Add date_of_birth to employees, for the birthday wish the apps show and
-- notify on. Stored as an ISO date string 'YYYY-MM-DD'; only month and day are
-- ever used for matching, the year is kept because HR records usually have it.
-- Empty string means "not recorded", which is how every existing row starts.
ALTER TABLE employees ADD COLUMN date_of_birth TEXT NOT NULL DEFAULT '';
