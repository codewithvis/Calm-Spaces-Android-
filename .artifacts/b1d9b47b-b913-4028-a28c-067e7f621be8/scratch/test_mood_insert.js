const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    console.log('--- Testing mood_entries insert variants ---');

    const baseData = {
        user_type: 'STUDENT',
        mood_emoji: '😄',
        mood_label: 'Happy',
        entry_date: '2026-08-15',
        entry_time: '12:00:00'
    };

    // Test 1: UUID (Current implementation)
    console.log('Test 1: UUID as user_id');
    const { error: err1 } = await supabase.from('mood_entries').insert({
        ...baseData,
        user_id: '00000000-0000-0000-0000-000000000000'
    });
    console.log('Result 1:', err1 ? err1.message : 'SUCCESS');

    // Test 2: Number as user_id
    console.log('Test 2: Number as user_id');
    const { error: err2 } = await supabase.from('mood_entries').insert({
        ...baseData,
        user_id: 12345
    });
    console.log('Result 2:', err2 ? err2.message : 'SUCCESS');
}
test();
