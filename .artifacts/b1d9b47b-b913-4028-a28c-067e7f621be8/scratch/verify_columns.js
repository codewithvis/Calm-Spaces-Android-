const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    console.log('--- Verifying Profiles Columns ---');

    // Try to select 'name'
    const { error: err1 } = await supabase.from('profiles').select('name').limit(1);
    console.log('Column "name" exists:', !err1);
    if (err1) console.log('Error "name":', err1.message);

    // Try to select 'full_name'
    const { error: err2 } = await supabase.from('profiles').select('full_name').limit(1);
    console.log('Column "full_name" exists:', !err2);
    if (err2) console.log('Error "full_name":', err2.message);
}
check();
