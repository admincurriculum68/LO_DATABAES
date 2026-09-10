import test from 'node:test';
import assert from 'node:assert/strict';
import { detectHeaderRow, normalizeHeader, suggestMapping } from '../src/lib/columnMapping.js';
import { IMPORT_SCHEMAS } from '../src/lib/importSchemas.js';

// คืนเลขคอลัมน์ (นับจาก 1 แบบที่ครูเห็นในหน้าจอ) ของแต่ละช่อง หรือ null ถ้าไม่ได้จับคู่
const columnsFor = (type, headers) => {
    const fields = IMPORT_SCHEMAS[type].fields;
    const mapping = suggestMapping(headers, fields);
    return Object.fromEntries(fields.map(field => [field.key, mapping[field.key] === '' ? null : Number(mapping[field.key]) + 1]));
};

test('normalizeHeader ตัดวงเล็บ ช่องว่าง และเครื่องหมายก่อนเทียบ', () => {
    assert.equal(normalizeHeader(' วัน/เดือน/ปีเกิด (ddmmyyyy) '), 'วันเดือนปีเกิดddmmyyyy');
    assert.equal(normalizeHeader('ปีการศึกษา (academic_year)'), 'ปีacademicyear');
});

test('ไฟล์นักเรียนที่ไม่มีคอลัมน์คำนำหน้า ต้องไม่เอาคอลัมน์ชื่อไปเป็นคำนำหน้า', () => {
    const columns = columnsFor('students', ['เลขประจำตัวประชาชน', 'วันเกิด', 'ชื่อ', 'นามสกุล', 'ชั้น/ห้อง']);

    assert.equal(columns.prefix, null);
    assert.equal(columns.first_name, 3);
    assert.equal(columns.last_name, 4);
});

test('ไฟล์ครูที่ไม่มีคอลัมน์คำนำหน้า ต้องไม่เอาคอลัมน์ชื่อไปเป็นคำนำหน้า', () => {
    const columns = columnsFor('teachers', ['เลขประจำตัวประชาชน', 'ชื่อ', 'นามสกุล', 'วันเกิด', 'บทบาท']);

    assert.deepEqual(columns, { citizen_id: 1, dob: 4, prefix: null, first_name: 2, last_name: 3, role: 5, homeroom: null });
});

test('หัวคอลัมน์ "เลขประจำตัว" ซ้ำสองคอลัมน์ ได้เลขบัตรกับรหัสนักเรียนคนละคอลัมน์', () => {
    const columns = columnsFor('students', ['เลขประจำตัว', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'วันเกิด', 'เลขประจำตัว', 'สถานะ', 'ชั้น', 'ห้อง']);

    assert.deepEqual(columns, {
        citizen_id: 1, dob: 5, student_code: 6, prefix: 2, first_name: 3,
        last_name: 4, current_grade_level: 8, current_room: 9,
    });
});

test('คอลัมน์ "ชั้น/ห้อง" คอลัมน์เดียว ใช้ร่วมกันทั้งระดับชั้นและห้อง', () => {
    const columns = columnsFor('students', ['เลขประจำตัวประชาชน', 'วันเกิด', 'ชื่อ', 'นามสกุล', 'ชั้น/ห้อง']);

    assert.equal(columns.current_grade_level, 5);
    assert.equal(columns.current_room, 5);
});

test('หัวคอลัมน์ครูสองภาษาจับคู่ครบหนึ่งต่อหนึ่ง', () => {
    const columns = columnsFor('teachers', [
        'เลขประจำตัวประชาชน (citizen_id)', 'คำนำหน้า (prefix)', 'ชื่อ (first_name)', 'นามสกุล (last_name)',
        'วัน/เดือน/ปีเกิด (ddmmyyyy)', 'บทบาท (role)', 'ครูประจำชั้น (homeroom)',
    ]);

    assert.deepEqual(columns, { citizen_id: 1, dob: 5, prefix: 2, first_name: 3, last_name: 4, role: 6, homeroom: 7 });
});

test('ไฟล์วิชาที่มีคอลัมน์กิจกรรมและหน่วยการเรียนรู้ปน จับคู่วิชา ห้อง ครู และชั่วโมงถูกคอลัมน์', () => {
    const columns = columnsFor('subjects', [
        'ปีการศึกษา (academic_year)', 'ภาคเรียน (semester)', 'ชื่อวิชา (subject_name)', 'ชื่อกิจกรรม',
        'ชื่อหน่วยการเรียนรู้', 'ชื่อโครงงาน', 'ระดับชั้น (grade_level)', 'ห้อง',
        'เลขประชาชนครูผู้สอน (teacher_citizen_id)', 'ชื่อครูผู้สอน', 'จำนวนชั่วโมง (teaching_hours)',
    ]);

    assert.deepEqual(columns, {
        academic_year: 1, semester: 2, subject_name: 3, grade_level: 7,
        subject_group: null, teaching_hours: 11, teacher_citizen_id: 9, room: 8,
    });
});

test('หัวคอลัมน์สั้น ๆ อย่าง "ที่" ไม่ถูกเดาเป็นห้อง เพราะบังเอิญอยู่ในคำเทียบยาว', () => {
    const columns = columnsFor('subjects', ['ที่', 'ชื่อวิชา', 'ระดับชั้น']);

    assert.equal(columns.room, null);
    assert.equal(columns.subject_name, 2);
});

test('คอลัมน์ที่หัวว่างไม่ถูกจับคู่กับอะไรเลย', () => {
    const columns = columnsFor('students', ['', 'เลขประจำตัวประชาชน', 'วันเกิด', 'ชื่อ', 'นามสกุล', 'ชั้น', 'ห้อง']);

    assert.equal(columns.citizen_id, 2);
    assert.equal(Object.values(columns).includes(1), false);
});

test('แม่แบบภาษาอังกฤษของทุกประเภทยังจับคู่ครบทุกช่อง', () => {
    const templates = {
        students: 'citizen_id,dob,student_code,prefix,first_name,last_name,current_room,current_grade_level',
        teachers: 'citizen_id,dob,prefix,first_name,last_name,role,homeroom',
        subjects: 'academic_year,semester,subject_name,grade_level,subject_group,teaching_hours,teacher_citizen_id,room',
        activities: 'academic_year,semester,context_name,grade_level,subject_group,teaching_hours,teacher_citizen_id,activity_category,description',
        enrollments: 'student_citizen_id,subject_name,room',
        learning_outcomes: 'grade_level,lo_code,ability_no,level_group,competency_area,is_custom_competency,lo_description',
    };
    Object.entries(templates).forEach(([type, line]) => {
        const headers = line.split(',');
        const columns = columnsFor(type, headers);
        Object.entries(columns).forEach(([key, column]) => {
            assert.equal(headers[column - 1], key, `${type}.${key}`);
        });
    });
});

test('detectHeaderRow ข้ามหัวรายงานบรรทัดแรกไปหาแถวหัวคอลัมน์จริง', () => {
    const rows = [
        ['รายชื่อนักเรียน ปีการศึกษา 2569'],
        ['เลขประจำตัวประชาชน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'วันเกิด', 'ชั้น', 'ห้อง'],
        ['1309904757106', 'เด็กชาย', 'ณรงค์กร', 'เกิดโมลี', '19/09/2562', 'ป.1', '1'],
    ];

    assert.equal(detectHeaderRow(rows, IMPORT_SCHEMAS.students.fields), 1);
});
