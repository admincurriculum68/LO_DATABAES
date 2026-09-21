-- ============================================================================
-- CBE Track — ชื่อด้านความสามารถแยกตามช่วงชั้น
--   ป.ต้น  (ป.1–ป.3) ใช้ "ความสามารถด้านการคิดคำนวณ" และ "ความสามารถด้านสุขภาพกายและจิต"
--   ป.ปลาย (ป.4–ป.6) ใช้ "ความสามารถด้านคณิตศาสตร์" และ "ความสามารถด้านสุขภาพกายและสุขภาวะจิต"
-- เปลี่ยนเฉพาะแถวที่ชื่อไม่ตรงช่วงชั้น รันซ้ำได้ ไม่กระทบโรงเรียนที่ชื่อถูกอยู่แล้ว
-- ============================================================================

BEGIN;

-- 1) คลัง LO ของโรงเรียน
UPDATE learning_outcomes
SET competency_area = 'ความสามารถด้านคณิตศาสตร์'
WHERE grade_level IN ('ป.4', 'ป.5', 'ป.6')
  AND competency_area = 'ความสามารถด้านการคิดคำนวณ';

UPDATE learning_outcomes
SET competency_area = 'ความสามารถด้านสุขภาพกายและจิต'
WHERE grade_level IN ('ป.1', 'ป.2', 'ป.3')
  AND competency_area = 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต';

-- 2) ระดับที่คาดหวังรายชั้น
UPDATE yearly_competencies
SET competency_area = 'ความสามารถด้านคณิตศาสตร์'
WHERE grade_level IN ('ป.4', 'ป.5', 'ป.6')
  AND competency_area = 'ความสามารถด้านการคิดคำนวณ';

UPDATE yearly_competencies
SET competency_area = 'ความสามารถด้านสุขภาพกายและจิต'
WHERE grade_level IN ('ป.1', 'ป.2', 'ป.3')
  AND competency_area = 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต';

-- 3) ผลสรุปรายด้านที่ครูประจำชั้นบันทึกไว้ ดูช่วงชั้นจากชั้นของนักเรียน
UPDATE competency_area_final_decisions AS d
SET competency_area = 'ความสามารถด้านคณิตศาสตร์'
FROM users_students AS s
WHERE s.student_id = d.student_id
  AND s.current_grade_level IN ('ป.4', 'ป.5', 'ป.6')
  AND d.competency_area = 'ความสามารถด้านการคิดคำนวณ';

UPDATE competency_area_final_decisions AS d
SET competency_area = 'ความสามารถด้านสุขภาพกายและจิต'
FROM users_students AS s
WHERE s.student_id = d.student_id
  AND s.current_grade_level IN ('ป.1', 'ป.2', 'ป.3')
  AND d.competency_area = 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต';

COMMIT;
