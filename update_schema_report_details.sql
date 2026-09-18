-- ============================================================================
-- CBE Track — ชื่อผู้ลงนามในเอกสาร และประเภทของรายการเรียนรู้
-- เพิ่มคอลัมน์อย่างเดียว รันซ้ำได้ ไม่กระทบข้อมูลเดิม
-- ============================================================================

BEGIN;

-- 1) ชื่อผู้ลงนามท้ายเอกสารที่พิมพ์ (ปกแฟ้มรายวิชา รายงานผู้ปกครอง ปพ.6)
ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS academic_head_name TEXT,
    ADD COLUMN IF NOT EXISTS academic_deputy_name TEXT,
    ADD COLUMN IF NOT EXISTS director_name TEXT;

COMMENT ON COLUMN schools.academic_head_name IS 'ชื่อหัวหน้าฝ่ายวิชาการ ใช้พิมพ์ในช่องลงชื่อของเอกสาร';
COMMENT ON COLUMN schools.academic_deputy_name IS 'ชื่อรองผู้อำนวยการฝ่ายวิชาการ ใช้พิมพ์ในช่องลงชื่อของเอกสาร';
COMMENT ON COLUMN schools.director_name IS 'ชื่อผู้อำนวยการโรงเรียน ใช้พิมพ์ในช่องลงชื่อของเอกสาร';

-- 2) ประเภทของรายการเรียนรู้ ตอนนำเข้าทุกอย่างถูกเก็บเป็นวิชา
--    บางรายการเป็นโครงงาน หน่วยการเรียนรู้ หรือกิจกรรม ค่าว่างคือวิชาเหมือนเดิม
ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS learning_format TEXT;

ALTER TABLE subjects
    DROP CONSTRAINT IF EXISTS subjects_learning_format_check;
ALTER TABLE subjects
    ADD CONSTRAINT subjects_learning_format_check
    CHECK (learning_format IS NULL OR learning_format IN ('subject', 'learning_unit', 'project', 'activity'));

COMMENT ON COLUMN subjects.learning_format IS 'ประเภทของรายการเรียนรู้: subject | learning_unit | project | activity (ว่าง = วิชา)';

-- 3) ตารางกิจกรรมพัฒนาผู้เรียนและคุณลักษณะอันพึงประสงค์เปิด RLS ไว้ตั้งแต่ตอนสร้าง
--    และ policy ให้สิทธิ์เฉพาะ role authenticated ซึ่งระบบนี้ไม่ได้ใช้ ครูจึงบันทึกผลไม่ได้เลย
--    ปรับให้เหมือนตารางอื่นในระบบ
ALTER TABLE student_year_evaluations DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

COMMIT;
