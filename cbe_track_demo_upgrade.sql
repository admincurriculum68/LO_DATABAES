-- ============================================================================
-- CBE Track — Presentation-ready DEMO upgrade
-- Safe for repeated execution. This migration does not delete existing data.
-- Target: Supabase/PostgreSQL sandbox used by the current custom DEMO login.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- หลักสูตรฐานสมรรถนะ พ.ศ. 2568 ไม่ใช้รหัสวิชา
-- คงคอลัมน์เดิมไว้เพื่อรองรับข้อมูลเก่า แต่ระบบไม่แสดงและไม่บังคับกรอก
ALTER TABLE subjects ALTER COLUMN subject_code DROP NOT NULL;

-- --------------------------------------------------------------------------
-- 1) Harden existing evaluation records and preserve qualitative evidence.
-- --------------------------------------------------------------------------
ALTER TABLE lo_evaluations
    ADD COLUMN IF NOT EXISTS evidence_note TEXT,
    ADD COLUMN IF NOT EXISTS evidence_url TEXT,
    ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'lo_evaluations_workflow_status_check'
    ) THEN
        ALTER TABLE lo_evaluations
            ADD CONSTRAINT lo_evaluations_workflow_status_check
            CHECK (workflow_status IN ('draft', 'submitted', 'returned', 'approved'));
    END IF;
END $$;

-- The sandbox still has legacy password-hashing triggers that depend on the
-- plain_password input columns. Keep those columns for DEMO compatibility.
-- A production identity migration must remove both triggers and columns only
-- after Supabase Auth / MOE SSO / Thai ID has replaced the custom login.

-- --------------------------------------------------------------------------
-- 2) Subject-level submission: teacher sends a complete subject for review.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_submissions (
    submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
    teacher_id UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'under_review', 'returned', 'approved')),
    teacher_note TEXT,
    reviewer_comment TEXT,
    submitted_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(subject_id, academic_year, semester)
);

CREATE INDEX IF NOT EXISTS idx_assessment_submissions_school_status
    ON assessment_submissions(school_id, academic_year, semester, status);

-- --------------------------------------------------------------------------
-- 3) Four equal learning formats in the product model: subjects, learning
--    units, projects, and activities. Subjects remain in their specialized
--    table because enrollment and teacher-assignment data depend on it.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_contexts (
    context_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    context_type TEXT NOT NULL
        CHECK (context_type IN ('learning_unit', 'project', 'activity')),
    context_code TEXT,
    context_name TEXT NOT NULL,
    description TEXT,
    academic_year INTEGER NOT NULL,
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
    grade_level TEXT,
    responsible_teacher_id UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(school_id, academic_year, semester, context_type, context_code)
);

-- Convert the former integrated-unit label to the canonical learning-unit type.
UPDATE learning_contexts
SET context_type = 'learning_unit'
WHERE context_type = 'integrated_unit';

ALTER TABLE learning_contexts
    DROP CONSTRAINT IF EXISTS learning_contexts_context_type_check;
ALTER TABLE learning_contexts
    ADD CONSTRAINT learning_contexts_context_type_check
    CHECK (context_type IN ('learning_unit', 'project', 'activity'));

CREATE TABLE IF NOT EXISTS learning_context_lo_mappings (
    mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_id UUID NOT NULL REFERENCES learning_contexts(context_id) ON DELETE CASCADE,
    lo_id UUID NOT NULL REFERENCES learning_outcomes(lo_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(context_id, lo_id)
);

CREATE TABLE IF NOT EXISTS learning_context_evaluations (
    context_evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    context_id UUID NOT NULL REFERENCES learning_contexts(context_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users_students(student_id) ON DELETE CASCADE,
    lo_id UUID NOT NULL REFERENCES learning_outcomes(lo_id) ON DELETE CASCADE,
    competency_level TEXT NOT NULL
        CHECK (competency_level IN ('เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A')),
    evidence_note TEXT,
    evidence_url TEXT,
    evaluated_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    workflow_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (workflow_status IN ('draft', 'submitted', 'returned', 'approved')),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(context_id, student_id, lo_id)
);

CREATE INDEX IF NOT EXISTS idx_context_evaluations_student_lo
    ON learning_context_evaluations(school_id, student_id, lo_id);

-- --------------------------------------------------------------------------
-- 4) Final LO decision made by academic affairs.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lo_final_decisions (
    decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users_students(student_id) ON DELETE CASCADE,
    lo_id UUID NOT NULL REFERENCES learning_outcomes(lo_id) ON DELETE CASCADE,
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
    UNIQUE(student_id, lo_id, academic_year, semester)
);

CREATE INDEX IF NOT EXISTS idx_lo_final_decisions_review_queue
    ON lo_final_decisions(school_id, academic_year, semester, decision_status);

-- --------------------------------------------------------------------------
-- 5) Audit trail and future external identity providers (including Thai ID).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(school_id) ON DELETE SET NULL,
    actor_id UUID,
    actor_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    detail JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_school_created
    ON audit_logs(school_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_identities (
    identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    person_type TEXT NOT NULL CHECK (person_type IN ('teacher', 'student')),
    person_id UUID NOT NULL,
    provider TEXT NOT NULL DEFAULT 'local' CHECK (provider IN ('local', 'thai_id', 'moe_sso')),
    provider_subject TEXT,
    verified_at TIMESTAMPTZ,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_subject)
);

