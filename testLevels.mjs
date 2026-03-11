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

async function check() {
    const vals = ['early_primary', 'upper_primary', 'ป.ต้น', 'ป.ปลาย', 'ประถมศึกษาตอนต้น'];
    for (const v of vals) {
        const { error } = await supabase.from('learning_outcomes').insert({
            level_group: v,
            ability_no: 99,
            lo_description: 'TEST'
        });
        if (!error) {
            console.log("SUCCESS:", v);
            await supabase.from('learning_outcomes').delete().eq('ability_no', 99);
            return;
        } else {
            console.log("FAILED:", v, error.message);
        }
    }
}
check();
