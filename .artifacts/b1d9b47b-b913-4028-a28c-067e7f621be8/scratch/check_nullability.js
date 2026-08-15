const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    console.log('--- Checking for NOT NULL columns ---');
    // Try to insert a row with only ID and see what Postgres complains about
    const { error } = await supabase.from('profiles').insert({
        id: '00000000-0000-0000-0000-000000000999',
        type: 'STUDENT'
    });

    if (error) {
        console.log('Postgres Error:', error.message);
    } else {
        console.log('Insert Success (Wait, RLS should have blocked this or it worked?)');
    }
}
check();
