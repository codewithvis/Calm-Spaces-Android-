const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function peek() {
    console.log('Peeking at existing profiles...');
    const { data, error } = await supabase.from('profiles').select('*').limit(3);
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Data:', JSON.stringify(data, null, 2));
    }
}
peek();
