async function testNoCORS() {
    try {
        const body = new URLSearchParams();
        body.append('chat_id', '123');
        body.append('text', 'hi');

        const res = await fetch('https://api.telegram.org/bot123456:ABC/sendMessage', {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });
        console.log("Status:", res.status);
    } catch (e) {
         console.error(e);
    }
}
testNoCORS();
