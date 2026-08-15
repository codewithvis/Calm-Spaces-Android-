const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = 'C:/Users/LENOVO/Documents/GitHub/calm-space-app-final/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function audit() {
    console.log('--- 🛡️ FINAL LIVE SECURITY AUDIT ---');

    // 1. Check Profiles (PII Leak) - Should now be 0 rows for anon if RLS is strict
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('registration_number, email').limit(5);
    // Note: If policy allows "view profiles" but view hides columns, it might still return rows but with empty sensitive fields
    const isLeaking = profiles && profiles.length > 0 && (profiles[0].registration_number || profiles[0].email);
    console.log('Profile Data Leak (Anon):', isLeaking ? '❌ VULNERABLE' : '✅ SECURE');

    // 2. Check Messages
    const { data: msgs, error: mErr } = await supabase.from('messages').select('*').limit(5);
    console.log('Message Privacy (Anon):', (msgs && msgs.length === 0) || mErr ? '✅ SECURE' : '❌ VULNERABLE');

    // 3. Check Location
    const { data: locs, error: lErr } = await supabase.from('student_locations').select('*').limit(5);
    console.log('Location Privacy (Anon):', (locs && locs.length === 0) || lErr ? '✅ SECURE' : '❌ VULNERABLE');

    // 4. Check Public View (PII Filter)
    const { data: viewData, error: vErr } = await supabase.from('public_profiles').select('*').limit(1);
    console.log('Public Profiles View:', viewData ? '✅ ACTIVE' : '❌ NOT FOUND/INACTIVE');

    console.log('--- AUDIT COMPLETE ---');
}
audit();
