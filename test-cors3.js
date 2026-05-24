async function testCORS() {
    try {
        const res = await fetch('https://api.telegram.org/bot1234/sendMessage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({chat_id: '123', text: 'hi'})
        });
        console.log("Status:", res.status);
        console.log("CORS headers:", res.headers.get('access-control-allow-origin'));
        let txt = await res.text();
        console.log(txt)
    } catch (e) {
         console.error(e);
    }
}
testCORS();
