// Prints the Arabic text the dashboard shows for each English label, so the guide names every button exactly as on screen.
const { launch, sleep } = require('./cdp.cjs');
const LABELS = process.argv.slice(2).join(' ').split('|').map(s => s.trim()).filter(Boolean);
(async () => {
    const ch = await launch(9334);
    try {
        await ch.navigate('http://localhost:5174/terms');
        await ch.evaluate("localStorage.setItem('cb_dash_lang','ar'); true");
        await ch.evaluate(`(async () => { const t = await import('/src/services/dashTranslate.ts'); const r = await import('/src/i18n/ar/index.ts'); r.installArabic(); await new Promise(x => setTimeout(x, 300)); return true; })()`);
        await sleep(500);
        const out = await ch.evaluate(`(async () => { const t = await import('/src/services/dashTranslate.ts'); return ${JSON.stringify(LABELS)}.map(l => l + ' => ' + (t.translate(l) || '??')); })()`);
        console.log(out.join('\n'));
    } finally { ch.close(); }
})();
