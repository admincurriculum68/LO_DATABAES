import test from 'node:test';
import assert from 'node:assert/strict';
import {
    defaultRouteFor, hasAnyRole, hasRole, parseRoleList, primaryRoleOf, roleLabelsFor, rolesOf,
} from '../src/lib/roles.js';

const teacherAdmin = { role: 'teacher', roles: ['teacher', 'admin'], primaryRole: 'teacher' };
const legacyAdmin = { role: 'admin' };            // session รูปแบบเดิมที่ยังค้าง localStorage
const student = { role: 'student', roles: ['student'], primaryRole: 'student' };

test('ครูที่ทำงานฝ่ายวิชาการด้วย ถือครบทั้งสองบทบาท', () => {
    assert.deepEqual(rolesOf(teacherAdmin), ['teacher', 'admin']);
    assert.ok(hasRole(teacherAdmin, 'teacher'));
    assert.ok(hasRole(teacherAdmin, 'admin'));
    assert.ok(!hasRole(teacherAdmin, 'executive'));
});

test('เข้าถึง route ได้ถ้ามีบทบาทใดบทบาทหนึ่งที่อนุญาต', () => {
    assert.ok(hasAnyRole(teacherAdmin, ['teacher']));
    assert.ok(hasAnyRole(teacherAdmin, ['admin', 'executive']));
    assert.ok(!hasAnyRole(teacherAdmin, ['executive']));
    assert.ok(!hasAnyRole(student, ['admin']));
});

test('session รูปแบบเดิมยังใช้งานได้ ไม่หลุดออกจากระบบตอนอัปเดต', () => {
    assert.deepEqual(rolesOf(legacyAdmin), ['admin']);
    assert.ok(hasRole(legacyAdmin, 'admin'));
    assert.equal(defaultRouteFor(legacyAdmin), '/admin');
});

test('หน้าแรกใช้บทบาทหลัก ไม่ใช่บทบาทแรกที่เจอ', () => {
    assert.equal(defaultRouteFor(teacherAdmin), '/');
    assert.equal(defaultRouteFor({ roles: ['teacher', 'admin'], primaryRole: 'admin' }), '/admin');
    assert.equal(defaultRouteFor(student), '/student');
    assert.equal(defaultRouteFor({ roles: ['executive'], primaryRole: 'executive' }), '/executive');
});

test('บทบาทหลักที่ไม่อยู่ในรายการจริง ต้องถอยไปใช้บทบาทที่มีจริง', () => {
    const broken = { role: 'executive', roles: ['teacher'], primaryRole: 'executive' };
    assert.equal(primaryRoleOf(broken), 'teacher');
    assert.equal(defaultRouteFor(broken), '/');
});

test('ผู้ใช้ที่ไม่มีข้อมูล ไม่ทำให้ระบบพัง', () => {
    assert.deepEqual(rolesOf(null), []);
    assert.equal(primaryRoleOf(null), null);
    assert.equal(defaultRouteFor(null), '/');
    assert.ok(!hasRole(null, 'admin'));
});

test('ป้ายบทบาทแสดงเป็นภาษาไทยครบทุกบทบาท', () => {
    assert.deepEqual(roleLabelsFor(teacherAdmin), ['ครูผู้สอน', 'ฝ่ายวิชาการ']);
});

test('อ่านบทบาทหลายค่าจากไฟล์นำเข้า และตัดค่าที่ไม่ถูกต้องทิ้ง', () => {
    assert.deepEqual(parseRoleList('teacher, admin'), ['teacher', 'admin']);
    assert.deepEqual(parseRoleList('ADMIN;executive'), ['admin', 'executive']);
    assert.deepEqual(parseRoleList('teacher|teacher'), ['teacher']);
    assert.deepEqual(parseRoleList('student'), []);      // นักเรียนไม่ใช่บทบาทของบุคลากร
    assert.deepEqual(parseRoleList('ครู'), []);          // ค่าที่ระบบไม่รู้จักต้องไม่หลุดเข้าไป
    assert.deepEqual(parseRoleList(null), []);
});
