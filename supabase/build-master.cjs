// Rebuilds supabase/MASTER_SETUP.sql from the migration files, in order.
//   Run:  node supabase/build-master.cjs
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'migrations');
const parts = fs.readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
const line = '-- ---------------------------------------------------------------------------\n';
let out = `-- ============================================================================
-- CleanBase MASTER SETUP
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- Safe to run more than once.
-- ============================================================================

`;
parts.forEach((p, i) => {
    out += `${line}-- PART: ${p}\n${line}`;
    out += fs.readFileSync(path.join(dir, p), 'utf8').replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
    if (i < parts.length - 1) out += '\n';
});
fs.writeFileSync(path.join(__dirname, 'MASTER_SETUP.sql'), out);
console.log(`MASTER_SETUP.sql built from ${parts.length} files: ${parts.join(', ')}`);
