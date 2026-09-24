import test from 'node:test';
import assert from 'node:assert/strict';
import { areasToSubmit, canEditArea, editableAreasFor } from '../src/lib/homeroomScope.js';

const lo = (loId, area) => ({ lo_id: loId, lo_code: loId, ability_no: 1, competency_area: area });
const enrollments = [
    { enrollment_id: 'e1', student_id: 's1', subject_id: 'thai', room: 'ป.2/1' },
    { enrollment_id: 'e2', student_id: 's1', subject_id: 'math', room: 'ป.2/1' },
    { enrollment_id: 'e3', student_id: 's2', subject_id: 'thai', room: 'ป.2/1' },
];
const mappings = [
    { subject_id: 'thai', room_name: null, learning_outcomes: lo('r1', 'ความสามารถด้านการอ่าน') },
    { subject_id: 'thai', room_name: null, learning_outcomes: lo('w1', 'ความสามารถด้านการเขียน') },
    { subject_id: 'math', room_name: null, learning_outcomes: lo('n1', 'ความสามารถด้านการคิดคำนวณ') },
];

test('ครูประจำชั้นและฝ่ายวิชาการแก้ได้ทุกด้าน', () => {
    const areas = editableAreasFor({ canEditAll: true, enrollments, mappings, canEditSubject: () => false });
    assert.equal(areas, null);
    assert.equal(canEditArea(areas, 'ความสามารถด้านการอ่าน'), true);
    assert.equal(canEditArea(areas, 'ด้านที่โรงเรียนเพิ่มเอง'), true);
});

test('ครูรายวิชาแก้ได้เฉพาะด้านของ LO วิชาที่ตัวเองสอนในห้องนั้น', () => {
    const areas = editableAreasFor({
        enrollments,
        mappings,
        canEditSubject: subjectId => subjectId === 'thai',
    });
    assert.deepEqual([...areas].sort(), ['ความสามารถด้านการเขียน', 'ความสามารถด้านการอ่าน'].sort());
    assert.equal(canEditArea(areas, 'ความสามารถด้านการอ่าน'), true);
    assert.equal(canEditArea(areas, ' ความสามารถด้านการเขียน '), true);
    assert.equal(canEditArea(areas, 'ความสามารถด้านการคิดคำนวณ'), false);
});

test('ครูที่ไม่ได้สอนห้องนี้แก้ไม่ได้สักด้าน', () => {
    const areas = editableAreasFor({ enrollments, mappings, canEditSubject: () => false });
    assert.equal(areas.size, 0);
    assert.equal(canEditArea(areas, 'ความสามารถด้านการอ่าน'), false);
});

test('ห้องที่มีชุด LO ของตัวเอง ใช้ชุดของห้องนั้นไม่ใช่ชุดทั้งวิชา', () => {
    const roomMappings = [
        ...mappings,
        { subject_id: 'thai', room_name: 'ป.2/1', learning_outcomes: lo('c1', 'ความสามารถด้านภาษาจีน') },
    ];
    const areas = editableAreasFor({ enrollments, mappings: roomMappings, canEditSubject: subjectId => subjectId === 'thai' });
    assert.deepEqual([...areas], ['ความสามารถด้านภาษาจีน']);
});

test('ปุ่มส่งผลสรุปของครูรายวิชาส่งเฉพาะด้านของตัวเอง ครูประจำชั้นส่งทั้งห้อง', () => {
    const roomAreas = ['ความสามารถด้านการอ่าน', ' ความสามารถด้านการเขียน ', 'ความสามารถด้านการคิดคำนวณ'];
    assert.equal(areasToSubmit(null, roomAreas), null);
    const mine = editableAreasFor({ enrollments, mappings, canEditSubject: subjectId => subjectId === 'thai' });
    assert.deepEqual(areasToSubmit(mine, roomAreas).sort(), ['ความสามารถด้านการเขียน', 'ความสามารถด้านการอ่าน'].sort());
    assert.deepEqual(areasToSubmit(new Set(), roomAreas), []);
});
