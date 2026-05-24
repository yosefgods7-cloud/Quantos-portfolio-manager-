async function testCORS() {
    try {
        const res = await fetch('https://api.telegram.org/bot1234/sendMessage', {
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:3000',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            }
        });
        console.log("Status:", res.status);
        console.log("CORS headers:", res.headers.get('access-control-allow-origin'));
    } catch (e) {
         console.error(e);
    }
}
testCORS();
