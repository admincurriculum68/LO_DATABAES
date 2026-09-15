// รายงานผลการพัฒนาความสามารถสำหรับผู้ปกครอง
//
// ใช้ผลที่ครูประจำชั้นสรุปรายด้าน (ระดับ + คำบรรยาย) เป็นเนื้อหาหลัก และแนบข้อความ LO รายวิชาได้
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

import { normalizeCompetencyArea } from '../constants/curriculum2568.js';
import { collectRoomEvidence, decisionKey } from './homeroomSummary.js';

const THAI_DIGITS = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];

/** แปลงเลขอารบิกเป็นเลขไทยสำหรับเอกสารราชการ */
export function toThaiDigits(value) {
    return String(value ?? '').replace(/\d/g, digit => THAI_DIGITS[Number(digit)]);
}

/** เวลาเรียนเฉลี่ยจากทุกวิชา ปัดเป็นจำนวนเต็ม ถ้าไม่มีข้อมูลเลยคืน null ไม่เดาว่า 100 */
export function averageAttendance(enrollments) {
    const values = (enrollments || []).map(item => item.attendance_percent).filter(value => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite);
    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * ประกอบข้อมูลรายงานของนักเรียนหนึ่งคน
 * decisions: แถว competency_area_final_decisions ของนักเรียนคนนี้
 * expectedByKey: Map "ชั้น:ด้าน" → ระดับที่คาดหวัง จาก yearly_competencies (ถ้ามี)
 */
export function buildParentReport({ student, enrollments, mappings, evaluations, decisions, activities, homeroomTeachers, expectedByKey }) {
    const { areas: evidenceAreas, notesByKey } = collectRoomEvidence(enrollments, mappings, evaluations);
    const decisionByArea = new Map((decisions || []).map(row => [normalizeCompetencyArea(row.competency_area), row]));
    const areas = [...evidenceAreas, ...[...decisionByArea.keys()].filter(area => !evidenceAreas.includes(area))];
    const grade = student?.current_grade_level || enrollments?.[0]?.subjects?.grade_level || '';

    const rows = areas.map(area => {
        const decision = decisionByArea.get(area);
        return {
            area,
            expected: expectedByKey?.get(`${grade}:${area}`) || '',
            level: decision?.final_level || '',
            summary: decision?.summary_text?.trim() || '',
            status: decision?.decision_status || 'none',
        };
    });
    const evidence = areas.flatMap(area => (notesByKey.get(decisionKey(student.student_id, area)) || []).map(note => ({ ...note, area })));

    return {
        student,
        grade,
        room: student?.current_room || enrollments?.[0]?.room || '',
        attendance: averageAttendance(enrollments),
        homeroomTeachers: homeroomTeachers || [],
        rows,
        evidence,
        activities: activities || null,
        allApproved: rows.length > 0 && rows.every(row => row.status === 'approved'),
        hasExpected: rows.some(row => row.expected),
    };
}
