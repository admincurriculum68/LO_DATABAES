import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_COMPETENCY_GROUPS, CBE_CAPABILITIES_2568, PHASE_END_CAPABILITY_GROUPS_BY_PHASE_2568, normalizeCompetencyArea } from '../src/constants/curriculum2568.js';

test('ชื่อด้านคำนวณและด้านสุขภาพแยกตามช่วงชั้น', () => {
    const early = PHASE_END_CAPABILITY_GROUPS_BY_PHASE_2568['ป.ต้น'].flatMap(group => group.abilities);
    const late = PHASE_END_CAPABILITY_GROUPS_BY_PHASE_2568['ป.ปลาย'].flatMap(group => group.abilities);
    assert.equal(early.find(item => item.key === 'numeracy').name, 'ความสามารถด้านการคิดคำนวณ');
    assert.equal(early.find(item => item.key === 'physical_mental_health').name, 'ความสามารถด้านสุขภาพกายและจิต');
    assert.equal(late.find(item => item.key === 'mathematics').name, 'ความสามารถด้านคณิตศาสตร์');
    assert.equal(late.find(item => item.key === 'physical_mental_health').name, 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต');
    // ป.ต้นมี 8 ด้าน (อ่าน เขียน คำนวณ + ประยุกต์ใช้ 5) ส่วน ป.ปลายมี 7 ด้าน
    assert.equal(early.length, 8);
    assert.equal(late.length, 7);
    // ชื่อทั้งสองช่วงชั้นต้องอยู่ในรายการความสามารถกลาง
    const names = CBE_CAPABILITIES_2568.map(item => item.name);
    ['ความสามารถด้านการคิดคำนวณ', 'ความสามารถด้านคณิตศาสตร์', 'ความสามารถด้านสุขภาพกายและจิต', 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต']
        .forEach(name => assert.ok(names.includes(name), name));
});

test('normalizeCompetencyArea ตัดช่องว่างอย่างเดียว ไม่แปลงชื่อข้ามช่วงชั้น', () => {
    assert.equal(normalizeCompetencyArea(' ความสามารถด้านสุขภาพกายและจิต '), 'ความสามารถด้านสุขภาพกายและจิต');
    assert.equal(normalizeCompetencyArea('ความสามารถด้านสุขภาพกายและสุขภาวะจิต'), 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต');
    assert.equal(normalizeCompetencyArea('ความสามารถด้านคณิตศาสตร์'), 'ความสามารถด้านคณิตศาสตร์');
    assert.equal(normalizeCompetencyArea(null), '');
});

test('หน้ารับรองผลจัดกลุ่มได้ทั้งชื่อด้านของ ป.ต้นและ ป.ปลาย', () => {
    ['ป.ต้น', 'ป.ปลาย'].forEach(phase => {
        const areas = APPROVAL_COMPETENCY_GROUPS[phase].flatMap(group => group.competencyAreas);
        assert.ok(areas.includes('ความสามารถด้านสุขภาพกายและสุขภาวะจิต'));
        assert.ok(areas.includes('ความสามารถด้านสุขภาพกายและจิต'));
    });
});
