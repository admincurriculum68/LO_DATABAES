/**
 * deleteSecondaryStudents.mjs
 * 
 * สคริปต์สำหรับลบนักเรียนระดับมัธยมศึกษาที่อัปโหลดผิดพลาด
 * โรงเรียนเป้าหมายกำหนดผ่าน TARGET_SCHOOL_ID
 * 
 * วิธีใช้:
 *   TARGET_SCHOOL_ID=<uuid> node deleteSecondaryStudents.mjs           → ดูตัวอย่างก่อน (DRY RUN)
 *   TARGET_SCHOOL_ID=<uuid> node deleteSecondaryStudents.mjs --confirm → ลบจริง
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
    fs.readFileSync(join(scriptDir, '.env'), 'utf8')
        .split('\n')
        .filter(line => line.includes('=') && !line.trim().startsWith('#'))
        .map(line => {
            const [key, ...value] = line.split('=');
            return [key.trim(), value.join('=').trim()];
        })
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const SCHOOL_ID = process.env.TARGET_SCHOOL_ID;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SCHOOL_ID) {
    console.error('❌ ต้องกำหนด VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY และ TARGET_SCHOOL_ID ก่อนใช้งาน');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const isDryRun = !process.argv.includes('--confirm');

// ─── ตัวระบุนักเรียนมัธยม ─────────────────────────────────
// 1. current_room ขึ้นต้นด้วย "ม." (เช่น ม.1/1, ม.2/3)
// 2. prefix เป็น "นาย", "นางสาว", "นาง" (ไม่มี ด.ช./ด.ญ.)
// 3. student_code ขึ้นต้นด้วยรหัสมัธยม (ถ้ามีรูปแบบต่างจากประถม)
// ─────────────────────────────────────────────────────────────

const isSecondaryRoom = (room) => {
    if (!room) return false;
    const r = room.trim();
    return r.startsWith('ม.') || r.startsWith('ม ') || /^[Mm]\./.test(r);
};

const isSecondaryPrefix = (prefix) => {
    if (!prefix) return false;
    const p = prefix.trim();
    // นักเรียนมัธยมมักมี prefix นาย / นางสาว แทนที่จะเป็น ด.ช. / ด.ญ.
    // แต่ถ้าโรงเรียนมีทั้งประถมและมัธยม บางคนอาจมี prefix เหล่านี้ด้วย
    // ให้ใช้ room เป็นตัวหลัก ส่วน prefix ใช้เป็น cross-check เท่านั้น
    return p === 'นาย' || p === 'นางสาว' || p === 'นาง';
};

async function main() {
    console.log('='.repeat(60));
    console.log('🏫 ตรวจสอบนักเรียนโรงเรียน ID:', SCHOOL_ID);
    console.log('='.repeat(60));

    // 1. ดึงนักเรียนทั้งหมดของโรงเรียนนี้
    const { data: allStudents, error: fetchErr } = await supabase
        .from('users_students')
        .select('student_id, student_code, prefix, first_name, last_name, current_room')
        .eq('school_id', SCHOOL_ID)
        .order('current_room', { ascending: true });

    if (fetchErr) {
        console.error('❌ ดึงข้อมูลไม่สำเร็จ:', fetchErr.message);
        process.exit(1);
    }

    if (!allStudents || allStudents.length === 0) {
        console.log('⚠️  ไม่พบนักเรียนในโรงเรียนนี้');
        process.exit(0);
    }

    console.log(`\n📊 นักเรียนทั้งหมดในโรงเรียน: ${allStudents.length} คน`);

    // 2. แยกนักเรียนมัธยมออก
    const secondaryStudents = allStudents.filter(s => isSecondaryRoom(s.current_room));
    const primaryStudents = allStudents.filter(s => !isSecondaryRoom(s.current_room));

    console.log(`\n📋 สรุปข้อมูลนักเรียน:`);
    console.log(`   ✅ ประถม (ป.) : ${primaryStudents.length} คน`);
    console.log(`   ❌ มัธยม (ม.) : ${secondaryStudents.length} คน  ← จะถูกลบ`);

    // 3. แสดงห้องที่พบ
    const roomSummary = {};
    allStudents.forEach(s => {
        const room = s.current_room || '(ไม่ระบุห้อง)';
        roomSummary[room] = (roomSummary[room] || 0) + 1;
    });

    console.log('\n📂 รายการห้องเรียนทั้งหมด:');
    Object.entries(roomSummary).sort().forEach(([room, count]) => {
        const tag = isSecondaryRoom(room) ? ' ❌ (มัธยม - จะลบ)' : ' ✅ (ประถม - คงไว้)';
        console.log(`   ${room}: ${count} คน${tag}`);
    });

    if (secondaryStudents.length === 0) {
        console.log('\n✅ ไม่พบนักเรียนระดับมัธยมในระบบ ไม่มีอะไรต้องลบ');
        process.exit(0);
    }

    // 4. แสดงรายชื่อนักเรียนมัธยมที่จะถูกลบ
    console.log(`\n🗑️  รายชื่อนักเรียนมัธยมที่จะถูกลบ (${secondaryStudents.length} คน):`);
    console.log('-'.repeat(60));
    secondaryStudents.forEach((s, i) => {
        console.log(`${String(i + 1).padStart(3)}. [${s.student_code || '-'}] ${s.prefix || ''}${s.first_name} ${s.last_name}  ห้อง: ${s.current_room || '-'}`);
    });
    console.log('-'.repeat(60));

    // 5. ตรวจสอบว่ามี student_enrollments ที่ผูกอยู่ไหม
    const secondaryIds = secondaryStudents.map(s => s.student_id);
    const { data: enrollments, error: enrollErr } = await supabase
        .from('student_enrollments')
        .select('enrollment_id, student_id')
        .in('student_id', secondaryIds);

    if (enrollErr) {
        console.warn('⚠️  ตรวจสอบ enrollments ไม่ได้:', enrollErr.message);
    } else if (enrollments && enrollments.length > 0) {
        console.log(`\n⚠️  พบข้อมูลการลงทะเบียนเรียน (student_enrollments) ที่ผูกกับนักเรียนมัธยม: ${enrollments.length} รายการ`);
        console.log('   → จะถูกลบพร้อมกัน (CASCADE) หรือต้องลบก่อน');
    } else {
        console.log('\n✅ ไม่พบข้อมูลการลงทะเบียนเรียนที่ผูกอยู่');
    }

    // 6. DRY RUN หรือ ลบจริง
    if (isDryRun) {
        console.log('\n' + '='.repeat(60));
        console.log('🔍 DRY RUN — ยังไม่ได้ลบข้อมูลจริง');
        console.log('   หากต้องการลบจริง รันคำสั่ง:');
        console.log('   node deleteSecondaryStudents.mjs --confirm');
        console.log('='.repeat(60));
        return;
    }

    // ─── ลบจริง ─────────────────────────────────────────────
    console.log('\n🔴 กำลังลบข้อมูลนักเรียนมัธยม...');

    // ลบ enrollments ก่อน (ถ้ามี FK constraint)
    if (enrollments && enrollments.length > 0) {
        const enrollIds = enrollments.map(e => e.enrollment_id);
        
        // ลบ lo_evaluations ที่ผูกกับ enrollments เหล่านั้นก่อน
        const { error: evalDeleteErr } = await supabase
            .from('lo_evaluations')
            .delete()
            .in('enrollment_id', enrollIds);

        if (evalDeleteErr) {
            console.error('❌ ลบ lo_evaluations ไม่สำเร็จ:', evalDeleteErr.message);
            process.exit(1);
        }
        console.log(`   ✅ ลบ lo_evaluations ${enrollIds.length} รายการสำเร็จ`);

        // ลบ student_enrollments
        const { error: enrollDeleteErr } = await supabase
            .from('student_enrollments')
            .delete()
            .in('student_id', secondaryIds);

        if (enrollDeleteErr) {
            console.error('❌ ลบ student_enrollments ไม่สำเร็จ:', enrollDeleteErr.message);
            process.exit(1);
        }
        console.log(`   ✅ ลบ student_enrollments ${enrollments.length} รายการสำเร็จ`);
    }

    // ลบ student_year_evaluations ถ้ามี
    const { error: yearEvalErr } = await supabase
        .from('student_year_evaluations')
        .delete()
        .in('student_id', secondaryIds);
    if (!yearEvalErr) console.log('   ✅ ลบ student_year_evaluations สำเร็จ (ถ้ามี)');

    // ลบนักเรียนออกจาก users_students
    const { error: deleteErr } = await supabase
        .from('users_students')
        .delete()
        .in('student_id', secondaryIds);

    if (deleteErr) {
        console.error('❌ ลบนักเรียนไม่สำเร็จ:', deleteErr.message);
        process.exit(1);
    }

    console.log(`\n✅ ลบนักเรียนมัธยมสำเร็จ ${secondaryStudents.length} คน`);
    console.log('='.repeat(60));
    console.log('🎉 เสร็จสิ้น! ข้อมูลนักเรียนระดับมัธยมถูกลบออกจากระบบแล้ว');
    console.log('='.repeat(60));
}

main().catch(err => {
    console.error('❌ เกิดข้อผิดพลาด:', err.message);
    process.exit(1);
});
