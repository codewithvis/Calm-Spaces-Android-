const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    const timestamp = Date.now();
    console.log('Testing minimal signup...');
    const { data, error } = await supabase.auth.signUp({
        email: `minimal_${timestamp}@gmail.com`,
        password: `StrongP@ssword${timestamp}!`,
    });
    if (error) {
        console.error('Minimal signup failed:', error.message);
    } else {
        console.log('Minimal signup SUCCESS');
    }
}
test();
