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

const pb = createClient(envVars['VITE_SUPABASE_URL'], envVars['VITE_SUPABASE_ANON_KEY']);

async function run() {
    console.log("We need to ask user to run: ALTER TABLE learning_outcomes ADD COLUMN lo_code VARCHAR(255);");
}

run();
