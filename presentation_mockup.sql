-- ============================================================================
-- CBE Track — ชุดข้อมูลสาธิตหลักสูตรการศึกษาประถมศึกษาตอนต้น พ.ศ. 2568
-- รุ่น: 2569-07-19
--
-- หลักสำคัญ
--   1) ข้อมูลสถานศึกษาถูกจำกัดด้วย school_id ของโรงเรียนสาธิตเท่านั้น
--   2) ใช้ความสามารถ 8 ด้านตามหลักสูตร ไม่ใช้ "ด้านภาษาไทย/ด้านคณิตศาสตร์"
--   3) LO เป็นผลลัพธ์ที่สถานศึกษากำหนด จึงใช้รหัสภายในโรงเรียน ไม่ใช่รหัสวิชา
--   4) LO เดียวกันเชื่อมกับหลายรูปแบบได้: วิชา หน่วยการเรียนรู้ โครงงาน กิจกรรม
--   5) มีหลักฐานเชิงคุณภาพ สถานะส่งตรวจ และผลรับรองของฝ่ายวิชาการ
--
-- วิธีใช้: รัน cbe_track_demo_upgrade.sql ก่อน แล้วจึงรันไฟล์นี้
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1) ล้างข้อมูลเดิมเฉพาะโรงเรียนสาธิต โดยรักษาข้อมูลโรงเรียนอื่นไว้
-- --------------------------------------------------------------------------
DELETE FROM audit_logs
WHERE school_id = '11111111-1111-1111-1111-111111111111';

DELETE FROM user_identities
WHERE school_id = '11111111-1111-1111-1111-111111111111';

DELETE FROM phase_completion_results
WHERE school_id = '11111111-1111-1111-1111-111111111111';

DELETE FROM student_yearly_competency_evaluations
WHERE result_id IN (
    SELECT result_id FROM student_yearly_results
    WHERE school_id = '11111111-1111-1111-1111-111111111111'
);
DELETE FROM student_yearly_results
WHERE school_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM yearly_behavior_templates
WHERE school_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM yearly_competencies
WHERE school_id = '11111111-1111-1111-1111-111111111111';

DELETE FROM student_year_evaluations
WHERE student_id IN (
    SELECT student_id FROM users_students
    WHERE school_id = '11111111-1111-1111-1111-111111111111'
);

DELETE FROM lo_final_decisions
WHERE school_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM learning_context_evaluations
WHERE school_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM learning_context_lo_mappings
WHERE context_id IN (
    SELECT context_id FROM learning_contexts
    WHERE school_id = '11111111-1111-1111-1111-111111111111'
);
DELETE FROM learning_contexts
WHERE school_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM assessment_submissions
WHERE school_id = '11111111-1111-1111-1111-111111111111';

DELETE FROM lo_evaluations
WHERE enrollment_id IN (
    SELECT se.enrollment_id
    FROM student_enrollments se
    JOIN subjects s ON s.subject_id = se.subject_id
    WHERE s.school_id = '11111111-1111-1111-1111-111111111111'
)
OR lo_id IN (
    SELECT lo_id FROM learning_outcomes
    WHERE school_id = '11111111-1111-1111-1111-111111111111'
       OR (school_id IS NULL AND lo_code IN ('M1', 'M2', 'L3', 'L4'))
);

DELETE FROM subject_lo_mapping
WHERE subject_id IN (
    SELECT subject_id FROM subjects
    WHERE school_id = '11111111-1111-1111-1111-111111111111'
)
OR lo_id IN (
    SELECT lo_id FROM learning_outcomes
    WHERE school_id = '11111111-1111-1111-1111-111111111111'
       OR (school_id IS NULL AND lo_code IN ('M1', 'M2', 'L3', 'L4'))
);

DELETE FROM student_enrollments
WHERE subject_id IN (
    SELECT subject_id FROM subjects
    WHERE school_id = '11111111-1111-1111-1111-111111111111'
)
OR student_id IN (
    SELECT student_id FROM users_students
    WHERE school_id = '11111111-1111-1111-1111-111111111111'
);

DELETE FROM subjects
WHERE school_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM learning_outcomes
WHERE school_id = '11111111-1111-1111-1111-111111111111'
   OR (school_id IS NULL AND lo_code IN ('M1', 'M2', 'L3', 'L4'));
DELETE FROM users_students
WHERE school_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM users_teachers
WHERE school_id = '11111111-1111-1111-1111-111111111111';

