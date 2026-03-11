-- 1. เพิ่มคอลัมน์เก็บรหัสผ่านแบบข้อความตัวอักษรธรรมดา (Plain Text) เพื่อให้ Admin เห็นและแก้ไขง่าย
ALTER TABLE users_teachers ADD COLUMN plain_password VARCHAR(20);
ALTER TABLE users_students ADD COLUMN plain_password VARCHAR(20);

-- อัพเดทรหัสผ่านธรรมดาให้ตรงกับ hash เดิมชั่วคราว (ใช้ในกรณีข้อมูลเก่าที่มีอยู่แล้วทดสอบ ตอน Mockup)
UPDATE users_teachers SET plain_password = '01012540' WHERE role = 'admin';
UPDATE users_teachers SET plain_password = '02022540' WHERE role = 'executive';
UPDATE users_teachers SET plain_password = '03032540' WHERE role = 'teacher';
UPDATE users_students SET plain_password = '04042555';

-- 2. สร้างตาราง schools สำหรับเก็บข้อมูลโรงเรียน
-- (ตารางนี้คุณมีอยู่แล้ว แต่อาจจะเอาไว้ใช้เป็นชื่อหลักของระบบ)
