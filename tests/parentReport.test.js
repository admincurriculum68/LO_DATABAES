import test from 'node:test';
import assert from 'node:assert/strict';
import { averageAttendance, buildParentReport, toThaiDigits } from '../src/lib/parentReport.js';

test('toThaiDigits และ averageAttendance ไม่เดาเวลาเรียนเมื่อไม่มีข้อมูล', () => {
    assert.equal(toThaiDigits('ป.1/2 95%'), 'ป.๑/๒ ๙๕%');
    assert.equal(averageAttendance([{ attendance_percent: 90 }, { attendance_percent: 95 }, { attendance_percent: null }]), 93);
    assert.equal(averageAttendance([{ attendance_percent: null }]), null);
});

test('buildParentReport ใช้ผลของครูประจำชั้นรายด้าน ระดับที่คาดหวังตามชั้น และบอกว่ารับรองครบหรือยัง', () => {
    const student = { student_id: 's1', current_grade_level: 'ป.1', current_room: 'ป.1/1' };
    const enrollments = [{ enrollment_id: 'e1', student_id: 's1', subject_id: 'thai', attendance_percent: 100, subjects: { subject_name: 'ภาษาไทย', grade_level: 'ป.1' } }];
    const mappings = [
        { subject_id: 'thai', learning_outcomes: { lo_id: 'r1', lo_code: 'อ่าน1', ability_no: 1, competency_area: 'ความสามารถด้านการอ่าน' } },
        { subject_id: 'thai', learning_outcomes: { lo_id: 'w1', lo_code: 'เขียน1', ability_no: 2, competency_area: 'ความสามารถด้านการเขียน' } },
    ];
    const evaluations = [{ enrollment_id: 'e1', lo_id: 'r1', evidence_note: 'อ่านคล่อง' }];
    const decisions = [
        { competency_area: 'ความสามารถด้านการอ่าน', final_level: 'ชำนาญ', summary_text: ' อ่านได้คล่อง ', decision_status: 'approved' },
        { competency_area: 'ความสามารถด้านการเขียน', final_level: 'พัฒนา', summary_text: null, decision_status: 'submitted' },
    ];
    const expectedByKey = new Map([['ป.1:ความสามารถด้านการอ่าน', 'พัฒนา']]);
    const report = buildParentReport({ student, enrollments, mappings, evaluations, decisions, activities: null, homeroomTeachers: ['ครูสมใจ'], expectedByKey });

    assert.deepEqual(report.rows.map(row => [row.area, row.expected, row.level, row.summary, row.status]), [
        ['ความสามารถด้านการอ่าน', 'พัฒนา', 'ชำนาญ', 'อ่านได้คล่อง', 'approved'],
        ['ความสามารถด้านการเขียน', '', 'พัฒนา', '', 'submitted'],
    ]);
    assert.equal(report.allPublished, true);
    assert.equal(report.hasExpected, true);
    assert.equal(report.attendance, 100);
    assert.deepEqual(report.evidence.map(item => `${item.subject}:${item.text}`), ['ภาษาไทย:อ่านคล่อง']);

    // ฉบับร่างของครูประจำชั้นยังไม่ออกสู่ผู้ปกครอง
    const draft = buildParentReport({ student, enrollments, mappings, evaluations, decisions: decisions.map(row => ({ ...row, decision_status: 'draft' })) });
    assert.equal(draft.allPublished, false);
});
