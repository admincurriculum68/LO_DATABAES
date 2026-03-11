import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function create() {
    const testUsers = [
        {
            citizen_id: '1111111111111',
            dob: '01012540',
            role: 'admin',
            fname: 'แอดมิน',
            lname: 'ทดสอบ'
        },
        {
            citizen_id: '2222222222222',
            dob: '02022540',
            role: 'executive',
            fname: 'ผอ.',
            lname: 'ทดสอบ'
        },
        {
            citizen_id: '3333333333333',
            dob: '03032540',
            role: 'teacher',
            fname: 'ครู',
            lname: 'ทดสอบ'
        }
    ];

    for (const u of testUsers) {
        const hash = hashPassword(u.dob);
        const { data, error: selectError } = await supabase.from('users_teachers').select('*').eq('citizen_id', u.citizen_id).single();
        
        if (!data) {
            const { error } = await supabase.from('users_teachers').insert({
                school_id: 'TEST-SCHOOL-01',
                citizen_id: u.citizen_id,
                password_hash: hash,
                prefix: 'นาย',
                first_name: u.fname,
                last_name: u.lname,
                role: u.role,
                is_active: true
            });
            if (error) console.error("Error creating", u.role, error);
            else console.log("Created", u.role);
        } else {
            console.log("Exists", u.role);
        }
    }

    // Student
    const schash = hashPassword('04042555');
    const { data: sdata } = await supabase.from('users_students').select('*').eq('citizen_id', '4444444444444').single();
    if (!sdata) {
        await supabase.from('users_students').insert({
            school_id: 'TEST-SCHOOL-01',
            citizen_id: '4444444444444',
            password_hash: schash,
            student_code: '99999',
            prefix: 'ด.ช.',
            first_name: 'นักเรียน',
            last_name: 'ทดสอบ',
            student_status: 'active'
        });
        console.log("Created student");
    } else {
        console.log("Exists student");
    }
}
create();
