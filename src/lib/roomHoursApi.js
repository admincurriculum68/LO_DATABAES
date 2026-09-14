import { supabase } from './supabase';

// ชั่วโมงเรียนแยกตามห้องต้องมีคอลัมน์ subjects.room_hours (สร้างด้วย update_schema_room_hours.sql)
// ถ้าโรงเรียนยังไม่ได้รัน SQL ระบบต้องทำงานแบบเดิมได้ ไม่ใช่นำเข้าไม่ได้ทั้งไฟล์
// จำผลไว้เฉพาะเมื่อรู้แน่ว่ามีหรือไม่มีคอลัมน์ ถ้าเน็ตหลุดจะถามใหม่ครั้งหน้า
let supported = null;

export async function roomHoursSupported() {
    if (supported !== null) return supported;
    const { error } = await supabase.from('subjects').select('room_hours').limit(1);
    if (!error) supported = true;
    else if (error.code === '42703') supported = false;
    return supported ?? false;
}
