import test from 'node:test';
import assert from 'node:assert/strict';
import {
    areaSelectionState, diffMapping, gradesOf, groupLearningOutcomesByArea, learningOutcomesForGrade,
    sameSelection, shortAreaName, sortSubjectsForMapping, suggestAreasForSubject, toggleArea,
} from '../src/lib/loMapping.js';

const lo = (lo_id, competency_area, ability_no, lo_code, grade_level = 'ป.1') => ({ lo_id, competency_area, ability_no, lo_code, grade_level });

test('sortSubjectsForMapping เรียงตามชั้นแล้วตามชื่อ ชื่อซ้ำข้ามชั้นไม่ปนกัน', () => {
    const sorted = sortSubjectsForMapping([
        { subject_name: 'ภาษาอังกฤษ', grade_level: 'ป.6' },
        { subject_name: 'ภาษาไทย', grade_level: 'ป.1' },
        { subject_name: 'คณิตศาสตร์', grade_level: 'ป.1' },
        { subject_name: 'ภาษาอังกฤษ', grade_level: 'ป.1' },
    ]);
    assert.deepEqual(sorted.map(s => `${s.subject_name} ${s.grade_level}`), ['คณิตศาสตร์ ป.1', 'ภาษาไทย ป.1', 'ภาษาอังกฤษ ป.1', 'ภาษาอังกฤษ ป.6']);
    assert.deepEqual(gradesOf(sorted), ['ป.1', 'ป.6']);
});

test('groupLearningOutcomesByArea เรียงด้านตามหลักสูตร และด้านที่โรงเรียนเพิ่มต่อท้าย', () => {
    const groups = groupLearningOutcomesByArea([
        lo('e1', 'ความสามารถด้านภาษาอังกฤษ', 9, 'อังกฤษ1'),
        lo('h2', 'ความสามารถด้านสุขภาพกายและจิต', 6, 'สุขภาพ2'),
        lo('r2', 'ความสามารถด้านการอ่าน', 1, 'อ่าน2'),
        lo('r1', 'ความสามารถด้านการอ่าน', 1, 'อ่าน1'),
        lo('h1', 'ความสามารถด้านสุขภาพกายและจิต', 6, 'สุขภาพ1'),
        lo('x', '', null, 'ทั่วไป1'),
    ]);
    assert.deepEqual(groups.map(g => g.area), ['ความสามารถด้านการอ่าน', 'ความสามารถด้านสุขภาพกายและจิต', 'ความสามารถด้านภาษาอังกฤษ', 'ไม่ระบุด้านความสามารถ']);
    assert.deepEqual(groups[0].los.map(l => l.lo_code), ['อ่าน1', 'อ่าน2']);
    assert.deepEqual(groups[1].los.map(l => l.lo_code), ['สุขภาพ1', 'สุขภาพ2']);
    assert.equal(shortAreaName('ความสามารถด้านคณิตศาสตร์'), 'คณิตศาสตร์');
});

test('ชื่อด้านสุขภาพของ ป.ต้นกับ ป.ปลาย เป็นคนละด้าน ไม่ถูกยุบรวมกัน', () => {
    const groups = groupLearningOutcomesByArea([
        lo('h1', 'ความสามารถด้านสุขภาพกายและจิต', 6, 'ต้น1'),
        lo('h2', 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต', 6, 'ปลาย1'),
    ]);
    assert.equal(groups.length, 2);
    assert.deepEqual([...groups.map(g => g.area)].sort(), ['ความสามารถด้านสุขภาพกายและจิต', 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต'].sort());
});

test('learningOutcomesForGrade ใช้ LO ของชั้นเดียวกันและ LO ที่ไม่ระบุชั้น', () => {
    const los = [lo('a', 'x', 1, 'a', 'ป.1'), lo('b', 'x', 1, 'b', 'ป.2'), { ...lo('c', 'x', 1, 'c'), grade_level: null }];
    assert.deepEqual(learningOutcomesForGrade(los, 'ป.1').map(l => l.lo_id), ['a', 'c']);
});

test('suggestAreasForSubject เดาจากชื่อวิชา และคืนเฉพาะด้านที่มีในชั้นนั้น', () => {
    const lowerPrimary = ['ความสามารถด้านการอ่าน', 'ความสามารถด้านการเขียน', 'ความสามารถด้านการคิดคำนวณ', 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต', 'ความสามารถด้านภาษาอังกฤษ'];
    const upperPrimary = ['ความสามารถด้านภาษาและการสื่อสาร', 'ความสามารถด้านการคิดคำนวณ', 'ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ'];
    assert.deepEqual(suggestAreasForSubject('ภาษาไทย', lowerPrimary), ['ความสามารถด้านการอ่าน', 'ความสามารถด้านการเขียน']);
    assert.deepEqual(suggestAreasForSubject('ภาษาไทย', upperPrimary), ['ความสามารถด้านภาษาและการสื่อสาร']);
    assert.deepEqual(suggestAreasForSubject('Smart Math', upperPrimary), ['ความสามารถด้านการคิดคำนวณ']);
    assert.deepEqual(suggestAreasForSubject('ทักษะการว่ายน้ำ', lowerPrimary), ['ความสามารถด้านสุขภาพกายและสุขภาวะจิต']);
    assert.deepEqual(suggestAreasForSubject('ศิลปะเสียงเพียงออ', upperPrimary), ['ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ']);
    // ช่วงชั้นต้นมีด้านภาษาอังกฤษแยก ช่วงชั้นปลายไม่มี จึงตกมาที่ด้านภาษาและการสื่อสาร
    assert.deepEqual(suggestAreasForSubject('ภาษาอังกฤษ', lowerPrimary), ['ความสามารถด้านภาษาอังกฤษ']);
    assert.deepEqual(suggestAreasForSubject('ภาษาอังกฤษ', upperPrimary), ['ความสามารถด้านภาษาและการสื่อสาร']);
    assert.deepEqual(suggestAreasForSubject('English for Real Life', upperPrimary), ['ความสามารถด้านภาษาและการสื่อสาร']);
    assert.deepEqual(suggestAreasForSubject('ภาษาจีน', upperPrimary), ['ความสามารถด้านภาษาและการสื่อสาร']);
    // ชื่อวิชาที่ไม่มีคำบอกด้าน ต้องเลือกเอง
    assert.deepEqual(suggestAreasForSubject('Pen Power', upperPrimary), []);
});

test('areaSelectionState และ toggleArea: เลือกครบกดแล้วเอาออกทั้งด้าน นอกนั้นเลือกทั้งด้าน', () => {
    const area = ['a', 'b', 'c'];
    assert.deepEqual(areaSelectionState(area, new Set()), { state: 'none', count: 0, total: 3 });
    assert.deepEqual(areaSelectionState(area, new Set(['a', 'x'])), { state: 'some', count: 1, total: 3 });
    assert.deepEqual([...toggleArea(new Set(['a', 'x']), area)].sort(), ['a', 'b', 'c', 'x']);
    assert.deepEqual([...toggleArea(new Set(['a', 'b', 'c', 'x']), area)], ['x']);
});

test('diffMapping และ sameSelection', () => {
    assert.deepEqual(diffMapping(['a', 'b'], ['b', 'c']), { toAdd: ['c'], toRemove: ['a'] });
    assert.deepEqual(diffMapping([], []), { toAdd: [], toRemove: [] });
    assert.equal(sameSelection(['a', 'b'], new Set(['b', 'a'])), true);
    assert.equal(sameSelection(['a'], ['a', 'b']), false);
});
