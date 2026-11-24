require('dotenv').config();
const {makePool}=require('../db');
const createApp=require('./app');
(async()=>{
    if(!process.env.JWT_SECRET)throw new Error('JWT_SECRET required');
    const pool=makePool();
    try{
        await pool.query('SELECT 1');
        const marker=await pool.query("SELECT 1 FROM migration_runs WHERE name='mongo-v1'");
        if(!marker.rowCount&&process.env.ALLOW_EMPTY_POSTGRES!=='1')throw new Error('Mongo migration not verified; refusing to start');
        const server=createApp(pool).listen(process.env.PORT||4000,()=>console.log('PostgreSQL API ready'));
        const stop=()=>server.close(()=>pool.end().finally(()=>process.exit(0)));
        process.once('SIGTERM',stop);process.once('SIGINT',stop);
    }catch(err){await pool.end();throw err;}
})().catch(err=>{console.error('Startup failed:',err.code||err.message);process.exitCode=1;});
