// ช่องลงชื่อท้ายเอกสารที่พิมพ์
//
// โรงเรียนต้องการ 4 ช่อง: ครูผู้สอนหรือครูประจำชั้น · หัวหน้าฝ่ายวิชาการ · รองผู้อำนวยการฝ่ายวิชาการ · ผู้อำนวยการ
// ชื่อของ 3 ตำแหน่งหลังเก็บที่ข้อมูลโรงเรียน ถ้ายังไม่ได้ตั้งค่าให้เว้นว่างไว้เซ็นด้วยลายมือ
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

export const TEACHER_ROLE = 'ครูผู้สอน';
export const HOMEROOM_ROLE = 'ครูประจำชั้น';

const clean = value => String(value ?? '').trim();

/**
 * school: แถวโรงเรียน { academic_head_name, academic_deputy_name, director_name }
 * teacherName: ชื่อครูผู้สอนหรือครูประจำชั้นของเอกสารฉบับนั้น (ว่างได้)
 * teacherRole: ป้ายของช่องแรก
 * คืน [{ role, name }] เรียงตามลำดับที่ใช้ลงนาม
 */
export function buildSigners(school, { teacherName = '', teacherRole = TEACHER_ROLE } = {}) {
    return [
        { role: teacherRole, name: clean(teacherName) },
        { role: 'หัวหน้าฝ่ายวิชาการ', name: clean(school?.academic_head_name) },
        { role: 'รองผู้อำนวยการฝ่ายวิชาการ', name: clean(school?.academic_deputy_name) },
        { role: 'ผู้อำนวยการโรงเรียน', name: clean(school?.director_name) },
    ];
}

/** ชื่อในวงเล็บ ถ้ายังไม่มีชื่อให้เป็นจุดไข่ปลาสำหรับเขียนเอง */
export function signerNameLine(name, dots = 42) {
    const text = clean(name);
    return text || '.'.repeat(dots);
}
