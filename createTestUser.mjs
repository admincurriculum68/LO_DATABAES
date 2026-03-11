import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envData = fs.readFileSync(join(__dirname, '.env'), 'utf-8');
const envVars = {};
envData.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) {
        envVars[key.trim()] = rest.join('=').trim();
    }
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'];
const supabaseKey = envVars['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function create() {
    let { data: schools } = await supabase.from('schools').select('*').limit(1);
    let school_id = null;
    if (!schools || schools.length === 0) {
        const { data: newSchool, error } = await supabase.from('schools').insert({
            school_code: '999',
            school_name: 'โรงเรียนทดสอบ',
            province: 'กรุงเทพมหานคร'
        }).select().single();
        if (error) {
            console.error("Failed to create school:", error.message);
            return;
        }
        school_id = newSchool.school_id;
    } else {
        school_id = schools[0].school_id;
    }

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
                school_id: school_id,
                citizen_id: u.citizen_id,
                password_hash: hash,
                prefix: 'นาย',
                first_name: u.fname,
                last_name: u.lname,
                role: u.role,
                is_active: true
            });
            if (error) console.error("Error creating", u.role, error.message);
            else console.log("Created", u.role, "CITIZEN_ID:", u.citizen_id, "DOB:", u.dob);
        } else {
            console.log("Exists", u.role, "CITIZEN_ID:", u.citizen_id, "DOB:", u.dob);
        }
    }

    // Student
    const schash = hashPassword('04042555');
    const { data: sdata } = await supabase.from('users_students').select('*').eq('citizen_id', '4444444444444').single();
    if (!sdata) {
        const { error } = await supabase.from('users_students').insert({
            school_id: school_id,
            citizen_id: '4444444444444',
            password_hash: schash,
            student_code: '99999',
            prefix: 'ด.ช.',
            first_name: 'นักเรียน',
            last_name: 'ทดสอบ',
            student_status: 'active'
        });
        if (error) console.error("Error student:", error.message);
        else console.log("Created student CITIZEN_ID: 4444444444444 DOB: 04042555");
    } else {
        console.log("Exists student CITIZEN_ID: 4444444444444 DOB: 04042555");
    }
}
create();
