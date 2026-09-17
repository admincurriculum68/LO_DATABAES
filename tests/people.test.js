import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTeacherImportRows, personSearchText, primaryTeacherRoleOf, teacherRoleSummary, teacherRolesOf, validatePersonDraft, personFieldErrors, thaiDobPassword, STUDENT_STATUS_CHOICES, studentStatusLabel } from '../src/lib/people.js';

const multiRole = {
    role: 'teacher',
    teacher_roles: [{ role: 'teacher', is_primary: true }, { role: 'admin', is_primary: false }],
};
const legacy = { role: 'admin', teacher_roles: [] };

test('ครูที่ทำงานหลายหน้าที่ อ่านบทบาทได้ครบ', () => {
    assert.deepEqual(teacherRolesOf(multiRole), ['teacher', 'admin']);
    assert.equal(primaryTeacherRoleOf(multiRole), 'teacher');
});

test('ครูที่ยังไม่มีแถวใน teacher_roles ใช้บทบาทเดิมจากคอลัมน์ role', () => {
    assert.deepEqual(teacherRolesOf(legacy), ['admin']);
    assert.equal(primaryTeacherRoleOf(legacy), 'admin');
});

test('บทบาทหลักที่ไม่มีอยู่จริง ต้องถอยไปใช้บทบาทที่มี', () => {
    const broken = { role: 'executive', teacher_roles: [{ role: 'teacher', is_primary: false }] };
    assert.equal(primaryTeacherRoleOf(broken), 'teacher');
});

test('สรุปบทบาทเป็นภาษาไทย และระบุว่าอันไหนเป็นบทบาทหลัก', () => {
    assert.equal(teacherRoleSummary(multiRole), 'ครูผู้สอน (หลัก) · ฝ่ายวิชาการ');
    assert.equal(teacherRoleSummary({ teacher_roles: [] }), '-');
});

test('เลขประจำตัวประชาชนต้องครบ 13 หลัก และบอกผลที่จะเกิดถ้าผิด', () => {
    const errs = validatePersonDraft('teachers', { citizen_id: '12345', first_name: 'ก', last_name: 'ข', roles: ['teacher'] });
    assert.equal(errs.length, 1);
    assert.match(errs[0], /13 หลัก/);
    assert.match(errs[0], /เข้าสู่ระบบไม่ได้/);
});

test('เลขบัตรที่มีขีดหรือช่องว่างคั่น ยังนับเป็น 13 หลัก', () => {
    const errs = validatePersonDraft('students', { citizen_id: '1-4299-00127-28-0', first_name: 'ก', last_name: 'ข' });
    assert.deepEqual(errs, []);
});

test('นักเรียนที่ใช้เลข G ผ่านการตรวจเลขประจำตัว', () => {
    assert.deepEqual(validatePersonDraft('students', { citizen_id: 'G693000002418', first_name: 'ลู๊บนา', last_name: 'ลาติฟา' }), []);
});

test('ต้องกรอกทั้งชื่อและนามสกุล', () => {
    const errs = validatePersonDraft('students', { citizen_id: '1429900127280', first_name: '  ', last_name: '' });
    assert.deepEqual(errs, ['ต้องกรอกชื่อ', 'ต้องกรอกนามสกุล']);
});

test('ครูต้องมีอย่างน้อย 1 บทบาท แต่นักเรียนไม่ต้องมี', () => {
    const base = { citizen_id: '1429900127280', first_name: 'ก', last_name: 'ข' };
    assert.deepEqual(validatePersonDraft('teachers', { ...base, roles: [] }), ['ครู 1 คนต้องมีอย่างน้อย 1 บทบาท']);
    assert.deepEqual(validatePersonDraft('students', base), []);
});

test('รหัสผ่านตรวจเฉพาะเมื่อกรอก และต้องเป็นวันเกิด 8 หลัก', () => {
    const base = { citizen_id: '1429900127280', first_name: 'ก', last_name: 'ข', roles: ['teacher'] };
    assert.deepEqual(validatePersonDraft('teachers', { ...base }), []);
    assert.deepEqual(validatePersonDraft('teachers', { ...base, new_password: '' }), []);
    assert.deepEqual(validatePersonDraft('teachers', { ...base, new_password: '0501' }), ['รหัสผ่านต้องเป็นวันเดือนปีเกิด 8 หลัก เช่น 05012555']);
    assert.deepEqual(validatePersonDraft('teachers', { ...base, new_password: '05012555' }), []);
});

