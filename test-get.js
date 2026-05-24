async function testGET() {
    try {
        const res = await fetch('https://api.telegram.org/bot123456:ABC/sendMessage?chat_id=123&text=hi');
        console.log("Status:", res.status);
    } catch (e) {
         console.error(e);
    }
}
testGET();
