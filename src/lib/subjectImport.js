import { LOSSY_SCIENTIFIC, sanitizeCitizenId } from './importSanitizers.js';
import { buildRoomHours } from './roomHours.js';

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

// ไฟล์ของโรงเรียนมักใส่ห้องเป็นเลขเปล่า เช่น 1 แต่ห้องของนักเรียนถูกเก็บเป็น ป.1/1
// (ตัวช่วยนำเข้ารวมชั้นกับห้องให้นักเรียนแบบเดียวกันนี้) ถ้าไม่แปลงให้ตรงกัน ครูร่วมสอน
// จะเปิดหน้าประเมินแล้วไม่เห็นนักเรียนสักคน เพราะหน้าประเมินกรองนักเรียนด้วยชื่อห้อง
export function normalizeRoomName(room, gradeLevel) {
    const value = text(room);
    const grade = text(gradeLevel);
    if (/^\d+$/.test(value) && grade) return `${grade}/${value}`;
    return value;
}

export function planSubjectImport(rows, {
    schoolId = null,
    academicYear = null,
    semester = null,
    teacherIdByCitizenId = new Map(),
    existingSubjects = [],
} = {}) {
    const existingByKey = new Map();
    existingSubjects.forEach(subject => existingByKey.set(subjectKey(subject), subject));

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
        if (!groups.has(key)) groups.set(key, { key, record, primaryTeacherId: null, assignments: [], seen: new Set(), roomHours: new Map(), unroomedHours: [], rooms: new Set() });
        const group = groups.get(key);

        // ครูกรอกรายละเอียดวิชาไว้เฉพาะแถวแรกได้ แถวถัดไปเว้นว่างไว้ไม่ถือว่าลบของเดิม
        if (!group.record.subject_group && record.subject_group) group.record.subject_group = record.subject_group;

        // ห้องที่ใช้จัดนักเรียนเข้าวิชามาจากทุกแถวที่ระบุห้อง ไม่ขึ้นกับว่าหาครูเจอหรือไม่
        // วิชาที่ครูยังไม่มีบัญชีจึงยังได้นักเรียนครบ แล้วค่อยเพิ่มครูภายหลัง
        const enrollmentRoom = normalizeRoomName(row.room, record.grade_level);
        if (enrollmentRoom) group.rooms.add(enrollmentRoom);

        // ชั่วโมงเก็บรายห้องไว้ก่อน แล้วค่อยสรุปเป็นค่าเริ่มต้นกับห้องที่ต่างหลังอ่านครบทุกแถว
        if (record.teaching_hours !== null) {
            if (enrollmentRoom) {
                if (!group.roomHours.has(enrollmentRoom)) group.roomHours.set(enrollmentRoom, []);
                group.roomHours.get(enrollmentRoom).push(record.teaching_hours);
            } else {
                group.unroomedHours.push(record.teaching_hours);
            }
        }

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

        const roomName = normalizeRoomName(row.room, record.grade_level);
        if (!roomName) return;
        const seenKey = assignmentKey(key, teacherId, roomName);
        if (group.seen.has(seenKey)) return;
        group.seen.add(seenKey);
        group.assignments.push({ subjectKey: key, teacherId, roomName });
    });

    // วิชาเดียวกันเรียนไม่เท่ากันได้ตามห้อง ค่าเริ่มต้นคือชั่วโมงที่พบบ่อยที่สุด ห้องที่ต่างเก็บไว้ใน room_hours
    // แต่ห้องเดียวกันควรมีชั่วโมงค่าเดียว ถ้าหลายแถวของห้องเดียวกันกรอกไม่ตรงกัน ใช้ค่าแรกและรายงาน
    const roomHoursConflicts = [];
    groups.forEach(group => {
        const hoursByRoom = new Map();
        group.roomHours.forEach((values, room) => {
            hoursByRoom.set(room, values[0]);
            const distinct = [...new Set(values)];
            if (distinct.length > 1) {
                roomHoursConflicts.push({ subjectName: group.record.subject_name, gradeLevel: group.record.grade_level, room, hours: distinct });
            }
        });
        const built = buildRoomHours(hoursByRoom, group.unroomedHours[0] ?? null);
        group.record.teaching_hours = built.teaching_hours;
        group.record.room_hours = built.room_hours;
        group.hasHours = hoursByRoom.size > 0 || group.unroomedHours.length > 0;
    });

    const newSubjects = [];
    const matchedSubjects = [];
    groups.forEach(group => {
        const existing = existingByKey.get(group.key);
        if (existing) {
            const sameHours = existing.teaching_hours === group.record.teaching_hours
                && JSON.stringify(existing.room_hours ?? null) === JSON.stringify(group.record.room_hours ?? null);
            matchedSubjects.push({
                key: group.key,
                subjectId: existing.subject_id,
                hoursChanged: group.hasHours && !sameHours,
                teaching_hours: group.record.teaching_hours,
                room_hours: group.record.room_hours,
            });
        } else {
            newSubjects.push({ key: group.key, record: { ...group.record, teacher_id: group.primaryTeacherId } });
        }
    });

    const assignments = [...groups.values()].flatMap(group => group.assignments);
    const enrollmentRooms = [...groups.values()].flatMap(group => [...group.rooms].map(roomName => ({ subjectKey: group.key, roomName })));

    return {
        newSubjects,
        matchedSubjects,
        assignments,
        unknownTeachers,
        lossyTeacherIds,
        incompleteRows,
        roomHoursConflicts,
        roomHoursSubjects: [...groups.values()].filter(group => group.record.room_hours).length,
        enrollmentRooms,
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

// ไฟล์วิชาระบุอยู่แล้วว่าวิชาไหนเรียนห้องไหน จึงจัดนักเรียนทุกคนในห้องนั้นเข้าวิชาได้เลย
// แทนการกดเพิ่มทีละห้อง ข้ามคนที่มีรายชื่อในวิชานั้นอยู่แล้วทุกสถานะ นำเข้าซ้ำจึงไม่เกิด
// รายชื่อซ้ำ และไม่ดึงนักเรียนที่ถูกถอนออกจากวิชากลับเข้ามา
export function buildRoomEnrollmentRows(enrollmentRooms, subjectIdByKey, students, existingEnrollments = []) {
    const existing = new Set((existingEnrollments || []).map(row => assignmentKey(row.subject_id, row.student_id, '')));
    const studentsByRoom = new Map();
    (students || []).forEach(student => {
        const room = text(student.current_room);
        if (!room) return;
        if (!studentsByRoom.has(room)) studentsByRoom.set(room, []);
        studentsByRoom.get(room).push(student.student_id);
    });
    const rows = [];
    (enrollmentRooms || []).forEach(item => {
        const subjectId = subjectIdByKey.get(item.subjectKey);
        if (!subjectId) return;
        (studentsByRoom.get(item.roomName) || []).forEach(studentId => {
            const key = assignmentKey(subjectId, studentId, '');
            if (existing.has(key)) return;
            existing.add(key);
            rows.push({ student_id: studentId, subject_id: subjectId, room: item.roomName, enrollment_status: 'active' });
        });
    });
    return rows;
}
