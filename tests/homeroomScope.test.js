import test from 'node:test';
import assert from 'node:assert/strict';
import { areasToSubmit, canEditArea } from '../src/lib/homeroomScope.js';

test('ครูประจำชั้นและฝ่ายวิชาการแก้ได้และส่งได้ทุกด้าน', () => {
    assert.equal(canEditArea(null, 'ความสามารถด้านการอ่าน'), true);
    assert.equal(areasToSubmit(null, ['ความสามารถด้านการอ่าน']), null);
});

test('ถ้าจำกัดด้าน แก้และส่งได้เฉพาะด้านที่กำหนด', () => {
    const mine = new Set(['ความสามารถด้านการอ่าน', 'ความสามารถด้านการเขียน']);
    assert.equal(canEditArea(mine, ' ความสามารถด้านการเขียน '), true);
    assert.equal(canEditArea(mine, 'ความสามารถด้านการคิดคำนวณ'), false);
    const roomAreas = ['ความสามารถด้านการอ่าน', ' ความสามารถด้านการเขียน ', 'ความสามารถด้านการคิดคำนวณ'];
    assert.deepEqual(areasToSubmit(mine, roomAreas).sort(), ['ความสามารถด้านการเขียน', 'ความสามารถด้านการอ่าน'].sort());
    assert.deepEqual(areasToSubmit(new Set(), roomAreas), []);
});
