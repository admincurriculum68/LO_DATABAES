// กำหนด LO ของวิชา
//
// โรงเรียนคิดเป็นรายด้าน เช่น "วิชาคณิตศาสตร์ใช้ด้านการคิดคำนวณ" แต่ระบบเก็บเป็นรายข้อ LO
// ไฟล์นี้ช่วยจัด LO เป็นกลุ่มตามด้าน เดาด้านจากชื่อวิชา และหาว่าต้องเพิ่มหรือลบอะไรตอนบันทึก
// ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

import { CBE_CAPABILITIES_2568, normalizeCompetencyArea } from '../constants/curriculum2568.js';

const GRADE_ORDER = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
const OFFICIAL_ORDER = CBE_CAPABILITIES_2568.map(item => item.name);
const thaiOrder = (a, b) => String(a || '').localeCompare(String(b || ''), 'th', { numeric: true });

export const UNSPECIFIED_AREA = 'ไม่ระบุด้านความสามารถ';

/** ชื่อด้านแบบสั้นสำหรับหัวตาราง "ความสามารถด้านการอ่าน" → "การอ่าน" */
export function shortAreaName(area) {
    return String(area || '').replace(/^ความสามารถด้าน/, '').trim() || UNSPECIFIED_AREA;
}

const gradeRank = grade => {
    const index = GRADE_ORDER.indexOf(grade);
    return index === -1 ? GRADE_ORDER.length : index;
};

/** เรียงวิชาตามชั้นแล้วตามชื่อ ชื่อซ้ำข้ามชั้นจะไม่ปนกัน */
export function sortSubjectsForMapping(subjects) {
    return [...(subjects || [])].sort((a, b) => gradeRank(a.grade_level) - gradeRank(b.grade_level) || thaiOrder(a.subject_name, b.subject_name));
}

/** ชั้นที่มีวิชา เรียง ป.1 → ป.6 */
export function gradesOf(subjects) {
    return [...new Set((subjects || []).map(subject => subject.grade_level).filter(Boolean))].sort((a, b) => gradeRank(a) - gradeRank(b) || thaiOrder(a, b));
}

/** LO ที่ใช้กับวิชาของชั้นนี้ได้ LO ที่ไม่ระบุชั้นใช้ได้ทุกชั้น */
export function learningOutcomesForGrade(learningOutcomes, grade) {
    return (learningOutcomes || []).filter(lo => !grade || !lo.grade_level || lo.grade_level === grade);
}

/**
 * จัด LO เป็นกลุ่มตามด้าน เรียงตามลำดับด้านในหลักสูตร 2568 ด้านที่โรงเรียนเพิ่มเองต่อท้าย
 * ในแต่ละด้านเรียงตามข้อที่แล้วตามรหัส LO
 */
export function groupLearningOutcomesByArea(learningOutcomes) {
    const groups = new Map();
    (learningOutcomes || []).forEach(lo => {
        const area = normalizeCompetencyArea(lo.competency_area) || UNSPECIFIED_AREA;
        if (!groups.has(area)) groups.set(area, []);
        groups.get(area).push(lo);
    });
    const rank = area => {
        const index = OFFICIAL_ORDER.indexOf(area);
        return index === -1 ? OFFICIAL_ORDER.length + (area === UNSPECIFIED_AREA ? 1 : 0) : index;
    };
    return [...groups.entries()]
        .sort(([a], [b]) => rank(a) - rank(b) || thaiOrder(a, b))
        .map(([area, los]) => ({
            area,
            los: [...los].sort((a, b) => (Number(a.ability_no) || 0) - (Number(b.ability_no) || 0) || thaiOrder(a.lo_code, b.lo_code)),
        }));
}

