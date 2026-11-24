const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const { OAuth2Client }=require('google-auth-library');
const { id, transaction }=require('../db');
const { bad, object, str, num, day, choice, metricFields }=require('./validation');
const { wrap }=require('./records');
const { estimateMacros }=require('../services/macroEstimator');
const limit=require('../middleware/rateLimit');
const publicUser=r=>({id:r.id,_id:r.id,name:r.profile.name,email:r.email,avatar:r.profile.avatar||''});
const token=r=>jwt.sign({userId:r.id,tokenVersion:r.token_version},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'7d'});
const email=v=>{const s=str(v,'email',254);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw bad('Invalid email');return s;};
const pass=v=>{if(typeof v!=='string'||v.length<6||Buffer.byteLength(v)>72)throw bad('Invalid password');return v;};
async function metrics(db,userId) {
    const r=await db.query('SELECT id, measured_at, payload FROM body_metrics WHERE user_id=$1 ORDER BY measured_at DESC,id DESC',[userId]);
    return r.rows.map(x=>({...x.payload,_id:x.id,date:x.measured_at.toISOString()}));
}
function latestMetrics(history) {
    const out={};for(const field of metricFields) {
        const value=history.find(x=>x[field]!=null&&x[field]!==0)?.[field];if(value!==undefined)out[field]=value;
    }return out;
}
async function profile(db,r,history) {
    const m=history||await metrics(db,r.id);
    // Explicit allowlist; never send password, Google ID, token version or raw document.
    const p={...publicUser(r)};
    for(const k of ['birthDate','height','gender','activityLevel','jobType','workoutsPerWeek','dailyActivity','isOnline']) if(r.profile[k]!==undefined)p[k]=r.profile[k];
    return {...p,bodyMetrics:m.slice(0,5),latestBodyMetrics:latestMetrics(m)};
}
function authFor(pool) {
    return wrap(async(req,res,next)=>{
        const match=/^Bearer ([^\s]+)$/i.exec(req.headers.authorization||'');
        if(!match)return res.status(401).json({message:'Unauthorized'});
        let decoded;
        try {decoded=jwt.verify(match[1],process.env.JWT_SECRET,{algorithms:['HS256']});if(typeof decoded.userId!=='string')throw Error();}
        catch{return res.status(401).json({message:'Invalid token'});}
        const r=(await pool.query('SELECT id,email,token_version,profile FROM users WHERE id=$1',[decoded.userId])).rows[0];
        if(!r||r.token_version!==(decoded.tokenVersion??0))return res.status(401).json({message:'Invalid token'});
        req.userId=r.id;req.user=r;next();
    });
}
function authRouter(pool,auth) {
    const router=express.Router(), throttle=limit(), google=new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    router.post('/register',throttle,wrap(async(req,res)=>{
        const name=str(req.body.name,'name',100), mail=email(req.body.email), password=pass(req.body.password);
        const hash=await bcrypt.hash(password,12);
        const p={name,authProvider:'local',isOnline:true,jobType:'desk',workoutsPerWeek:3,dailyActivity:'medium',activityLevel:'moderate'};
        const r=(await pool.query('INSERT INTO users(id,email,password_hash,profile) VALUES($1,$2,$3,$4) RETURNING *',[id(),mail,hash,JSON.stringify(p)])).rows[0];
        res.status(201).json({token:token(r),user:publicUser(r)});
    }));
    router.post('/login',throttle,wrap(async(req,res)=>{
        const mail=email(req.body.email), password=req.body.password;
        if(typeof password!=='string'||Buffer.byteLength(password)>72)throw bad('Invalid credentials');
        const r=(await pool.query('SELECT * FROM users WHERE email=$1',[mail])).rows[0];
        if(!r?.password_hash||!(await bcrypt.compare(password,r.password_hash)))return res.status(401).json({message:'Invalid credentials'});
        await pool.query("UPDATE users SET profile=profile || '{\"isOnline\":true}'::jsonb WHERE id=$1",[r.id]);
        res.json({token:token(r),user:publicUser(r)});
    }));
    router.post('/google',throttle,wrap(async(req,res)=>{
        if(!process.env.GOOGLE_CLIENT_ID)return res.status(503).json({message:'Google authentication disabled'});
        let p;try{const t=await google.verifyIdToken({idToken:str(req.body.credential,'credential',8192),audience:process.env.GOOGLE_CLIENT_ID});p=t.getPayload();}catch{return res.status(401).json({message:'Invalid Google credentials'});}
        if(!p?.email_verified||!p.sub||!p.email)return res.status(401).json({message:'Invalid Google credentials'});
        let r=(await pool.query('SELECT * FROM users WHERE google_id=$1',[p.sub])).rows[0];
        if(!r){
            if((await pool.query('SELECT 1 FROM users WHERE email=$1',[p.email])).rowCount)return res.status(409).json({message:'Google account linking requires explicit verification'});
            r=(await pool.query('INSERT INTO users(id,email,google_id,profile) VALUES($1,$2,$3,$4) RETURNING *',[id(),email(p.email),p.sub,JSON.stringify({name:p.name||p.email.split('@')[0],avatar:p.picture||'',authProvider:'google',isOnline:true,jobType:'desk',workoutsPerWeek:3,dailyActivity:'medium'})])).rows[0];
        }
        res.json({token:token(r),user:publicUser(r)});
    }));
    router.get('/profile',auth,wrap(async(req,res)=>res.json(await profile(pool,req.user))));
    router.get('/body-metrics-history',auth,wrap(async(req,res)=>res.json((await metrics(pool,req.userId)).reverse())));
    router.get('/allUsers',auth,(req,res)=>res.status(403).json({message:'User directory disabled'}));
    router.post('/logout',auth,wrap(async(req,res)=>{
        await pool.query("UPDATE users SET token_version=token_version+1, profile=profile || '{\"isOnline\":false}'::jsonb WHERE id=$1",[req.userId]);
        res.json({message:'Logout successful'});
    }));
    router.put('/profile',auth,wrap(async(req,res)=>{
        const result=await transaction(pool,async db=>{
            const user=(await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.userId])).rows[0];
            const input=req.body;if(!object(input))throw bad('Invalid profile');
            const p={...user.profile};
            if(input.name!==undefined)p.name=str(input.name,'name',100);
            if(input.birthDate!==undefined)p.birthDate=input.birthDate?day(input.birthDate):'';
            if(input.height!==undefined)p.height=input.height===null?null:num(input.height,'height',1,300);
            if(input.gender!==undefined)p.gender=choice(input.gender,'gender',['male','female','other']);
            if(input.jobType!==undefined)p.jobType=choice(input.jobType,'jobType',['desk','standing','physical']);
            if(input.workoutsPerWeek!==undefined)p.workoutsPerWeek=num(input.workoutsPerWeek,'workoutsPerWeek',0,7,true);
            if(input.dailyActivity!==undefined)p.dailyActivity=choice(input.dailyActivity,'dailyActivity',['low','medium','high']);
            if(input.activityLevel!==undefined)p.activityLevel=choice(input.activityLevel,'activityLevel',['sedentary','light','moderate','active','very_active']);
            let history=await metrics(db,user.id), last=latestMetrics(history);
            if(input.bodyMetrics!==undefined) {
                if(!Array.isArray(input.bodyMetrics)||input.bodyMetrics.length>1||input.bodyMetrics.some(x=>!object(x)))throw bad('Invalid body metrics');
                const m=input.bodyMetrics[0]||{}, delta={};
                for(const k of metricFields)if(m[k]!==undefined&&m[k]!==null&&m[k]!==''){
                    const value=num(m[k],k,0,['bodyFat','bodyWater','subcutaneousFat'].includes(k)?100:100000);
                    if(value!==last[k])delta[k]=value;
                }
                if(Object.keys(delta).length){
                    await db.query('INSERT INTO body_metrics(id,user_id,measured_at,payload) VALUES($1,$2,now(),$3)',[id(),user.id,JSON.stringify(delta)]);
                    history=await metrics(db,user.id);
                }
            }
            const updated=(await db.query('UPDATE users SET profile=$2 WHERE id=$1 RETURNING *',[user.id,JSON.stringify(p)])).rows[0];
            const response=await profile(db,updated,history);
            const goal=(await db.query('SELECT payload FROM goals WHERE user_id=$1',[user.id])).rows[0];
            if(goal){
                const macro=estimateMacros({...p,bodyMetrics:history},goal.payload);
                if(macro.calories&&macro.protein)response._macroRecalc={method:macro.method,goalDirection:macro.goalDirection,targetCaloriesPerDay:macro.calories,targetProteinPerDay:macro.protein,tdee:macro.tdee,calorieAdjustment:macro.calorieAdjustment};
            }
            return response;
        });
        res.json(result);
    }));
    return router;
}
module.exports={authFor,authRouter,metrics,latestMetrics};
