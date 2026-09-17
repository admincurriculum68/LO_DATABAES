// อ่านและเขียนข้อมูลสำหรับเพิ่ม ย้ายห้อง และนำนักเรียนออก แผนการจัดวิชาอยู่ใน studentPlacement.js
import { hashPassword } from './auth';
import { fetchAllByIn, supabase } from './supabase';

const byName = (a, b) => String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'th', { numeric: true });

export async function loadTermSubjects({ schoolId, academicYear, semester }) {
    if (!schoolId || !academicYear || !semester) return [];
    const { data, error } = await supabase.from('subjects')
        .select('subject_id, subject_name, grade_level')
        .eq('school_id', schoolId).eq('academic_year', academicYear).eq('semester', semester);
    if (error) throw error;
    return data || [];
}

/**
 * วิชาของห้องในภาคเรียนนี้ ดูจากวิชาที่มีนักเรียนห้องนี้เรียนอยู่ หรือมีครูรับสอนห้องนี้
 * คืน { subjects, termSubjects } termSubjects ใช้หาแถวลงทะเบียนเดิมของนักเรียน
 */
export async function loadRoomSubjects({ schoolId, academicYear, semester, room }) {
    const termSubjects = await loadTermSubjects({ schoolId, academicYear, semester });
    const roomName = String(room || '').trim();
    if (!roomName || !termSubjects.length) return { subjects: [], termSubjects };
    const ids = termSubjects.map(subject => subject.subject_id);
    const [enrolled, assigned] = await Promise.all([
        fetchAllByIn(ids, (batch, from, to) => supabase.from('student_enrollments')
            .select('subject_id').in('subject_id', batch).eq('room', roomName).eq('enrollment_status', 'active').range(from, to)),
        fetchAllByIn(ids, (batch, from, to) => supabase.from('subject_teachers')
            .select('subject_id').in('subject_id', batch).eq('room_name', roomName).range(from, to)),
    ]);
    const found = new Set([...enrolled, ...assigned].map(row => row.subject_id));
    return { subjects: termSubjects.filter(subject => found.has(subject.subject_id)).sort(byName), termSubjects };
}

export async function loadStudentTermEnrollments(studentId, subjectIds) {
    if (!studentId) return [];
    return fetchAllByIn(subjectIds, (batch, from, to) => supabase.from('student_enrollments')
        .select('enrollment_id, subject_id, room, enrollment_status')
        .eq('student_id', studentId).in('subject_id', batch).range(from, to));
}

/** เลขประจำตัวนี้มีเจ้าของแล้วหรือยัง ตรวจทั้งนักเรียนและครู เพราะการเข้าสู่ระบบค้นหาครูก่อน */
export async function findCitizenOwner(citizenId) {
    const [students, teachers] = await Promise.all([
        supabase.from('users_students').select('student_id, school_id').eq('citizen_id', citizenId).limit(1),
        supabase.from('users_teachers').select('teacher_id, school_id').eq('citizen_id', citizenId).limit(1),
    ]);
    if (students.error) throw students.error;
    if (teachers.error) throw teachers.error;
    if (students.data?.length) return { kind: 'student', ...students.data[0] };
    if (teachers.data?.length) return { kind: 'teacher', ...teachers.data[0] };
    return null;
}

/** dob คือวันเดือนปีเกิด DDMMYYYY (พ.ศ.) ใช้เป็นรหัสผ่านแบบเดียวกับการนำเข้าไฟล์ */
export async function createStudent({ schoolId, student, dob }) {
    const { data, error } = await supabase.from('users_students').insert({
        school_id: schoolId,
        citizen_id: student.citizen_id,
        password_hash: await hashPassword(dob),
        student_code: student.student_code || null,
        prefix: student.prefix || '',
        first_name: student.first_name,
        last_name: student.last_name,
        current_grade_level: student.current_grade_level || null,
        current_room: student.current_room || null,
        student_status: 'active',
    }).select('student_id').single();
    if (error) throw error;
    return data.student_id;
}

/**
 * บันทึกแผนจากห้องเดียวกัน: เพิ่มก่อน แล้วเปลี่ยนห้องหรือเปิดแถวเดิม แล้วจึงนำออก
 * ถ้าขั้นแรกล้ม นักเรียนยังอยู่ในวิชาเดิมครบ
 */
export async function applyStudentPlacement({ studentId, plan, schoolId, actor, action, detail }) {
    if (plan.toInsert.length) {
        const { error } = await supabase.from('student_enrollments').insert(plan.toInsert.map(item => ({
            student_id: studentId, subject_id: item.subject_id, room: item.room, enrollment_status: 'active',
        })));
        if (error) throw error;
    }
    const updatesByRoom = new Map();
    plan.toUpdate.forEach(item => updatesByRoom.set(item.room, [...(updatesByRoom.get(item.room) || []), item.enrollment_id]));
    for (const [room, ids] of updatesByRoom) {
        const { error } = await supabase.from('student_enrollments')
            .update({ room, enrollment_status: 'active' }).in('enrollment_id', ids);
        if (error) throw error;
    }
    const leavesByStatus = new Map();
    plan.toLeave.forEach(item => leavesByStatus.set(item.status, [...(leavesByStatus.get(item.status) || []), item.enrollment_id]));
    for (const [status, ids] of leavesByStatus) {
        const { error } = await supabase.from('student_enrollments')
            .update({ enrollment_status: status }).in('enrollment_id', ids);
        if (error) throw error;
    }
    await supabase.from('audit_logs').insert({
        school_id: schoolId || actor?.school_id,
        actor_id: actor?.teacher_id || actor?.id,
        actor_role: actor?.role,
        action,
        entity_type: 'student',
        entity_id: studentId,
        detail: {
            ...detail,
            added: plan.toInsert.length,
            moved_or_reopened: plan.toUpdate.length,
            left: plan.toLeave.length,
        },
    });
}
