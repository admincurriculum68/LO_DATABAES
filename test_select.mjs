import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; 

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: teacherData, error: teacherError } = await supabase
        .from('users_teachers')
        .select('*, schools(school_name)')
        .limit(1);
    console.log("Joined data:", JSON.stringify(teacherData, null, 2));
}
run();
