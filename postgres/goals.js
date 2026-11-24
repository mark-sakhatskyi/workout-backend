const express=require('express');
const { id,transaction }=require('../db');
const { wrap }=require('./records');
const { bad, object, num, day, optionalText, str, choice }=require('./validation');
const { metrics }=require('./auth');
const { estimateEffectiveMacros }=require('../services/macroEstimator');
const defaults={targetWeight:null,targetBodyFat:null,targetMuscleMass:null,targetBmi:null,targetWaterPerDay:null,targetWorkoutsPerWeek:null,targetDate:null,notes:'',customGoals:[],manualCalories:null,manualProtein:null};
const numeric=['targetWeight','targetBodyFat','targetMuscleMass','targetBmi','targetWaterPerDay','targetWorkoutsPerWeek'];
function goalUpdate(body,old) {
    if(!object(body))throw bad('Invalid goal');
    const data={...defaults,...old};
    for(const k of numeric)if(body[k]!==undefined)data[k]=body[k]===null?null:num(body[k],k,0,k==='targetBodyFat'?100:k==='targetWorkoutsPerWeek'?7:10000,k==='targetWorkoutsPerWeek');
    if(body.targetDate!==undefined)data.targetDate=body.targetDate?day(body.targetDate):null;
    if(body.notes!==undefined)data.notes=optionalText(body.notes,'notes',10000);
    if(body.goalDirection!==undefined)data.goalDirection=body.goalDirection===null?null:choice(body.goalDirection,'goalDirection',['cut','gain','maintain']);
    for(const [k,legacy] of [['manualCalories','targetCaloriesPerDay'],['manualProtein','targetProteinPerDay']]){
        const value=Object.hasOwn(body,k)?body[k]:body[legacy];
        if(value!==undefined)data[k]=value===null?null:num(value,k,1,k==='manualCalories'?20000:1000);
    }
    if(data.manualCalories!=null&&data.manualProtein!=null&&data.manualProtein*4>data.manualCalories)throw bad('Protein energy exceeds calorie target');
    if(body.customGoals!==undefined){
        if(!Array.isArray(body.customGoals)||body.customGoals.length>100)throw bad('Invalid custom goals');
        data.customGoals=body.customGoals.map(g=>{if(!object(g))throw bad('Invalid custom goal');return { _id:typeof g._id==='string'?g._id:id(),label:str(g.label,'label'),currentValue:g.currentValue==null?null:num(g.currentValue,'currentValue',-100000),targetValue:g.targetValue==null?null:num(g.targetValue,'targetValue',-100000),unit:optionalText(g.unit||'','unit',30)};});
    }
    return data;
}
async function response(db,user,row){
    const data={...defaults,...row?.payload};
    const history=await metrics(db,user.id);
    const auto=estimateEffectiveMacros({...user.profile,bodyMetrics:history},data);
    const {calories=null,protein=null,fats=null,carbs=null}=auto;
    return {...data,_id:row?.id??null,userId:user.id,targetCaloriesPerDay:calories,targetProteinPerDay:protein,_macros:{calories,protein,fats,carbs},_macroMethod:auto.method,_goalDirection:auto.goalDirection,_tdee:auto.tdee,_leanMass:auto.leanMass,_calorieAdjustment:auto.calorieAdjustment};
}
function routerFor(pool,auth){
    const router=express.Router();router.use(auth);
    router.get('/',wrap(async(req,res)=>{const row=(await pool.query('SELECT * FROM goals WHERE user_id=$1',[req.userId])).rows[0];res.json(await response(pool,req.user,row));}));
    router.put('/',wrap(async(req,res)=>{
        const out=await transaction(pool,async db=>{
            await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.userId]);
            const old=(await db.query('SELECT * FROM goals WHERE user_id=$1',[req.userId])).rows[0];
            const data=goalUpdate(req.body,old?.payload);data.updatedAt=new Date().toISOString();if(!data.createdAt)data.createdAt=data.updatedAt;
            const row=(await db.query('INSERT INTO goals(id,user_id,payload) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET payload=EXCLUDED.payload RETURNING *',[old?.id||id(),req.userId,JSON.stringify(data)])).rows[0];
            return response(db,req.user,row);
        });res.json(out);
    }));
    return router;
}
module.exports={routerFor,goalUpdate};
