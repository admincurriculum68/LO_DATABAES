-- ─────────────────────────────────────────────────────────────
-- LO ของวิชาแยกตามห้อง
--
-- วิชาชื่อเดียวกันแต่ละห้องใช้ LO ต่างกันได้ เช่น ห้องปกติกับห้อง IEP สอนคนละครู
-- subject_lo_mapping.room_name
--   ว่าง  = ใช้กับทุกห้องของวิชา (แบบเดิม ข้อมูลเก่ายังใช้ได้)
--   มีค่า = ใช้เฉพาะห้องนั้น และมาก่อนแถวที่ว่าง
-- ครูผู้สอนเลือกแล้วใช้ได้ทันที ไม่ต้องรออนุมัติ updated_by / updated_at บอกว่าใครแก้ล่าสุด
--
-- รันครั้งเดียวใน Supabase SQL Editor รันซ้ำได้ไม่เกิดผลเสีย
-- ─────────────────────────────────────────────────────────────

ALTER TABLE subject_lo_mapping
    ADD COLUMN IF NOT EXISTS room_name TEXT,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ลบ unique เดิมที่บังคับวิชาละ LO ละแถว เพราะตอนนี้วิชาเดียวมี LO เดียวกันได้หลายห้อง
DO $$
DECLARE
    item RECORD;
BEGIN
    FOR item IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'subject_lo_mapping'
          AND con.contype = 'u'
          AND (
              SELECT array_agg(att.attname::text ORDER BY att.attname)
              FROM unnest(con.conkey) AS k(attnum)
              JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
          ) = ARRAY['lo_id', 'subject_id']
    LOOP
        EXECUTE format('ALTER TABLE subject_lo_mapping DROP CONSTRAINT %I', item.conname);
    END LOOP;

    FOR item IN
        SELECT idx.indexname
        FROM pg_indexes idx
        WHERE idx.tablename = 'subject_lo_mapping'
          AND idx.indexdef ILIKE 'CREATE UNIQUE INDEX%'
          AND idx.indexdef ILIKE '%(subject_id, lo_id)%'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', item.indexname);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_lo_mapping_subject_room_lo
    ON subject_lo_mapping (subject_id, COALESCE(room_name, ''), lo_id);

CREATE INDEX IF NOT EXISTS idx_subject_lo_mapping_subject_room
    ON subject_lo_mapping (subject_id, room_name);

COMMENT ON COLUMN subject_lo_mapping.room_name IS
    'ห้องที่ใช้ LO นี้ ว่าง = ทุกห้องของวิชา มีค่า = เฉพาะห้องนั้นและมาก่อนแถวที่ว่าง';

-- ให้ API เห็นคอลัมน์ใหม่ทันที ไม่ต้องรอรีสตาร์ต
NOTIFY pgrst, 'reload schema';
