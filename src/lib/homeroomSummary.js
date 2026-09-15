// ครูประจำชั้นสรุปความสามารถรายด้าน
//
// ครูผู้สอนแต่ละวิชาเขียนข้อความพฤติกรรมราย LO ครูประจำชั้นรวมข้อความของทุกวิชามาเลือกระดับและเขียนคำบรรยายรายด้าน
// แล้วส่งให้ฝ่ายวิชาการรับรองทั้งห้อง ผลเก็บใน competency_area_final_decisions
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

import { normalizeCompetencyArea } from '../constants/curriculum2568.js';
import { groupLearningOutcomesByArea } from './loMapping.js';

export const SUMMARY_LEVELS = ['เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A'];

export const ROOM_STATUS = {
    empty: { label: 'ยังไม่เริ่มสรุป', chip: 'chip-neutral' },
    draft: { label: 'กำลังสรุป', chip: 'chip-info' },
    submitted: { label: 'ส่งฝ่ายวิชาการแล้ว', chip: 'chip-warning' },
    returned: { label: 'ส่งกลับให้แก้ไข', chip: 'chip-danger' },
    approved: { label: 'รับรองแล้ว', chip: 'chip-success' },
};

/** คีย์ของผลหนึ่งรายการ ใช้ชื่อด้านแบบมาตรฐาน ชื่อเดิมกับชื่อใหม่ของด้านเดียวกันจึงไม่แยกเป็นสองรายการ */
export function decisionKey(studentId, area) {
    return `${studentId}:${normalizeCompetencyArea(area)}`;
}

/** ผลที่รับรองแล้วแก้ไม่ได้ จนกว่าฝ่ายวิชาการจะส่งกลับ */
export function isLockedDecision(row) {
    return Boolean(row && (row.is_locked || row.decision_status === 'approved'));
}

/** ผ่านเกณฑ์เมื่อได้ระดับพัฒนาขึ้นไป N/A ยังไม่ตัดสิน */
export function passStatusFor(level) {
    if (!level || level === 'N/A') return 'pending';
    return ['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'].includes(level) ? 'passed' : 'not_passed';
}

const normalizeText = text => String(text || '').replace(/\s+/g, ' ').trim();

/**
 * ร่างคำบรรยายรายด้านจากข้อความ LO ของทุกวิชา
 * เรียงตามลำดับที่ส่งมา ตัดข้อความที่ซ้ำกัน (ครูมักเติมข้อความเดียวกันทั้งห้อง) และเว้นวรรคระหว่างข้อความ
 */
export function buildNarrativeDraft(notes) {
    const seen = new Set();
    const parts = [];
    (notes || []).forEach(note => {
        const text = normalizeText(typeof note === 'string' ? note : note?.text);
        if (!text || seen.has(text)) return;
        seen.add(text);
        parts.push(text);
    });
    return parts.join(' ');
}

/** นับว่าสรุปครบกี่รายการ รายการที่ครบต้องมีทั้งระดับและคำบรรยาย */
export function summaryProgress(studentIds, areas, valuesByKey) {
    let leveled = 0;
    let narrated = 0;
    let complete = 0;
    (studentIds || []).forEach(studentId => (areas || []).forEach(area => {
        const value = valuesByKey.get(decisionKey(studentId, area));
        const hasLevel = Boolean(value?.level);
        const hasText = Boolean(normalizeText(value?.summary));
        if (hasLevel) leveled += 1;
        if (hasText) narrated += 1;
        if (hasLevel && hasText) complete += 1;
    }));
    const total = (studentIds?.length || 0) * (areas?.length || 0);
    return { total, leveled, narrated, complete, missing: total - complete };
}

/**
 * สถานะของทั้งห้องจากแถวผลในฐานข้อมูล
 * expectedCount คือจำนวนนักเรียน × จำนวนด้าน ใช้บอกว่าส่งหรือรับรองครบทั้งห้องแล้วหรือยัง
 */
export function roomStatus(rows, expectedCount) {
    const list = (rows || []).filter(Boolean);
    if (!list.length) return 'empty';
    if (list.some(row => row.decision_status === 'returned')) return 'returned';
    const enough = list.length >= (expectedCount || 0);
    if (enough && list.every(row => row.decision_status === 'approved')) return 'approved';
    if (enough && list.every(row => ['submitted', 'approved'].includes(row.decision_status))) return 'submitted';
    return 'draft';
}

/**
 * ด้านที่ห้องใช้จริง และข้อความ LO ของนักเรียนแต่ละคนแยกตามด้าน
 * enrollments: [{ enrollment_id, student_id, subject_id, subjects: { subject_name } }]
 * mappings: [{ subject_id, learning_outcomes: { lo_id, lo_code, ability_no, competency_area } }]
 * evaluations: [{ enrollment_id, lo_id, evidence_note }]
 */
export function collectRoomEvidence(enrollments, mappings, evaluations) {
    const losBySubject = new Map();
    (mappings || []).forEach(item => {
        if (!item?.learning_outcomes) return;
        if (!losBySubject.has(item.subject_id)) losBySubject.set(item.subject_id, []);
        losBySubject.get(item.subject_id).push(item.learning_outcomes);
    });
    const uniqueLos = [...new Map([...losBySubject.values()].flat().map(lo => [lo.lo_id, lo])).values()];
    const areas = groupLearningOutcomesByArea(uniqueLos).map(group => group.area);
    const noteByEnrollmentLo = new Map((evaluations || [])
        .filter(item => normalizeText(item.evidence_note))
        .map(item => [`${item.enrollment_id}:${item.lo_id}`, normalizeText(item.evidence_note)]));
    const notesByKey = new Map();
    (enrollments || []).forEach(enrollment => {
        [...(losBySubject.get(enrollment.subject_id) || [])]
            .sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0))
            .forEach(lo => {
                const text = noteByEnrollmentLo.get(`${enrollment.enrollment_id}:${lo.lo_id}`);
                if (!text) return;
                const key = decisionKey(enrollment.student_id, lo.competency_area);
                if (!notesByKey.has(key)) notesByKey.set(key, []);
                notesByKey.get(key).push({ subject: enrollment.subjects?.subject_name || 'รายวิชา', loCode: lo.lo_code || `LO ${lo.ability_no || ''}`.trim(), text });
            });
    });
    notesByKey.forEach(list => list.sort((a, b) => a.subject.localeCompare(b.subject, 'th')));
    return { areas, notesByKey };
}
