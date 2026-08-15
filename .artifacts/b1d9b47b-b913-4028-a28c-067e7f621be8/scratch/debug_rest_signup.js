const fs = require('fs');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));

async function test() {
    const url = `${env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/signup`;
    const timestamp = Date.now();

    console.log('Sending manual REST signup request...');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: `rest_user_${timestamp}@gmail.com`,
                password: `P@ssword_${timestamp}!`,
                data: {
                    name: 'REST Tester'
                }
            })
        });

        console.log('Status:', response.status);
        console.log('Status Text:', response.statusText);

        const body = await response.text();
        console.log('Response Body:', body);

    } catch (err) {
        console.error('Fetch Error:', err.message);
    }
}
test();
