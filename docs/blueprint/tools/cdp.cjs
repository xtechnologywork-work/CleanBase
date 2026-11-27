// A tiny Chrome DevTools Protocol client: start headless Chrome, open a page, send commands.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(port = 9333) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-chrome-'));
    const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
        '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--lang=en-US', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
        try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) break; } catch { /* not up yet */ }
        await sleep(200);
    }
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
    let id = 0;
    const waiting = new Map();
    const listeners = [];
    ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.bad(new Error(m.error.message)) : w.ok(m.result); }
        else if (m.method) listeners.forEach(l => l(m));
    };
    const send = (method, params = {}) => new Promise((ok, bad) => { const i = ++id; waiting.set(i, { ok, bad }); ws.send(JSON.stringify({ id: i, method, params })); });
    const once = name => new Promise(ok => { const l = m => { if (m.method === name) { listeners.splice(listeners.indexOf(l), 1); ok(m.params); } }; listeners.push(l); });
    const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
    };
    const navigate = async (url) => { const loaded = once('Page.loadEventFired'); await send('Page.navigate', { url }); await loaded; };
    await send('Page.enable'); await send('Runtime.enable');
    const close = () => { try { ws.close(); } catch { /* closed */ } proc.kill(); };
    return { send, evaluate, navigate, close, sleep };
}

module.exports = { launch, sleep };
