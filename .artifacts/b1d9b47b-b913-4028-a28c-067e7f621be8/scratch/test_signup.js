const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function testSignup() {
    console.log('--- 🧪 LIVE SIGNUP TEST ---');

    const timestamp = Date.now();
    const testEmail = `user${timestamp}@gmail.com`;
    const testPassword = `P@ssword${timestamp}!`;
    const regNo = Math.floor(100000 + Math.random() * 900000);

    console.log(`Email: ${testEmail}`);
    console.log(`Reg No: ${regNo}`);

    const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
            data: {
                username: `user${timestamp}`,
                name: 'Test User',
                registration_number: regNo.toString(),
                phone_number: '9876543210',
                course: 'FACULTY_OF_ENGINEERING',
                date_of_birth: '01/01/2000',
                type: "STUDENT",
            },
        }
    });

    if (error) {
        console.error('❌ SIGNUP FAILED:', error.message);
        console.error('Error Code:', error.status);
    } else {
        console.log('✅ SIGNUP SUCCESS (Auth Account Created)');
        console.log('User ID:', data.user.id);

        // Wait a bit for the trigger to fire
        console.log('Waiting for profile trigger...');
        await new Promise(r => setTimeout(r, 4000));

        // Check if profile exists
        const { data: profile, error: pErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();

        if (pErr) {
            console.error('❌ PROFILE CHECK FAILED:', pErr.message);
        } else if (profile) {
            console.log('✅ PROFILE CREATED SUCCESSFULLY');
            console.log('Profile Data:', profile);
        } else {
            console.error('❌ PROFILE NOT FOUND');
            console.log('This usually means the trigger is NOT deployed or is failing.');
        }
    }
}

testSignup();
