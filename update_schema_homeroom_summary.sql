-- ─────────────────────────────────────────────────────────────
-- ครูประจำชั้นสรุปความสามารถรายด้าน
--
-- เดิมครูผู้สอนสรุประดับทีละวิชา แล้วฝ่ายวิชาการรับรองรายคน
-- ตอนนี้ครูประจำชั้นซึ่งรู้จักนักเรียนเป็นคนสรุประดับและเขียนคำบรรยายรายด้าน
-- แล้วส่งให้ฝ่ายวิชาการรับรองทั้งห้อง
--
-- สถานะของแต่ละแถว (นักเรียน × ด้าน × ภาคเรียน)
--   draft      ครูประจำชั้นบันทึกร่าง
--   submitted  ครูประจำชั้นส่งฝ่ายวิชาการ
--   approved   ฝ่ายวิชาการรับรองแล้ว และล็อก
--   returned   ฝ่ายวิชาการส่งกลับพร้อมเหตุผล (decision_reason)
--   pending    ค่าเดิมจากขั้นตอนเก่า เก็บไว้ให้ข้อมูลเก่าอ่านได้
--
-- รันครั้งเดียวใน Supabase SQL Editor รันซ้ำได้ไม่เกิดผลเสีย
-- ─────────────────────────────────────────────────────────────

ALTER TABLE competency_area_final_decisions
    ADD COLUMN IF NOT EXISTS summary_text TEXT,
    ADD COLUMN IF NOT EXISTS summarized_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS summarized_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

ALTER TABLE competency_area_final_decisions
    DROP CONSTRAINT IF EXISTS competency_area_final_decisions_decision_status_check;
ALTER TABLE competency_area_final_decisions
    ADD CONSTRAINT competency_area_final_decisions_decision_status_check
    CHECK (decision_status IN ('draft', 'submitted', 'pending', 'approved', 'returned'));

COMMENT ON COLUMN competency_area_final_decisions.summary_text IS
    'คำบรรยายความสามารถรายด้านของครูประจำชั้น พิมพ์ในรายงานผู้ปกครอง';

-- ให้ API เห็นคอลัมน์ใหม่ทันที ไม่ต้องรอรีสตาร์ต
NOTIFY pgrst, 'reload schema';
