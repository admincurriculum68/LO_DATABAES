import { LOSSY_SCIENTIFIC, sanitizeCitizenId } from './importSanitizers.js';

// โรงเรียนหนึ่งวิชามีครูได้หลายคน และแบ่งกันดูคนละห้อง ไฟล์นำเข้าจึงต้องเขียน
// วิชาเดิมซ้ำได้หลายแถว แถวละครูหนึ่งคน ตรรกะนี้ยุบแถวที่เป็นวิชาเดียวกันให้เหลือ
// รายวิชาเดียว แล้วแยกการมอบหมายครูรายห้องออกมาเป็นอีกชุดหนึ่ง
//
// ถ้าไม่กรอกคอลัมน์ห้อง ผลลัพธ์จะเท่ากับการนำเข้าแบบเดิมทุกประการ

const SEP = '␟';

const text = value => (value === null || value === undefined ? '' : String(value).trim());

export function subjectKey({ subject_name, grade_level, academic_year, semester }) {
    return [subject_name, grade_level, academic_year, semester].join(SEP);
}

export function assignmentKey(subjectIdentifier, teacherId, roomName) {
    return [subjectIdentifier, teacherId, roomName].join(SEP);
}

export function planSubjectImport(rows, {
    schoolId = null,
    academicYear = null,
    semester = null,
    teacherIdByCitizenId = new Map(),
    existingSubjects = [],
} = {}) {
    const existingIdByKey = new Map();
    existingSubjects.forEach(subject => existingIdByKey.set(subjectKey(subject), subject.subject_id));

    const groups = new Map();
    const unknownTeachers = [];
    const lossyTeacherIds = [];
    const incompleteRows = [];

    (rows || []).forEach((row, index) => {
        const lineNumber = index + 2; // แถวที่ 1 ในไฟล์คือหัวคอลัมน์
        const subjectName = text(row.subject_name);
        const gradeLevel = text(row.grade_level);
        if (!subjectName || !gradeLevel) {
            incompleteRows.push(lineNumber);
            return;
        }

        const hours = text(row.teaching_hours);
        const record = {
            school_id: schoolId,
            academic_year: parseInt(row.academic_year, 10) || academicYear || null,
            semester: parseInt(row.semester, 10) || semester || 1,
            subject_code: null,
            subject_name: subjectName,
            grade_level: gradeLevel,
            subject_group: text(row.subject_group) || null,
            teaching_hours: hours ? parseInt(hours, 10) : null,
        };

        const key = subjectKey(record);
        if (!groups.has(key)) groups.set(key, { key, record, primaryTeacherId: null, assignments: [], seen: new Set() });
        const group = groups.get(key);

        // ครูกรอกรายละเอียดวิชาไว้เฉพาะแถวแรกได้ แถวถัดไปเว้นว่างไว้ไม่ถือว่าลบของเดิม
        if (!group.record.subject_group && record.subject_group) group.record.subject_group = record.subject_group;
        if (group.record.teaching_hours === null && record.teaching_hours !== null) group.record.teaching_hours = record.teaching_hours;

        const rawTeacher = text(row.teacher_citizen_id);
        if (!rawTeacher) return;

        const citizenId = sanitizeCitizenId(rawTeacher);
        if (citizenId === LOSSY_SCIENTIFIC) {
            lossyTeacherIds.push({ row: lineNumber, value: rawTeacher });
            return;
        }
        const teacherId = citizenId ? teacherIdByCitizenId.get(citizenId) || null : null;
        if (!teacherId) {
            unknownTeachers.push({ row: lineNumber, citizenId: citizenId || rawTeacher, subjectName });
            return;
        }

        // ครูคนแรกที่พบของวิชานี้คือครูหลัก ซึ่งเห็นได้ทุกห้องของวิชา
        if (!group.primaryTeacherId) group.primaryTeacherId = teacherId;

        const roomName = text(row.room);
        if (!roomName) return;
        const seenKey = assignmentKey(key, teacherId, roomName);
        if (group.seen.has(seenKey)) return;
        group.seen.add(seenKey);
        group.assignments.push({ subjectKey: key, teacherId, roomName });
    });

    const newSubjects = [];
    const matchedSubjects = [];
    groups.forEach(group => {
        const existingId = existingIdByKey.get(group.key);
        if (existingId) matchedSubjects.push({ key: group.key, subjectId: existingId });
        else newSubjects.push({ key: group.key, record: { ...group.record, teacher_id: group.primaryTeacherId } });
    });

    const assignments = [...groups.values()].flatMap(group => group.assignments);

    return {
        newSubjects,
        matchedSubjects,
        assignments,
        unknownTeachers,
        lossyTeacherIds,
        incompleteRows,
        subjectCount: groups.size,
    };
}

// เรียกหลังจาก insert รายวิชาเสร็จแล้ว เพราะเพิ่งรู้ subject_id ตอนนั้น
export function buildTeacherAssignmentRows(assignments, subjectIdByKey, schoolId) {
    const seen = new Set();
    const rows = [];
    (assignments || []).forEach(item => {
        const subjectId = subjectIdByKey.get(item.subjectKey);
        if (!subjectId) return;
        const key = assignmentKey(subjectId, item.teacherId, item.roomName);
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ school_id: schoolId, subject_id: subjectId, teacher_id: item.teacherId, room_name: item.roomName });
    });
    return rows;
}
