import { supabase } from './supabase';

// การสรุปโดยครูประจำชั้นต้องมีคอลัมน์ summary_text (สร้างด้วย update_schema_homeroom_summary.sql)
// ถ้ายังไม่ได้รัน SQL หน้าจอต้องบอกให้รัน ไม่ใช่พังทั้งหน้า
// จำผลไว้เฉพาะเมื่อรู้แน่ว่ามีหรือไม่มีคอลัมน์ ถ้าเน็ตหลุดจะถามใหม่ครั้งหน้า
let supported = null;

export async function homeroomSummarySupported() {
    if (supported !== null) return supported;
    const { error } = await supabase.from('competency_area_final_decisions').select('summary_text').limit(1);
    if (!error) supported = true;
    else if (error.code === '42703') supported = false;
    return supported ?? false;
}

export const HOMEROOM_SUMMARY_SQL_HINT = 'ฐานข้อมูลยังไม่รองรับการสรุปโดยครูประจำชั้น ผู้ดูแลระบบต้องรันไฟล์ update_schema_homeroom_summary.sql ใน Supabase ก่อน';
