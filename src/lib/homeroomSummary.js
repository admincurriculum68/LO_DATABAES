// ครูประจำชั้นสรุปความสามารถรายด้าน
//
// ครูผู้สอนแต่ละวิชาเขียนข้อความพฤติกรรมราย LO ครูประจำชั้นรวมข้อความของทุกวิชามาเลือกระดับและเขียนคำบรรยายรายด้าน
// แล้วกดส่ง ผลจึงออกสู่นักเรียนและผู้ปกครองทันที ไม่ต้องรอฝ่ายวิชาการรับรอง
// ฝ่ายวิชาการตรวจภายหลัง แก้ระดับเองได้ หรือขอให้ครูประจำชั้นแก้ ผลเก็บใน competency_area_final_decisions
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

import { normalizeCompetencyArea } from '../constants/curriculum2568.js';
import { mergeAreaLists } from './competencyAreas.js';
import { groupLearningOutcomesByArea } from './loMapping.js';
import { buildLoResolver } from './loByRoom.js';

export const SUMMARY_LEVELS = ['เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A'];

export const ROOM_STATUS = {
    empty: { label: 'ยังไม่เริ่มสรุป', chip: 'chip-neutral' },
    draft: { label: 'กำลังสรุป', chip: 'chip-info' },
    submitted: { label: 'ส่งแล้ว ผู้ปกครองเห็นได้', chip: 'chip-success' },
    returned: { label: 'ฝ่ายวิชาการขอให้แก้', chip: 'chip-danger' },
};

/** ผลที่ส่งแล้วจะแสดงกับนักเรียนและผู้ปกครอง แถวเก่าที่เคยรับรองไว้ถือว่าส่งแล้วเช่นกัน */
export const PUBLISHED_STATUSES = ['submitted', 'approved'];

export function isPublishedDecision(row) {
    return PUBLISHED_STATUSES.includes(row?.decision_status);
}

/** คีย์ของผลหนึ่งรายการ ใช้ชื่อด้านแบบมาตรฐาน ชื่อเดิมกับชื่อใหม่ของด้านเดียวกันจึงไม่แยกเป็นสองรายการ */
export function decisionKey(studentId, area) {
    return `${studentId}:${normalizeCompetencyArea(area)}`;
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
 * expectedCount คือจำนวนนักเรียน × จำนวนด้าน ใช้บอกว่าส่งครบทั้งห้องแล้วหรือยัง
 */
export function roomStatus(rows, expectedCount) {
    const list = (rows || []).filter(Boolean);
    if (!list.length) return 'empty';
    if (list.some(row => row.decision_status === 'returned')) return 'returned';
    const enough = list.length >= (expectedCount || 0);
    if (enough && list.every(isPublishedDecision)) return 'submitted';
    return 'draft';
}

/**
 * ด้านที่ห้องใช้จริง และข้อความ LO ของนักเรียนแต่ละคนแยกตามด้าน
 * enrollments: [{ enrollment_id, student_id, subject_id, room, subjects: { subject_name } }]
 * mappings: [{ subject_id, room_name, learning_outcomes: { lo_id, lo_code, ability_no, competency_area } }]
 * evaluations: [{ enrollment_id, lo_id, evidence_note }]
 * areas: ด้านที่ต้องสรุปของชั้นนั้น (จากคลัง LO ของโรงเรียน) ถ้าไม่ส่งมาจะใช้เฉพาะด้านที่มี LO ผูกอยู่
 * LO ของแต่ละวิชาขึ้นกับห้องของนักเรียน ห้องที่ไม่มีชุดของตัวเองใช้ชุดทั้งวิชา
 */
export function collectRoomEvidence(enrollments, mappings, evaluations, { areas: requiredAreas } = {}) {
    const resolver = buildLoResolver((mappings || []).filter(item => item?.learning_outcomes));
    const losFor = enrollment => resolver.rowsFor(enrollment.subject_id, enrollment.room).map(row => row.learning_outcomes);
    const uniqueLos = [...new Map((enrollments || []).flatMap(losFor).map(lo => [lo.lo_id, lo])).values()];
    // ครูประจำชั้นต้องสรุปครบทุกด้านของชั้น แม้ด้านนั้นยังไม่มีวิชาไหนผูก LO ไว้
    const areasWithLo = groupLearningOutcomesByArea(uniqueLos).map(group => group.area);
    const areas = requiredAreas?.length ? mergeAreaLists(requiredAreas, areasWithLo) : areasWithLo;
    const noteByEnrollmentLo = new Map((evaluations || [])
        .filter(item => normalizeText(item.evidence_note))
        .map(item => [`${item.enrollment_id}:${item.lo_id}`, normalizeText(item.evidence_note)]));
    const notesByKey = new Map();
    (enrollments || []).forEach(enrollment => {
        [...losFor(enrollment)]
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
