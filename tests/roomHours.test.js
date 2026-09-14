import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomHours, hasRoomHours, hoursForRoom, summarizeRoomHours } from '../src/lib/roomHours.js';

test('buildRoomHours ใช้ชั่วโมงที่พบบ่อยที่สุดเป็นค่าเริ่มต้น และเก็บเฉพาะห้องที่ต่าง', () => {
    const built = buildRoomHours(new Map([['ป.1/1', 80], ['ป.1/2', 80], ['ป.1/3', 80], ['ป.1/4', 100], ['ป.1/5', 100], ['ป.1/6', 60]]));
    assert.deepEqual(built, { teaching_hours: 80, room_hours: { 'ป.1/4': 100, 'ป.1/5': 100, 'ป.1/6': 60 } });
});

test('buildRoomHours: ทุกห้องเท่ากันไม่มี room_hours · จำนวนเท่ากันใช้ค่าที่พบก่อน · ช่องว่างไม่นับ', () => {
    assert.deepEqual(buildRoomHours({ 'ป.2/1': 40, 'ป.2/2': 40 }), { teaching_hours: 40, room_hours: null });
    assert.deepEqual(buildRoomHours(new Map([['ป.2/1', 20], ['ป.2/2', 40]])), { teaching_hours: 20, room_hours: { 'ป.2/2': 40 } });
    assert.deepEqual(buildRoomHours({ 'ป.2/1': '', 'ป.2/2': null }, 60), { teaching_hours: 60, room_hours: null });
});

test('hoursForRoom ใช้ชั่วโมงของห้องถ้ามี ถ้าไม่มีใช้ค่าเริ่มต้นของวิชา', () => {
    const subject = { teaching_hours: 80, room_hours: { 'ป.1/4': 100 } };
    assert.equal(hoursForRoom(subject, 'ป.1/4'), 100);
    assert.equal(hoursForRoom(subject, 'ป.1/1'), 80);
    assert.equal(hoursForRoom({ teaching_hours: null }, 'ป.1/1'), null);
    assert.equal(hasRoomHours(subject), true);
    assert.equal(hasRoomHours({ teaching_hours: 80, room_hours: null }), false);
});

test('summarizeRoomHours รวมห้องที่เลขติดกันเป็นช่วง', () => {
    const subject = { teaching_hours: 80, room_hours: { 'ป.1/4': 100, 'ป.1/5': 100, 'ป.1/6': 100 } };
    assert.equal(summarizeRoomHours(subject, ['ป.1/1', 'ป.1/2', 'ป.1/3', 'ป.1/4', 'ป.1/5', 'ป.1/6']), 'ห้อง 1–3: 80 ชม. · ห้อง 4–6: 100 ชม.');
    assert.equal(summarizeRoomHours({ teaching_hours: 40, room_hours: null }, ['ป.1/1']), '40 ชั่วโมง');
    assert.equal(summarizeRoomHours({ teaching_hours: 20, room_hours: { 'ป.1/6': 10 } }, ['ป.1/1', 'ป.1/3', 'ป.1/6']), 'ห้อง 1, 3: 20 ชม. · ห้อง 6: 10 ชม.');
    assert.equal(summarizeRoomHours(null, []), '');
});
