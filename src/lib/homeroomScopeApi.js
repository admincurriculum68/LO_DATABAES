import { fetchAllByIn, supabase } from './supabase';
import { loadSubjectAssignments } from './loByRoomApi';
import { compareRooms, teacherRoomAccess } from './teacherAccess';

// ห้องที่ครูรายวิชาเข้าไปสรุปความสามารถของด้านตัวเองได้
//
// เดิมหน้าสรุปเปิดให้เฉพาะครูประจำชั้น โรงเรียนจึงต้องให้ครูรายวิชายืมบัญชีครูประจำชั้นเข้ามากรอก
// ตอนนี้ครูรายวิชาใช้บัญชีตัวเองได้ ห้องที่เห็นคือห้องที่ตัวเองสอนจริงในภาคเรียนนั้น
// ส่วนด้านที่แก้ได้คำนวณจาก LO ของวิชาตัวเองในห้องนั้น (src/lib/homeroomScope.js)

const sameTerm = (subject, academicYear, semester) => String(subject?.academic_year) === String(academicYear)
    && String(subject?.semester) === String(semester);

/**
 * คืน { rooms, accessBySubject }
 *   rooms: ห้องที่ครูคนนี้สอนในภาคเรียนนั้น เรียงตามชื่อห้อง
 *   accessBySubject: Map(subject_id → สิทธิ์รายห้อง) ใช้ตัดสินว่าด้านไหนของห้องนั้นแก้ได้
 */
export async function loadTeachingRooms({ teacherId, schoolId, academicYear, semester }) {
    const empty = { rooms: [], accessBySubject: new Map() };
    if (!teacherId || !schoolId || !academicYear || !semester) return empty;

    const [primary, coTeaching] = await Promise.all([
        supabase.from('subjects').select('subject_id, teacher_id')
            .eq('school_id', schoolId).eq('teacher_id', teacherId)
            .eq('academic_year', academicYear).eq('semester', semester),
        supabase.from('subject_teachers')
            .select('subjects!inner(subject_id, teacher_id, school_id, academic_year, semester)')
            .eq('teacher_id', teacherId),
    ]);
    if (primary.error) throw primary.error;
    if (coTeaching.error) throw coTeaching.error;

    const subjects = new Map((primary.data || []).map(row => [row.subject_id, row]));
    (coTeaching.data || []).forEach(row => {
        const subject = row.subjects;
        if (!subject || subject.school_id !== schoolId || !sameTerm(subject, academicYear, semester)) return;
        if (!subjects.has(subject.subject_id)) subjects.set(subject.subject_id, subject);
    });
    if (!subjects.size) return empty;

    // ครูหลักของวิชาไม่ได้แปลว่าสอนทุกห้อง ห้องที่สอนจริงดูจากแถวครูรายห้องของวิชานั้น
    const assignments = await loadSubjectAssignments([...subjects.keys()]);
    const accessBySubject = new Map();
    subjects.forEach((subject, subjectId) => {
        const access = teacherRoomAccess(subject, assignments.filter(row => row.subject_id === subjectId), teacherId);
        if (access.canAccess) accessBySubject.set(subjectId, access);
    });
    if (!accessBySubject.size) return empty;

    const enrollments = await fetchAllByIn([...accessBySubject.keys()], (batch, from, to) => supabase
        .from('student_enrollments').select('subject_id, room')
        .eq('enrollment_status', 'active').in('subject_id', batch).range(from, to));
    const rooms = new Set();
    enrollments.forEach(row => {
        if (row.room && accessBySubject.get(row.subject_id)?.allows(row.room)) rooms.add(row.room);
    });
    return { rooms: [...rooms].sort(compareRooms), accessBySubject };
}
