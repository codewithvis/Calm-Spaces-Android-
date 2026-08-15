const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    // This query might fail if not allowed, but let's try
    const { data, error } = await supabase.rpc('inspect_table_triggers', { table_name: 'profiles' });
    if (error) {
        console.log('inspect_table_triggers RPC failed:', error.message);
    } else {
        console.log('Triggers on profiles:', data);
    }
}
check();
