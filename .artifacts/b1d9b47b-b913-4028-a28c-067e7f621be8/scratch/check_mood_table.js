const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    console.log('--- Mood Entries Table Check ---');

    // 1. Try to fetch a sample to see columns
    const { data, error } = await supabase.from('mood_entries').select('*').limit(1);
    if (error) {
        console.log('Error fetching mood_entries:', error.message);
    } else {
        console.log('Sample entry:', data);
    }

    // 2. Try an insert test with a dummy ID (will likely fail RLS but check column types)
    const dummyId = '00000000-0000-0000-0000-000000000000';
    const { error: insErr } = await supabase.from('mood_entries').insert({
        user_id: dummyId,
        user_type: 'STUDENT',
        mood_emoji: '😊',
        mood_label: 'Happy',
        entry_date: '2026-08-15',
        entry_time: '12:00:00',
        scheduled_label: 'Morning',
        schedule_key: 'slot_1'
    });
    if (insErr) {
        console.log('Insert test error:', insErr.message);
        console.log('Error code:', insErr.code);
    } else {
        console.log('Insert test: SUCCESS (Wait, RLS might be disabled or dummy ID worked?)');
    }
}
check();