-- คำบรรยายระดับความสามารถเป็นข้อมูลกลาง จึงลบเฉพาะหมวดที่ชุดสาธิตเคยสร้าง
DELETE FROM behavior_templates
WHERE competency_area IN (
    'ภาษาไทย', 'คณิตศาสตร์', 'การใช้ภาษา', 'การคิดคำนวณ',
    'ความสามารถด้านภาษาไทย', 'ความสามารถด้านคณิตศาสตร์',
    'ความสามารถด้านการอ่าน', 'ความสามารถด้านการเขียน',
    'ความสามารถด้านการคิดคำนวณ',
    'ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี',
    'ความสามารถด้านสังคมและความเป็นพลเมือง',
    'ความสามารถด้านเศรษฐกิจและการเงิน',
    'ความสามารถด้านสุขภาพกายและจิต',
    'ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ'
);

-- --------------------------------------------------------------------------
-- 2) โรงเรียน บุคลากร และผู้เรียน
-- --------------------------------------------------------------------------
UPDATE schools
SET school_name = 'โรงเรียนสาธิตต้นแบบ CBE Track',
    active_academic_year = 2569,
    active_semester = 1,
    is_active = TRUE
WHERE school_id = '11111111-1111-1111-1111-111111111111';

-- บัญชีทั้งหมดใช้รหัสผ่านสาธิต 01012540
INSERT INTO users_teachers (
    teacher_id, school_id, citizen_id, plain_password, password_hash,
    prefix, first_name, last_name, role, homeroom, is_active
) VALUES
('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '1111111111111', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', 'นาง', 'พิมพ์ชนก', 'วิชาการ', 'admin', NULL, TRUE),
('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '2222222222222', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', 'นาง', 'กมลวรรณ', 'ใจดี', 'teacher', 'ป.1/1', TRUE),
('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '3333333333333', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', 'นาย', 'ธนกฤต', 'คิดเป็น', 'teacher', 'ป.1/2', TRUE),
('a4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '4444444444444', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', 'นางสาว', 'ศิริพร', 'สร้างสรรค์', 'teacher', NULL, TRUE),
('a5555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '5555555555555', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', 'นาย', 'ณรงค์ชัย', 'บริหารดี', 'executive', NULL, TRUE);

