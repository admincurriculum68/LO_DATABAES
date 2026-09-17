/**
 * people.js — ตรรกะที่ใช้ร่วมกันสำหรับข้อมูลครูและนักเรียน
 *
 * ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง
 * ส่วนที่คุยกับ Supabase อยู่ใน peopleApi.js
 */
import { ROLE_LABELS, parseRoleList, rolesOf } from './roles.js';
import { citizenIdFormatError, isCitizenIdFormat, LOSSY_SCIENTIFIC, normalizeThaiDob, sanitizeCitizenId } from './importSanitizers.js';

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
 * ข้อผิดพลาดรายช่อง ใช้แสดงใต้ช่องที่ผิดในแผงแก้ไข แทน toast มุมจอที่หายเองในไม่กี่วินาที
 * คืน object เช่น { citizen_id: '...', first_name: '...' } ช่องที่ถูกต้องไม่มี key
 * ข้อความอธิบายผลที่จะเกิดจริง ไม่ใช่แค่บอกว่าข้อมูลไม่ถูกต้อง
 */
// ค่าที่ฐานข้อมูลยอมรับ (users_students_student_status_check) ไม่มีค่า inactive
export const STUDENT_STATUS_CHOICES = [
    ['active', 'ใช้งานอยู่'],
    ['transferred', 'ย้ายออก'],
    ['dropped', 'ลาออก'],
    ['graduated', 'จบการศึกษา'],
];

export function studentStatusLabel(status) {
    return STUDENT_STATUS_CHOICES.find(([value]) => value === status)?.[1] || 'ไม่ได้เรียนแล้ว';
}

/** วันเดือนปีเกิด DDMMYYYY ปี พ.ศ. ที่ใช้เป็นรหัสผ่านได้ คืนค่าว่างถ้าไม่ถูกต้อง */
export function thaiDobPassword(value) {
    const text = String(value ?? '').trim();
    // รับเฉพาะที่พิมพ์เป็นวันที่ ไม่แปลงตัวเลขสั้น ๆ เป็นเลขวันที่ของ Excel
    if (!/^\d{8}$/.test(text) && !/^\d{1,2}[\s./-]\d{1,2}[\s./-]\d{2,4}$/.test(text)) return '';
    const dob = normalizeThaiDob(text);
    if (!/^\d{8}$/.test(dob)) return '';
    const day = Number(dob.slice(0, 2));
    const month = Number(dob.slice(2, 4));
    const year = Number(dob.slice(4));
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2400 || year > 2700) return '';
    return dob;
}

export function personFieldErrors(kind, data) {
    const errors = {};
    const id = sanitizeCitizenId(data.citizen_id);
    if (!isCitizenIdFormat(id)) {
        errors.citizen_id = `${citizenIdFormatError(id)} หากแก้ผิด เจ้าของบัญชีจะเข้าสู่ระบบไม่ได้`;
    }
    if (!String(data.first_name ?? '').trim()) errors.first_name = 'ต้องกรอกชื่อ';
    if (!String(data.last_name ?? '').trim()) errors.last_name = 'ต้องกรอกนามสกุล';

    if (kind === 'teachers' && (!Array.isArray(data.roles) || data.roles.length === 0)) {
        errors.roles = 'ครู 1 คนต้องมีอย่างน้อย 1 บทบาท';
    }
    // ช่องวันเกิดมีเฉพาะตอนเพิ่มคนใหม่ ใช้เป็นรหัสผ่านเข้าสู่ระบบ
    if (data.dob !== undefined && !thaiDobPassword(data.dob)) {
        errors.dob = 'กรอกวันเดือนปีเกิด 8 หลัก ปี พ.ศ. เช่น 05012560';
    }
    if (data.new_password !== undefined && data.new_password !== null && String(data.new_password).trim() !== '') {
        const pw = String(data.new_password).replace(/\D/g, '');
        if (pw.length !== 8) errors.new_password = 'รหัสผ่านต้องเป็นวันเดือนปีเกิด 8 หลัก เช่น 05012555';
    }
    return errors;
}

/** ตรวจข้อมูลก่อนบันทึก คืนรายการข้อความเตือนตามลำดับช่อง */
export function validatePersonDraft(kind, data) {
    return Object.values(personFieldErrors(kind, data));
}

/** ข้อความค้นหาของคน 1 คน ใช้กรองรายชื่อฝั่งเบราว์เซอร์ */
export function personSearchText(person) {
    return [
        person.prefix, person.first_name, person.last_name,
        person.citizen_id, person.student_code, person.current_room,
        person.current_grade_level, person.homeroom,
    ].filter(Boolean).join(' ').toLowerCase();
}

// โรงเรียนมักเขียนคนเดียวหลายแถว แถวละบทบาท เช่น admin แถวหนึ่ง teacher อีกแถว
// ต้องรวมบทบาทจากทุกแถวของคนเดียวกัน ถ้าแถวหลังทับแถวแรก แอดมินจะหลุดสิทธิ์
// บทบาทที่พบก่อนเป็นบทบาทหลัก และห้องประจำชั้นใช้ค่าแรกที่ไม่ว่าง
export function mergeTeacherImportRows(rows) {
    const byCitizen = new Map();
    (rows || []).forEach(row => {
        const citizenId = sanitizeCitizenId(row.citizen_id);
        if (!citizenId || citizenId === LOSSY_SCIENTIFIC) return;
        const entry = byCitizen.get(citizenId) || { roles: [], homeroom: '' };
        parseRoleList(row.role).forEach(role => {
            if (!entry.roles.includes(role)) entry.roles.push(role);
        });
        const homeroom = String(row.homeroom ?? '').trim();
        if (homeroom && !entry.homeroom) entry.homeroom = homeroom;
        byCitizen.set(citizenId, entry);
    });
    byCitizen.forEach(entry => {
        if (!entry.roles.length) entry.roles.push('teacher');
    });
    return byCitizen;
}
