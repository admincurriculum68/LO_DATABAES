-- ============================================================================
-- CBE Track — Requirements 1–16 upgrade
-- Safe for repeated execution; no existing records are deleted.
-- Run after cbe_track_demo_upgrade.sql.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1–2) LO is grade-specific and identifies curriculum/custom competency areas.
ALTER TABLE learning_outcomes
    ADD COLUMN IF NOT EXISTS grade_level TEXT,
    ADD COLUMN IF NOT EXISTS is_custom_competency BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_learning_outcomes_school_grade_area
    ON learning_outcomes(school_id, grade_level, competency_area);

-- 6) Four importable learning formats and teaching hours.
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS teaching_hours INTEGER;
ALTER TABLE learning_contexts ADD COLUMN IF NOT EXISTS teaching_hours INTEGER;

ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_teaching_hours_check;
ALTER TABLE subjects ADD CONSTRAINT subjects_teaching_hours_check
    CHECK (teaching_hours IS NULL OR teaching_hours >= 0);
ALTER TABLE learning_contexts DROP CONSTRAINT IF EXISTS learning_contexts_teaching_hours_check;
ALTER TABLE learning_contexts ADD CONSTRAINT learning_contexts_teaching_hours_check
    CHECK (teaching_hours IS NULL OR teaching_hours >= 0);

-- 8, 11, 16) Individual LO evidence is qualitative text only.
-- competency_level remains nullable for backward compatibility, but new UI never
-- writes a decision into this column.
UPDATE lo_evaluations SET competency_level = NULL WHERE competency_level = '';
ALTER TABLE lo_evaluations ALTER COLUMN competency_level DROP NOT NULL;
ALTER TABLE lo_evaluations DROP CONSTRAINT IF EXISTS lo_evaluations_competency_level_check;
ALTER TABLE lo_evaluations ADD CONSTRAINT lo_evaluations_competency_level_check
    CHECK (competency_level IS NULL OR competency_level IN ('เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A'));

UPDATE learning_context_evaluations SET competency_level = NULL WHERE competency_level = '';
ALTER TABLE learning_context_evaluations ALTER COLUMN competency_level DROP NOT NULL;
ALTER TABLE learning_context_evaluations DROP CONSTRAINT IF EXISTS learning_context_evaluations_competency_level_check;
ALTER TABLE learning_context_evaluations ADD CONSTRAINT learning_context_evaluations_competency_level_check
    CHECK (competency_level IS NULL OR competency_level IN ('เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A'));

COMMENT ON COLUMN lo_evaluations.competency_level IS
    'Legacy only. Formative LO observations are stored in evidence_note; decisions are made per competency area.';

-- 9–10) A subject can have several teachers, scoped to actual rooms.
CREATE TABLE IF NOT EXISTS subject_teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users_teachers(teacher_id) ON DELETE CASCADE,
    room_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(subject_id, teacher_id, room_name)
);

ALTER TABLE subject_teachers ADD COLUMN IF NOT EXISTS room_name TEXT;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subject_teachers' AND column_name = 'room_assigned'
    ) THEN
        EXECUTE 'UPDATE subject_teachers SET room_name = room_assigned WHERE room_name IS NULL';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_teachers_assignment
    ON subject_teachers(subject_id, teacher_id, room_name)
    WHERE room_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subject_teachers_teacher
    ON subject_teachers(teacher_id, subject_id);

-- 13) Learner-development activities: three curriculum-2551 categories.
ALTER TABLE learning_contexts ADD COLUMN IF NOT EXISTS activity_category TEXT;
UPDATE learning_contexts SET activity_category = 'กิจกรรมแนะแนว' WHERE activity_category = 'แนะแนว';
UPDATE learning_contexts SET activity_category = 'กิจกรรมนักเรียน' WHERE activity_category = 'นักเรียน/ลูกเสือ';
UPDATE learning_contexts SET activity_category = 'กิจกรรมเพื่อสังคมและสาธารณประโยชน์'
WHERE activity_category = 'ชมรม/เพื่อสังคมและสาธารณประโยชน์';
ALTER TABLE learning_contexts DROP CONSTRAINT IF EXISTS learning_contexts_activity_category_check;
ALTER TABLE learning_contexts ADD CONSTRAINT learning_contexts_activity_category_check
    CHECK (activity_category IS NULL OR activity_category IN (
        'กิจกรรมแนะแนว',
        'กิจกรรมนักเรียน',
        'กิจกรรมเพื่อสังคมและสาธารณประโยชน์'
    ));

-- 14, 16) Formative decision is per competency area within a subject enrollment.
CREATE TABLE IF NOT EXISTS competency_area_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES student_enrollments(enrollment_id) ON DELETE CASCADE,
    competency_area TEXT NOT NULL,
    competency_level TEXT,
    qualitative_summary TEXT,
    evaluated_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(enrollment_id, competency_area),
    CHECK (competency_level IS NULL OR competency_level IN ('เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A'))
);

