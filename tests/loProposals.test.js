import test from 'node:test';
import assert from 'node:assert/strict';
import { PROPOSAL_STATUS, lastEditedText, proposalSummary, selectionOfProposal, statusOf, teacherCanEdit } from '../src/lib/loProposals.js';

const subject = subject_id => ({ subject_id });

test('statusOf: วิชาที่กำหนด LO ไว้ก่อนมีระบบเสนอ ถือว่าอนุมัติแล้ว', () => {
    assert.equal(statusOf(null, []), 'none');
    assert.equal(statusOf(undefined, new Set()), 'none');
    // ไม่มีแถวการเสนอ แต่มี LO ใช้งานอยู่จริง แปลว่าฝ่ายวิชาการกำหนดไว้เองก่อนหน้านี้
    assert.equal(statusOf(null, ['lo1', 'lo2']), 'approved');
    assert.equal(statusOf({ status: 'submitted' }, ['lo1']), 'submitted');
    assert.equal(statusOf({ status: 'returned' }, []), 'returned');
    // สถานะแปลกปลอมจากฐานข้อมูลต้องไม่ทำให้หน้าจอพัง
    assert.equal(statusOf({ status: 'unknown' }, ['lo1']), 'approved');
    Object.values(PROPOSAL_STATUS).forEach(tone => assert.ok(tone.label && tone.chip && tone.short));
});

test('teacherCanEdit: ครูแก้ได้เฉพาะก่อนส่งและตอนถูกส่งกลับ', () => {
    assert.equal(teacherCanEdit('none'), true);
    assert.equal(teacherCanEdit('draft'), true);
    assert.equal(teacherCanEdit('returned'), true);
    assert.equal(teacherCanEdit('submitted'), false);
    assert.equal(teacherCanEdit('approved'), false);
});

test('selectionOfProposal: ใช้ของที่ครูเลือกก่อน ถ้ายังไม่มีแถวจึงใช้ LO ที่อนุมัติไว้', () => {
    assert.deepEqual([...selectionOfProposal({ lo_ids: ['a', 'b'] }, ['c'])], ['a', 'b']);
    assert.deepEqual([...selectionOfProposal(null, ['c'])], ['c']);
    // ครูเคลียร์ทิ้งทั้งหมดแล้วบันทึกร่างไว้ ต้องไม่ย้อนไปใช้ของเดิม
    assert.deepEqual([...selectionOfProposal({ lo_ids: [] }, ['c'])], []);
});

test('proposalSummary นับวิชาตามสถานะครบทุกวิชา', () => {
    const subjects = [subject('s1'), subject('s2'), subject('s3'), subject('s4')];
    const proposals = new Map([
        ['s1', { status: 'submitted' }],
        ['s2', { status: 'draft' }],
        ['s4', { status: 'returned' }],
    ]);
    const saved = new Map([['s3', new Set(['lo1'])]]);
    const counts = proposalSummary(subjects, proposals, saved);
    assert.deepEqual(counts, { total: 4, none: 0, draft: 1, submitted: 1, returned: 1, approved: 1 });
});

test('lastEditedText บอกชื่อครูที่แก้ล่าสุด และไม่พังเมื่อยังไม่มีข้อมูล', () => {
    assert.equal(lastEditedText(null, new Map()), '');
    const text = lastEditedText({ updated_at: '2026-09-16T03:00:00Z', updated_by: 't1' }, new Map([['t1', 'นางสาวสมหญิง ใจดี']]));
    assert.match(text, /^แก้ล่าสุดโดย นางสาวสมหญิง ใจดี เมื่อ /);
    assert.match(lastEditedText({ updated_at: '2026-09-16T03:00:00Z', updated_by: 'x' }, new Map()), /^แก้ล่าสุดเมื่อ /);
});
