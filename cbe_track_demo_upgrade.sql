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
-- 6) Presentation scenario: the same LO is used by two subjects and a project.
--    All statements are scoped to the deterministic sandbox school.
-- --------------------------------------------------------------------------
INSERT INTO subject_lo_mapping (mapping_id, subject_id, lo_id)
SELECT gen_random_uuid(),
       'c2222222-2222-2222-2222-222222222222'::UUID,
       'e1111111-1111-1111-1111-111111111111'::UUID
WHERE EXISTS (SELECT 1 FROM subjects WHERE subject_id = 'c2222222-2222-2222-2222-222222222222')
  AND EXISTS (SELECT 1 FROM learning_outcomes WHERE lo_id = 'e1111111-1111-1111-1111-111111111111')
  AND NOT EXISTS (
      SELECT 1 FROM subject_lo_mapping
      WHERE subject_id = 'c2222222-2222-2222-2222-222222222222'
        AND lo_id = 'e1111111-1111-1111-1111-111111111111'
  );

INSERT INTO learning_contexts (
    context_id, school_id, context_type, context_code, context_name, description,
    academic_year, semester, grade_level, responsible_teacher_id
)
SELECT
    '91111111-1111-1111-1111-111111111111'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    'project', 'PRJ-P1-01', 'โครงงานตลาดนัดพอเพียง',
    'บูรณาการการอ่าน การสื่อสาร และการคำนวณจากสถานการณ์จริง',
    2569, 1, 'ป.1', 'a2222222-2222-2222-2222-222222222222'::UUID
WHERE EXISTS (SELECT 1 FROM schools WHERE school_id = '11111111-1111-1111-1111-111111111111')
ON CONFLICT (context_id) DO UPDATE SET
    context_name = EXCLUDED.context_name,
    description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO learning_context_lo_mappings (context_id, lo_id)
SELECT '91111111-1111-1111-1111-111111111111'::UUID,
       'e1111111-1111-1111-1111-111111111111'::UUID
WHERE EXISTS (SELECT 1 FROM learning_contexts WHERE context_id = '91111111-1111-1111-1111-111111111111')
  AND EXISTS (SELECT 1 FROM learning_outcomes WHERE lo_id = 'e1111111-1111-1111-1111-111111111111')
ON CONFLICT (context_id, lo_id) DO NOTHING;

INSERT INTO learning_context_evaluations (
    school_id, context_id, student_id, lo_id, competency_level,
    evidence_note, evaluated_by, workflow_status, submitted_at
)
SELECT
    '11111111-1111-1111-1111-111111111111'::UUID,
    '91111111-1111-1111-1111-111111111111'::UUID,
    'b1111111-1111-1111-1111-111111111111'::UUID,
    'e1111111-1111-1111-1111-111111111111'::UUID,
    'ชำนาญ',
    'อ่านป้ายรายการสินค้า อธิบายข้อมูล และสื่อสารกับเพื่อนในสถานการณ์จำลองได้ชัดเจน',
    'a2222222-2222-2222-2222-222222222222'::UUID,
    'submitted', NOW()
WHERE EXISTS (SELECT 1 FROM users_students WHERE student_id = 'b1111111-1111-1111-1111-111111111111')
ON CONFLICT (context_id, student_id, lo_id) DO UPDATE SET
    competency_level = EXCLUDED.competency_level,
    evidence_note = EXCLUDED.evidence_note,
    workflow_status = 'submitted',
    submitted_at = NOW(),
    updated_at = NOW();

UPDATE lo_evaluations
SET workflow_status = 'submitted',
    submitted_at = COALESCE(submitted_at, NOW()),
    evidence_note = COALESCE(
        evidence_note,
        CASE
            WHEN competency_level = 'เชี่ยวชาญ' THEN 'ปฏิบัติได้คล่อง อธิบายเหตุผลและช่วยเพื่อนได้'
            WHEN competency_level = 'ชำนาญ' THEN 'ปฏิบัติได้ด้วยตนเองและอธิบายขั้นตอนได้'
            WHEN competency_level = 'พัฒนา' THEN 'ปฏิบัติได้เมื่อมีคำชี้แนะบางส่วน'
            ELSE 'อยู่ระหว่างรวบรวมหลักฐานเพิ่มเติม'
        END
    ),
    updated_at = NOW()
WHERE enrollment_id IN (
    'd1111111-1111-1111-1111-111111111111'::UUID,
    'd2222222-2222-2222-2222-222222222222'::UUID,
    'd3333333-3333-3333-3333-333333333333'::UUID
);

-- --------------------------------------------------------------------------
-- Security note
-- --------------------------------------------------------------------------
-- This sandbox still uses a custom client-side login and the public anon key.
-- Do not enable permissive production RLS policies here. Before production:
--   1. move authentication to Supabase Auth / MOE SSO / Thai ID,
--   2. put school_id and role in verified JWT claims,
--   3. enable RLS on every tenant table and scope policies to those claims,
--   4. move password and identity checks to a trusted server-side component.
