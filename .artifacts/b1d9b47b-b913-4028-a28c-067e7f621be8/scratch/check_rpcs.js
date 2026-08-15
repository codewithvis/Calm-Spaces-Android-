const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    console.log('--- Testing Security RPCs ---');

    console.log('Testing check_username_exists...');
    const { data: userExists, error: userError } = await supabase.rpc('check_username_exists', { username_to_check: 'admin_test_xyz' });
    if (userError) {
        console.error('❌ check_username_exists FAILED:', userError.message);
    } else {
        console.log('✅ check_username_exists SUCCESS:', userExists);
    }

    console.log('Testing check_registration_exists...');
    const { data: regExists, error: regError } = await supabase.rpc('check_registration_exists', { reg_to_check: 999999999 });
    if (regError) {
        console.error('❌ check_registration_exists FAILED:', regError.message);
    } else {
        console.log('✅ check_registration_exists SUCCESS:', regExists);
    }
}
check();
