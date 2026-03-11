-- เพิ่มคอลัมน์เก็บผลกิจกรรมและคุณลักษณะในตาราง enrollments
ALTER TABLE student_enrollments ADD COLUMN activity_result VARCHAR(20) DEFAULT 'ผ่าน';
ALTER TABLE student_enrollments ADD COLUMN character_result VARCHAR(20) DEFAULT 'ผ่าน';
