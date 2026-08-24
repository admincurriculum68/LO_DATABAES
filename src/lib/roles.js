/**
 * roles.js — จุดเดียวที่ตัดสินเรื่องบทบาทของผู้ใช้
 *
 * ครู 1 คนปฏิบัติหน้าที่ได้หลายบทบาทพร้อมกัน เช่นเป็นทั้งครูผู้สอนและฝ่ายวิชาการ
 * ก่อนหน้านี้มี 4 จุดแยกกันที่ตัดสินว่าเข้าสู่ระบบแล้วไปหน้าไหน ทำให้ผู้ใช้ที่มี
 * หลายบทบาทถูกเด้งวนไปมา โมดูลนี้จึงรวมตรรกะทั้งหมดไว้ที่เดียว
 */

export const ROLE_LABELS = {
    admin: 'ฝ่ายวิชาการ',
    teacher: 'ครูผู้สอน',
    executive: 'ผู้บริหาร',
    student: 'นักเรียน',
};

export const ROLE_TONES = {
    admin: 'bg-violet-100 text-violet-700 border-violet-200',
    teacher: 'bg-blue-100 text-blue-700 border-blue-200',
    executive: 'bg-amber-100 text-amber-700 border-amber-200',
    student: 'bg-green-100 text-green-700 border-green-200',
};

const HOME_BY_ROLE = {
    admin: '/admin',
    executive: '/executive',
    student: '/student',
    teacher: '/',
};

/**
 * คืนบทบาททั้งหมดของผู้ใช้เป็น array เสมอ
 * รองรับ session รูปแบบเดิมที่เก็บ role เป็นข้อความเดี่ยว เพื่อไม่ให้ผู้ใช้ที่ยัง
 * ค้าง localStorage เดิมอยู่หลุดออกจากระบบตอนอัปเดตเวอร์ชัน
 */
export function rolesOf(user) {
    if (!user) return [];
    if (Array.isArray(user.roles) && user.roles.length > 0) {
        return [...new Set(user.roles.filter(Boolean))];
    }
    return user.role ? [user.role] : [];
}

export function hasRole(user, role) {
    return rolesOf(user).includes(role);
}

export function hasAnyRole(user, allowedRoles) {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    const owned = rolesOf(user);
    return allowedRoles.some(role => owned.includes(role));
}

/** บทบาทหลัก ใช้ตัดสินหน้าแรกหลังเข้าสู่ระบบ */
export function primaryRoleOf(user) {
    if (!user) return null;
    const owned = rolesOf(user);
    if (user.primaryRole && owned.includes(user.primaryRole)) return user.primaryRole;
    if (user.role && owned.includes(user.role)) return user.role;
    return owned[0] || null;
}

/** หน้าแรกของผู้ใช้ ใช้แทนการ switch ตาม role ที่เคยกระจายอยู่หลายไฟล์ */
export function defaultRouteFor(user) {
    return HOME_BY_ROLE[primaryRoleOf(user)] || '/';
}

/** ป้ายบทบาทสำหรับแสดงผล เช่น ['ครูผู้สอน', 'ฝ่ายวิชาการ'] */
export function roleLabelsFor(user) {
    return rolesOf(user).map(role => ROLE_LABELS[role] || role);
}

/** แปลงค่าบทบาทจากไฟล์นำเข้า รองรับหลายค่าคั่นด้วย , ; / หรือช่องว่าง */
export function parseRoleList(raw) {
    if (Array.isArray(raw)) return [...new Set(raw.map(item => String(item).trim()).filter(Boolean))];
    if (raw === null || raw === undefined) return [];
    return [...new Set(
        String(raw)
            .split(/[,;/|]+/)
            .map(item => item.trim().toLowerCase())
            .filter(item => item in HOME_BY_ROLE && item !== 'student')
    )];
}
