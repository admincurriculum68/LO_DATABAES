-- ============================================================================
-- CBE Track — รองรับครู 1 คนมีหลายบทบาท
-- ============================================================================
-- ที่มา: โรงเรียนที่ทดลองใช้แจ้งว่าครู 1 ท่านมักปฏิบัติหน้าที่หลายตำแหน่งพร้อมกัน
-- เช่นเป็นทั้งครูผู้สอนและเจ้าหน้าที่ฝ่ายวิชาการ แต่ระบบให้เลือกได้บทบาทเดียว
-- ทำให้ครูต้องยืมเลขประจำตัวประชาชนของเพื่อนครูมาเข้าระบบ ซึ่งทำให้ข้อมูล
-- ผู้ประเมินและผู้รับรองผลถูกบันทึกผิดคน
--
-- สคริปต์นี้เพิ่มอย่างเดียว ไม่มีคำสั่งลบข้อมูล และรันซ้ำได้
-- ============================================================================

-- 1) ตารางบทบาทของครู -------------------------------------------------------
-- users_teachers.role เดิมยังคงอยู่ ใช้เป็น "บทบาทหลัก" สำหรับตัดสินหน้าแรก
-- หลังเข้าสู่ระบบ ส่วนตารางนี้เก็บบทบาททั้งหมดที่ครูคนนั้นปฏิบัติจริง
CREATE TABLE IF NOT EXISTS teacher_roles (
    teacher_role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users_teachers(teacher_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'admin', 'executive')),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (teacher_id, role)
);

-- ครู 1 คนมีบทบาทหลักได้เพียงบทบาทเดียว
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_roles_primary
    ON teacher_roles(teacher_id)
    WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_teacher_roles_role
    ON teacher_roles(role);

COMMENT ON TABLE teacher_roles IS
    'บทบาททั้งหมดที่ครูแต่ละคนปฏิบัติ ครูคนเดียวเป็นได้ทั้งครูผู้สอนและฝ่ายวิชาการ';
COMMENT ON COLUMN teacher_roles.is_primary IS
    'บทบาทหลัก ใช้ตัดสินหน้าแรกหลังเข้าสู่ระบบ มีได้คนละ 1 บทบาท';

-- 2) ย้ายข้อมูลเดิมเข้าตารางใหม่ ---------------------------------------------
-- ครูทุกคนที่มีอยู่ได้บทบาทเดิมของตนเป็นบทบาทหลัก
INSERT INTO teacher_roles (teacher_id, role, is_primary)
SELECT t.teacher_id,
       CASE WHEN t.role IN ('teacher', 'admin', 'executive') THEN t.role ELSE 'teacher' END,
       TRUE
FROM users_teachers AS t
WHERE NOT EXISTS (
    SELECT 1 FROM teacher_roles AS existing
    WHERE existing.teacher_id = t.teacher_id
);

-- 3) กันข้อมูลกำพร้า ---------------------------------------------------------
-- ครูที่ไม่มีบทบาทหลักเลย (เช่นถูกลบแถวไปโดยไม่ตั้งใจ) ให้ยกบทบาทแรกขึ้นเป็นหลัก
UPDATE teacher_roles
SET is_primary = TRUE, updated_at = NOW()
WHERE teacher_role_id IN (
    SELECT DISTINCT ON (r.teacher_id) r.teacher_role_id
    FROM teacher_roles AS r
    WHERE NOT EXISTS (
        SELECT 1 FROM teacher_roles AS p
        WHERE p.teacher_id = r.teacher_id AND p.is_primary
    )
    ORDER BY r.teacher_id, r.created_at
);