COMMENT ON TABLE user_identities IS
    'Identity-provider link only. Do not store Thai ID access tokens or citizen data returned by the provider here.';

-- --------------------------------------------------------------------------
-- 6) Formal annual and phase-completion reporting structures.
--    Central phase descriptors are not tenant-owned; annual expectations are
--    scoped to each school's curriculum.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS yearly_competencies (
    competency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    grade_level TEXT NOT NULL,
    competency_no INTEGER NOT NULL,
    description TEXT NOT NULL,
    expected_level TEXT NOT NULL CHECK (expected_level IN ('เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(school_id, grade_level, competency_no)
);

CREATE TABLE IF NOT EXISTS yearly_behavior_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    grade_level TEXT NOT NULL,
    competency_no INTEGER NOT NULL,
    competency_level TEXT NOT NULL CHECK (competency_level IN ('เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ')),
    behavior_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(school_id, grade_level, competency_no, competency_level)
);

CREATE TABLE IF NOT EXISTS student_yearly_results (
    result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users_students(student_id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    grade_level TEXT NOT NULL,
    attendance_percent NUMERIC(5,2),
    learner_activities TEXT NOT NULL DEFAULT 'ผ่าน' CHECK (learner_activities IN ('ผ่าน', 'ไม่ผ่าน')),
    desirable_chars TEXT NOT NULL DEFAULT 'ผ่าน' CHECK (desirable_chars IN ('ผ่าน', 'ไม่ผ่าน')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, academic_year, grade_level)
);

CREATE TABLE IF NOT EXISTS student_yearly_competency_evaluations (
    evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES student_yearly_results(result_id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES yearly_competencies(competency_id) ON DELETE CASCADE,
    achieved_level TEXT NOT NULL CHECK (achieved_level IN ('เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(result_id, competency_id)
);

CREATE TABLE IF NOT EXISTS central_phase_behaviors (
    behavior_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase TEXT NOT NULL CHECK (phase IN ('ตอนต้น', 'ตอนปลาย')),
    ability_key TEXT NOT NULL,
    competency_level TEXT NOT NULL CHECK (competency_level IN ('เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ')),
    behavior_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(phase, ability_key, competency_level)
);

CREATE TABLE IF NOT EXISTS phase_completion_results (
    result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users_students(student_id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('ตอนต้น', 'ตอนปลาย')),
    ability_levels JSONB NOT NULL DEFAULT '{}'::JSONB,
    learner_activities TEXT NOT NULL DEFAULT 'ผ่าน' CHECK (learner_activities IN ('ผ่าน', 'ไม่ผ่าน')),
    desirable_chars TEXT NOT NULL DEFAULT 'ผ่าน' CHECK (desirable_chars IN ('ผ่าน', 'ไม่ผ่าน')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, academic_year, phase)
);

-- Academic mock data belongs in presentation_mockup.sql. Keeping schema and
-- seed separate prevents a migration from silently restoring obsolete terms.

-- --------------------------------------------------------------------------
-- Security note
-- --------------------------------------------------------------------------
-- This sandbox still uses a custom client-side login and the public anon key.
-- Do not enable permissive production RLS policies here. Before production:
--   1. move authentication to Supabase Auth / MOE SSO / Thai ID,
--   2. put school_id and role in verified JWT claims,
--   3. enable RLS on every tenant table and scope policies to those claims,
--   4. move password and identity checks to a trusted server-side component.
