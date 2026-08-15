const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function inspect() {
    console.log('--- Deep Inspecting profiles table via insertion errors ---');

    // Try to find what's REQUIRED by leaving out everything and see error
    const { error: err1 } = await supabase.from('profiles').insert({
        id: '11111111-1111-1111-1111-111111111111'
    });
    console.log('Error from minimal insert:', err1 ? err1.message : 'SUCCESS');

    // Try to find if 'type' is an enum or text
    const { error: err2 } = await supabase.from('profiles').insert({
        id: '22222222-2222-2222-2222-222222222222',
        type: 'INVALID_TYPE_XYZ'
    });
    console.log('Error from invalid type insert:', err2 ? err2.message : 'SUCCESS');

    // Check if 'username' or 'registration_number' have unique constraints by trying to duplicate a known one
    // But since the table is empty (verified earlier), let's try to insert two identical ones in a row
    console.log('Testing uniqueness constraints...');
    await supabase.from('profiles').insert({ id: '33333333-3333-3333-3333-333333333333', username: 'duplicate', name: 'Test' });
    const { error: err3 } = await supabase.from('profiles').insert({ id: '44444444-4444-4444-4444-444444444444', username: 'duplicate', name: 'Test' });
    console.log('Duplicate Username Error:', err3 ? err3.message : 'NONE');
}
inspect();
