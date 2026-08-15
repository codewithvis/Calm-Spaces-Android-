const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    console.log('--- Testing ENUM Case Sensitivity ---');

    const variants = ['STUDENT', 'student', 'Student'];

    for (const v of variants) {
        console.log(`Testing variant: "${v}"`);
        const { error } = await supabase.from('profiles').insert({
            id: '00000000-0000-0000-0000-000000000' + Math.floor(Math.random()*999),
            type: v,
            name: 'Test'
        });

        if (error) {
            console.log(`Result for "${v}": ${error.message}`);
            if (error.message.includes('invalid input value for enum')) {
                console.log(`❌ "${v}" is NOT a valid enum value.`);
            } else if (error.message.includes('row-level security')) {
                console.log(`✅ "${v}" seems VALID (stopped by RLS, not by Type error).`);
            }
        } else {
            console.log(`✅ SUCCESS for "${v}"`);
        }
    }
}
test();
