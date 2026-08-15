const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    console.log('--- Checking for profile uniqueness/conflicts ---');

    const { data: testData } = await supabase.from('public_profiles').select('username, registration_number').limit(5);
    console.log('Existing samples:', testData);

    if (testData && testData.length > 0) {
        // ... (rest same)
    }
}
check();
