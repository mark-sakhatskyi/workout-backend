const fields=['weight','neck','chest','waist','hips','biceps','forearm','bmi','bodyFat','subcutaneousFat','visceralFat','bodyWater','muscleMass','boneMass','bmr','metabolicAge'];
const sorted = history => [...(history || [])].sort((a,b)=>new Date(b.date)-new Date(a.date));
function latestMetrics(history){
    const entries=sorted(history), result={};
    for(const k of fields){const row=entries.find(m=>m[k]!=null&&m[k]!==''&&m[k]!==0);if(row)result[k]=row[k];}
    return result;
}
function metricChanges(history, input){
    if(!Array.isArray(input)||input.length>1||input.some(m=>!m||typeof m!=='object'||Array.isArray(m)))throw Object.assign(new Error('Invalid body metrics'),{status:400});
    const current=latestMetrics(history), result={};
    for(const k of fields){
        const v=input[0]?.[k];
        if(v==null||v==='')continue;
        const max=['bodyFat','subcutaneousFat','bodyWater'].includes(k)?100:100000;
        if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)throw Object.assign(new Error('Invalid body metrics'),{status:400});
        if(v!==0&&v!==current[k])result[k]=v;
    }
    return result;
}
module.exports={latestMetrics,metricChanges,sorted};
