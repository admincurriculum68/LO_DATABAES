import test from 'node:test';
import assert from 'node:assert/strict';
import {
    personSearchText, primaryTeacherRoleOf, teacherRoleSummary, teacherRolesOf, validatePersonDraft,
} from '../src/lib/people.js';

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
