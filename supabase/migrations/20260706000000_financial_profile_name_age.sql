-- Dashboard header shows the user's name/age — real fields, not an env var
-- fallback. Colocated on financial_profile per product decision (single-user
-- v1, one row per user already exists there).
alter table financial_profile add column if not exists name text;
alter table financial_profile add column if not exists age integer;
