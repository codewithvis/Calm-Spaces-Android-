const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    console.log('--- Checking mood_entries schema ---');

    // We can use RPC to query information_schema if enabled, but likely not.
    // So we try to insert an almost-empty row to see what fails.
    const { error } = await supabase.from('mood_entries').insert({}).select();
    if (error) {
        console.log('Insert empty row error:', error.message);
        console.log('Error details:', error.details);
    }
}
check();
