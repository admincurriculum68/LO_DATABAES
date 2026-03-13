import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envPath = '/Users/analatkhankhen/Downloads/LO DATABASE/.env';
const envContent = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

console.log('Checking tables...');

async function run() {
  const { data: cols, error: errCols } = await supabase
    .from('behavior_templates')
    .select('*')
    .limit(1);

  console.log('Columns in behavior_templates:', cols && cols.length > 0 ? Object.keys(cols[0]) : 'Empty data or error', errCols?.message);
}

run();
