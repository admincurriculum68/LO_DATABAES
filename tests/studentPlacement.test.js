import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAVE_STATUS, placementSummary, planStudentPlacement } from '../src/lib/studentPlacement.js';

const names = new Map([['thai', 'ภาษาไทย'], ['math', 'คณิตศาสตร์'], ['iep', 'ทักษะการสื่อสาร (IEP)'], ['art', 'ศิลปะ']]);
const row = (enrollment_id, subject_id, room, enrollment_status = 'active') => ({ enrollment_id, subject_id, room, enrollment_status });

test('นักเรียนใหม่ เข้าทุกวิชาของห้อง', () => {
    const plan = planStudentPlacement({ enrollments: [], targetSubjectIds: ['thai', 'math'], targetRoom: 'ป.4/1' });
    assert.deepEqual(plan.toInsert, [{ subject_id: 'thai', room: 'ป.4/1' }, { subject_id: 'math', room: 'ป.4/1' }]);
    assert.equal(plan.toUpdate.length, 0);
    assert.equal(plan.toLeave.length, 0);
    assert.equal(plan.hasChanges, true);
});

test('ย้ายห้องในชั้นเดียวกัน ใช้แถวเดิมเปลี่ยนห้อง ข้อความ LO จึงตามไปด้วย', () => {
    const plan = planStudentPlacement({
        enrollments: [row('e1', 'thai', 'ป.4/1'), row('e2', 'math', 'ป.4/1')],
        targetSubjectIds: ['thai', 'math'],
        targetRoom: 'ป.4/2',
    });
    assert.deepEqual(plan.toUpdate.map(item => [item.enrollment_id, item.room, item.fromRoom, item.reopened]), [
        ['e1', 'ป.4/2', 'ป.4/1', false],
        ['e2', 'ป.4/2', 'ป.4/1', false],
    ]);
    assert.equal(plan.toInsert.length, 0);
    assert.equal(plan.toLeave.length, 0);
    assert.deepEqual(placementSummary(plan, names), ['ย้ายห้องในวิชาเดิม 2 วิชา ข้อความ LO ที่บันทึกไว้ย้ายตามไปด้วย']);
});

test('ย้ายไปห้อง IEP ที่วิชาต่างกัน เพิ่มวิชาใหม่และออกจากวิชาที่ห้องใหม่ไม่มี', () => {
    const plan = planStudentPlacement({
        enrollments: [row('e1', 'thai', 'ป.4/1'), row('e2', 'art', 'ป.4/1')],
        targetSubjectIds: ['thai', 'iep'],
        targetRoom: 'ป.4/4',
        leaveStatus: LEAVE_STATUS.move,
    });
    assert.deepEqual(plan.toInsert, [{ subject_id: 'iep', room: 'ป.4/4' }]);
    assert.deepEqual(plan.toUpdate.map(item => item.enrollment_id), ['e1']);
    assert.deepEqual(plan.toLeave, [{ enrollment_id: 'e2', subject_id: 'art', status: 'moved' }]);
    assert.deepEqual(placementSummary(plan, names), [
        'ย้ายห้องในวิชาเดิม 1 วิชา ข้อความ LO ที่บันทึกไว้ย้ายตามไปด้วย',
        'เข้าเรียนวิชาใหม่ 1 วิชา: ทักษะการสื่อสาร (IEP)',
        'ออกจาก 1 วิชา: ศิลปะ (ข้อความที่บันทึกไว้ยังเก็บอยู่)',
    ]);
});

test('ย้ายออกหรือลาออก ออกจากทุกวิชาที่ยังเรียนอยู่ แถวที่ออกไปแล้วไม่แตะ', () => {
    const plan = planStudentPlacement({
        enrollments: [row('e1', 'thai', 'ป.4/1'), row('e2', 'math', 'ป.4/1'), row('e3', 'art', 'ป.4/1', 'moved')],
        targetSubjectIds: [],
        leaveStatus: LEAVE_STATUS.withdraw,
    });
    assert.deepEqual(plan.toLeave.map(item => [item.enrollment_id, item.status]), [['e1', 'withdrawn'], ['e2', 'withdrawn']]);
    assert.equal(plan.toInsert.length, 0);
    assert.equal(plan.toUpdate.length, 0);
});

test('กลับเข้าเรียน เปิดแถวเดิมแทนการสร้างแถวใหม่', () => {
    const plan = planStudentPlacement({
        enrollments: [row('e1', 'thai', 'ป.4/1', 'withdrawn'), row('e2', 'math', 'ป.4/1', 'withdrawn')],
        targetSubjectIds: ['thai', 'math'],
        targetRoom: 'ป.4/1',
    });
    assert.equal(plan.toInsert.length, 0);
    assert.deepEqual(plan.toUpdate.map(item => [item.enrollment_id, item.reopened]), [['e1', true], ['e2', true]]);
    assert.match(placementSummary(plan, names)[0], /^กลับเข้าเรียน 2 วิชา ข้อความเดิมกลับมาด้วย: คณิตศาสตร์, ภาษาไทย$/);
});

test('ห้องเดิมและวิชาครบแล้ว ไม่มีอะไรต้องเปลี่ยน', () => {
    const plan = planStudentPlacement({
        enrollments: [row('e1', 'thai', 'ป.4/1'), row('e0', 'thai', 'ป.4/1', 'withdrawn')],
        targetSubjectIds: ['thai'],
        targetRoom: 'ป.4/1',
    });
    assert.equal(plan.hasChanges, false);
    assert.deepEqual(placementSummary(plan, names), ['ไม่มีวิชาที่ต้องเปลี่ยน']);
});
