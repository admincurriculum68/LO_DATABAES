import { supabase } from './supabase';

// ประเภทของรายการเรียนรู้ต้องมีคอลัมน์ subjects.learning_format (สร้างด้วย update_schema_report_details.sql)
// โรงเรียนที่ยังไม่ได้รัน SQL ให้ถือว่าทุกแถวเป็นวิชาเหมือนเดิม
let supported = null;

export async function learningFormatSupported() {
    if (supported !== null) return supported;
    const { error } = await supabase.from('subjects').select('learning_format').limit(1);
    if (!error) supported = true;
    else if (error.code === '42703') supported = false;
    return supported ?? false;
}
