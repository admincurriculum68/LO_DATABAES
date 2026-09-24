// ใครแก้ความสามารถด้านไหนได้บ้างในหน้าสรุปความสามารถรายด้าน
//
// โรงเรียนมอบให้ครูรายวิชาเป็นคนสรุปด้านของวิชาตัวเอง เช่น ครูภาษาไทยสรุปด้านการอ่านและการเขียน
// เดิมหน้านี้เปิดให้เฉพาะครูประจำชั้น ครูรายวิชาจึงต้องยืมบัญชีครูประจำชั้นเข้ามากรอก
// ตอนนี้ครูรายวิชาใช้บัญชีตัวเองได้ แต่แก้ได้เฉพาะด้านที่ LO ของวิชาที่ตัวเองสอนในห้องนั้นผูกอยู่
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

import { normalizeCompetencyArea } from '../constants/curriculum2568.js';
import { buildLoResolver } from './loByRoom.js';

/**
 * enrollments: แถวลงทะเบียนของห้องนั้น [{ subject_id, room }]
 * mappings: แถว subject_lo_mapping พร้อม learning_outcomes ของวิชาในห้องนั้น
 * canEditSubject: ฟังก์ชันบอกว่าครูคนนี้สอนวิชานั้นในห้องนี้ไหม (subjectId, room) => boolean
 * คืน null = แก้ได้ทุกด้าน (ครูประจำชั้นและฝ่ายวิชาการ) หรือ Set ของชื่อด้านที่แก้ได้
 */
export function editableAreasFor({ canEditAll = false, enrollments = [], mappings = [], canEditSubject } = {}) {
    if (canEditAll) return null;
    const resolver = buildLoResolver((mappings || []).filter(item => item?.learning_outcomes));
    const areas = new Set();
    const seen = new Set();
    (enrollments || []).forEach(enrollment => {
        const key = `${enrollment.subject_id}:${enrollment.room || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (canEditSubject && !canEditSubject(enrollment.subject_id, enrollment.room)) return;
        resolver.rowsFor(enrollment.subject_id, enrollment.room).forEach(row => {
            const area = normalizeCompetencyArea(row.learning_outcomes?.competency_area);
            if (area) areas.add(area);
        });
    });
    return areas;
}

/** ด้านนี้แก้ได้ไหม ใช้กับค่าที่ editableAreasFor คืนมา */
export function canEditArea(editableAreas, area) {
    if (!editableAreas) return true;
    return editableAreas.has(normalizeCompetencyArea(area));
}

/**
 * ด้านที่ปุ่มส่งผลสรุปจะส่ง
 * ครูประจำชั้นและฝ่ายวิชาการส่งทั้งห้อง (คืน null) ครูรายวิชาส่งเฉพาะด้านของวิชาตัวเอง
 * คืนชื่อด้านแบบเดียวกับที่บันทึกในฐานข้อมูล เพื่อใช้กรองแถวตอนส่ง
 */
export function areasToSubmit(editableAreas, areas = []) {
    if (!editableAreas) return null;
    return [...new Set((areas || [])
        .filter(area => canEditArea(editableAreas, area))
        .map(normalizeCompetencyArea)
        .filter(Boolean))];
}
