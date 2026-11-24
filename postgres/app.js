const express=require('express');
const cors=require('cors');
const { authFor,authRouter }=require('./auth');
const { routerFor,wrap }=require('./records');
const goals=require('./goals');
module.exports=function createApp(pool){
    const app=express(),auth=authFor(pool);
    const allowed=new Set((process.env.CORS_ORIGINS||'https://workout-frontend-935r.onrender.com,http://localhost:5173').split(',').map(s=>s.trim()));
    app.disable('x-powered-by');
    if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
    app.use(cors({origin:(origin,cb)=>cb(null,!origin||allowed.has(origin))}));
    app.use(express.json({limit:'128kb'}));
    app.get('/health',wrap(async(req,res)=>{await pool.query('SELECT 1');res.json({status:'ok',database:'postgres'});}));
    app.use('/api/auth',authRouter(pool,auth));
    for(const table of ['workouts','meals','cardio','comments','news'])app.use('/api/'+table,routerFor(pool,auth,table));
    app.use('/api/goals',goals.routerFor(pool,auth));
    app.get('/api/user',auth,(req,res)=>res.status(403).json({message:'User directory disabled'}));
    app.use((req,res)=>res.status(404).json({message:'Not found'}));
    app.use((err,req,res,next)=>{
        if(res.headersSent)return next(err);
        if(err.type==='entity.parse.failed')return res.status(400).json({message:'Invalid JSON'});
        if(err.type==='entity.too.large')return res.status(413).json({message:'Payload too large'});
        if(err.status===400)return res.status(400).json({message:err.message});
        if(err.code==='23505')return res.status(409).json({message:'Duplicate record'});
        if(['23514','22007','22P02','23503'].includes(err.code))return res.status(400).json({message:'Invalid data'});
        console.error('Request failed:',err.code||err.name);
        res.status(500).json({message:'Internal server error'});
    });return app;
};
