// Every screenshot of the blueprint: where to go, what to click first, and which parts get a numbered mark.
// Texts are the English ones; in the Arabic dashboard they are matched through the translation.
const modal = { sel: '.sheet-col' };

module.exports = [
    /* ---------------- 1. Getting started ---------------- */
    { id: 'register', url: '/register', role: 'none', marks: [
        { n: 1, sel: '#reg-name', up: '.auth-field' }, { n: 2, sel: '#reg-company', up: '.auth-field' }, { n: 3, sel: '#reg-phone', up: '.auth-field' },
        { n: 4, sel: '#reg-email', up: '.auth-field' }, { n: 5, sel: '#reg-password', up: '.auth-field' }, { n: 6, sel: '.auth-submit' }] },
    { id: 'locked', url: '/locked', role: 'locked', clip: { sel: '.auth-card', pad: 24 }, marks: [
        { n: 1, sel: '.rev-steps' }, { n: 2, sel: '.auth-actions .lp-btn-primary' }, { n: 3, sel: '.auth-actions .lp-btn-ghost' }] },
    { id: 'login', url: '/login', role: 'none', clip: { sel: '.auth-card', pad: 24 }, marks: [
        { n: 1, sel: '#login-email', up: '.auth-field' }, { n: 2, sel: '#login-password', up: '.auth-field' }, { n: 3, sel: '.auth-submit' }] },
    { id: 'overview', url: '/app', h: 860, marks: [
        { n: 1, sel: 'aside nav' }, { n: 2, sel: '.app-lang-btn' }, { n: 3, text: '30d', up: 'div', upN: 0 }, { n: 4, text: 'New booking', tag: 'button' },
        { n: 5, sel: '.kpis', nth: 0 }, { n: 6, text: 'Needs your attention', up: '.panel' }] },

    /* settings */
    { id: 'settings-profile', url: '/app/settings', h: 900, marks: [
        { n: 1, text: 'General Profile', tag: 'button' }, { n: 2, text: 'Branding', tag: 'button' }, { n: 3, text: 'Working Hours', tag: 'button' },
        { n: 4, text: 'Drivers', tag: 'button' }, { n: 5, text: 'Team Members', tag: 'button' }, { n: 6, text: 'Save Changes', tag: 'button' }] },
    { id: 'settings-branding', url: '/app/settings', h: 900, steps: [{ click: { text: 'Branding', tag: 'button' } }], marks: [
        { n: 1, text: 'Upload logo', tag: 'button' }, { n: 2, text: 'Ready-made palettes', up: 'div' }, { n: 3, text: 'Preview', upN: 1 }] },
    { id: 'settings-hours', url: '/app/settings', h: 900, steps: [{ click: { text: 'Working Hours', tag: 'button' } }], marks: [] },
    { id: 'business', url: '/app/business', h: 900, marks: [
        { n: 1, text: 'Legal business name', upN: 1 }, { n: 2, text: 'Invoice prefix', upN: 1 }, { n: 3, text: 'Minimum notice (hours)', upN: 1 }, { n: 4, text: 'Save changes', tag: 'button' }] },

    /* services, resources */
    { id: 'services', url: '/app/services', marks: [
        { n: 1, text: 'Add service', tag: 'button' }, { n: 2, text: 'Copy link', tag: 'button' }, { n: 3, text: 'Share on WhatsApp', tag: 'button' }] },
    { id: 'service-form', url: '/app/services', steps: [{ click: { text: 'Add service', tag: 'button' } },
        { set: [{ sel: '.sheet-col input', nth: 0 }, 'Sofa Cleaning'] }, { set: [{ sel: '.sheet-col input[type=number]', nth: 0 }, '180'] }], marks: [
        { n: 1, sel: '.sheet-col .fld', nth: 0 }, { n: 2, sel: '.sheet-col .fld', nth: 2 }, { n: 3, sel: '.sheet-col .fld', nth: 3 }, { n: 4, sel: '.sheet-col input[type=checkbox]', upN: 1 }, { n: 5, sel: '.sheet-col button[type=submit]' }] },
    { id: 'resources-zones', url: '/app/resources', marks: [
        { n: 1, text: 'Zones', tag: 'button' }, { n: 2, text: 'Accommodations', tag: 'button' }, { n: 3, text: 'Vehicles', tag: 'button' }, { n: 4, text: 'Supplies', tag: 'button' }, { n: 5, text: 'Add zone', tag: 'button' }] },
    { id: 'resources-supplies', url: '/app/resources', steps: [{ click: { text: 'Supplies', tag: 'button' } }], marks: [{ n: 1, text: 'Add item', tag: 'button' }, { n: 2, sel: 'main table' }] },

    /* team */
    { id: 'cleaners', url: '/app/staff', h: 860, marks: [
        { n: 1, text: 'Add Cleaner', tag: 'button' }, { n: 2, sel: 'main input[type=search], main input[placeholder]', nth: 0 }, { n: 3, text: 'Documents', tag: 'button' }] },
    { id: 'cleaner-form', url: '/app/staff', steps: [{ click: { text: 'Add Cleaner', tag: 'button' } }], marks: [
        { n: 1, text: 'Upload photo (optional)', upN: 1 }, { n: 2, sel: 'form input[type=text]', nth: 0 }, { n: 3, sel: 'form input[type=tel]' }, { n: 4, sel: 'form select' }] },
    { id: 'documents', url: '/app/staff', steps: [{ click: { text: 'Documents', tag: 'button' } }], marks: [
        { n: 1, sel: '.sheet-col select' }, { n: 2, sel: '.sheet-col input[type=date]' }, { n: 3, text: 'Photo or PDF', tag: 'button' }, { n: 4, text: 'Save document', tag: 'button' }, { n: 5, text: 'Expiring soon', tag: 'span' }] },
    { id: 'drivers-settings', url: '/app/settings', h: 860, steps: [{ click: { text: 'Drivers', tag: 'button' } }], marks: [
        { n: 1, text: 'Driver login page', up: 'section, .panel', upN: 0 }, { n: 2, text: 'Copy link', tag: 'button' }, { n: 3, text: 'Add driver', tag: 'button' }, { n: 4, text: 'Set password', tag: 'button' }] },
    { id: 'team-members', url: '/app/settings', steps: [{ click: { text: 'Team Members', tag: 'button' } }], marks: [{ n: 1, text: 'Add Member', tag: 'button' }, { n: 2, sel: 'main table' }] },

    /* ---------------- 2. From order to review ---------------- */
    { id: 'store-service', url: '/store/{co}', role: 'none', mobile: true, w: 390, h: 844, scale: 2, marks: [
        { n: 1, sel: '.st-lang' }, { n: 2, sel: '.st-steps' }, { n: 3, sel: '.st-svc', nth: 0 }] },
    { id: 'store-time', url: '/store/{co}', role: 'none', mobile: true, w: 390, h: 844, scale: 2, steps: [
        { js: "document.querySelectorAll('.st-svc')[0].click()" }, { js: "[...document.querySelectorAll('.st-card')].find(c => !c.disabled).click()" },
        { js: "const d=[...document.querySelectorAll('.st-day')].filter(x=>!x.disabled&&x.textContent); (d[1]||d[0]).click();" }],
        scrollTop: 470, marks: [{ n: 1, sel: '.st-cal' }, { n: 2, sel: '.st-times' }] },
    { id: 'requests', url: '/app/bookings', h: 900, marks: [
        { n: 1, text: 'Accept', tag: 'button', up: '.panel' }, { n: 2, text: 'Accept', tag: 'button' }, { n: 3, text: 'Decline', tag: 'button' }, { n: 4, text: 'New Booking', tag: 'button' }] },
    { id: 'booking-form', url: '/app/bookings', h: 900, steps: [{ click: { text: 'New Booking', tag: 'button' } }], marks: [
        { n: 1, sel: 'form select', nth: 0 }, { n: 2, sel: 'form select', nth: 1 }, { n: 3, sel: 'form select', nth: 2 }, { n: 4, sel: 'form input[type=date]' }] },
    { id: 'calendar', url: '/app/bookings', h: 900, scrollTop: 700, marks: [{ n: 1, text: 'Layla Hassan', nth: 1, upN: 2 }, { n: 2, text: 'Omar Saleh', upN: 2 }, { n: 3, text: 'Today', tag: 'span', upN: 1 }] },
    { id: 'dispatch', url: '/app/dispatch', h: 900, marks: [
        { n: 1, sel: 'main input[type=date]' }, { n: 2, text: 'Unassigned', tag: 'h3', up: '.panel' }, { n: 3, text: 'Maria Santos', tag: 'h3', up: '.panel' }] },
    { id: 'job', url: '/app/dispatch', h: 1500, clip: { sel: '.sheet-col', pad: 14 }, steps: [{ js: "[...document.querySelectorAll('main button')].find(b=>/John Miller/.test(b.textContent)).click()" }], marks: [
        { n: 1, sel: '.sheet-col select', nth: 0 }, { n: 2, sel: '.sheet-col select', nth: 1 }, { n: 3, sel: '.sheet-col input[type=checkbox]', upN: 2 }, { n: 4, text: 'Before photos', upN: 2 }, { n: 5, text: 'Start job', tag: 'button' }, { n: 6, text: 'Supplies used', upN: 1 }] },
    { id: 'drivers-board', url: '/app/drivers', h: 900, marks: [
        { n: 1, text: 'Copy driver login link', tag: 'button' }, { n: 2, text: 'Assign all', tag: 'button' }, { n: 3, sel: 'main select', nth: 0 }] },
    { id: 'driver-app', url: '/app/drivers', mobile: true, w: 390, h: 844, scale: 2, steps: [
        { js: "const all = [...document.querySelectorAll('main *')].filter(e => /John Miller/.test(e.textContent) && e.querySelector('select') && e.querySelector('button')); all.sort((a, b) => a.textContent.length - b.textContent.length); const row = all[0]; [...row.querySelectorAll('button')].pop().click();" },
        { js: "const db = JSON.parse(localStorage.getItem('cleancrm_mock_db')); const me = JSON.parse(localStorage.getItem('cleancrm_session')); const d = db.users.find(u => u.companyId === me.companyId && u.role === 'driver'); localStorage.setItem('cleancrm_session', JSON.stringify(d)); localStorage.setItem('cb_driver_company', me.companyId);", go: '/driver' }],
        marks: [] },
    { id: 'invoice-new', url: '/app/invoices', h: 900, steps: [{ click: { text: 'New invoice', tag: 'button' } }, { set: [{ sel: '.sheet-col select', nth: 0 }, 'Fatima'] }], marks: [
        { n: 1, sel: '.sheet-col select', nth: 0 }, { n: 2, sel: '.sheet-col input[type=checkbox]', upN: 1 }, { n: 3, text: 'Create and send', tag: 'button' }] },
    { id: 'invoice', url: '/app/invoices', h: 1250, clip: { sel: '.sheet-col', pad: 14 }, steps: [{ js: "document.querySelector('main tbody tr').click()" }], marks: [
        { n: 1, sel: '.sheet-col table', nth: 0 }, { n: 2, text: 'Record payment', tag: 'button' }, { n: 3, text: 'WhatsApp', tag: 'button' }, { n: 4, text: 'Print', tag: 'button' }] },
    { id: 'reviews-ask', url: '/app/quality', h: 1000, steps: [{ click: { text: 'Reviews', tag: 'button' } }], marks: [
        { n: 1, text: 'Ask for reviews', tag: 'button' }, { n: 2, text: 'Send on WhatsApp', tag: 'button' }, { n: 3, text: 'Published', tag: 'button' }] },
    { id: 'complaints', url: '/app/quality', marks: [{ n: 1, text: 'Log complaint', tag: 'button' }, { n: 2, text: 'Resolve', tag: 'button' }] },

    /* ---------------- 3. The other modules ---------------- */
    { id: 'clients', url: '/app/clients', marks: [{ n: 1, text: 'Add Client', tag: 'button' }] },
    { id: 'sales', url: '/app/sales', h: 860, marks: [{ n: 1, text: 'Leads', tag: 'button' }, { n: 2, text: 'Quotes', tag: 'button' }, { n: 3, text: 'Promotions', tag: 'button' }, { n: 4, text: 'Add lead', tag: 'button' }] },
    { id: 'subscriptions', url: '/app/subscriptions', h: 900, marks: [{ n: 1, text: 'New subscription', tag: 'button' }, { n: 2, text: 'Payments', tag: 'button' }, { n: 3, text: 'Templates', tag: 'button' }, { n: 4, sel: 'main table' }] },
    { id: 'team-hub', url: '/app/team', h: 860, marks: [{ n: 1, text: 'Attendance', tag: 'button' }, { n: 2, text: 'Leave', tag: 'button' }, { n: 3, text: 'Payroll', tag: 'button' }, { n: 4, text: 'Check in now', tag: 'button' }] },
    { id: 'payroll', url: '/app/team', h: 900, steps: [{ click: { text: 'Payroll', tag: 'button' } }], marks: [{ n: 1, text: 'Generate payroll', tag: 'button' }, { n: 2, text: 'Mark paid', tag: 'button' }, { n: 3, text: 'Pay terms', upN: 1 }] },
    { id: 'expenses', url: '/app/expenses', marks: [{ n: 1, text: 'Add expense', tag: 'button' }, { n: 2, text: 'By category', up: '.panel' }] },
    { id: 'reports', url: '/app/reports', h: 860, marks: [{ n: 1, text: 'Revenue', tag: 'button' }, { n: 2, text: 'Export CSV', tag: 'button' }] },
    { id: 'activity', url: '/app/activity', marks: [{ n: 1, text: 'Export CSV', tag: 'button' }] },
];
