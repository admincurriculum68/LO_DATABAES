import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherAssignmentRows, planSubjectImport, subjectKey } from '../src/lib/subjectImport.js';

const TEACHERS = new Map([
    ['1111111111111', 'teacher-a'],
    ['2222222222222', 'teacher-b'],
    ['3333333333333', 'teacher-c'],
]);

const base = {
    schoolId: 'school-1',
    academicYear: 2568,
    semester: 1,
    teacherIdByCitizenId: TEACHERS,
};

const row = extra => ({
    academic_year: 2568,
    semester: 1,
    subject_name: 'การอ่านการเขียนภาษาไทย 3',
    grade_level: 'ป.3',
    subject_group: 'ภาษาและการสื่อสาร',
    teaching_hours: 120,
    ...extra,
});

test('แถวซ้ำของวิชาเดียวกันยุบเหลือรายวิชาเดียว ไม่สร้างวิชาซ้ำ', () => {
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '1111111111111', room: 'ป.3/1' }),
        row({ teacher_citizen_id: '2222222222222', room: 'ป.3/2' }),
        row({ teacher_citizen_id: '3333333333333', room: 'ป.3/3' }),
    ], base);

    assert.equal(plan.subjectCount, 1);
    assert.equal(plan.newSubjects.length, 1);
    assert.equal(plan.assignments.length, 3);
});

test('ครูคนแรกของวิชาเป็นครูหลัก', () => {
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '2222222222222', room: 'ป.3/2' }),
        row({ teacher_citizen_id: '1111111111111', room: 'ป.3/1' }),
    ], base);

    assert.equal(plan.newSubjects[0].record.teacher_id, 'teacher-b');
});

test('ครูคนเดียวสอนหลายห้องได้ และห้องซ้ำนับครั้งเดียว', () => {
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '1111111111111', room: 'ป.3/1' }),
        row({ teacher_citizen_id: '1111111111111', room: 'ป.3/2' }),
        row({ teacher_citizen_id: '1111111111111', room: 'ป.3/2' }),
    ], base);

    assert.equal(plan.assignments.length, 2);
    assert.deepEqual(plan.assignments.map(item => item.roomName), ['ป.3/1', 'ป.3/2']);
});

test('ไม่กรอกคอลัมน์ห้อง ให้ผลเท่ากับการนำเข้าแบบเดิม', () => {
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '1111111111111' }),
        row({ subject_name: 'การคิดคำนวณ 3', subject_group: 'การคิดคำนวณ', teaching_hours: 200, teacher_citizen_id: '2222222222222' }),
    ], base);

    assert.equal(plan.newSubjects.length, 2);
    assert.equal(plan.assignments.length, 0);
    assert.equal(plan.newSubjects[0].record.teacher_id, 'teacher-a');
    assert.equal(plan.newSubjects[1].record.teacher_id, 'teacher-b');
});

test('ชั้นต่างกันหรือภาคเรียนต่างกันคือคนละวิชา', () => {
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '1111111111111' }),
        row({ grade_level: 'ป.2', teacher_citizen_id: '1111111111111' }),
        row({ semester: 2, teacher_citizen_id: '1111111111111' }),
    ], base);

    assert.equal(plan.subjectCount, 3);
});

test('วิชาที่มีอยู่แล้วไม่สร้างซ้ำ แต่ยังเพิ่มครูเข้าไปได้', () => {
    const existing = {
        subject_id: 'subject-1',
        subject_name: 'การอ่านการเขียนภาษาไทย 3',
        grade_level: 'ป.3',
        academic_year: 2568,
        semester: 1,
    };
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '1111111111111', room: 'ป.3/1' }),
        row({ teacher_citizen_id: '2222222222222', room: 'ป.3/2' }),
    ], { ...base, existingSubjects: [existing] });

    assert.equal(plan.newSubjects.length, 0);
    assert.equal(plan.matchedSubjects.length, 1);
    assert.equal(plan.matchedSubjects[0].subjectId, 'subject-1');
    assert.equal(plan.assignments.length, 2);
});

test('เลขบัตรครูที่ไม่มีในระบบถูกรายงาน ไม่เงียบหาย', () => {
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '1234567890123', room: 'ป.3/1' }),
    ], base);

    assert.equal(plan.unknownTeachers.length, 1);
    assert.equal(plan.unknownTeachers[0].row, 2);
    assert.equal(plan.unknownTeachers[0].citizenId, '1234567890123');
    assert.equal(plan.newSubjects[0].record.teacher_id, null);
    assert.equal(plan.assignments.length, 0);
});

test('เลขบัตรที่ Excel ทำหลักหายถูกแยกรายงานต่างหาก', () => {
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '1.23457E+12', room: 'ป.3/1' }),
    ], base);

    assert.equal(plan.lossyTeacherIds.length, 1);
    assert.equal(plan.unknownTeachers.length, 0);
});

test('แถวที่ไม่มีชื่อวิชาหรือชั้นถูกข้ามและรายงานเลขแถว', () => {
    const plan = planSubjectImport([
        row({ subject_name: '   ', teacher_citizen_id: '1111111111111' }),
        row({ grade_level: '', teacher_citizen_id: '1111111111111' }),
        row({ teacher_citizen_id: '1111111111111' }),
    ], base);

    assert.deepEqual(plan.incompleteRows, [2, 3]);
    assert.equal(plan.subjectCount, 1);
});

test('รายละเอียดวิชาที่กรอกเฉพาะแถวแรก ไม่ถูกแถวถัดไปลบทิ้ง', () => {
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '1111111111111', room: 'ป.3/1' }),
        row({ subject_group: '', teaching_hours: '', teacher_citizen_id: '2222222222222', room: 'ป.3/2' }),
    ], base);

    assert.equal(plan.newSubjects[0].record.subject_group, 'ภาษาและการสื่อสาร');
    assert.equal(plan.newSubjects[0].record.teaching_hours, 120);
});

test('ปีการศึกษาที่ไฟล์ไม่ได้ระบุ ใช้ปีที่เปิดอยู่ในระบบ', () => {
    const plan = planSubjectImport([
        row({ academic_year: '', semester: '', teacher_citizen_id: '1111111111111' }),
    ], base);

    assert.equal(plan.newSubjects[0].record.academic_year, 2568);
    assert.equal(plan.newSubjects[0].record.semester, 1);
});

test('buildTeacherAssignmentRows เติม subject_id หลังบันทึกวิชาแล้ว', () => {
    const plan = planSubjectImport([
        row({ teacher_citizen_id: '1111111111111', room: 'ป.3/1' }),
        row({ teacher_citizen_id: '2222222222222', room: 'ป.3/2' }),
    ], base);

    const key = subjectKey({ subject_name: 'การอ่านการเขียนภาษาไทย 3', grade_level: 'ป.3', academic_year: 2568, semester: 1 });
    const rows = buildTeacherAssignmentRows(plan.assignments, new Map([[key, 'subject-9']]), 'school-1');

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { school_id: 'school-1', subject_id: 'subject-9', teacher_id: 'teacher-a', room_name: 'ป.3/1' });
});

test('buildTeacherAssignmentRows ข้ามวิชาที่หา subject_id ไม่เจอ', () => {
    const rows = buildTeacherAssignmentRows(
        [{ subjectKey: 'ไม่มีจริง', teacherId: 'teacher-a', roomName: 'ป.3/1' }],
        new Map(),
        'school-1',
    );

    assert.deepEqual(rows, []);
});
