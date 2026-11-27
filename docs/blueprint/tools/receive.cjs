// Receives the demo data (localStorage) posted from the browser and saves it as JSON, then exits.
//   node docs/blueprint/tools/receive.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'work', 'storage.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') { res.end(); return; }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
        JSON.parse(body);
        fs.writeFileSync(out, body);
        res.end('saved ' + body.length);
        console.log('saved', out, body.length);
        setTimeout(() => process.exit(0), 200);
    });
}).listen(5199, '127.0.0.1', () => console.log('listening 5199'));
