/**
 * deleteAllStudentsFromSchool.mjs
 * ลบนักเรียนทั้งหมดของโรงเรียนที่กำหนดผ่าน TARGET_SCHOOL_ID
 * พร้อม related data (enrollments, evaluations)
 *
 * รัน:  TARGET_SCHOOL_ID=<uuid> node deleteAllStudentsFromSchool.mjs           → preview
 *       TARGET_SCHOOL_ID=<uuid> node deleteAllStudentsFromSchool.mjs --confirm → ลบจริง
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
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;
const SCHOOL_ID = process.env.TARGET_SCHOOL_ID;

if (!SUPABASE_URL || !SUPABASE_KEY || !SCHOOL_ID) {
    console.error('❌ ต้องกำหนด VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY และ TARGET_SCHOOL_ID ก่อนใช้งาน');
    process.exit(1);
}

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY);
const isDryRun  = !process.argv.includes('--confirm');

async function main() {
    console.log('='.repeat(60));
    console.log('🏫 โรงเรียน ID:', SCHOOL_ID);
    console.log(isDryRun ? '🔍 MODE: DRY RUN (ยังไม่ลบจริง)' : '🔴 MODE: CONFIRM — กำลังลบจริง!');
    console.log('='.repeat(60));

    // 1. ดึงนักเรียนทั้งหมด
    const { data: students, error: sErr } = await supabase
        .from('users_students')
        .select('student_id, student_code, prefix, first_name, last_name, current_room')
        .eq('school_id', SCHOOL_ID);

    if (sErr) { console.error('❌ ดึงนักเรียนไม่ได้:', sErr.message); process.exit(1); }
    if (!students || students.length === 0) {
        console.log('✅ ไม่มีนักเรียนในโรงเรียนนี้แล้ว');
        process.exit(0);
    }

    const studentIds = students.map(s => s.student_id);
    console.log(`\n👥 นักเรียนในโรงเรียนนี้: ${students.length} คน`);

    // แสดงตัวอย่าง 10 รายแรก
    console.log('\n📋 ตัวอย่าง 10 คนแรก:');
    students.slice(0, 10).forEach((s, i) =>
        console.log(`  ${i+1}. [${s.student_code || '-'}] ${s.prefix || ''}${s.first_name} ${s.last_name}  ห้อง: ${s.current_room || '(ไม่ระบุ)'}`)
    );
    if (students.length > 10) console.log(`  ... และอีก ${students.length - 10} คน`);

    // 2. นับ enrollments ผ่าน subquery (หลีกเลี่ยง large in() array)
    // ดึง student_ids แบบ batch (max 200 ต่อครั้ง)
    let totalEnrollCount = 0;
    let allEnrollIds = [];
    const BATCH = 200;
    for (let b = 0; b < studentIds.length; b += BATCH) {
        const chunk = studentIds.slice(b, b + BATCH);
        const { data: batchEnroll } = await supabase
            .from('student_enrollments')
            .select('enrollment_id')
            .in('student_id', chunk);
        if (batchEnroll) {
            totalEnrollCount += batchEnroll.length;
            allEnrollIds.push(...batchEnroll.map(e => e.enrollment_id));
        }
    }

    // 3. นับ evaluations
    let evalCount = 0;
    if (allEnrollIds.length > 0) {
        for (let b = 0; b < allEnrollIds.length; b += BATCH) {
            const chunk = allEnrollIds.slice(b, b + BATCH);
            const { count } = await supabase
                .from('lo_evaluations')
                .select('*', { count: 'exact', head: true })
                .in('enrollment_id', chunk);
            evalCount += count || 0;
        }
    }

    let yearEvalCount = 0;
    for (let b = 0; b < studentIds.length; b += BATCH) {
        const chunk = studentIds.slice(b, b + BATCH);
        const { count } = await supabase
            .from('student_year_evaluations')
            .select('*', { count: 'exact', head: true })
            .in('student_id', chunk);
        yearEvalCount += count || 0;
    }
    const enrollIds = allEnrollIds;

    console.log(`\n📊 ข้อมูลที่จะถูกลบทั้งหมด:`);
    console.log(`   👤 users_students       : ${students.length} คน`);
    console.log(`   📚 student_enrollments  : ${enrollIds.length} รายการ`);
    console.log(`   📝 lo_evaluations       : ${evalCount} รายการ`);
    console.log(`   🗒️  student_year_eval    : ${yearEvalCount || 0} รายการ`);

    if (isDryRun) {
        console.log('\n' + '='.repeat(60));
        console.log('🔍 DRY RUN — ยังไม่ได้ลบข้อมูลจริง');
        console.log('   รันคำสั่งนี้เพื่อลบจริง:');
        console.log('   node deleteAllStudentsFromSchool.mjs --confirm');
        console.log('='.repeat(60));
        return;
    }

    // ─── ลบจริง ตามลำดับ FK (batch 200 ต่อครั้ง) ─────────
    console.log('\n🔴 เริ่มลบข้อมูล...\n');

    // Step 1: lo_evaluations (batch)
    if (enrollIds.length > 0) {
        let loDeleted = 0;
        for (let b = 0; b < enrollIds.length; b += BATCH) {
            const chunk = enrollIds.slice(b, b + BATCH);
            const { error: e1 } = await supabase.from('lo_evaluations').delete().in('enrollment_id', chunk);
            if (e1) { console.error('❌ ลบ lo_evaluations ล้มเหลว:', e1.message); process.exit(1); }
            loDeleted += chunk.length;
        }
        console.log(`   ✅ ลบ lo_evaluations ${loDeleted} รายการ (batch)`);
    }

    // Step 2: student_year_evaluations (batch)
    let yearDeleted = 0;
    for (let b = 0; b < studentIds.length; b += BATCH) {
        const chunk = studentIds.slice(b, b + BATCH);
        const { error: e2 } = await supabase.from('student_year_evaluations').delete().in('student_id', chunk);
        if (e2) console.warn('   ⚠️ ลบ student_year_evaluations batch:', e2.message);
        else yearDeleted += chunk.length;
    }
    console.log(`   ✅ ลบ student_year_evaluations (batch) สำเร็จ`);

    // Step 3: student_enrollments (batch)
    let enrollDeleted = 0;
    for (let b = 0; b < studentIds.length; b += BATCH) {
        const chunk = studentIds.slice(b, b + BATCH);
        const { error: e3 } = await supabase.from('student_enrollments').delete().in('student_id', chunk);
        if (e3) { console.error('❌ ลบ student_enrollments ล้มเหลว:', e3.message); process.exit(1); }
        enrollDeleted += chunk.length;
    }
    console.log(`   ✅ ลบ student_enrollments (batch) สำเร็จ`);

    // Step 4: users_students — ลบทั้งหมดด้วย school_id ครั้งเดียว
    const { error: e4 } = await supabase.from('users_students').delete().eq('school_id', SCHOOL_ID);
    if (e4) { console.error('❌ ลบ users_students ล้มเหลว:', e4.message); process.exit(1); }
    console.log(`   ✅ ลบ users_students ${students.length} คน`);

    console.log('\n' + '='.repeat(60));
    console.log(`🎉 เสร็จสิ้น! ลบนักเรียนออกจากระบบครบ ${students.length} คน`);
    console.log('   → โรงเรียนสามารถอัปโหลดข้อมูลใหม่ผ่านหน้า Admin ได้เลย');
    console.log('='.repeat(60));
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