ALTER TABLE competency_area_evaluations
    ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS qualitative_summary TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE competency_area_evaluations AS evaluation
SET school_id = subject.school_id
FROM student_enrollments AS enrollment
JOIN subjects AS subject ON subject.subject_id = enrollment.subject_id
WHERE evaluation.enrollment_id = enrollment.enrollment_id
  AND evaluation.school_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_competency_area_evaluations_school_area
    ON competency_area_evaluations(school_id, competency_area);

COMMENT ON TABLE competency_area_evaluations IS
    'Human-reviewed Formative decisions per competency area. No automatic averaging from LO observations.';

-- 7) Human-reviewed curriculum-2568 to curriculum-2551 equivalency records.
-- The system stores evidence and the decision; it deliberately does not invent
-- an automatic conversion formula because schools must approve their own rules.
CREATE TABLE IF NOT EXISTS curriculum_equivalency_results (
    equivalency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users_students(student_id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    source_curriculum TEXT NOT NULL DEFAULT '2568',
    target_curriculum TEXT NOT NULL DEFAULT '2551',
    grade_level TEXT,
    source_competency_area TEXT NOT NULL,
    source_evidence TEXT NOT NULL,
    target_learning_area TEXT NOT NULL,
    target_subject_name TEXT NOT NULL DEFAULT '',
    target_result TEXT,
    decision_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (decision_status IN ('draft', 'approved', 'returned')),
    decision_reason TEXT,
    decided_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, academic_year, source_competency_area, target_learning_area, target_subject_name)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_equivalency_school_status
    ON curriculum_equivalency_results(school_id, academic_year, decision_status);

COMMENT ON TABLE curriculum_equivalency_results IS
    'Evidence-backed equivalency from curriculum 2568 to 2551; approval is always a human academic decision.';

-- ============================================================================
-- School-scale structure: homerooms, flexible learning groups and history
-- ============================================================================

CREATE TABLE IF NOT EXISTS homerooms (
    homeroom_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    grade_level TEXT NOT NULL CHECK (grade_level IN ('ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6')),
    room_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(school_id, academic_year, grade_level, room_name)
);

-- Earlier drafts keyed only by room_name, which can collide when every grade
-- uses room numbers 1–12. Replace that draft constraint when this script is rerun.
ALTER TABLE homerooms
    DROP CONSTRAINT IF EXISTS homerooms_school_id_academic_year_room_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_homerooms_unique_room
    ON homerooms(school_id, academic_year, grade_level, room_name);
CREATE INDEX IF NOT EXISTS idx_homerooms_school_year_grade
    ON homerooms(school_id, academic_year, grade_level, room_name);

CREATE TABLE IF NOT EXISTS student_homeroom_history (
    placement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users_students(student_id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    grade_level TEXT NOT NULL CHECK (grade_level IN ('ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6')),
    homeroom_id UUID REFERENCES homerooms(homeroom_id) ON DELETE SET NULL,
    placement_status TEXT NOT NULL DEFAULT 'active'
        CHECK (placement_status IN ('active', 'moved', 'transferred_out', 'withdrawn', 'completed')),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    change_reason TEXT,
    changed_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_homeroom_one_active
    ON student_homeroom_history(student_id, academic_year)
    WHERE placement_status = 'active' AND effective_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_homeroom_school_year_room
    ON student_homeroom_history(school_id, academic_year, homeroom_id, placement_status);

CREATE TABLE IF NOT EXISTS learning_groups (
    group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
    group_type TEXT NOT NULL
        CHECK (group_type IN ('subject', 'project', 'activity', 'support', 'custom')),
    group_name TEXT NOT NULL,
    room_name TEXT,
    grade_level TEXT CHECK (grade_level IS NULL OR grade_level IN ('ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6')),
    subject_id UUID REFERENCES subjects(subject_id) ON DELETE CASCADE,
    context_id UUID REFERENCES learning_contexts(context_id) ON DELETE CASCADE,
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (subject_id IS NULL OR context_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_groups_unique_source_room
    ON learning_groups(school_id, academic_year, semester, group_type, COALESCE(subject_id, context_id), COALESCE(room_name, group_name));
CREATE INDEX IF NOT EXISTS idx_learning_groups_school_term
    ON learning_groups(school_id, academic_year, semester, group_type, is_active);

CREATE TABLE IF NOT EXISTS learning_group_members (
    membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES learning_groups(group_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users_students(student_id) ON DELETE CASCADE,
    membership_status TEXT NOT NULL DEFAULT 'active'
        CHECK (membership_status IN ('active', 'moved', 'withdrawn')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    change_reason TEXT,
    changed_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_group_member_active
    ON learning_group_members(group_id, student_id)
    WHERE membership_status = 'active' AND left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_learning_group_members_student
    ON learning_group_members(student_id, membership_status);

CREATE TABLE IF NOT EXISTS learning_group_teachers (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES learning_groups(group_id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users_teachers(teacher_id) ON DELETE CASCADE,
    teaching_role TEXT NOT NULL DEFAULT 'co_teacher'
        CHECK (teaching_role IN ('lead_teacher', 'co_teacher', 'assistant')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    assigned_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_group_teacher_active
    ON learning_group_teachers(group_id, teacher_id)
    WHERE unassigned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_learning_group_teachers_teacher
    ON learning_group_teachers(teacher_id, unassigned_at);

CREATE TABLE IF NOT EXISTS import_mapping_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    data_type TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    column_mapping JSONB NOT NULL DEFAULT '{}'::JSONB,
    header_row INTEGER NOT NULL DEFAULT 1 CHECK (header_row > 0),
    created_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(school_id, data_type, profile_name)
);

-- Backfill current homerooms and placements without rewriting legacy columns.
INSERT INTO homerooms (school_id, academic_year, grade_level, room_name, display_name)
SELECT DISTINCT student.school_id,
       COALESCE(school.active_academic_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 543),
       student.current_grade_level,
       student.current_room,
       student.current_room
FROM users_students AS student
JOIN schools AS school ON school.school_id = student.school_id
WHERE student.current_grade_level IN ('ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6')
  AND NULLIF(TRIM(student.current_room), '') IS NOT NULL
ON CONFLICT (school_id, academic_year, grade_level, room_name) DO NOTHING;

INSERT INTO student_homeroom_history (
    school_id, student_id, academic_year, grade_level, homeroom_id, placement_status
)
SELECT student.school_id,
       student.student_id,
       homeroom.academic_year,
       student.current_grade_level,
       homeroom.homeroom_id,
       'active'
FROM users_students AS student
JOIN schools AS school ON school.school_id = student.school_id
JOIN homerooms AS homeroom
  ON homeroom.school_id = student.school_id
 AND homeroom.academic_year = COALESCE(school.active_academic_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 543)
 AND homeroom.grade_level = student.current_grade_level
 AND homeroom.room_name = student.current_room
WHERE NOT EXISTS (
    SELECT 1 FROM student_homeroom_history AS existing
    WHERE existing.student_id = student.student_id
      AND existing.academic_year = homeroom.academic_year
      AND existing.placement_status = 'active'
      AND existing.effective_to IS NULL
);

-- Create subject learning groups from the current enrollment structure.
INSERT INTO learning_groups (
    school_id, academic_year, semester, group_type, group_name, room_name,
    grade_level, subject_id
)
SELECT DISTINCT subject.school_id,
       subject.academic_year,
       subject.semester,
       'subject',
       subject.subject_name || COALESCE(' · ' || enrollment.room, ''),
       enrollment.room,
       subject.grade_level,
       subject.subject_id
FROM student_enrollments AS enrollment
JOIN subjects AS subject ON subject.subject_id = enrollment.subject_id
WHERE NULLIF(TRIM(enrollment.room), '') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO learning_group_members (group_id, student_id, membership_status)
SELECT learning_group.group_id, enrollment.student_id, 'active'
FROM student_enrollments AS enrollment
JOIN learning_groups AS learning_group
  ON learning_group.subject_id = enrollment.subject_id
 AND learning_group.room_name = enrollment.room
WHERE NOT EXISTS (
    SELECT 1 FROM learning_group_members AS existing
    WHERE existing.group_id = learning_group.group_id
      AND existing.student_id = enrollment.student_id
      AND existing.membership_status = 'active'
      AND existing.left_at IS NULL
);

INSERT INTO learning_group_teachers (group_id, teacher_id, teaching_role)
SELECT learning_group.group_id,
       subject_teacher.teacher_id,
       CASE WHEN subject.teacher_id = subject_teacher.teacher_id THEN 'lead_teacher' ELSE 'co_teacher' END
FROM learning_groups AS learning_group
JOIN subjects AS subject ON subject.subject_id = learning_group.subject_id
JOIN subject_teachers AS subject_teacher
  ON subject_teacher.subject_id = subject.subject_id
 AND subject_teacher.room_name = learning_group.room_name
WHERE NOT EXISTS (
    SELECT 1 FROM learning_group_teachers AS existing
    WHERE existing.group_id = learning_group.group_id
      AND existing.teacher_id = subject_teacher.teacher_id
      AND existing.unassigned_at IS NULL
);

COMMENT ON TABLE student_homeroom_history IS
    'Year-aware homeroom placement history; legacy current_grade_level/current_room remain compatibility fields only.';
COMMENT ON TABLE learning_groups IS
    'Flexible groups independent from homerooms: subjects, projects, activities, support groups and custom mixed-room groups.';

-- Security note: this demo still uses custom client-side authentication with the
-- anon key. Do not add permissive RLS policies. Before production, migrate to
-- Supabase Auth/MOE SSO, put school_id and role in verified app_metadata, enable
-- RLS on every public table, and scope policies by those verified claims.
