/**
 * people.js — ตรรกะที่ใช้ร่วมกันสำหรับข้อมูลครูและนักเรียน
 *
 * ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง
 * ส่วนที่คุยกับ Supabase อยู่ใน peopleApi.js
 */
import { ROLE_LABELS, rolesOf } from './roles.js';

export const ROLE_CHOICES = [
    ['teacher', 'ครูผู้สอน'],
    ['admin', 'ฝ่ายวิชาการ'],
    ['executive', 'ผู้บริหาร'],
];

/**
 * อ่านบทบาททั้งหมดของครูจากแถวที่ join teacher_roles มาแล้ว
 *
 * ถ้ามีแถวใน teacher_roles ให้ถือเป็นแหล่งข้อมูลจริงทั้งหมด ไม่ผสมคอลัมน์ role เดิมเข้าไป
 * มิฉะนั้นบทบาทที่ฝ่ายวิชาการเพิ่งเอาออก จะโผล่กลับมาจากคอลัมน์เก่าที่ยังไม่ได้ล้าง
 * (ต่างจาก auth.js ที่ผสมไว้โดยตั้งใจ เพราะตอนเข้าสู่ระบบควรเผื่อไว้ไม่ให้ใครถูกล็อกออก)
 */
export function teacherRolesOf(teacher) {
    const rows = Array.isArray(teacher?.teacher_roles) ? teacher.teacher_roles : [];
    const roles = [...new Set(rows.map(row => row.role).filter(Boolean))];
    return roles.length ? roles : rolesOf(teacher);
}

/** บทบาทหลักของครู ใช้ตัดสินหน้าแรกหลังเข้าสู่ระบบ */
export function primaryTeacherRoleOf(teacher) {
    const roles = teacherRolesOf(teacher);
    const rows = Array.isArray(teacher?.teacher_roles) ? teacher.teacher_roles : [];
    const flagged = rows.find(row => row.is_primary)?.role;
    if (flagged && roles.includes(flagged)) return flagged;
    if (teacher?.role && roles.includes(teacher.role)) return teacher.role;
    return roles[0] || null;
}

/** ป้ายบทบาทสำหรับแสดงผล เช่น "ครูผู้สอน (หลัก) · ฝ่ายวิชาการ" */
export function teacherRoleSummary(teacher) {
    const primary = primaryTeacherRoleOf(teacher);
    return teacherRolesOf(teacher)
        .map(role => (role === primary ? `${ROLE_LABELS[role] || role} (หลัก)` : ROLE_LABELS[role] || role))
        .join(' · ') || '-';
}

/**
 * ตรวจข้อมูลก่อนบันทึก คืนรายการข้อความเตือน
 * ข้อความอธิบายผลที่จะเกิดจริง ไม่ใช่แค่บอกว่าข้อมูลไม่ถูกต้อง
 */
export function validatePersonDraft(kind, data) {
    const errors = [];
    const id = String(data.citizen_id ?? '').replace(/\D/g, '');
    if (id.length !== 13) {
        errors.push(`เลขประจำตัวประชาชนต้องมี 13 หลัก (ขณะนี้ ${id.length} หลัก) หากแก้ผิด เจ้าของบัญชีจะเข้าสู่ระบบไม่ได้`);
    }
    if (!String(data.first_name ?? '').trim()) errors.push('ต้องกรอกชื่อ');
    if (!String(data.last_name ?? '').trim()) errors.push('ต้องกรอกนามสกุล');

    if (kind === 'teachers' && (!Array.isArray(data.roles) || data.roles.length === 0)) {
        errors.push('ครู 1 คนต้องมีอย่างน้อย 1 บทบาท');
    }
    if (data.new_password !== undefined && data.new_password !== null && String(data.new_password).trim() !== '') {
        const pw = String(data.new_password).replace(/\D/g, '');
        if (pw.length !== 8) errors.push('รหัสผ่านต้องเป็นวันเดือนปีเกิด 8 หลัก เช่น 05012555');
    }
    return errors;
}

/** ข้อความค้นหาของคน 1 คน ใช้กรองรายชื่อฝั่งเบราว์เซอร์ */
export function personSearchText(person) {
    return [
        person.prefix, person.first_name, person.last_name,
        person.citizen_id, person.student_code, person.current_room,
        person.current_grade_level, person.homeroom,
    ].filter(Boolean).join(' ').toLowerCase();
}
