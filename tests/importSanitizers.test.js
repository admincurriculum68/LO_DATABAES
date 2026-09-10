import test from 'node:test';
import assert from 'node:assert/strict';
import { excelSerialToThaiDob, LOSSY_SCIENTIFIC, normalizeThaiDob, sanitizeCitizenId } from '../src/lib/importSanitizers.js';

test('sanitizeCitizenId preserves text digits and removes Excel decimal suffix', () => {
    assert.equal(sanitizeCitizenId('1-2345-67890-12-3'), '1234567890123');
    assert.equal(sanitizeCitizenId('1234567890123.00'), '1234567890123');
});

test('sanitizeCitizenId rejects lossy scientific notation', () => {
    assert.equal(sanitizeCitizenId('1.23457E+12'), LOSSY_SCIENTIFIC);
});

test('Excel serial and common Thai dates normalize to DDMMBBBB', () => {
    assert.equal(excelSerialToThaiDob(25569), '01012513');
    assert.equal(normalizeThaiDob('1/1/2010'), '01012553');
    assert.equal(normalizeThaiDob('2010-01-05'), '05012553');
    assert.equal(normalizeThaiDob('05012555'), '05012555');
});

test('normalizeThaiDob อ่าน DDMMYYYY ที่วันที่ 19–26 ถูกต้อง ไม่สับเป็นปี ค.ศ.', () => {
    assert.equal(normalizeThaiDob('23042517'), '23042517');
    assert.equal(normalizeThaiDob(23042517), '23042517');
    assert.equal(normalizeThaiDob('19082527'), '19082527');
    assert.equal(normalizeThaiDob('21022539'), '21022539');
    assert.equal(normalizeThaiDob('25122530'), '25122530');
});

test('normalizeThaiDob ยังรองรับ YYYYMMDD และ DDMMYYYY แบบ ค.ศ.', () => {
    assert.equal(normalizeThaiDob('25300112'), '12012530');
    assert.equal(normalizeThaiDob('20100105'), '05012553');
    assert.equal(normalizeThaiDob('05012010'), '05012553');
});
