async function testCORS() {
    try {
        const body = new URLSearchParams();
        body.append('chat_id', '123');
        body.append('text', 'hi');

        const res = await fetch('https://api.telegram.org/bot123456:ABC/sendMessage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
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
