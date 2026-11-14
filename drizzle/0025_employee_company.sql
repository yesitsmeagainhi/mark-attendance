-- Company each employee works for (varies between staff). Empty = use the default
-- company from Settings → Company details.
ALTER TABLE `employees` ADD COLUMN `company_name` text NOT NULL DEFAULT '';
