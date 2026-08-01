-- ============================================================================
-- CBE Track — school branding for official printable reports
-- Additive and safe to run repeatedly in the Supabase SQL Editor.
-- ============================================================================

BEGIN;

ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS logo_data_url TEXT;

COMMENT ON COLUMN schools.logo_data_url IS
    'Small school emblem stored as a compressed browser-generated data URL for printable reports.';

ALTER TABLE schools
    DROP CONSTRAINT IF EXISTS schools_logo_data_url_size_check;
ALTER TABLE schools
    ADD CONSTRAINT schools_logo_data_url_size_check
    CHECK (logo_data_url IS NULL OR char_length(logo_data_url) <= 500000);

NOTIFY pgrst, 'reload schema';

COMMIT;
