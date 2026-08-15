const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function verify() {
    console.log('--- 🏁 FINAL SIGN-UP VERIFICATION ---');

    const timestamp = Date.now();
    const testEmail = `user${timestamp}@gmail.com`;
    const testPassword = `P@ssword${timestamp}!`;

    console.log(`Testing with Email: ${testEmail}`);

    const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        // REMOVING ALL METADATA
    });

    if (error) {
        console.error('❌ SIGN-UP FAILED:', error.message, '(Code:', error.status, ')');
        console.log('Full error object:', JSON.stringify(error));
    } else {
        console.log('✅ SIGNUP SUCCESS (Auth Account Created)');
    }
}
verify();