INSERT INTO users_students (
    student_id, school_id, citizen_id, plain_password, password_hash,
    student_code, prefix, first_name, last_name, student_status,
    current_grade_level, current_room
) VALUES
('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '9100000000001', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', '69001', 'ด.ช.', 'ภูมิพัฒน์', 'ตั้งใจเรียน', 'active', 'ป.1', 'ป.1/1'),
('b2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '9100000000002', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', '69002', 'ด.ญ.', 'ปุณณภา', 'ใฝ่รู้', 'active', 'ป.1', 'ป.1/1'),
('b3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '9100000000003', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', '69003', 'ด.ช.', 'ธีรภัทร', 'มีวินัย', 'active', 'ป.1', 'ป.1/1'),
('b4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '9100000000004', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', '69004', 'ด.ญ.', 'ชนัญชิดา', 'แบ่งปัน', 'active', 'ป.1', 'ป.1/1'),
('b5555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '9100000000005', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', '69005', 'ด.ช.', 'นราวิชญ์', 'ช่างสังเกต', 'active', 'ป.1', 'ป.1/2'),
('b6666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '9100000000006', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', '69006', 'ด.ญ.', 'พิชญาภา', 'สร้างสรรค์', 'active', 'ป.1', 'ป.1/2'),
('b7777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', '9100000000007', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', '69007', 'ด.ช.', 'กฤตภาส', 'ร่วมมือดี', 'active', 'ป.1', 'ป.1/2'),
('b8888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', '9100000000008', '01012540', 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0', '69008', 'ด.ญ.', 'ณิชาภัทร', 'พากเพียร', 'active', 'ป.1', 'ป.1/2');

-- --------------------------------------------------------------------------
-- 3) LO ตามหลักสูตรสถานศึกษา ครบ 8 ด้านตามหลักสูตร พ.ศ. 2568
-- --------------------------------------------------------------------------
INSERT INTO learning_outcomes (
    lo_id, school_id, lo_code, ability_no, level_group,
    competency_area, lo_description, is_active
) VALUES
('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'SCH-P1-LO-01', 1, 'ป.ต้น', 'ความสามารถด้านการอ่าน', 'อ่านคำ ประโยค และข้อความสั้นจากเรื่องใกล้ตัว แล้วบอกสาระสำคัญหรือข้อมูลที่นำไปใช้ได้', TRUE),
('e2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'SCH-P1-LO-02', 2, 'ป.ต้น', 'ความสามารถด้านการเขียน', 'เขียนคำและประโยคสั้นเพื่อถ่ายทอดข้อมูล ความคิด หรือความรู้สึก โดยสื่อความหมายได้เหมาะสมกับสถานการณ์', TRUE),
('e3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'SCH-P1-LO-03', 3, 'ป.ต้น', 'ความสามารถด้านการคิดคำนวณ', 'ใช้จำนวนนับ การบวก และการลบเพื่อแก้ปัญหาใกล้ตัว พร้อมอธิบายวิธีคิดด้วยภาษาหรือสื่อที่เข้าใจได้', TRUE),
('e4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'SCH-P1-LO-04', 4, 'ป.ต้น', 'ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี', 'สังเกต ตั้งคำถาม รวบรวมหลักฐาน และอธิบายการเปลี่ยนแปลงของสิ่งรอบตัว โดยใช้เครื่องมือหรือเทคโนโลยีอย่างเหมาะสม', TRUE),
('e5555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'SCH-P1-LO-05', 5, 'ป.ต้น', 'ความสามารถด้านสังคมและความเป็นพลเมือง', 'ปฏิบัติตนตามข้อตกลง รับฟังผู้อื่น ร่วมตัดสินใจ และรับผิดชอบหน้าที่ของตนในห้องเรียนและชุมชน', TRUE),
('e6666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'SCH-P1-LO-06', 6, 'ป.ต้น', 'ความสามารถด้านเศรษฐกิจและการเงิน', 'วางแผนใช้ทรัพยากรและเงินในสถานการณ์ใกล้ตัว แยกความจำเป็นกับความต้องการ และตัดสินใจอย่างมีเหตุผล', TRUE),
('e7777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'SCH-P1-LO-07', 7, 'ป.ต้น', 'ความสามารถด้านสุขภาพกายและจิต', 'ดูแลสุขอนามัยและความปลอดภัยของตน สังเกตอารมณ์ และเลือกวิธีจัดการตนเองหรือขอความช่วยเหลือได้เหมาะสม', TRUE),
('e8888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'SCH-P1-LO-08', 8, 'ป.ต้น', 'ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 'สร้างสรรค์และนำเสนอผลงานจากเสียง สี รูปร่าง การเคลื่อนไหว หรือเรื่องราวท้องถิ่น พร้อมบอกความรู้สึกและคุณค่าที่รับรู้', TRUE);

-- --------------------------------------------------------------------------
-- 4) รูปแบบที่ 1: วิชา (ไม่มีรหัสวิชาในหลักสูตร 2568)
-- --------------------------------------------------------------------------
INSERT INTO subjects (
    subject_id, school_id, academic_year, semester, subject_code,
    subject_name, grade_level, subject_group, teacher_id
) VALUES
('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 2569, 1, NULL, 'ภาษาไทย: อ่าน เขียน สื่อสาร', 'ป.1', 'ภาษาไทย', 'a2222222-2222-2222-2222-222222222222'),
('c2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 2569, 1, NULL, 'คณิตคิดรอบตัว', 'ป.1', 'คณิตศาสตร์', 'a3333333-3333-3333-3333-333333333333'),
('c3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 2569, 1, NULL, 'วิทยาศาสตร์และสิ่งแวดล้อมใกล้ตัว', 'ป.1', 'วิทยาศาสตร์', 'a4444444-4444-4444-4444-444444444444'),
('c4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 2569, 1, NULL, 'ชีวิต ศิลปะ และชุมชน', 'ป.1', 'สังคม สุขภาวะ และศิลปะ', 'a2222222-2222-2222-2222-222222222222');

INSERT INTO subject_lo_mapping (mapping_id, subject_id, lo_id) VALUES
('f1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111'),
('f1111111-1111-1111-1111-111111111112', 'c1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222'),
('f2222222-2222-2222-2222-222222222221', 'c2222222-2222-2222-2222-222222222222', 'e1111111-1111-1111-1111-111111111111'),
('f2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'e3333333-3333-3333-3333-333333333333'),
('f2222222-2222-2222-2222-222222222223', 'c2222222-2222-2222-2222-222222222222', 'e6666666-6666-6666-6666-666666666666'),
('f3333333-3333-3333-3333-333333333331', 'c3333333-3333-3333-3333-333333333333', 'e1111111-1111-1111-1111-111111111111'),
('f3333333-3333-3333-3333-333333333332', 'c3333333-3333-3333-3333-333333333333', 'e4444444-4444-4444-4444-444444444444'),
('f4444444-4444-4444-4444-444444444441', 'c4444444-4444-4444-4444-444444444444', 'e2222222-2222-2222-2222-222222222222'),
('f4444444-4444-4444-4444-444444444442', 'c4444444-4444-4444-4444-444444444444', 'e5555555-5555-5555-5555-555555555555'),
('f4444444-4444-4444-4444-444444444443', 'c4444444-4444-4444-4444-444444444444', 'e7777777-7777-7777-7777-777777777777'),
('f4444444-4444-4444-4444-444444444444', 'c4444444-4444-4444-4444-444444444444', 'e8888888-8888-8888-8888-888888888888');

INSERT INTO student_enrollments (student_id, subject_id, room, attendance_percent)
SELECT st.student_id, sb.subject_id, st.current_room,
       CASE RIGHT(st.student_code, 1)
           WHEN '8' THEN 82.50 WHEN '7' THEN 88.00 WHEN '6' THEN 91.50
           ELSE 96.00
       END
FROM users_students st
CROSS JOIN subjects sb
WHERE st.school_id = '11111111-1111-1111-1111-111111111111'
  AND sb.school_id = '11111111-1111-1111-1111-111111111111';

INSERT INTO lo_evaluations (
    enrollment_id, lo_id, competency_level, evaluated_by,
    evidence_note, workflow_status, submitted_at, updated_at
)
SELECT se.enrollment_id, slm.lo_id,
       CASE (RIGHT(st.student_code, 1)::INTEGER + lo.ability_no) % 4
           WHEN 0 THEN 'เชี่ยวชาญ'
           WHEN 1 THEN 'ชำนาญ'
           WHEN 2 THEN 'พัฒนา'
           ELSE 'เริ่มต้น'
       END,
       sb.teacher_id,
       CASE lo.lo_code
           WHEN 'SCH-P1-LO-01' THEN 'อ่านข้อมูลจากบัตรคำและป้ายในสถานการณ์เรียนรู้ แล้วบอกสาระสำคัญโดยอ้างอิงข้อความที่อ่าน'
           WHEN 'SCH-P1-LO-02' THEN 'เขียนข้อความสั้นเพื่อสื่อสารกับเพื่อน โดยเรียงลำดับความคิดและปรับแก้จากข้อเสนอแนะ'
           WHEN 'SCH-P1-LO-03' THEN 'ใช้สื่อรูปธรรมคำนวณจำนวน อธิบายวิธีคิด และตรวจสอบคำตอบจากสถานการณ์ซื้อขายจำลอง'
           WHEN 'SCH-P1-LO-04' THEN 'บันทึกสิ่งที่สังเกต เปรียบเทียบหลักฐาน และอธิบายการเปลี่ยนแปลงของวัสดุหรือสิ่งมีชีวิตใกล้ตัว'
           WHEN 'SCH-P1-LO-05' THEN 'ทำหน้าที่ตามข้อตกลง รับฟังความคิดเห็น และร่วมตัดสินใจในการทำงานกลุ่ม'
           WHEN 'SCH-P1-LO-06' THEN 'จำแนกความจำเป็นและความต้องการ วางแผนใช้เงินจำลอง และบอกเหตุผลของการเลือก'
           WHEN 'SCH-P1-LO-07' THEN 'ปฏิบัติกิจวัตรด้านสุขอนามัย บอกอารมณ์ของตน และเลือกวิธีดูแลตนเองได้เหมาะสม'
           ELSE 'สร้างและนำเสนอผลงานจากเรื่องราวท้องถิ่น พร้อมอธิบายความรู้สึกและสิ่งที่ต้องการสื่อ'
       END,
       CASE WHEN RIGHT(st.student_code, 1) IN ('7', '8') THEN 'draft' ELSE 'submitted' END,
       CASE WHEN RIGHT(st.student_code, 1) IN ('7', '8') THEN NULL ELSE NOW() END,
       NOW()
FROM student_enrollments se
JOIN users_students st ON st.student_id = se.student_id
JOIN subjects sb ON sb.subject_id = se.subject_id
JOIN subject_lo_mapping slm ON slm.subject_id = sb.subject_id
JOIN learning_outcomes lo ON lo.lo_id = slm.lo_id
WHERE sb.school_id = '11111111-1111-1111-1111-111111111111';

INSERT INTO assessment_submissions (
    school_id, subject_id, academic_year, semester, teacher_id, status,
    teacher_note, reviewer_comment, submitted_at, reviewed_by, reviewed_at
)
SELECT sb.school_id, sb.subject_id, sb.academic_year, sb.semester, sb.teacher_id,
       CASE sb.subject_id
           WHEN 'c1111111-1111-1111-1111-111111111111' THEN 'approved'
           WHEN 'c2222222-2222-2222-2222-222222222222' THEN 'under_review'
           WHEN 'c3333333-3333-3333-3333-333333333333' THEN 'returned'
           ELSE 'submitted'
       END,
       'ส่งผลพร้อมหลักฐานรายบุคคลตาม LO ที่รับผิดชอบ',
       CASE WHEN sb.subject_id = 'c3333333-3333-3333-3333-333333333333'
            THEN 'กรุณาเพิ่มหลักฐานจากการสังเกตระหว่างปฏิบัติงานของนักเรียนสองคน'
            WHEN sb.subject_id = 'c1111111-1111-1111-1111-111111111111'
            THEN 'ตรวจสอบหลักฐานและรับรองผลแล้ว'
            ELSE NULL END,
       NOW(),
       CASE WHEN sb.subject_id IN ('c1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333')
            THEN 'a1111111-1111-1111-1111-111111111111'::UUID ELSE NULL END,
       CASE WHEN sb.subject_id IN ('c1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333')
            THEN NOW() ELSE NULL END
FROM subjects sb
WHERE sb.school_id = '11111111-1111-1111-1111-111111111111';

-- --------------------------------------------------------------------------
-- 5) รูปแบบที่ 2–4: หน่วยการเรียนรู้ โครงงาน และกิจกรรม
-- --------------------------------------------------------------------------
INSERT INTO learning_contexts (
    context_id, school_id, context_type, context_code, context_name,
    description, academic_year, semester, grade_level,
    responsible_teacher_id, is_active
) VALUES
('91111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'learning_unit', 'UNIT-P1-01', 'หน่วยการเรียนรู้ ชุมชนของเรา', 'เรียนรู้ข้อมูล บุคคล สถานที่ กติกา และสิ่งแวดล้อมในชุมชนผ่านการสำรวจและสื่อสารผล', 2569, 1, 'ป.1', 'a2222222-2222-2222-2222-222222222222', TRUE),
('92222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'project', 'PROJECT-P1-01', 'โครงงาน ตลาดนัดพอเพียง', 'วางแผนผลิตภัณฑ์อย่างง่าย สำรวจต้นทุน ตั้งราคา สื่อสาร และสะท้อนการใช้ทรัพยากรอย่างรับผิดชอบ', 2569, 1, 'ป.1', 'a3333333-3333-3333-3333-333333333333', TRUE),
('93333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'activity', 'ACTIVITY-P1-01', 'กิจกรรม สุขภาวะดี มีสุนทรียภาพ', 'ฝึกดูแลสุขภาพกายและจิต ทำงานร่วมกัน และสร้างสรรค์ผลงานจากศิลปวัฒนธรรมในท้องถิ่น', 2569, 1, 'ป.1', 'a4444444-4444-4444-4444-444444444444', TRUE);

INSERT INTO learning_context_lo_mappings (context_id, lo_id) VALUES
('91111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111'),
('91111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222'),
('91111111-1111-1111-1111-111111111111', 'e4444444-4444-4444-4444-444444444444'),
('91111111-1111-1111-1111-111111111111', 'e5555555-5555-5555-5555-555555555555'),
('92222222-2222-2222-2222-222222222222', 'e1111111-1111-1111-1111-111111111111'),
('92222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222222'),
('92222222-2222-2222-2222-222222222222', 'e3333333-3333-3333-3333-333333333333'),
('92222222-2222-2222-2222-222222222222', 'e6666666-6666-6666-6666-666666666666'),
('93333333-3333-3333-3333-333333333333', 'e5555555-5555-5555-5555-555555555555'),
('93333333-3333-3333-3333-333333333333', 'e7777777-7777-7777-7777-777777777777'),
('93333333-3333-3333-3333-333333333333', 'e8888888-8888-8888-8888-888888888888');

INSERT INTO learning_context_evaluations (
    school_id, context_id, student_id, lo_id, competency_level,
    evidence_note, evaluated_by, workflow_status, submitted_at, updated_at
)
SELECT lc.school_id, lc.context_id, st.student_id, map.lo_id,
       CASE (RIGHT(st.student_code, 1)::INTEGER + lo.ability_no + 1) % 4
           WHEN 0 THEN 'เชี่ยวชาญ'
           WHEN 1 THEN 'ชำนาญ'
           WHEN 2 THEN 'พัฒนา'
           ELSE 'เริ่มต้น'
       END,
       CASE lc.context_type
           WHEN 'learning_unit' THEN 'รวบรวมข้อมูลจากการสำรวจชุมชน ทำงานตามหน้าที่ และนำเสนอสิ่งที่ค้นพบโดยอ้างอิงหลักฐาน'
           WHEN 'project' THEN 'ร่วมวางแผนตลาดนัด ใช้ข้อมูลตัดสินใจ แก้ปัญหาระหว่างทำงาน และสะท้อนผลการเรียนรู้ของตน'
           ELSE 'ปฏิบัติกิจกรรมสุขภาวะและสร้างสรรค์ผลงานร่วมกับผู้อื่น พร้อมอธิบายความรู้สึกและคุณค่าที่รับรู้'
       END,
       lc.responsible_teacher_id,
       CASE WHEN RIGHT(st.student_code, 1) = '8' THEN 'draft' ELSE 'submitted' END,
       CASE WHEN RIGHT(st.student_code, 1) = '8' THEN NULL ELSE NOW() END,
       NOW()
FROM learning_contexts lc
JOIN learning_context_lo_mappings map ON map.context_id = lc.context_id
JOIN learning_outcomes lo ON lo.lo_id = map.lo_id
CROSS JOIN users_students st
WHERE lc.school_id = '11111111-1111-1111-1111-111111111111'
  AND st.school_id = lc.school_id;

-- --------------------------------------------------------------------------
-- 6) ผลตัดสินสุดท้ายโดยฝ่ายวิชาการ (ข้อมูลบางส่วนตั้งใจให้รอตรวจ)
-- --------------------------------------------------------------------------
INSERT INTO lo_final_decisions (
    school_id, student_id, lo_id, academic_year, semester,
    final_level, pass_status, decision_status, decision_reason,
    decided_by, decided_at, is_locked
)
SELECT '11111111-1111-1111-1111-111111111111', st.student_id, lo.lo_id, 2569, 1,
       CASE WHEN RIGHT(st.student_code, 1) IN ('7', '8') THEN NULL
            WHEN (RIGHT(st.student_code, 1)::INTEGER + lo.ability_no) % 4 = 0 THEN 'เชี่ยวชาญ'
            WHEN (RIGHT(st.student_code, 1)::INTEGER + lo.ability_no) % 4 = 1 THEN 'ชำนาญ'
            WHEN (RIGHT(st.student_code, 1)::INTEGER + lo.ability_no) % 4 = 2 THEN 'พัฒนา'
            ELSE 'เริ่มต้น' END,
       CASE WHEN RIGHT(st.student_code, 1) IN ('7', '8') THEN 'pending'
            WHEN (RIGHT(st.student_code, 1)::INTEGER + lo.ability_no) % 4 = 3 THEN 'not_passed'
            ELSE 'passed' END,
       CASE WHEN RIGHT(st.student_code, 1) IN ('7', '8') THEN 'pending' ELSE 'approved' END,
       CASE WHEN RIGHT(st.student_code, 1) IN ('7', '8')
            THEN 'รอครูส่งหลักฐานให้ครบจากรูปแบบการจัดการเรียนรู้ที่เกี่ยวข้อง'
            ELSE 'พิจารณาหลักฐานเชิงคุณภาพจากครูผู้ประเมินทุกแหล่งและรับรองผลแล้ว' END,
       CASE WHEN RIGHT(st.student_code, 1) IN ('7', '8') THEN NULL
            ELSE 'a1111111-1111-1111-1111-111111111111'::UUID END,
       CASE WHEN RIGHT(st.student_code, 1) IN ('7', '8') THEN NULL ELSE NOW() END,
       CASE WHEN RIGHT(st.student_code, 1) IN ('7', '8') THEN FALSE ELSE TRUE END
FROM users_students st
CROSS JOIN learning_outcomes lo
WHERE st.school_id = '11111111-1111-1111-1111-111111111111'
  AND lo.school_id = st.school_id;

INSERT INTO student_year_evaluations (
    student_id, academic_year, semester, activity_status,
    character_status, evaluator_id, updated_at
)
SELECT student_id, 2569, 1,
       CASE WHEN RIGHT(student_code, 1) = '8' THEN 'ไม่ผ่าน' ELSE 'ผ่าน' END,
       'ผ่าน',
       CASE WHEN current_room = 'ป.1/1'
            THEN 'a2222222-2222-2222-2222-222222222222'::UUID
            ELSE 'a3333333-3333-3333-3333-333333333333'::UUID END,
       NOW()
FROM users_students
WHERE school_id = '11111111-1111-1111-1111-111111111111';

-- --------------------------------------------------------------------------
-- 7) คำบรรยายระดับความสามารถ 4 ระดับสำหรับความสามารถ 8 ด้าน
--    เป็นข้อความสาธิตเชิงระบบ ไม่แทนเอกสารคำบรรยายกลางฉบับประกาศใช้
-- --------------------------------------------------------------------------
WITH capabilities(competency_area) AS (VALUES
    ('ความสามารถด้านการอ่าน'),
    ('ความสามารถด้านการเขียน'),
    ('ความสามารถด้านการคิดคำนวณ'),
    ('ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี'),
    ('ความสามารถด้านสังคมและความเป็นพลเมือง'),
    ('ความสามารถด้านเศรษฐกิจและการเงิน'),
    ('ความสามารถด้านสุขภาพกายและจิต'),
    ('ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ')
), levels(competency_level, behavior_text) AS (VALUES
    ('เริ่มต้น', 'ปฏิบัติได้บางส่วนในสถานการณ์ที่คุ้นเคย เมื่อมีแบบอย่างและได้รับการช่วยเหลืออย่างใกล้ชิด'),
    ('พัฒนา', 'ปฏิบัติได้ในสถานการณ์ที่คุ้นเคย เมื่อได้รับคำชี้แนะบางส่วน และเริ่มตรวจสอบงานของตน'),
    ('ชำนาญ', 'ปฏิบัติได้ด้วยตนเองอย่างสม่ำเสมอ เลือกวิธีดำเนินงานที่เหมาะสม และอธิบายเหตุผลได้'),
    ('เชี่ยวชาญ', 'ประยุกต์ใช้ได้อย่างคล่องแคล่วในสถานการณ์ที่หลากหลายหรือสถานการณ์ใหม่ อธิบายเหตุผลและถ่ายโอนการเรียนรู้ได้')
)
INSERT INTO behavior_templates (competency_area, competency_level, behavior_text)
SELECT competency_area, competency_level, behavior_text
FROM capabilities CROSS JOIN levels;

-- --------------------------------------------------------------------------
-- 8) ความคาดหวังรายชั้นปีและคำบรรยายสำหรับรายงาน ปพ.๖ (โรงเรียนกำหนด)
-- --------------------------------------------------------------------------
INSERT INTO yearly_competencies (
    competency_id, school_id, grade_level, competency_no, description, expected_level
) SELECT lo.lo_id, lo.school_id, 'ป.1', lo.ability_no, lo.lo_description,
         CASE WHEN lo.ability_no <= 3 THEN 'พัฒนา' ELSE 'เริ่มต้น' END
  FROM learning_outcomes lo
 WHERE lo.school_id = '11111111-1111-1111-1111-111111111111';

INSERT INTO yearly_behavior_templates (
    school_id, grade_level, competency_no, competency_level, behavior_text
)
SELECT '11111111-1111-1111-1111-111111111111', 'ป.1', lo.ability_no,
       bt.competency_level, bt.behavior_text
FROM learning_outcomes lo
JOIN behavior_templates bt ON bt.competency_area = lo.competency_area
WHERE lo.school_id = '11111111-1111-1111-1111-111111111111';

INSERT INTO student_yearly_results (
    school_id, student_id, academic_year, grade_level,
    attendance_percent, learner_activities, desirable_chars
)
SELECT st.school_id, st.student_id, 2569, 'ป.1',
       ROUND(AVG(se.attendance_percent), 2),
       CASE WHEN RIGHT(st.student_code, 1) = '8' THEN 'ไม่ผ่าน' ELSE 'ผ่าน' END,
       'ผ่าน'
FROM users_students st
JOIN student_enrollments se ON se.student_id = st.student_id
WHERE st.school_id = '11111111-1111-1111-1111-111111111111'
GROUP BY st.school_id, st.student_id, st.student_code;

INSERT INTO student_yearly_competency_evaluations (
    result_id, competency_id, achieved_level
)
SELECT syr.result_id, yc.competency_id,
       CASE (RIGHT(st.student_code, 1)::INTEGER + yc.competency_no) % 4
           WHEN 0 THEN 'เชี่ยวชาญ'
           WHEN 1 THEN 'ชำนาญ'
           WHEN 2 THEN 'พัฒนา'
           ELSE 'เริ่มต้น'
       END
FROM student_yearly_results syr
JOIN users_students st ON st.student_id = syr.student_id
JOIN yearly_competencies yc
  ON yc.school_id = syr.school_id AND yc.grade_level = syr.grade_level
WHERE syr.school_id = '11111111-1111-1111-1111-111111111111';

-- --------------------------------------------------------------------------
-- 9) คำบรรยายกลางเมื่อจบช่วงชั้น ครบ 8 ด้าน × 4 ระดับ × 2 ช่วงชั้น
-- --------------------------------------------------------------------------
DELETE FROM central_phase_behaviors
WHERE ability_key IN (
    'reading', 'writing', 'math', 'numeracy', 'applied', 'language', 'science',
    'social', 'economics', 'health', 'arts',
    'science_environment_technology', 'society_citizenship',
    'economics_finance', 'physical_mental_health', 'arts_culture_aesthetics'
);

WITH phases(phase) AS (VALUES ('ตอนต้น'), ('ตอนปลาย')),
abilities(ability_key) AS (VALUES
    ('reading'), ('writing'), ('numeracy'),
    ('science_environment_technology'), ('society_citizenship'),
    ('economics_finance'), ('physical_mental_health'), ('arts_culture_aesthetics')
), levels(competency_level, behavior_text) AS (VALUES
    ('เริ่มต้น', 'ปฏิบัติได้บางส่วนในสถานการณ์ที่คุ้นเคย โดยต้องมีแบบอย่างและการช่วยเหลืออย่างใกล้ชิด'),
    ('พัฒนา', 'ปฏิบัติได้ในสถานการณ์ที่คุ้นเคยเมื่อได้รับคำชี้แนะบางส่วน และเริ่มกำกับตนเองได้'),
    ('ชำนาญ', 'ปฏิบัติได้ด้วยตนเองอย่างสม่ำเสมอในสถานการณ์ที่หลากหลาย และอธิบายเหตุผลได้'),
    ('เชี่ยวชาญ', 'ประยุกต์ใช้ได้อย่างคล่องแคล่วในสถานการณ์ใหม่ เชื่อมโยงความรู้ และถ่ายโอนการเรียนรู้ได้')
)
INSERT INTO central_phase_behaviors (phase, ability_key, competency_level, behavior_text)
SELECT phase, ability_key, competency_level, behavior_text
FROM phases CROSS JOIN abilities CROSS JOIN levels;

-- --------------------------------------------------------------------------
-- 10) ประวัติการดำเนินงานสำหรับการตรวจสอบย้อนหลัง
-- --------------------------------------------------------------------------
INSERT INTO audit_logs (
    school_id, actor_id, actor_role, action, entity_type, entity_id, detail
) VALUES
('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'admin', 'IMPORT_DEMO_DATA_2568', 'school', '11111111-1111-1111-1111-111111111111', '{"source":"presentation_mockup.sql","curriculum":"หลักสูตรการศึกษาประถมศึกษาตอนต้น พ.ศ. 2568","tenant_safe":true}'::JSONB),
('11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'teacher', 'SUBMIT_SUBJECT_ASSESSMENT', 'subject', 'c1111111-1111-1111-1111-111111111111', '{"status":"submitted","evidence":"complete"}'::JSONB),
('11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'admin', 'APPROVE_LO_RESULTS', 'learning_outcome', 'e1111111-1111-1111-1111-111111111111', '{"decision":"approved","reviewed_sources":["subject","learning_unit","project"]}'::JSONB);

COMMIT;

-- ตรวจผลหลังรัน
SELECT competency_area, COUNT(*) AS lo_count
FROM learning_outcomes
WHERE school_id = '11111111-1111-1111-1111-111111111111'
GROUP BY competency_area
ORDER BY MIN(ability_no);

SELECT context_type, COUNT(*) AS format_count
FROM learning_contexts
WHERE school_id = '11111111-1111-1111-1111-111111111111'
GROUP BY context_type
ORDER BY context_type;
