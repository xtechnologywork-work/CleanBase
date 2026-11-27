// Takes every screenshot of the blueprint from the demo app (http://localhost:5174, demo mode) with the test company's data,
// and writes where each numbered mark goes. Nothing is changed in the user's own browser: a copy of the data is used.
//   node docs/blueprint/tools/capture.cjs ar            (all shots)
//   node docs/blueprint/tools/capture.cjs ar overview   (only shots whose id contains "overview")
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp.cjs');
const SHOTS = require('./shots.cjs');

const LANG = process.argv[2] || 'ar';
const ONLY = process.argv[3] || '';
const BASE = 'http://localhost:5174';
const OUT = path.join(__dirname, '..', 'work', 'shots', LANG);
fs.mkdirSync(OUT, { recursive: true });

/* ---------- the data: a copy of the test company, with a fuller day so the screens look like a real business ---------- */
function prepareStorage() {
    const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'work', 'storage.json'), 'utf8'));
    const db = JSON.parse(s.cleancrm_mock_db);
    const owner = JSON.parse(s.cleancrm_session);
    const co = owner.companyId;
    const svc = n => db.services.find(x => x.companyId === co && x.name === n);
    const cli = n => db.clients.find(x => x.companyId === co && x.name === n);
    const stf = n => db.staff.find(x => x.companyId === co && db.users.find(u => u.id === x.userId)?.name === n);
    const now = new Date().toISOString();
    if (!db.clients.find(c => c.id === 'cl-bp-layla')) {
        db.clients.push({ id: 'cl-bp-layla', companyId: co, name: 'Layla Hassan', phone: '+974 3344 5566', address: 'Al Waab, Street 840, Villa 21', totalSpent: 0, createdAt: now });
        db.clients.push({ id: 'cl-bp-omar', companyId: co, name: 'Omar Saleh', phone: '+974 3355 7788', address: 'The Pearl, Viva Bahriya 9', totalSpent: 0, createdAt: now });
    }
    const today = new Date(); const d = n => { const x = new Date(today); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    const add = (id, client, service, cleaner, date, time, status, pay, extra = {}) => {
        if (db.bookings.find(b => b.id === id)) return;
        const c = client.id ? client : cli(client); const s2 = svc(service);
        db.bookings.push({ id, companyId: co, clientId: c.id, serviceId: s2.id, cleanerId: cleaner ? stf(cleaner).id : undefined, date, time, address: c.address,
            price: s2.price, status, paymentStatus: pay, createdAt: now, ...extra });
    };
    // the screenshots are taken at 09:10 in the morning (see CLOCK), so today's day looks like a real working morning
    db.bookings.filter(b => b.companyId === co && b.date === d(0) && b.time > '17:00' && b.status === 'completed').forEach(b => { b.time = '07:00'; });
    add('bp-1', 'Fatima Al Kuwari', 'Standard Home Cleaning', 'Maria Santos', d(0), '08:00', 'in_progress', 'unpaid');
    add('bp-2', 'John Miller', 'Deep Cleaning', 'Grace Wanjiru', d(0), '12:00', 'confirmed', 'unpaid');
    add('bp-3', { id: 'cl-bp-omar', address: 'The Pearl, Viva Bahriya 9' }, 'Standard Home Cleaning', null, d(0), '15:00', 'confirmed', 'unpaid');
    add('bp-4', { id: 'cl-bp-layla', address: 'Al Waab, Street 840, Villa 21' }, 'Deep Cleaning', 'Grace Wanjiru', d(1), '09:30', 'pending', 'unpaid',
        { source: 'store', notes: 'Two bedrooms and a balcony, please.' });
    add('bp-5', 'Doha Tech Office', 'Office Cleaning', 'Amina Bekele', d(2), '07:30', 'confirmed', 'paid');
    add('bp-6', 'John Miller', 'Standard Home Cleaning', 'Maria Santos', d(3), '10:00', 'confirmed', 'unpaid');
    // a second company that is still waiting for approval, for the "under review" screen
    if (!db.companies.find(c => c.id === 'c-bp-locked')) {
        db.companies.push({ id: 'c-bp-locked', name: 'Golden Home Services', phone: '+97455509876', subscriptionPlan: 'pro', monthlyRevenue: 500, createdAt: now });
        db.users.push({ id: 'u-bp-locked', email: 'sara@goldenhome.qa', password: 'demo', name: 'Sara Hamad', role: 'companyadmin', companyId: 'c-bp-locked', status: 'locked', createdAt: now });
    }
    s.cleancrm_mock_db = JSON.stringify(db);
    const users = Object.fromEntries(db.users.map(u => [u.email, u]));
    const driver = db.users.find(u => u.companyId === co && u.role === 'driver');
    return { storage: s, owner, driver, locked: users['sara@goldenhome.qa'], companyId: co };
}

