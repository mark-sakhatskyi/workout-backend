// Run against a quiesced source and a dedicated, empty PostgreSQL database.
// Default is dry-run; --apply performs an atomic import, never deletes source data.
require('dotenv').config();
const mongoose=require('mongoose');
const {makePool,schema,transaction}=require('../db');
const {validDate}=require('../middleware/validation');
const models={users:require('../models/User'),workouts:require('../models/Workout'),meals:require('../models/Meal'),cardio:require('../models/Cardio'),comments:require('../models/Comment'),goals:require('../models/Goal'),news:require('../models/News')};
const tables=['users','body_metrics','workouts','meals','cardio','comments','goals','news'];
const plain=x=>JSON.parse(JSON.stringify(x));
const key=x=>{if(x==null||String(x)==='')throw new Error('Missing source identifier');return String(x);};
async function run(){
    if(!process.env.MONGO_URI||!process.env.DATABASE_URL)throw new Error('MONGO_URI and DATABASE_URL required');
    const apply=process.argv.includes('--apply');
    if(apply&&process.env.CONFIRM_MONGO_READ_ONLY_WINDOW!=='1')throw new Error('Freeze source writes and set CONFIRM_MONGO_READ_ONLY_WINDOW=1');
    const pool=makePool();
    try{
        await mongoose.connect(process.env.MONGO_URI);
        if(apply)await schema(pool);
        const counts={};const src=mongoose.connection.db;
        for(const [table,model] of Object.entries(models))counts[table]=await src.collection(model.collection.name).countDocuments({});
        counts.body_metrics = (await src.collection(models.users.collection.name).aggregate([{ $project: { n: { $size: { $ifNull: ['$bodyMetrics', []] } } } }, { $group: { _id: null, n: { $sum: '$n' } } }]).toArray())[0]?.n ?? 0;
        console.log('Source document counts:',JSON.stringify(counts));
        if(!apply){console.log('Dry-run only: source counts read; no rows or schema written. Use --apply after backup and write freeze.');return;}
        await transaction(pool,async db=>{
            await db.query("SELECT pg_advisory_xact_lock(hashtext('workout-mongo-v1'))");
            for(const t of tables){const r=await db.query('SELECT count(*)::int AS n FROM '+t);if(r.rows[0].n!==0)throw new Error('Target must be empty: '+t);}
            const imported={...Object.fromEntries(tables.map(t=>[t,0]))};
            for await(const doc of src.collection(models.users.collection.name).find({})){
                const {_id,email,password,googleId,tokenVersion,bodyMetrics,...profile}=plain(doc);
                await db.query('INSERT INTO users(id,email,password_hash,google_id,token_version,profile) VALUES($1,$2,$3,$4,$5,$6)',[key(_id),email,password||null,googleId||null,tokenVersion??0,JSON.stringify(profile)]);
                imported.users++;
                for(const [i,m] of (bodyMetrics||[]).entries()){
                    const {_id:metricId,date,...payload}=m;
                    if(!date||Number.isNaN(Date.parse(date)))throw new Error('Invalid legacy metric date');
                    await db.query('INSERT INTO body_metrics(id,user_id,measured_at,payload) VALUES($1,$2,$3,$4)',[metricId?key(metricId):key(_id)+':'+i,key(_id),date,JSON.stringify(payload)]);
                    imported.body_metrics++;
                }
            }
            for(const table of ['workouts','meals','cardio','comments','goals','news']){
                for await(const doc of src.collection(models[table].collection.name).find({})){
                    const {_id,userId,date,...payload}=plain(doc);
                    if(table==='goals'){
                        // Retain legacy calculated fields for audit, never treat as manual overrides.
                        if(date!==undefined)payload.date=date;
                        await db.query('INSERT INTO goals(id,user_id,payload) VALUES($1,$2,$3)',[key(_id),key(userId),JSON.stringify(payload)]);
                    }else{
                        if(!validDate(date))throw new Error('Invalid legacy day in '+table);
                        await db.query('INSERT INTO '+table+'(id,user_id,day,payload) VALUES($1,$2,$3,$4)',[key(_id),key(userId),date,JSON.stringify(payload)]);
                    }imported[table]++;
                }
            }
            for(const [table,model] of Object.entries(models)){
                const after=await src.collection(model.collection.name).countDocuments({});
                if(imported[table]!==counts[table]||after!==counts[table])throw new Error('Source count changed: '+table);
            }
            const metricsAfter = (await src.collection(models.users.collection.name).aggregate([{ $project: { n: { $size: { $ifNull: ['$bodyMetrics', []] } } } }, { $group: { _id: null, n: { $sum: '$n' } } }]).toArray())[0]?.n ?? 0;
            if(imported.body_metrics!==counts.body_metrics||metricsAfter!==counts.body_metrics)throw new Error('Source metric count changed');
            for(const t of tables){const r=await db.query('SELECT count(*)::int AS n FROM '+t);if(r.rows[0].n!==imported[t])throw new Error('Target count mismatch: '+t);}
            await db.query("INSERT INTO migration_runs(name,counts) VALUES('mongo-v1',$1)",[JSON.stringify(imported)]);
            console.log('Verified imported counts:',JSON.stringify(imported));
        });
        console.log('Migration committed. MongoDB remains unchanged. Legacy AI responses remain only in the Mongo backup.');
    }finally{await mongoose.disconnect();await pool.end();}
}
run().catch(err=>{console.error('Migration failed:',err.code||err.message);process.exitCode=1;});