test('ค้นหาเจอทั้งจากชื่อ รหัสนักเรียน และห้องเรียน', () => {
    const text = personSearchText({ prefix: 'ด.ช.', first_name: 'ภูมิพัฒน์', last_name: 'ตั้งใจเรียน', student_code: '69001', current_room: 'ป.1/1' });
    assert.ok(text.includes('ภูมิพัฒน์'));
    assert.ok(text.includes('69001'));
    assert.ok(text.includes('ป.1/1'));
});

test('mergeTeacherImportRows รวมบทบาทของคนเดียวที่เขียนหลายแถว บทบาทแถวแรกเป็นบทบาทหลัก', () => {
    const merged = mergeTeacherImportRows([
        { citizen_id: '3309901514365', role: 'admin', homeroom: '' },
        { citizen_id: '1309900315214', role: 'teacher', homeroom: 'ป.1/1' },
        { citizen_id: '3309901514365', role: 'teacher', homeroom: '' },
    ]);

    assert.deepEqual(merged.get('3309901514365').roles, ['admin', 'teacher']);
    assert.deepEqual(merged.get('1309900315214'), { roles: ['teacher'], homeroom: 'ป.1/1' });
});

test('mergeTeacherImportRows ไม่มีบทบาทให้เป็นครูผู้สอน และรับหลายบทบาทในช่องเดียว', () => {
    const merged = mergeTeacherImportRows([
        { citizen_id: '1111111111119', role: '' },
        { citizen_id: '2222222222228', role: 'teacher,executive' },
    ]);

    assert.deepEqual(merged.get('1111111111119').roles, ['teacher']);
    assert.deepEqual(merged.get('2222222222228').roles, ['teacher', 'executive']);
});

test('personFieldErrors บอกข้อผิดพลาดแยกรายช่อง เพื่อแสดงใต้ช่องที่ผิด', () => {
    const errors = personFieldErrors('teachers', { citizen_id: '123', first_name: ' ', last_name: 'ใจดี', roles: [] });

    assert.deepEqual(Object.keys(errors), ['citizen_id', 'first_name', 'roles']);
    assert.match(errors.citizen_id, /ขณะนี้ 3 หลัก/);
    assert.deepEqual(personFieldErrors('students', { citizen_id: '1234567890123', first_name: 'ก', last_name: 'ข' }), {});
});

test('นักเรียนใหม่ต้องมีวันเกิดที่ใช้เป็นรหัสผ่านได้ รับได้ทั้งแบบมีขีดคั่นและ 8 หลัก', () => {
    const base = { citizen_id: '1234567890123', first_name: 'ปอ', last_name: 'ใจดี' };
    assert.equal(personFieldErrors('students', { ...base, dob: '' }).dob, 'กรอกวันเดือนปีเกิด 8 หลัก ปี พ.ศ. เช่น 05012560');
    assert.equal(personFieldErrors('students', { ...base, dob: '32012560' }).dob !== undefined, true);
    assert.equal(personFieldErrors('students', { ...base, dob: '05012560' }).dob, undefined);
    assert.equal(personFieldErrors('students', base).dob, undefined);
    assert.equal(thaiDobPassword('5/1/2560'), '05012560');
    assert.equal(thaiDobPassword('05-01-2017'), '05012560');
    assert.equal(thaiDobPassword('0501'), '');
});

test('สถานะนักเรียนใช้เฉพาะค่าที่ฐานข้อมูลยอมรับ ไม่มี inactive', () => {
    assert.deepEqual(STUDENT_STATUS_CHOICES.map(([value]) => value), ['active', 'transferred', 'dropped', 'graduated']);
    assert.equal(studentStatusLabel('transferred'), 'ย้ายออก');
    assert.equal(studentStatusLabel('inactive'), 'ไม่ได้เรียนแล้ว');
});
