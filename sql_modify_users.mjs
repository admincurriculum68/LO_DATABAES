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
    const { data: schools, error } = await supabase.from('schools').select('*');
    if (error) {
        console.error("Error fetching schools", error);
    } else {
        console.log("Schools:", schools);
        if (schools.length > 0) {
            console.log("School name to add to UI:", schools[0].school_name);
        }
    }
}
run();
