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

async function updatePasswords() {
    await supabase.from('users_teachers').update({ password_hash: 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0' }).eq('citizen_id', '1111111111111');
    await supabase.from('users_teachers').update({ password_hash: '792e170d30002442fb93321847c70bb1d53a197bd49a055405644a8ea9418172' }).eq('citizen_id', '2222222222222');
    await supabase.from('users_teachers').update({ password_hash: '16cd060645a79e5aa014df0fe26550e71177aecb1242d1f28a11ff8b6d43d60c' }).eq('citizen_id', '3333333333333');
    await supabase.from('users_students').update({ password_hash: '9b7e080a6ebd332e15a13d4be23ce3e700817e7967457868a2279db44809d606' }).eq('citizen_id', '4444444444444');
    console.log("Updated hashes.");
}
updatePasswords();
