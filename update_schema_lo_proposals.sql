-- ─────────────────────────────────────────────────────────────
-- ครูผู้สอนเลือก LO ของวิชาตัวเอง ฝ่ายวิชาการอนุมัติแล้วล็อก
--
-- subject_lo_proposals = สิ่งที่ครู "เสนอ" ไว้ ยังไม่ใช่ของจริง
-- subject_lo_mapping   = ของจริงที่ทุกหน้าใช้ ระบบเขียนทับให้เฉพาะตอนฝ่ายวิชาการอนุมัติ
--
-- สถานะ draft → submitted → approved  หรือ returned (ส่งกลับพร้อมเหตุผล) แล้วครูแก้และส่งใหม่
-- วิชาหนึ่งใช้ LO ชุดเดียวกันทุกห้อง ครูคนไหนของวิชานั้นก็แก้และส่งได้ updated_at กันการเขียนทับกัน
--
-- รันครั้งเดียวใน Supabase SQL Editor รันซ้ำได้ไม่เกิดผลเสีย
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subject_lo_proposals (
    proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    subject_id UUID NOT NULL UNIQUE REFERENCES subjects(subject_id) ON DELETE CASCADE,
    lo_ids UUID[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'approved', 'returned')),
    review_note TEXT,
    updated_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users_teachers(teacher_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_lo_proposals_school_status
    ON subject_lo_proposals(school_id, status);

COMMENT ON TABLE subject_lo_proposals IS
    'LO ที่ครูผู้สอนเสนอสำหรับวิชาหนึ่ง ฝ่ายวิชาการอนุมัติแล้วระบบจึงเขียนลง subject_lo_mapping';

-- วิชาที่ฝ่ายวิชาการกำหนด LO ไว้ก่อนมีระบบนี้ ให้ถือว่าอนุมัติแล้ว จะได้ใช้งานต่อได้ทันที
INSERT INTO subject_lo_proposals (school_id, subject_id, lo_ids, status, reviewed_at)
SELECT s.school_id, s.subject_id, ARRAY_AGG(m.lo_id), 'approved', NOW()
FROM subjects s
JOIN subject_lo_mapping m ON m.subject_id = s.subject_id
GROUP BY s.school_id, s.subject_id
ON CONFLICT (subject_id) DO NOTHING;

-- ให้ API เห็นตารางใหม่ทันที ไม่ต้องรอรีสตาร์ต
NOTIFY pgrst, 'reload schema';
