import test from 'node:test';
import assert from 'node:assert/strict';
import { accessibleRooms, formatRoomRange, teacherRoomAccess, teachersWithRooms } from '../src/lib/teacherAccess.js';

const ROOMS = ['ป.4/1', 'ป.4/2', 'ป.4/3', 'ป.4/4', 'ป.4/5'];
// ภาษาอังกฤษ ป.4 ของเสนานุเคราะห์: ครูหลักสอนห้องปกติ ครูอีกคนสอนห้อง IEP
const english = { subject_id: 's1', teacher_id: 'hathai' };
const englishRows = [
    { teacher_id: 'hathai', room_name: 'ป.4/1' },
    { teacher_id: 'hathai', room_name: 'ป.4/2' },
    { teacher_id: 'hathai', room_name: 'ป.4/3' },
    { teacher_id: 'thanan', room_name: 'ป.4/4' },
    { teacher_id: 'thanan', room_name: 'ป.4/5' },
];

test('ครูหลักที่มีแถวรายห้อง เห็นเฉพาะห้องของตัวเอง ไม่เห็นห้อง IEP ของครูอีกคน', () => {
    const access = teacherRoomAccess(english, englishRows, 'hathai');
    assert.equal(access.canAccess, true);
    assert.equal(access.allRooms, false);
    assert.deepEqual(accessibleRooms(access, ROOMS), ['ป.4/1', 'ป.4/2', 'ป.4/3']);
    assert.equal(access.allows('ป.4/4'), false);
});

test('ครูร่วมที่ไม่ใช่ครูหลัก เห็นเฉพาะห้องที่ได้รับมอบหมาย', () => {
    const access = teacherRoomAccess(english, englishRows, 'thanan');
    assert.deepEqual(accessibleRooms(access, ROOMS), ['ป.4/4', 'ป.4/5']);
});

test('แถวที่ไม่ระบุห้อง แปลว่ารับทั้งวิชา', () => {
    const access = teacherRoomAccess(english, [...englishRows, { teacher_id: 'head', room_name: null }], 'head');
    assert.equal(access.allRooms, true);
    assert.deepEqual(accessibleRooms(access, ROOMS), ROOMS);
});

test('วิชาแบบเก่าที่ไม่มีแถวรายห้อง ครูหลักยังเห็นทุกห้องเหมือนเดิม', () => {
    const access = teacherRoomAccess({ teacher_id: 'old' }, [], 'old');
    assert.equal(access.allRooms, true);
    assert.deepEqual(accessibleRooms(access, ['ป.1/1', 'ป.1/2']), ['ป.1/1', 'ป.1/2']);
});

test('ครูหลักที่ไม่มีแถวของตัวเอง เห็นเฉพาะห้องที่ยังไม่มีครูคนอื่นรับ', () => {
    const access = teacherRoomAccess({ teacher_id: 'main' }, [{ teacher_id: 'other', room_name: 'ป.4/4' }], 'main');
    assert.deepEqual(accessibleRooms(access, ROOMS), ['ป.4/1', 'ป.4/2', 'ป.4/3', 'ป.4/5']);
    assert.equal(teacherRoomAccess({ teacher_id: 'main' }, [{ teacher_id: 'other', room_name: null }], 'main').canAccess, false);
});

test('ครูที่ไม่เกี่ยวกับวิชา เข้าไม่ได้', () => {
    const access = teacherRoomAccess(english, englishRows, 'stranger');
    assert.equal(access.canAccess, false);
    assert.deepEqual(accessibleRooms(access, ROOMS), []);
    assert.equal(teacherRoomAccess(english, englishRows, '').canAccess, false);
});

test('formatRoomRange ย่อห้องต่อเนื่อง และ teachersWithRooms รวมห้องต่อครู', () => {
    assert.equal(formatRoomRange(['ป.4/3', 'ป.4/1', 'ป.4/2']), 'ป.4/1–4/3');
    assert.equal(formatRoomRange(['ป.4/1', 'ป.4/2', 'ป.4/5']), 'ป.4/1–4/2, ป.4/5');
    assert.equal(formatRoomRange(['ป.4/4']), 'ป.4/4');
    assert.equal(formatRoomRange([]), '');
    assert.deepEqual(teachersWithRooms(english, englishRows), [
        { teacherId: 'hathai', rooms: ['ป.4/1', 'ป.4/2', 'ป.4/3'] },
        { teacherId: 'thanan', rooms: ['ป.4/4', 'ป.4/5'] },
    ]);
    assert.deepEqual(teachersWithRooms({ teacher_id: 'old' }, []), [{ teacherId: 'old', rooms: [] }]);
});
