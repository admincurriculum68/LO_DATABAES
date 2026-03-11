import { createClient } from '@supabase/supabase-js';
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

async function checkSchema() {
    // Try to get one school row to see the columns, or try to insert a dummy one with only known columns
    const { data: schoolData, error: schoolErr } = await supabase.from('schools').select('*').limit(1);
    console.log("Schools columns:", schoolData && schoolData.length > 0 ? Object.keys(schoolData[0]) : "No data/error");
    if (schoolErr) console.error("Schools Error:", schoolErr.message);

    // Also check users_teachers and users_students since they reference school_id
    const { data: td, error: te } = await supabase.from('users_teachers').select('*').limit(1);
    console.log("Teachers columns:", td && td.length > 0 ? Object.keys(td[0]) : "No data/error", te ? te.message : "");
}
checkSchema();