/* ---------- code that runs in the page: find an element by selector or by its English text (also after translation) ---------- */
const PAGE_HELPERS = `
window.__T = async () => { try { const m = await import('/src/services/dashTranslate.ts'); return s => m.translate(s); } catch { return () => null; } };
window.__find = async (m) => {
    const T = await __T();
    const norm = s => (s || '').replace(/\\s+/g, ' ').trim();
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    let els = [];
    const scope = m.within ? (await __find({ ...m.within, within: undefined })) : document;
    if (!scope) return null;
    if (m.sel) els = [...scope.querySelectorAll(m.sel)].filter(vis);
    if (m.text) {
        const want = [m.text, T(m.text)].filter(Boolean).map(norm);
        const pool = (m.sel ? els : [...scope.querySelectorAll(m.tag || 'button,a,label,h1,h2,h3,h4,th,td,span,div,b,p,li,input,select,textarea,small,strong,summary,option')]).filter(vis);
        const own = e => norm(e.textContent) || norm(e.value) || norm(e.placeholder) || norm(e.getAttribute && e.getAttribute('aria-label'));
        let hit = pool.filter(e => want.includes(own(e)));
        if (!hit.length && !m.exact) hit = pool.filter(e => want.some(w => own(e).startsWith(w)));
        els = hit.filter(e => !hit.some(o => o !== e && e.contains(o)));
    }
    let e = els[m.nth || 0];
    if (!e) return null;
    if (m.up) e = e.closest(m.up) || e;
    for (let i = 0; i < (m.upN || 0); i++) e = e.parentElement || e;
    return e;
};
window.__click = async (m) => { const e = await __find(m); if (!e) throw new Error('click target not found: ' + JSON.stringify(m)); e.scrollIntoView({ block: 'center' }); e.click(); };
window.__set = async (m, v) => { const e = await __find(m); if (!e) throw new Error('field not found: ' + JSON.stringify(m));
    const P = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    if (e.tagName === 'SELECT') { const o = [...e.options].find(o => o.textContent.includes(v)) ; v = o ? o.value : v; }
    Object.getOwnPropertyDescriptor(P, 'value').set.call(e, v); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
window.__rect = async (m) => { const e = await __find(m); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
`;

