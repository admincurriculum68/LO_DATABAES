-- ตารางเก็บผลประเมินรายปี (กิจกรรมพัฒนาผู้เรียน และ คุณลักษณะอันพึงประสงค์)
CREATE TABLE student_year_evaluations (
    eval_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES users_students(student_id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    activity_status VARCHAR(20) DEFAULT 'ผ่าน', -- 'ผ่าน' หรือ 'ไม่ผ่าน'
    character_status VARCHAR(20) DEFAULT 'ผ่าน', -- 'ผ่าน' หรือ 'ไม่ผ่าน'
    evaluator_id UUID REFERENCES users_teachers(teacher_id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(student_id, academic_year, semester)
);

ALTER TABLE student_year_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all authenticated users" 
ON student_year_evaluations FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Enable insert for authenticated users" 
ON student_year_evaluations FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" 
ON student_year_evaluations FOR UPDATE 
TO authenticated 
USING (true);
