-- ============================================================
-- TIER 1 MIGRATION: Academic Year/Semester Filter + Student Grade/Room
-- ============================================================

-- 1. เพิ่มฟิลด์ active_academic_year / active_semester ใน schools
ALTER TABLE schools ADD COLUMN IF NOT EXISTS active_academic_year INTEGER DEFAULT 2569;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS active_semester INTEGER DEFAULT 1;

-- 2. เพิ่มฟิลด์ current_grade_level / current_room ใน users_students
ALTER TABLE users_students ADD COLUMN IF NOT EXISTS current_grade_level TEXT;
ALTER TABLE users_students ADD COLUMN IF NOT EXISTS current_room TEXT;

-- 3. อัปเดตข้อมูลตัวอย่าง (mockup) ให้ตรงกับข้อมูลที่มีอยู่
UPDATE schools SET active_academic_year = 2569, active_semester = 1
WHERE school_id = '11111111-1111-1111-1111-111111111111';

-- อัปเดต grade/room ให้นักเรียน mockup 
UPDATE users_students SET current_grade_level = 'ป.1', current_room = 'ป.1/1'
WHERE school_id = '11111111-1111-1111-1111-111111111111';

-- ============================================================
-- ปิด RLS ตารางใหม่ (ถ้ายังไม่ปิด)
-- ============================================================
-- (ไม่มีตารางใหม่ในรอบนี้ เป็นแค่ ALTER)
