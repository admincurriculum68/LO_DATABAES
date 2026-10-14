// ใครแก้ความสามารถด้านไหนได้บ้างในหน้าสรุปความสามารถรายด้าน
// editableAreas = null คือแก้ได้ทุกด้าน (ครูประจำชั้นและฝ่ายวิชาการ ซึ่งเป็นผู้ใช้หน้านี้ในปัจจุบัน)
// หรือ Set ของชื่อด้านที่แก้ได้ โรงเรียนเคยเปิดให้ครูรายวิชาสรุปด้านของตัวเอง แล้วขอปิด
// ให้ครูประจำชั้นเป็นผู้สรุปและประสานกับครูรายวิชาเอง
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

import { normalizeCompetencyArea } from '../constants/curriculum2568.js';

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
