async function testCORS() {
    try {
        const res = await fetch('https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage', {
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
