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

async function runSQLviaRpcOrBypass() {
    // If we have anon key and RLS is enabled, inserts fail.
    // If the user's RLS is enabled, we need to instruct them properly, or disable RLS for testing if we have the service key.
    console.log("Supabase connected.");
    const { data: q1, error: e1 } = await supabase.from('schools').select('*');
    console.log("Schools:", q1, e1?.message);
}
runSQLviaRpcOrBypass();
