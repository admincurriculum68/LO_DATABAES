-- 1. เพิ่มคอลัมน์เปอร์เซ็นต์เวลาเรียน ลงใน student_enrollments
ALTER TABLE student_enrollments ADD COLUMN attendance_percent NUMERIC(5,2) DEFAULT 100;

-- 2. เพิ่มคอลัมน์ห้องเรียนประจำชั้น ให้กับครู ลงใน users_teachers
ALTER TABLE users_teachers ADD COLUMN homeroom VARCHAR(20);

-- ทดสอบอัพเดทข้อมูลครูให้เป็นครูประจำชั้น ป.1/1 (อิงจาก mock data)
UPDATE users_teachers SET homeroom = 'ป.1/1' WHERE first_name = 'ครูสมศรี';
