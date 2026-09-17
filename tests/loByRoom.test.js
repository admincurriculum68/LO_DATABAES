import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoResolver, idsForEnrollment, planRoomWrite, roomsSummary, sameSetAcrossRooms } from '../src/lib/loByRoom.js';

const row = (subject_id, lo_id, room_name = null, updated_at = null) => ({ subject_id, lo_id, room_name, updated_at });

test('ห้องที่มีชุดของตัวเองใช้ชุดนั้น ห้องอื่นใช้ชุดทั้งวิชา', () => {
    const resolver = buildLoResolver([
        row('eng', 'a'), row('eng', 'b'),
        row('eng', 'x', 'ป.4/4'), row('eng', 'y', 'ป.4/4'), row('eng', 'z', 'ป.4/4'),
    ]);
    assert.deepEqual([...resolver.idsFor('eng', 'ป.4/1')], ['a', 'b']);
    assert.deepEqual([...resolver.idsFor('eng', 'ป.4/4')], ['x', 'y', 'z']);
    assert.equal(resolver.isRoomSpecific('eng', 'ป.4/4'), true);
    assert.equal(resolver.isRoomSpecific('eng', 'ป.4/1'), false);
    assert.deepEqual([...idsForEnrollment(resolver, { subject_id: 'eng', room: 'ป.4/4' })], ['x', 'y', 'z']);
    assert.deepEqual([...resolver.allIdsForSubject('eng')].sort(), ['a', 'b', 'x', 'y', 'z']);
});

test('ห้องที่ยังไม่เลือกและไม่มีชุดทั้งวิชา ได้ชุดว่าง', () => {
    const resolver = buildLoResolver([row('math', 'm1', 'ป.1/1')]);
    assert.equal(resolver.idsFor('math', 'ป.1/2').size, 0);
    assert.equal(resolver.idsFor('other', 'ป.1/1').size, 0);
    const summary = roomsSummary(resolver, 'math', ['ป.1/1', 'ป.1/2']);
    assert.deepEqual(summary.missing, ['ป.1/2']);
    assert.equal(summary.sameSet, false);
    assert.deepEqual(summary.rooms.map(item => [item.room, item.count, item.specific]), [['ป.1/1', 1, true], ['ป.1/2', 0, false]]);
});

test('lastEdit บอกแถวที่แก้ล่าสุดของห้อง', () => {
    const resolver = buildLoResolver([
        row('thai', 't1', 'ป.1/1', '2026-09-17T01:00:00Z'),
        { ...row('thai', 't2', 'ป.1/1', '2026-09-17T03:00:00Z'), updated_by: 'kru' },
    ]);
    assert.equal(resolver.lastEdit('thai', 'ป.1/1').updated_by, 'kru');
    assert.equal(resolver.lastEdit('thai', 'ป.1/2'), null);
});

test('sameSetAcrossRooms เทียบชุดโดยไม่สนลำดับ', () => {
    assert.equal(sameSetAcrossRooms([new Set(['a', 'b']), new Set(['b', 'a'])]), true);
    assert.equal(sameSetAcrossRooms([new Set(['a']), new Set(['a', 'b'])]), false);
    assert.equal(sameSetAcrossRooms([]), true);
});

test('planRoomWrite: ห้องที่ยังใช้ชุดทั้งวิชา เขียนเป็นชุดของห้องทั้งชุด', () => {
    assert.deepEqual(planRoomWrite([], ['a', 'b'], ['a', 'c']).toAdd.sort(), ['a', 'c']);
    // ชุดที่เลือกเหมือนชุดทั้งวิชาอยู่แล้ว ไม่ต้องเขียน
    assert.deepEqual(planRoomWrite([], ['a', 'b'], ['b', 'a']), { toAdd: [], toRemove: [], effectiveBefore: new Set(['a', 'b']) });
    // ห้องที่ยังไม่มีอะไรเลย
    assert.deepEqual(planRoomWrite([], [], ['a']).toAdd, ['a']);
});

test('planRoomWrite: ห้องที่มีชุดของตัวเอง เพิ่มและเอาออกเฉพาะส่วนที่ต่าง', () => {
    const plan = planRoomWrite([{ lo_id: 'a' }, { lo_id: 'b' }], ['z'], ['b', 'c']);
    assert.deepEqual(plan.toAdd, ['c']);
    assert.deepEqual(plan.toRemove, ['a']);
    assert.deepEqual([...plan.effectiveBefore], ['a', 'b']);
});
