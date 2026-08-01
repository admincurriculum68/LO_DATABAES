-- ============================================================================
-- CBE Track — Complete the qualitative LO -> competency-area approval pipeline
-- Run after cbe_track_demo_upgrade.sql and update_schema_15_req.sql.
-- This migration is additive and safe to run repeatedly.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Formative decisions are submitted and reviewed per competency area.
ALTER TABLE competency_area_evaluations
    ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE competency_area_evaluations
    DROP CONSTRAINT IF EXISTS competency_area_evaluations_workflow_status_check;
ALTER TABLE competency_area_evaluations
    ADD CONSTRAINT competency_area_evaluations_workflow_status_check
    CHECK (workflow_status IN ('draft', 'submitted', 'returned', 'approved'));

CREATE INDEX IF NOT EXISTS idx_competency_area_evaluations_enrollment_status
    ON competency_area_evaluations(enrollment_id, workflow_status);

-- Academic affairs certifies one result per student + competency area + term.
CREATE TABLE IF NOT EXISTS competency_area_final_decisions (
    decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users_students(student_id) ON DELETE CASCADE,
    competency_area TEXT NOT NULL,
    academic_year INTEGER NOT NULL,
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
    final_level TEXT
        CHECK (final_level IS NULL OR final_level IN ('เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A')),
    pass_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (pass_status IN ('pending', 'passed', 'not_passed')),
    decision_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (decision_status IN ('pending', 'approved', 'returned')),
    decision_reason TEXT,
    decided_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, competency_area, academic_year, semester)
);

CREATE INDEX IF NOT EXISTS idx_competency_area_final_review_queue
    ON competency_area_final_decisions(school_id, academic_year, semester, decision_status);
CREATE INDEX IF NOT EXISTS idx_competency_area_final_student_term
    ON competency_area_final_decisions(student_id, academic_year, semester);

COMMENT ON TABLE competency_area_final_decisions IS
    'Academic certification per competency area. Qualitative LO observations remain supporting evidence and are never averaged automatically.';

-- A subject may be submitted separately by room. Existing submissions are the
-- whole-subject scope (*) and remain valid.
ALTER TABLE assessment_submissions
    ADD COLUMN IF NOT EXISTS room_scope TEXT NOT NULL DEFAULT '*';

ALTER TABLE assessment_submissions
    DROP CONSTRAINT IF EXISTS assessment_submissions_subject_id_academic_year_semester_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_submissions_subject_room_term
    ON assessment_submissions(subject_id, academic_year, semester, room_scope);

CREATE INDEX IF NOT EXISTS idx_assessment_submissions_teacher_room
    ON assessment_submissions(teacher_id, subject_id, room_scope, status);

COMMENT ON COLUMN assessment_submissions.room_scope IS
    'Room/group submitted by the teacher; * means the whole subject for legacy records.';

-- Keep flexible groups and the assessment enrollment source in sync without
-- deleting evaluation history when a learner leaves a group.
ALTER TABLE student_enrollments
    ADD COLUMN IF NOT EXISTS learning_group_id UUID REFERENCES learning_groups(group_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS enrollment_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE student_enrollments
    DROP CONSTRAINT IF EXISTS student_enrollments_enrollment_status_check;
ALTER TABLE student_enrollments
    ADD CONSTRAINT student_enrollments_enrollment_status_check
    CHECK (enrollment_status IN ('active', 'moved', 'withdrawn'));

CREATE INDEX IF NOT EXISTS idx_student_enrollments_group_status
    ON student_enrollments(learning_group_id, enrollment_status);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_subject_status
    ON student_enrollments(subject_id, enrollment_status);

-- The browser now sends password_hash directly and never selects plaintext.
-- Remove only legacy triggers whose function body still references
-- plain_password, then remove the exposed plaintext columns.
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN
        SELECT trigger.tgname AS trigger_name, class.relname AS event_object_table
        FROM pg_trigger AS trigger
        JOIN pg_class AS class ON class.oid = trigger.tgrelid
        JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
        JOIN pg_proc AS procedure ON procedure.oid = trigger.tgfoid
        WHERE NOT trigger.tgisinternal
          AND namespace.nspname = 'public'
          AND class.relname IN ('users_teachers', 'users_students')
          AND pg_get_functiondef(procedure.oid) ILIKE '%plain_password%'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_record.trigger_name, trigger_record.event_object_table);
    END LOOP;
END $$;

ALTER TABLE users_teachers DROP COLUMN IF EXISTS plain_password;
ALTER TABLE users_students DROP COLUMN IF EXISTS plain_password;

-- behavior_templates is a central catalogue. School administrators may read
-- it, but must not be able to modify shared rows from the browser client.
REVOKE INSERT, UPDATE, DELETE ON TABLE behavior_templates FROM anon, authenticated;
GRANT SELECT ON TABLE behavior_templates TO anon, authenticated;

-- Annual report rows need an explicit area key so an approved area decision
-- can flow into ปพ.๖ without relying on row order or free-text descriptions.
ALTER TABLE yearly_competencies
    ADD COLUMN IF NOT EXISTS competency_area TEXT;

UPDATE yearly_competencies AS yearly
SET competency_area = outcome.competency_area
FROM learning_outcomes AS outcome
WHERE yearly.competency_area IS NULL
  AND yearly.competency_id = outcome.lo_id;

CREATE INDEX IF NOT EXISTS idx_yearly_competencies_school_grade_area
    ON yearly_competencies(school_id, grade_level, competency_area);

NOTIFY pgrst, 'reload schema';

COMMIT;
