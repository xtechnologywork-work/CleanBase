// Builds the blueprint: puts the numbered marks on every screenshot, numbers the pages, checks that nothing overflows,
// prints the PDF with Chrome and saves a picture of every page for review.
//   node docs/blueprint/tools/build.cjs ar
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp.cjs');

const LANG = process.argv[2] || 'ar';
const DIR = path.join(__dirname, '..');
const WORK = path.join(DIR, 'work');
const SRC = path.join(DIR, 'src', `blueprint-${LANG}.html`);
const SHOTS = path.join(WORK, 'shots', LANG);
const OUT_HTML = path.join(WORK, `blueprint-${LANG}.html`);
const OUT_PDF = path.join(DIR, `CleanBase-Blueprint-V1-${LANG.toUpperCase()}.pdf`);
const PREVIEW = path.join(WORK, 'preview', LANG);

const ACCENT = '#f97316';

/** The screenshot with its marks: a numbered badge on the corner of a rounded frame around each part. */
function figure(id, cls) {
    const info = JSON.parse(fs.readFileSync(path.join(SHOTS, id + '.json'), 'utf8'));
    const { w, h, marks } = info;
    const r = Math.max(11, Math.round(w * 0.0125));
    const sw = Math.max(2.2, w / 360);
    const rtl = LANG === 'ar';
    const parts = marks.map(m => {
        const p = m.pad ?? 4;
        const x = Math.max(1, m.x - p), y = Math.max(1, m.y - p);
        const bw = Math.min(w - x - 1, m.w + 2 * p), bh = Math.min(h - y - 1, m.h + 2 * p);
        // the badge sits on the reading-start corner of the frame, kept inside the picture
        let cx = rtl ? x + bw : x, cy = y;
        cx = Math.min(w - r - 2, Math.max(r + 2, cx)); cy = Math.min(h - r - 2, Math.max(r + 2, cy));
        return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${Math.min(10, bh / 2)}" fill="rgba(249,115,22,.07)" stroke="${ACCENT}" stroke-width="${sw}"/>`
            + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ACCENT}" stroke="#fff" stroke-width="${Math.max(2, r / 5)}"/>`
            + `<text x="${cx}" y="${cy}" dy="0.36em" text-anchor="middle" font-size="${r * 1.15}" font-weight="700" fill="#fff" font-family="Arial, sans-serif">${m.n}</text>`;
    }).join('');
    const phone = info.mobile ? ' phone' : '';
    return `<figure class="shot${phone}${cls ? ' ' + cls : ''}"><div class="frame" style="aspect-ratio:${w}/${h}">`
        + `<img src="shots/${LANG}/${id}.jpg" alt="">`
        + `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${parts}</svg></div></figure>`;
}

async function run() {
    let html = fs.readFileSync(SRC, 'utf8');
    const missing = [];
    html = html.replace(/<figure data-shot="([\w-]+)"(?: data-class="([\w -]+)")?\s*><\/figure>/g, (_m, id, cls) => {
        if (!fs.existsSync(path.join(SHOTS, id + '.json'))) { missing.push(id); return `<p style="color:red">MISSING SHOT ${id}</p>`; }
        return figure(id, cls);
    });
    if (missing.length) console.log('missing shots:', missing.join(', '));
    fs.writeFileSync(OUT_HTML, html);

    const ch = await launch(9335);
    try {
        await ch.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1160, deviceScaleFactor: 1, mobile: false });
        await ch.navigate('file:///' + OUT_HTML.replace(/\\/g, '/'));
        await ch.evaluate('document.fonts.ready.then(() => true)');
        await sleep(1500);
        // page numbers, the contents, and pages whose content does not fit
        const report = await ch.evaluate(`(() => {
            const pages = [...document.querySelectorAll('.page')];
            pages.forEach((p, i) => { const n = p.querySelector('.pno'); if (n) n.textContent = String(i + 1); });
            document.querySelectorAll('[data-ref]').forEach(el => { const t = document.getElementById(el.dataset.ref); el.textContent = t ? String(pages.indexOf(t.closest('.page')) + 1) : '?'; });
            const over = pages.map((p, i) => { const body = p.querySelector('.body') || p; return body.scrollHeight > body.clientHeight + 1 ? (i + 1) + ' (' + (p.id || '') + ') +' + (body.scrollHeight - body.clientHeight) + 'px' : null; }).filter(Boolean);
            const broken = [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src.split('/').pop());
            return { pages: pages.length, over, broken };
        })()`);
        console.log(`pages: ${report.pages}`);
        if (report.over.length) console.log('OVERFLOW:', report.over.join(' | '));
        if (report.broken.length) console.log('BROKEN IMAGES:', report.broken.join(', '));

        // previews of every page
        fs.rmSync(PREVIEW, { recursive: true, force: true }); fs.mkdirSync(PREVIEW, { recursive: true });
        const count = await ch.evaluate(`document.querySelectorAll('.page').length`);
        for (let i = 0; i < count; i++) {
            // bring the page to the top of the window, then take exactly that page
            const r = await ch.evaluate(`(() => { const ps = [...document.querySelectorAll('.page')]; ps.forEach((p, j) => { p.style.display = j === ${i} ? '' : 'none'; }); scrollTo(0, 0); const b = ps[${i}].getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
            await sleep(150);
            const shot = await ch.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.w, height: r.h, scale: 1 } });
            fs.writeFileSync(path.join(PREVIEW, `p${String(i + 1).padStart(2, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
        }
        // the PDF
        await ch.evaluate(`document.querySelectorAll('.page').forEach(p => { p.style.display = ''; }); true`);
        const pdf = await ch.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, displayHeaderFooter: false });
        fs.writeFileSync(OUT_PDF, Buffer.from(pdf.data, 'base64'));
        console.log('pdf:', OUT_PDF, Math.round(fs.statSync(OUT_PDF).size / 1024) + ' KB');
    } finally { ch.close(); }
}

run().catch(e => { console.error(e); process.exit(1); });
