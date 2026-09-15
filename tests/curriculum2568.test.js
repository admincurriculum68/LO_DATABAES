import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_COMPETENCY_GROUPS, CBE_CAPABILITIES_2568, PHASE_END_CAPABILITY_GROUPS_2568, normalizeCompetencyArea } from '../src/constants/curriculum2568.js';

test('ด้านสุขภาพใช้ชื่อตามหลักสูตร 2568 "สุขภาพกายและสุขภาวะจิต"', () => {
    const health = CBE_CAPABILITIES_2568.find(item => item.key === 'physical_mental_health');
    assert.equal(health.name, 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต');
    const phaseHealth = PHASE_END_CAPABILITY_GROUPS_2568.flatMap(group => group.abilities).find(item => item.key === 'physical_mental_health');
    assert.equal(phaseHealth.name, health.name);
});

test('normalizeCompetencyArea ถือชื่อเดิม "สุขภาพกายและจิต" เป็นด้านเดียวกัน และไม่แตะชื่ออื่น', () => {
    assert.equal(normalizeCompetencyArea('ความสามารถด้านสุขภาพกายและจิต'), 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต');
    assert.equal(normalizeCompetencyArea(' สุขภาพกายและจิต '), 'สุขภาพกายและสุขภาวะจิต');
    assert.equal(normalizeCompetencyArea('ความสามารถด้านสุขภาพกายและสุขภาวะจิต'), 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต');
    assert.equal(normalizeCompetencyArea('ความสามารถด้านการคิดคำนวณ'), 'ความสามารถด้านการคิดคำนวณ');
    assert.equal(normalizeCompetencyArea(null), '');
});

test('หน้ารับรองผลจัดกลุ่มได้ทั้งชื่อใหม่และชื่อเดิมของด้านสุขภาพ', () => {
    ['ป.ต้น', 'ป.ปลาย'].forEach(phase => {
        const areas = APPROVAL_COMPETENCY_GROUPS[phase].flatMap(group => group.competencyAreas);
        assert.ok(areas.includes('ความสามารถด้านสุขภาพกายและสุขภาวะจิต'));
        assert.ok(areas.includes('ความสามารถด้านสุขภาพกายและจิต'));
    });
});
