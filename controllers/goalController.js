const Goal=require('../models/Goal');
const User=require('../models/User');
const {estimateEffectiveMacros}=require('../services/macroEstimator');
const {validDate,fail}=require('../middleware/validation');
const bad=()=>Object.assign(new Error('Invalid goal'),{status:400});
function goalUpdate(body,old={}){
    if(!body||typeof body!=='object'||Array.isArray(body))throw bad();
    const update={};
    const bounds={targetWeight:1000,targetBodyFat:100,targetMuscleMass:1000,targetBmi:200,targetWaterPerDay:30,targetWorkoutsPerWeek:7};
    for(const [k,max] of Object.entries(bounds))if(Object.hasOwn(body,k)){
        const v=body[k];
        if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max||(k==='targetWorkoutsPerWeek'&&!Number.isInteger(v))))throw bad();
        update[k]=v;
    }
    if(Object.hasOwn(body,'goalDirection')){
        if(![null,'cut','gain','maintain'].includes(body.goalDirection))throw bad();
        update.goalDirection=body.goalDirection;
    }
    for(const [k,legacy,max] of [['manualCalories','targetCaloriesPerDay',20000],['manualProtein','targetProteinPerDay',1000]]){
        if(!Object.hasOwn(body,k)&&!Object.hasOwn(body,legacy))continue;
        const v=Object.hasOwn(body,k)?body[k]:body[legacy];
        if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<1||v>max))throw bad();
        update[k]=v;
    }
    const cal=Object.hasOwn(update,'manualCalories')?update.manualCalories:old.manualCalories;
    const protein=Object.hasOwn(update,'manualProtein')?update.manualProtein:old.manualProtein;
    if(cal!=null&&protein!=null&&protein*4>cal)throw bad();
    if(Object.hasOwn(body,'targetDate')){
        if(body.targetDate!==null&&body.targetDate!==''&&!validDate(body.targetDate))throw bad();
        update.targetDate=body.targetDate||null;
    }
    if(Object.hasOwn(body,'notes')){
        if(typeof body.notes!=='string'||body.notes.length>10000)throw bad();
        update.notes=body.notes;
    }
    if(Object.hasOwn(body,'customGoals')){
        if(!Array.isArray(body.customGoals)||body.customGoals.length>100)throw bad();
        update.customGoals=body.customGoals.map(g=>{
            if(!g||typeof g.label!=='string'||!g.label.trim()||g.label.length>255||typeof(g.unit??'')!=='string'||(g.unit??'').length>30)throw bad();
            const item={label:g.label.trim(),unit:g.unit||''};
            for(const k of ['currentValue','targetValue']){
                const v=g[k]??null;if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)))throw bad();item[k]=v;
            }
            if(typeof g._id==='string'&&/^[a-f\d]{24}$/i.test(g._id))item._id=g._id;
            return item;
        });
    }
    return update;
}
async function buildGoalResponse(goal,userId){
    const user=await User.findById(userId).select('bodyMetrics height gender birthDate jobType workoutsPerWeek dailyActivity').lean();
    const macros=estimateEffectiveMacros(user,goal);
    const {calories=null,protein=null,fats=null,carbs=null}=macros;
    return {...goal.toObject(),targetCaloriesPerDay:calories,targetProteinPerDay:protein,_macros:{calories,protein,fats,carbs},_macroMethod:macros.method,_goalDirection:macros.goalDirection,_tdee:macros.tdee,_leanMass:macros.leanMass,_calorieAdjustment:macros.calorieAdjustment};
}
exports.getGoal=async(req,res)=>{
    try{
        const goal=await Goal.findOne({userId:req.userId})||new Goal({userId:req.userId});
        res.json(await buildGoalResponse(goal,req.userId));
    }catch(err){fail(res,err);}
};
exports.upsertGoal=async(req,res)=>{
    try{
        const current=await Goal.findOne({userId:req.userId});
        const update=goalUpdate(req.body,current||{});
        const goal=await Goal.findOneAndUpdate({userId:req.userId},{$set:update},{new:true,upsert:true,setDefaultsOnInsert:true,runValidators:true});
        res.json(await buildGoalResponse(goal,req.userId));
    }catch(err){fail(res,err);}
};
exports.goalUpdate=goalUpdate;
