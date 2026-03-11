-- สร้างตารางใหม่เอาไว้เก็บผลประเมิน กิจกรรมพัฒนาผู้เรียน และ คุณลักษณะอันพึงประสงค์ โดยเฉพาะ
CREATE TABLE student_year_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    student_id UUID REFERENCES users_students(student_id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    activity_result VARCHAR(20) DEFAULT 'ผ่าน', -- ผ่าน / ไม่ผ่าน
    character_result VARCHAR(20) DEFAULT 'ผ่าน', -- ผ่าน / ไม่ผ่าน
    evaluated_by UUID REFERENCES users_teachers(teacher_id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(student_id, academic_year, semester)
);

-- ปลดล็อค RLS ให้ปลอดภัยในการใช้งาน
ALTER TABLE student_year_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for authenticated users" 
ON student_year_evaluations FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Enable insert/update for teachers and admins" 
ON student_year_evaluations FOR ALL 
TO authenticated 
USING (auth.role() = 'authenticated');