async function run() {
    const data = prepareStorage();
    const ch = await launch();
    // CLOCK: every page believes it is 09:10 today, whatever time the screenshots are really taken
    const morning = new Date(); morning.setHours(9, 10, 0, 0);
    const offset = morning.getTime() - Date.now();
    await ch.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const R = Date; const off = ${offset}; class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } } D.parse = R.parse; D.UTC = R.UTC; window.Date = D; })();` });
    const results = [];
    try {
        for (const shot of SHOTS) {
            if (ONLY && !shot.id.includes(ONLY)) continue;
            const w = shot.w || 1280, h = shot.h || 800, mobile = !!shot.mobile;
            await ch.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: shot.scale || 2, mobile });
            await ch.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
            await ch.navigate(BASE + '/terms');
            const store = { ...data.storage, cb_dash_lang: LANG, cb_store_lang: LANG, cb_driver_lang: LANG };
            const who = shot.role === 'none' ? null : shot.role === 'driver' ? data.driver : shot.role === 'locked' ? data.locked : data.owner;
            if (who) store.cleancrm_session = JSON.stringify(who); else delete store.cleancrm_session;
            if (shot.role === 'driver') store.cb_driver_company = data.companyId;
            await ch.evaluate(`localStorage.clear(); sessionStorage.clear(); const s = ${JSON.stringify(store)}; for (const k in s) localStorage.setItem(k, s[k]); true`);
            const url = BASE + shot.url.replace('{co}', data.companyId);
            await ch.navigate(url);
            await sleep(shot.wait || 2200);
            await ch.evaluate(PAGE_HELPERS + ';true');
            const note = [];
            try {
                if (shot.steps) for (const st of shot.steps) {
                    if (st.click) await ch.evaluate(`__click(${JSON.stringify(st.click)})`);
                    if (st.set) await ch.evaluate(`__set(${JSON.stringify(st.set[0])}, ${JSON.stringify(st.set[1])})`);
                    if (st.js) await ch.evaluate(`(async () => { ${st.js} })()`);
                    if (st.go) { await ch.navigate(BASE + st.go); await sleep(2200); await ch.evaluate(PAGE_HELPERS + ';true'); }
                    await sleep(st.wait || 700);
                }
            } catch (e) { note.push('step failed: ' + e.message.split('\n')[0]); }
            await sleep(900);                                   // the translation and any animation settle
            // test passwords are never shown, and the local test address is shortened to the part that matters
            const secret = JSON.stringify(data.owner.password || '\u0000');
            await ch.evaluate(`(() => { const pw = ${secret}; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode; if (n.textContent.includes(pw)) n.textContent = n.textContent.split(pw).join('••••••••'); if (n.textContent.includes('http://localhost:5174')) n.textContent = n.textContent.replace(/http:\\/\\/localhost:5174/g, 'https://…'); }
                document.querySelectorAll('input').forEach(i => { if (i.value && i.value.includes('localhost:5174')) i.value = i.value.replace('http://localhost:5174', 'https://…'); }); return true; })()`);
            // notes that only exist in the local demo (not in the real online version) are hidden
            await ch.evaluate(`[...document.querySelectorAll('p,small,span,div')].filter(e => e.children.length === 0 && /demo mode|cloud database|الوضع التجريبي|السحابية/i.test(e.textContent)).forEach(e => { let x = e; for (let i = 0; i < 3 && x.parentElement && !x.parentElement.querySelector('label'); i++) x = x.parentElement; (x.parentElement && x.parentElement.querySelector('label') ? x.parentElement : x).style.display = 'none'; }); true`);
            await ch.evaluate(`(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.appendChild(s); return true; })()`);
            await sleep(200);
            await ch.evaluate(`document.documentElement.style.scrollBehavior = 'auto'; document.body.style.scrollBehavior = 'auto'; document.querySelectorAll('[data-sheet], .sheet').forEach(s => s.scrollTop = 0); (document.querySelector('main') || document.scrollingElement).scrollTop = ${shot.scrollTop || 0}; [...document.querySelectorAll('main, main *')].filter(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight && !e.closest('.sheet')).forEach(e => { e.scrollTop = ${shot.scrollTop || 0}; }); window.scrollTo(0, ${shot.scrollTop || 0}); true`);
            await sleep(300);
            // the area to keep
            let clip = { x: 0, y: 0, w, h };
            if (shot.clip) {
                const r = await ch.evaluate(`__rect(${JSON.stringify(shot.clip)})`);
                if (r) { const p = shot.clip.pad ?? 12; clip = { x: Math.max(0, r.x - p), y: Math.max(0, r.y - p), w: Math.min(w, r.w + 2 * p), h: Math.min(h - Math.max(0, r.y - p), r.h + 2 * p) }; }
                else note.push('clip not found');
            }
            if (shot.box) clip = shot.box;
            // the numbered marks, relative to the kept area
            const marks = [];
            for (const m of shot.marks || []) {
                const r = await ch.evaluate(`__rect(${JSON.stringify(m)})`);
                if (!r) { note.push(`mark ${m.n} not found (${m.text || m.sel})`); continue; }
                marks.push({ n: m.n, shape: m.shape || 'box', x: r.x - clip.x, y: r.y - clip.y, w: r.w, h: r.h, pad: m.pad ?? 4 });
            }
            // the picture is cut in page coordinates, the marks were measured in window coordinates: add the window's scroll
            const sc = await ch.evaluate('({ x: scrollX, y: scrollY })');
            const shotRes = await ch.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, clip: { x: clip.x + sc.x, y: clip.y + sc.y, width: clip.w, height: clip.h, scale: 1 }, captureBeyondViewport: false });
            fs.writeFileSync(path.join(OUT, shot.id + '.jpg'), Buffer.from(shotRes.data, 'base64'));
            // English left on an Arabic screen (people's names, addresses and services are the company's own data and stay as typed)
            if (LANG === 'ar') {
                const left = await ch.evaluate(`(() => { const data = /Pearl|Shine|Youssef|Alami|Maria|Santos|Grace|Wanjiru|Amina|Bekele|Ahmed|Driver|Fatima|Kuwari|John|Miller|Doha|Tech|Office|Sara|Layla|Hassan|Omar|Saleh|Golden|Home|Hamad|Cleaning|Deep|Standard|Sofa|West Bay|Tower|Lusail|Porto|Arabia|Marina|District|Pearl|Viva|Bahriya|Waab|Street|Villa|Wakra|Staff House|Floor|Microfibre|Hind|Thani|Nadia|Qatar|Chem|Woqod|Realty|Toyota|Hiace|Nissan|Urvan|North|South|CleanBase|English|WELCOME|QT-|INV-|CTR-|e\\.g\\.|gmail|bedrooms|balcony|bell|gate|mirror|Excellent|spotless|Client says|Every Tuesday|Steam|Top to bottom|Regular|Full deep|Daily office|Empty property|Family visit|side entrance|eco products|CSV|QAR/i;
                    const out = new Set(); const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                    while (walk.nextNode()) { const t = walk.currentNode.textContent.trim(); const el = walk.currentNode.parentElement; if (!el || !el.offsetParent) continue; const r = el.getBoundingClientRect(); if (r.bottom < ${clip.y} || r.top > ${clip.y + clip.h} || r.right < ${clip.x} || r.left > ${clip.x + clip.w}) continue;
                        if (/[A-Za-z]{3,}/.test(t) && !data.test(t)) out.add(t.slice(0, 60)); }
                    return [...out].slice(0, 12); })()`);
                if (left.length) note.push('english: ' + left.join(' / '));
            }
            const info = { id: shot.id, w: clip.w, h: clip.h, mobile, marks, note };
            fs.writeFileSync(path.join(OUT, shot.id + '.json'), JSON.stringify(info));
            results.push(info);
            console.log(`${shot.id}: ${marks.length}/${(shot.marks || []).length} marks${note.length ? '  !! ' + note.join(' | ') : ''}`);
        }
    } finally { ch.close(); }
    const all = path.join(OUT, '_index.json');
    const prev = fs.existsSync(all) ? JSON.parse(fs.readFileSync(all, 'utf8')) : {};
    results.forEach(r => { prev[r.id] = r; });
    fs.writeFileSync(all, JSON.stringify(prev, null, 1));
}

run().catch(e => { console.error(e); process.exit(1); });
