const { Pool } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomBytes } = require('node:crypto');
const id = () => randomBytes(12).toString('hex');
function makePool() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
    return new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
}
async function transaction(pool, fn) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
    catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
}
async function schema(pool) {
    await transaction(pool, client => client.query(readFileSync(join(__dirname, 'schema.sql'), 'utf8')));
}
module.exports = { makePool, transaction, schema, id };
