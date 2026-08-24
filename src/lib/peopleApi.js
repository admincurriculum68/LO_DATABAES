/**
 * peopleApi.js — คำสั่งที่คุยกับฐานข้อมูลสำหรับข้อมูลครูและนักเรียน
 * แยกจาก people.js เพื่อให้ตรรกะบริสุทธิ์ในไฟล์นั้นเทสต์ได้ แบบเดียวกับที่ roles.js แยกจาก auth.js
 */
import { supabase } from './supabase';

/**
 * ปรับ teacher_roles ให้ตรงกับบทบาทที่เลือก
 *
 * ตั้งบทบาทหลักเป็น 2 ขั้น (เคลียร์ก่อนแล้วค่อยตั้ง) เพราะฐานข้อมูลมี
 * unique index ที่อนุญาตให้ครู 1 คนมีแถว is_primary ได้เพียงแถวเดียว
 */
export async function syncTeacherRoles(teacherId, roles, primaryRole) {
    const wanted = [...new Set(roles)].filter(Boolean);
    if (wanted.length === 0) return;
    const primary = wanted.includes(primaryRole) ? primaryRole : wanted[0];

    const { data: existing, error: readError } = await supabase.from('teacher_roles')
        .select('teacher_role_id, role').eq('teacher_id', teacherId);
    if (readError) throw readError;

    const current = new Set((existing || []).map(row => row.role));
    const toAdd = wanted.filter(role => !current.has(role));
    const toRemove = (existing || []).filter(row => !wanted.includes(row.role));

    if (toAdd.length) {
        const { error } = await supabase.from('teacher_roles')
            .insert(toAdd.map(role => ({ teacher_id: teacherId, role, is_primary: false })));
        if (error) throw error;
    }
    for (const row of toRemove) {
        const { error } = await supabase.from('teacher_roles').delete().eq('teacher_role_id', row.teacher_role_id);
        if (error) throw error;
    }
    const { error: clearError } = await supabase.from('teacher_roles')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('teacher_id', teacherId).neq('role', primary);
    if (clearError) throw clearError;
    const { error: setError } = await supabase.from('teacher_roles')
        .update({ is_primary: true, updated_at: new Date().toISOString() })
        .eq('teacher_id', teacherId).eq('role', primary);
    if (setError) throw setError;
}
