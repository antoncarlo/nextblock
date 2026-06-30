-- 0011 — add 'lp' to the KYB applicant-type enum.
--
-- The /app/apply onboarding now has three first-class participants
-- (Reinsurer/Cedant, Syndicate Curator, Institutional Liquidity Provider). The
-- LP application submits applicant_type='lp', which the kyb_applicant_type enum
-- ('cedant','curator') did not allow — LP submissions would fail at insert.
-- Add the value (idempotent). ADD VALUE only extends the type; existing rows and
-- the cedant_profiles 1:1 extension (applicant_type='cedant') are unaffected.

alter type public.kyb_applicant_type add value if not exists 'lp';
