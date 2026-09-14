-- ─────────────────────────────────────────────────────────────
-- ชั่วโมงเรียนแยกตามห้อง
--
-- วิชาเดียวกันเรียนไม่เท่ากันได้ตามโปรแกรม เช่น ภาษาไทย ป.1 ห้อง 1–3 เรียน 80 ชม. ห้อง 4–6 เรียน 100 ชม.
-- subjects.teaching_hours  = ชั่วโมงค่าเริ่มต้น (ค่าที่ใช้มากที่สุดในวิชานั้น)
-- subjects.room_hours      = เฉพาะห้องที่ต่างจากค่าเริ่มต้น เช่น {"ป.1/4": 100, "ป.1/5": 100, "ป.1/6": 100}
--
-- รันครั้งเดียวใน Supabase SQL Editor รันซ้ำได้ไม่เกิดผลเสีย
-- ─────────────────────────────────────────────────────────────

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS room_hours JSONB;

ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_room_hours_object_check;
ALTER TABLE subjects ADD CONSTRAINT subjects_room_hours_object_check
    CHECK (room_hours IS NULL OR jsonb_typeof(room_hours) = 'object');

COMMENT ON COLUMN subjects.room_hours IS
    'ชั่วโมงเรียนเฉพาะห้องที่ต่างจาก teaching_hours รูปแบบ {"ชื่อห้อง": จำนวนชั่วโมง}';

-- ให้ API เห็นคอลัมน์ใหม่ทันที ไม่ต้องรอรีสตาร์ต
NOTIFY pgrst, 'reload schema';
