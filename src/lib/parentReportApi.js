import { fetchAllByIn, fetchAllRows, supabase } from './supabase';
import { normalizeCompetencyArea } from '../constants/curriculum2568';
import { buildParentReport } from './parentReport';
import { homeroomSummarySupported } from './homeroomSummaryApi';
import { loadRoomMappings } from './loByRoomApi';
import { loadSchoolProfile } from './schoolProfile';

const fullName = person => `${person?.prefix || ''}${person?.first_name || ''} ${person?.last_name || ''}`.trim();
const ENROLLMENT_SELECT = 'enrollment_id, student_id, subject_id, room, attendance_percent, users_students!inner(student_id, school_id, student_code, prefix, first_name, last_name, current_grade_level, current_room), subjects!inner(subject_name, grade_level, academic_year, semester, school_id)';

/**
 * โหลดข้อมูลรายงานผู้ปกครองของนักเรียนคนเดียว (studentId) หรือทั้งห้อง (room)
 * คืน { school, reports } เรียงตามรหัสนักเรียน
 */
export async function loadParentReports({ schoolId, academicYear, semester, studentId = '', room = '' }) {
    const year = Number(academicYear);
    const term = Number(semester);
    const termEnrollments = scope => fetchAllRows((from, to) => {
        let query = supabase.from('student_enrollments').select(ENROLLMENT_SELECT)
            .eq('enrollment_status', 'active')
            .eq('users_students.school_id', schoolId).eq('subjects.school_id', schoolId)
            .eq('subjects.academic_year', year).eq('subjects.semester', term);
        query = scope(query);
        return query.range(from, to);
    });

    // ทั้งห้อง: หานักเรียนจากกลุ่มเรียนของห้องนี้ แล้วดึงทุกวิชาของนักเรียนเหล่านั้นให้ครบ
    let enrollments;
    if (studentId) {
        enrollments = await termEnrollments(query => query.eq('student_id', studentId));
    } else {
        const roomEnrollments = await termEnrollments(query => query.eq('room', room));
        const studentIds = [...new Set(roomEnrollments.map(item => item.student_id))];
        enrollments = await fetchAllByIn(studentIds, (batch, from, to) => supabase.from('student_enrollments').select(ENROLLMENT_SELECT)
            .eq('enrollment_status', 'active').in('student_id', batch)
            .eq('users_students.school_id', schoolId).eq('subjects.school_id', schoolId)
            .eq('subjects.academic_year', year).eq('subjects.semester', term).range(from, to));
    }
    const school = await loadSchoolProfile(schoolId).catch(() => ({ school_name: '', logo_data_url: '' }));
    if (!enrollments.length) return { school, reports: [] };

    const studentIds = [...new Set(enrollments.map(item => item.student_id))];
    const subjectIds = [...new Set(enrollments.map(item => item.subject_id))];
    const hasSummary = await homeroomSummarySupported();
    const decisionColumns = `student_id, competency_area, final_level, decision_status${hasSummary ? ', summary_text' : ''}`;
    const grades = [...new Set(enrollments.map(item => item.users_students?.current_grade_level || item.subjects?.grade_level).filter(Boolean))];

    const [mappings, evaluations, decisions, activities, teachers, yearly] = await Promise.all([
        loadRoomMappings(subjectIds, { withLo: true }),
        fetchAllByIn(enrollments.map(item => item.enrollment_id), (batch, from, to) => supabase.from('lo_evaluations')
            .select('enrollment_id, lo_id, evidence_note').in('enrollment_id', batch).range(from, to)),
        fetchAllByIn(studentIds, (batch, from, to) => supabase.from('competency_area_final_decisions')
            .select(decisionColumns).eq('school_id', schoolId).eq('academic_year', year).eq('semester', term)
            .in('student_id', batch).range(from, to)),
        fetchAllByIn(studentIds, (batch, from, to) => supabase.from('student_year_evaluations')
            .select('student_id, activity_status, character_status').eq('academic_year', year).eq('semester', term)
            .in('student_id', batch).range(from, to)),
        fetchAllRows((from, to) => supabase.from('users_teachers').select('prefix, first_name, last_name, homeroom')
            .eq('school_id', schoolId).eq('is_active', true).not('homeroom', 'is', null).range(from, to)),
        grades.length
            ? supabase.from('yearly_competencies').select('grade_level, competency_area, expected_level').eq('school_id', schoolId).in('grade_level', grades)
                .then(({ data, error }) => (error ? [] : data || []))
            : Promise.resolve([]),
    ]);

    const teachersByRoom = new Map();
    teachers.forEach(teacher => {
        if (!teachersByRoom.has(teacher.homeroom)) teachersByRoom.set(teacher.homeroom, []);
        teachersByRoom.get(teacher.homeroom).push(fullName(teacher));
    });
    const expectedByKey = new Map(yearly.filter(item => item.competency_area && item.expected_level)
        .map(item => [`${item.grade_level}:${normalizeCompetencyArea(item.competency_area)}`, item.expected_level]));
    const activityByStudent = new Map(activities.map(item => [item.student_id, item]));

    const reports = studentIds.map(id => {
        const studentEnrollments = enrollments.filter(item => item.student_id === id);
        const student = studentEnrollments[0].users_students;
        const enrollmentIds = new Set(studentEnrollments.map(item => item.enrollment_id));
        const studentSubjects = new Set(studentEnrollments.map(item => item.subject_id));
        return buildParentReport({
            student,
            enrollments: studentEnrollments,
            mappings: mappings.filter(item => studentSubjects.has(item.subject_id)),
            evaluations: evaluations.filter(item => enrollmentIds.has(item.enrollment_id)),
            decisions: decisions.filter(item => item.student_id === id),
            activities: activityByStudent.get(id),
            homeroomTeachers: teachersByRoom.get(student.current_room) || [],
            expectedByKey,
        });
    }).sort((a, b) => String(a.student.student_code || '').localeCompare(String(b.student.student_code || ''), 'th', { numeric: true }));

    return { school, reports };
}
