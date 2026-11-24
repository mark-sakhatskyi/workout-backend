require('dotenv').config();
const { makePool, schema } = require('./index');
(async () => { const pool = makePool(); try { await schema(pool); console.log('Schema initialized'); } finally { await pool.end(); } })()
    .catch(err => { console.error('Schema setup failed:', err.code || err.name); process.exitCode = 1; });
