-- Add profile photo storage key for employees
-- The key maps to a file in the local storage (data/uploads/profiles/<employeeId>/photo.<ext>)
ALTER TABLE employees ADD COLUMN profile_photo_key TEXT;