// คำในชื่อวิชา → คำในชื่อด้าน ใช้เดาเท่านั้น ครูผู้สอนและฝ่ายวิชาการต้องตรวจก่อนบันทึกเสมอ
// ช่วงชั้นต้นแยกด้านการอ่านและการเขียน และบางโรงเรียนเพิ่มด้านภาษาอังกฤษกับภาษาจีน
// ช่วงชั้นปลายรวมเป็นด้านภาษาและการสื่อสาร จึงใส่ชื่อด้านของทั้งสองช่วงชั้นไว้ในกฎเดียวกัน
// ด้านไหนไม่มีในชั้นนั้นจะถูกตัดออกเอง
const SUBJECT_AREA_RULES = [
    { pattern: /ภาษาไทย|วรรณกรรม|วรรณคดี/, areas: ['การอ่าน', 'การเขียน', 'ภาษาและการสื่อสาร'] },
    { pattern: /อ่าน/, areas: ['การอ่าน', 'ภาษาและการสื่อสาร'] },
    { pattern: /เขียน/, areas: ['การเขียน', 'ภาษาและการสื่อสาร'] },
    { pattern: /คณิต|\bmath/i, areas: ['การคิดคำนวณ'] },
    { pattern: /วิทยาศาสตร์|วิทย์|เทคโนโลยี|สิ่งแวดล้อม|\bscience/i, areas: ['วิทยาศาสตร์'] },
    { pattern: /สังคม|ประวัติศาสตร์|พลเมือง|หน้าที่/, areas: ['สังคม'] },
    { pattern: /เศรษฐกิจ|การเงิน/, areas: ['เศรษฐกิจ'] },
    { pattern: /สุขภาพ|สุขศึกษา|พลศึกษา|ว่ายน้ำ|กีฬา/, areas: ['สุขภาพ'] },
    { pattern: /ศิลปะ|ดนตรี|นาฏศิลป์|ทัศนศิลป์/, areas: ['ศิลปะ'] },
    { pattern: /อังกฤษ|\benglish/i, areas: ['ภาษาอังกฤษ', 'ภาษาและการสื่อสาร'] },
    { pattern: /จีน|\bchinese/i, areas: ['ภาษาจีน', 'ภาษาและการสื่อสาร'] },
];

/**
 * เดาด้านของวิชาจากชื่อวิชา คืนเฉพาะด้านที่มีอยู่จริงใน areas
 * ถ้าไม่มีคำที่บอกด้านได้ คืนรายการว่าง ให้ฝ่ายวิชาการเลือกเอง
 */
export function suggestAreasForSubject(subjectName, areas) {
    const name = String(subjectName || '');
    const keywords = SUBJECT_AREA_RULES.filter(rule => rule.pattern.test(name)).flatMap(rule => rule.areas);
    if (!keywords.length) return [];
    return (areas || []).filter(area => keywords.some(keyword => shortAreaName(area).includes(keyword)));
}

/** สถานะช่องของด้านหนึ่ง: เลือกครบทุกข้อ บางข้อ หรือไม่ได้เลือก */
export function areaSelectionState(areaLoIds, selectedIds) {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    const count = (areaLoIds || []).filter(id => selected.has(id)).length;
    if (!areaLoIds?.length || count === 0) return { state: 'none', count, total: areaLoIds?.length || 0 };
    return { state: count === areaLoIds.length ? 'all' : 'some', count, total: areaLoIds.length };
}

/** ชุด LO ใหม่หลังกดช่องของด้าน ถ้าเลือกครบอยู่แล้วให้เอาออกทั้งด้าน นอกนั้นเลือกทั้งด้าน */
export function toggleArea(selectedIds, areaLoIds) {
    const next = new Set(selectedIds || []);
    const { state } = areaSelectionState(areaLoIds, next);
    (areaLoIds || []).forEach(id => (state === 'all' ? next.delete(id) : next.add(id)));
    return next;
}

/** LO ที่ต้องเพิ่มและต้องเอาออก เทียบกับที่อยู่ในฐานข้อมูล */
export function diffMapping(savedIds, draftIds) {
    const saved = new Set(savedIds || []);
    const draft = new Set(draftIds || []);
    return {
        toAdd: [...draft].filter(id => !saved.has(id)),
        toRemove: [...saved].filter(id => !draft.has(id)),
    };
}

/** ชุด LO สองชุดเท่ากันหรือไม่ ใช้บอกว่าวิชายังมีการเปลี่ยนแปลงที่ไม่ได้บันทึก */
export function sameSelection(a, b) {
    const left = new Set(a || []);
    const right = new Set(b || []);
    return left.size === right.size && [...left].every(id => right.has(id));
}
