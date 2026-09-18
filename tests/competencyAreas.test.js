import test from 'node:test';
import assert from 'node:assert/strict';
import { areasFromLoBank, mergeAreaLists } from '../src/lib/competencyAreas.js';

// คลัง LO ของเสนาฯ ชั้น ป.4 มี 7 ด้าน เรียงตาม ability_no 1–7
const loBankP4 = [
    { competency_area: 'ความสามารถด้านการคิดคำนวณ', ability_no: 2 },
    { competency_area: 'ความสามารถด้านภาษาและการสื่อสาร', ability_no: 1 },
    { competency_area: 'ความสามารถด้านการคิดคำนวณ', ability_no: 2 },
    { competency_area: 'ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', ability_no: 7 },
    { competency_area: 'ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี', ability_no: 3 },
];

test('areasFromLoBank เรียงด้านตาม ability_no และตัดด้านซ้ำ', () => {
    assert.deepEqual(areasFromLoBank(loBankP4), [
        'ความสามารถด้านภาษาและการสื่อสาร',
        'ความสามารถด้านการคิดคำนวณ',
        'ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี',
        'ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ',
    ]);
    assert.deepEqual(areasFromLoBank([]), []);
});

test('areasFromLoBank รวมชื่อด้านสุขภาพแบบเก่ากับแบบใหม่เป็นด้านเดียว และดันแถวที่ไม่มีลำดับไปท้าย', () => {
    const areas = areasFromLoBank([
        { competency_area: 'ความสามารถด้านสุขภาพกายและจิต', ability_no: 6 },
        { competency_area: 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต', ability_no: 6 },
        { competency_area: 'ความสามารถด้านภาษาจีน', ability_no: null },
        { competency_area: 'ความสามารถด้านการอ่าน', ability_no: 1 },
        { competency_area: '  ', ability_no: 2 },
    ]);
    assert.deepEqual(areas, [
        'ความสามารถด้านการอ่าน',
        'ความสามารถด้านสุขภาพกายและสุขภาวะจิต',
        'ความสามารถด้านภาษาจีน',
    ]);
});

test('mergeAreaLists ต่อท้ายด้านที่มีข้อมูลแล้วแต่ไม่อยู่ในคลัง และไม่ซ้ำ', () => {
    const merged = mergeAreaLists(
        ['ความสามารถด้านการอ่าน', 'ความสามารถด้านการเขียน'],
        ['ความสามารถด้านการเขียน', 'ความสามารถด้านสุขภาพกายและจิต'],
    );
    assert.deepEqual(merged, [
        'ความสามารถด้านการอ่าน',
        'ความสามารถด้านการเขียน',
        'ความสามารถด้านสุขภาพกายและสุขภาวะจิต',
    ]);
    assert.deepEqual(mergeAreaLists(null, null), []);
});
