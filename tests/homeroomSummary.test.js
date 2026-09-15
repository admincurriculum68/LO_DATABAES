import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNarrativeDraft, collectRoomEvidence, decisionKey, isLockedDecision, passStatusFor, roomStatus, summaryProgress } from '../src/lib/homeroomSummary.js';

test('buildNarrativeDraft รวมข้อความทุกวิชา ตัดข้อความซ้ำและช่องว่างเกิน', () => {
    const draft = buildNarrativeDraft([
        { text: 'อ่านออกเสียงได้ถูกต้อง' },
        { text: '  อ่านออกเสียงได้ถูกต้อง ' },
        '',
        { text: 'เขียนเล่าเรื่อง\nได้ต่อเนื่อง' },
        null,
    ]);
    assert.equal(draft, 'อ่านออกเสียงได้ถูกต้อง เขียนเล่าเรื่อง ได้ต่อเนื่อง');
    assert.equal(buildNarrativeDraft([]), '');
});

test('decisionKey ถือชื่อด้านสุขภาพเดิมกับใหม่เป็นด้านเดียวกัน', () => {
    assert.equal(decisionKey('s1', 'ความสามารถด้านสุขภาพกายและจิต'), decisionKey('s1', 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต'));
});

test('summaryProgress นับรายการที่ครบเมื่อมีทั้งระดับและคำบรรยาย', () => {
    const values = new Map([
        [decisionKey('s1', 'A'), { level: 'พัฒนา', summary: 'ข้อความ' }],
        [decisionKey('s1', 'B'), { level: 'ชำนาญ', summary: '  ' }],
        [decisionKey('s2', 'A'), { level: '', summary: 'ข้อความ' }],
    ]);
    assert.deepEqual(summaryProgress(['s1', 's2'], ['A', 'B'], values), { total: 4, leveled: 2, narrated: 2, complete: 1, missing: 3 });
});

test('roomStatus: ส่งกลับมาก่อน รับรองหรือส่งครบต้องครบทุกรายการ', () => {
    assert.equal(roomStatus([], 4), 'empty');
    assert.equal(roomStatus([{ decision_status: 'draft' }], 4), 'draft');
    assert.equal(roomStatus([{ decision_status: 'submitted' }, { decision_status: 'submitted' }], 4), 'draft');
    assert.equal(roomStatus(Array(4).fill({ decision_status: 'submitted' }), 4), 'submitted');
    assert.equal(roomStatus([...Array(3).fill({ decision_status: 'approved' }), { decision_status: 'submitted' }], 4), 'submitted');
    assert.equal(roomStatus(Array(4).fill({ decision_status: 'approved' }), 4), 'approved');
    assert.equal(roomStatus([...Array(3).fill({ decision_status: 'approved' }), { decision_status: 'returned' }], 4), 'returned');
});

test('passStatusFor และ isLockedDecision', () => {
    assert.equal(passStatusFor('เริ่มต้น'), 'not_passed');
    assert.equal(passStatusFor('พัฒนา'), 'passed');
    assert.equal(passStatusFor('N/A'), 'pending');
    assert.equal(passStatusFor(''), 'pending');
    assert.equal(isLockedDecision({ decision_status: 'approved' }), true);
    assert.equal(isLockedDecision({ decision_status: 'returned', is_locked: false }), false);
});

test('collectRoomEvidence รวมข้อความ LO ของทุกวิชาตามด้าน และใช้เฉพาะ LO ที่ผูกกับวิชานั้น', () => {
    const enrollments = [
        { enrollment_id: 'e1', student_id: 's1', subject_id: 'thai', subjects: { subject_name: 'ภาษาไทย' } },
        { enrollment_id: 'e2', student_id: 's1', subject_id: 'lit', subjects: { subject_name: 'วรรณกรรม' } },
    ];
    const mappings = [
        { subject_id: 'thai', learning_outcomes: { lo_id: 'r1', lo_code: 'อ่าน1', ability_no: 1, competency_area: 'ความสามารถด้านการอ่าน' } },
        { subject_id: 'lit', learning_outcomes: { lo_id: 'r2', lo_code: 'อ่าน2', ability_no: 1, competency_area: 'ความสามารถด้านการอ่าน' } },
        { subject_id: 'thai', learning_outcomes: { lo_id: 'h1', lo_code: 'สุขภาพ1', ability_no: 6, competency_area: 'ความสามารถด้านสุขภาพกายและจิต' } },
    ];
    const evaluations = [
        { enrollment_id: 'e1', lo_id: 'r1', evidence_note: 'อ่านคล่อง' },
        { enrollment_id: 'e2', lo_id: 'r2', evidence_note: 'เล่าเรื่องได้' },
        { enrollment_id: 'e2', lo_id: 'r1', evidence_note: 'ไม่ได้ผูกกับวิชานี้' },
        { enrollment_id: 'e1', lo_id: 'h1', evidence_note: '   ' },
    ];
    const { areas, notesByKey } = collectRoomEvidence(enrollments, mappings, evaluations);
    assert.deepEqual(areas, ['ความสามารถด้านการอ่าน', 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต']);
    assert.deepEqual(notesByKey.get(decisionKey('s1', 'ความสามารถด้านการอ่าน')).map(note => `${note.subject}:${note.text}`), ['ภาษาไทย:อ่านคล่อง', 'วรรณกรรม:เล่าเรื่องได้']);
    assert.equal(notesByKey.has(decisionKey('s1', 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต')), false);
});
