// รายการด้านความสามารถที่ต้องสรุปของแต่ละชั้น
//
// เดิมระบบสร้างรายการด้านจาก LO ที่ครูเลือกไว้เท่านั้น ห้องที่ครูยังเลือก LO ไม่ครบทุกวิชา
// จึงขาดด้านไปจากใบรายงาน (ป.4–6 ต้องมี 7 ด้าน) ตอนนี้ยึดคลัง LO ของโรงเรียนรายชั้นเป็นหลัก
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

import { normalizeCompetencyArea } from '../constants/curriculum2568.js';

/**
 * ด้านความสามารถจากคลัง LO เรียงตามลำดับที่โรงเรียนตั้งไว้ (ability_no ต่ำสุดของแต่ละด้าน)
 * loRows: [{ competency_area, ability_no }]
 */
export function areasFromLoBank(loRows) {
    const firstSeen = new Map();
    (loRows || []).forEach((row, index) => {
        const area = normalizeCompetencyArea(row?.competency_area);
        if (!area) return;
        const raw = row?.ability_no;
        const hasOrder = raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw));
        const order = hasOrder ? Number(raw) : Number.MAX_SAFE_INTEGER;
        const current = firstSeen.get(area);
        if (!current || order < current.order) firstSeen.set(area, { order, index });
    });
    return [...firstSeen.entries()]
        .sort((a, b) => a[1].order - b[1].order || a[1].index - b[1].index)
        .map(([area]) => area);
}

/** ต่อท้ายด้านที่มีข้อมูลอยู่แล้วแต่ไม่อยู่ในคลัง เพื่อไม่ให้ผลที่บันทึกไว้หายจากหน้าจอ */
export function mergeAreaLists(primary, extra) {
    const result = [];
    const seen = new Set();
    [...(primary || []), ...(extra || [])].forEach(item => {
        const area = normalizeCompetencyArea(item);
        if (!area || seen.has(area)) return;
        seen.add(area);
        result.push(area);
    });
    return result;
}
