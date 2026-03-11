import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; 

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: teacherData, error: teacherError } = await supabase
        .from('users_teachers')
        .select('*, schools(school_name)')
        .limit(1);
    console.log("Joined data:", JSON.stringify(teacherData, null, 2));
    console.log("Error:", teacherError);
}
run();
