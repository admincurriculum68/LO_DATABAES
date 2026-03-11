import { supabase } from './supabase';

export async function hashPassword(dobString) {
    const msgUint8 = new TextEncoder().encode(dobString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loginWithCitizenId(citizenId, dob) {
    try {
        const hashedPassword = await hashPassword(dob);

        // Check teachers/admins/executives table
        const { data: teacherData, error: teacherError } = await supabase
            .from('users_teachers')
            .select('*, schools(school_name)')
            .eq('citizen_id', citizenId);

        if (teacherError) throw teacherError;

        if (teacherData && teacherData.length > 0) {
            const user = teacherData[0];
            if (user.password_hash === hashedPassword) {
                if (user.is_active) {
                    return {
                        status: 'success',
                        message: 'เข้าสู่ระบบสำเร็จ',
                        user: {
                            id: user.teacher_id,
                            teacher_id: user.teacher_id,
                            school_id: user.school_id,
                            school_name: user.schools?.school_name || null,
                            full_name: `${user.prefix || ''}${user.first_name} ${user.last_name}`,
                            role: user.role, // teacher, admin, executive
                            homeroom: user.homeroom
                        }
                    };
                } else {
                    return { status: 'error', message: 'บัญชีนี้ถูกระงับการใช้งาน' };
                }
            } else {
                return { status: 'error', message: 'รหัสผ่านไม่ถูกต้อง (วันเดือนปีเกิด)' };
            }
        }

        // Check students table if not found in teachers
        const { data: studentData, error: studentError } = await supabase
            .from('users_students')
            .select('*, schools(school_name)')
            .eq('citizen_id', citizenId);

        if (studentError) throw studentError;

        if (studentData && studentData.length > 0) {
            const user = studentData[0];
            if (user.password_hash === hashedPassword) {
                if (user.student_status === 'active') {
                    return {
                        status: 'success',
                        message: 'เข้าสู่ระบบสำเร็จ',
                        user: {
                            id: user.student_id,
                            student_id: user.student_id,
                            school_id: user.school_id,
                            school_name: user.schools?.school_name || null,
                            full_name: `${user.prefix || ''}${user.first_name} ${user.last_name}`,
                            role: 'student'
                        }
                    };
                } else {
                    return { status: 'error', message: 'บัญชีนักเรียนนี้ถูกระงับ' };
                }
            } else {
                return { status: 'error', message: 'รหัสผ่านไม่ถูกต้อง (วันเดือนปีเกิด)' };
            }
        }

        return { status: 'error', message: 'ไม่พบเลขบัตรประจำตัวประชาชนนี้ในระบบ' };
    } catch (err) {
        console.error(err);
        return { status: 'error', message: 'ข้อผิดพลาดระบบ: ' + err.message };
    }
}
