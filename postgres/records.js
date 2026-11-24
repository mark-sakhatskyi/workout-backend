const express = require('express');
const { id, transaction } = require('../db');
const { bad, day, str, record, choice, dateRange, cardioTypes } = require('./validation');
const tables = new Set(['workouts','meals','cardio','comments','news']);
const tableName = t => { if (!tables.has(t)) throw new Error('Unknown table'); return t; };
const unpack = r => ({ ...r.payload, _id: r.id, userId: r.user_id, date: r.date });
const projection = 'id, user_id, day::text AS date, payload';
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
async function list(db, table, userId, query = {}, exactDay = null) {
    tableName(table);
    const [from,to] = dateRange(query);
    const type = table === 'cardio' && query.type !== undefined ? choice(query.type,'type',cardioTypes) : null;
    if (table !== 'news' && !userId) throw new Error('Missing record owner');
    const values = [userId || null, from, to, exactDay, type];
    const result = await db.query(
        'SELECT ' + projection + ' FROM ' + table +
        ' WHERE ($1::text IS NULL OR user_id = $1) AND ($2::date IS NULL OR day >= $2) AND ($3::date IS NULL OR day <= $3) AND ($4::date IS NULL OR day = $4) AND ($5::text IS NULL OR payload->>\'type\' = $5) ORDER BY day DESC, payload->>\'createdAt\' DESC NULLS LAST, id', values);
    return result.rows.map(unpack);
}
function stats(sessions) {
    const result = { totalSessions:sessions.length,totalDuration:0,totalDistance:0,totalCalories:0,avgHeartRate:0,avgPace:0,avgSpeed:0,byType:{} };
    let hrTime=0, hrSum=0, paceTime=0, paceDistance=0, speedTime=0, speedSum=0;
    for (const s of sessions) {
        const duration = Number(s.duration)||0, distance=Number(s.distance)||0, calories=Number(s.calories)||0;
        result.totalDuration+=duration; result.totalDistance+=distance; result.totalCalories+=calories;
        if (s.avgHeartRate>0 && duration>0) { hrTime+=duration; hrSum+=s.avgHeartRate*duration; }
        if (s.avgPace>0 && distance>0) { paceTime+=s.avgPace*distance; paceDistance+=distance; }
        if (s.avgSpeed>0 && duration>0) { speedTime+=duration; speedSum+=s.avgSpeed*duration; }
        const type = cardioTypes.includes(s.type) ? s.type : 'other';
        const b = result.byType[type] ||= {count:0,duration:0,distance:0,calories:0};
        b.count++;b.duration+=duration;b.distance+=distance;b.calories+=calories;
    }
    result.avgHeartRate=hrTime?Math.round(hrSum/hrTime):0;
    result.avgPace=paceDistance?Math.round(paceTime/paceDistance*100)/100:0;
    result.avgSpeed=speedTime?Math.round(speedSum/speedTime*100)/100:0;
    return result;
}
function routerFor(pool, auth, table) {
    tableName(table);
    const router=express.Router();
    if (table !== 'news') router.use(auth);
    router.get('/',wrap(async(req,res)=>res.json(await list(pool,table,req.userId,req.query))));
    if (table === 'meals' || table === 'comments') router.get('/by-date',wrap(async(req,res)=>res.json(await list(pool,table,req.userId,{},day(req.query.date)))));
    if (table === 'cardio') {
        router.get('/stats',wrap(async(req,res)=>res.json(stats(await list(pool,table,req.userId,req.query)))));
        router.get('/:id',wrap(async(req,res)=>{
            const r=await pool.query('SELECT '+projection+' FROM cardio WHERE id=$1 AND user_id=$2',[req.params.id,req.userId]);
            return r.rowCount?res.json(unpack(r.rows[0])):res.status(404).json({message:'Record not found'});
        }));
    }
    if (table === 'news') router.get('/:date',wrap(async(req,res)=>{
        const items=await list(pool,table,null,{},day(req.params.date));
        return items.length?res.json(items[0]):res.status(404).json({message:'Record not found'});
    }));
    const writeAuth=table==='news'?[auth]:[];
    router.post('/',...writeAuth,wrap(async(req,res)=>{
        const data=record(table,req.body);
        const recordId=req.body._id===undefined?id():str(req.body._id,'id',100);
        const now=new Date().toISOString();data.createdAt=now;data.updatedAt=now;
        if(table==='news')data.author=req.user.profile.name;
        const r=await pool.query('INSERT INTO '+table+' (id,user_id,day,payload) VALUES ($1,$2,$3,$4) RETURNING '+projection,[recordId,req.userId,data.date,JSON.stringify(data)]);
        const item=unpack(r.rows[0]);
        return res.status(201).json(table==='news'?{message:'News added',news:item}:item);
    }));
    router.put('/:id',...writeAuth,wrap(async(req,res)=>{
        const updated=await transaction(pool,async db=>{
            const r=await db.query('SELECT '+projection+' FROM '+table+' WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.userId]);
            if(!r.rowCount)return null;
            const old=r.rows[0];const data=record(table,req.body,{...old.payload,date:old.date});
            data.updatedAt=new Date().toISOString();
            const saved=await db.query('UPDATE '+table+' SET day=$3,payload=$4 WHERE id=$1 AND user_id=$2 RETURNING '+projection,[req.params.id,req.userId,data.date,JSON.stringify(data)]);
            return unpack(saved.rows[0]);
        });
        return updated?res.json(table==='news'?{message:'News updated',news:updated}:updated):res.status(404).json({message:'Record not found'});
    }));
    router.delete('/:id',...writeAuth,wrap(async(req,res)=>{
        const result=await pool.query('DELETE FROM '+table+' WHERE id=$1 AND user_id=$2 RETURNING '+projection,[req.params.id,req.userId]);
        if(!result.rowCount)return res.status(404).json({message:'Record not found'});
        return res.json({message:'Record deleted',...(table==='cardio'?{cardio:unpack(result.rows[0])}:{})});
    }));
    return router;
}
module.exports={routerFor,stats,wrap,list};
