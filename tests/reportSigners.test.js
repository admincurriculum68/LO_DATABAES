import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSigners, HOMEROOM_ROLE, signerNameLine } from '../src/lib/reportSigners.js';

const school = {
    academic_head_name: 'นางสาวมาลี ใจงาม',
    academic_deputy_name: ' นายสมชาย รักเรียน ',
    director_name: 'นางวราภรณ์ ตั้งมั่น',
};

test('ช่องลงชื่อมี 4 ตำแหน่งตามลำดับ และตัดช่องว่างหัวท้ายของชื่อ', () => {
    const signers = buildSigners(school, { teacherName: 'น.ส.จุรีรัตน์ ทุมกลาง' });
    assert.deepEqual(signers.map(item => item.role), ['ครูผู้สอน', 'หัวหน้าฝ่ายวิชาการ', 'รองผู้อำนวยการฝ่ายวิชาการ', 'ผู้อำนวยการโรงเรียน']);
    assert.deepEqual(signers.map(item => item.name), ['น.ส.จุรีรัตน์ ทุมกลาง', 'นางสาวมาลี ใจงาม', 'นายสมชาย รักเรียน', 'นางวราภรณ์ ตั้งมั่น']);
});

test('รายงานของครูประจำชั้นเปลี่ยนป้ายช่องแรกได้', () => {
    const signers = buildSigners(school, { teacherName: 'ครูสมใจ', teacherRole: HOMEROOM_ROLE });
    assert.equal(signers[0].role, 'ครูประจำชั้น');
    assert.equal(signers[0].name, 'ครูสมใจ');
});

test('โรงเรียนที่ยังไม่ได้ตั้งค่าชื่อผู้ลงนาม ให้เว้นจุดไข่ปลาไว้เซ็นเอง', () => {
    const signers = buildSigners(null, {});
    assert.deepEqual(signers.map(item => item.name), ['', '', '', '']);
    assert.match(signerNameLine(signers[3].name), /^\.{10,}$/);
    assert.equal(signerNameLine('นางวราภรณ์ ตั้งมั่น'), 'นางวราภรณ์ ตั้งมั่น');
});
