const { validDate } = require('../middleware/validation');
const bad = message => Object.assign(new Error(message), { status: 400 });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function str(v, key, max = 255) {
    if (typeof v !== 'string' || !v.trim() || v.length > max) throw bad('Invalid ' + key);
    return v.trim();
}
function num(v, key, min = 0, max = 1000000, integer = false) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) throw bad('Invalid ' + key);
    return v;
}
function day(v) { if (!validDate(v)) throw bad('Invalid date'); return v; }
function optionalText(v, key, max = 2000) { if (typeof v !== 'string' || v.length > max) throw bad('Invalid ' + key); return v.trim(); }
function choice(v, key, values) { if (!values.includes(v)) throw bad('Invalid ' + key); return v; }
function dateRange(q) {
    let from = q.startDate, to = q.endDate;
    if (from !== undefined) day(from);
    if (to !== undefined) day(to);
    if (from && to && from > to) throw bad('Invalid date range');
    return [from || null, to || null];
}
const metricFields = ['weight','neck','chest','waist','hips','biceps','forearm','bmi','bodyFat','subcutaneousFat','visceralFat','bodyWater','muscleMass','boneMass','bmr','metabolicAge'];
const cardioTypes = ['running','cycling','swimming','walking','rowing','elliptical','stair_climber','jump_rope','hiking','other'];
function record(table, input, previous = {}) {
    if (!object(input)) throw bad('Invalid data');
    const x = { ...previous };
    const set = (key, f, required = false, defaultValue) => {
        if (Object.hasOwn(input, key)) x[key] = f(input[key], key);
        else if (x[key] === undefined && defaultValue !== undefined) x[key] = defaultValue;
        else if (required && x[key] === undefined) throw bad('Missing ' + key);
    };
    set('date', day, true);
    if (table === 'workouts') {
        set('name', str, true); set('weight', num, true);
        set('reps', (v,k)=>num(v,k,1,10000,true), true);
        set('sets', (v,k)=>num(v,k,1,10000,true), true);
        set('difficulty', (v,k)=>choice(v,k,['easy','hard','']), false, '');
    }
    if (table === 'meals') {
        set('name', str, true);
        for (const k of ['calories','protein','fats','carbs']) set(k,num,true);
        set('grams', (v,k)=>num(v,k,0.001),false,100);
    }
    if (table === 'comments') set('text', (v,k)=>str(v,k,10000), true);
    if (table === 'news') { set('title',str,true); set('text',(v,k)=>str(v,k,10000),true); }
    if (table === 'cardio') {
        set('type',(v,k)=>choice(v,k,cardioTypes),true);
        set('duration',(v,k)=>num(v,k,0.001,100000),true);
        for (const k of ['distance','avgHeartRate','maxHeartRate','calories','avgPace','avgSpeed']) set(k,(v,key)=>v === null ? null : num(v,key));
        set('elevation',(v,k)=>v === null ? null : num(v,k,-100000,100000));
        set('notes',optionalText);
        if (x.type === 'other') set('customType',str,true); else delete x.customType;
        if (x.avgHeartRate != null && x.maxHeartRate != null && x.avgHeartRate > x.maxHeartRate) throw bad('Average heart rate exceeds maximum');
    }
    return x;
}
module.exports = { bad, object, str, num, day, optionalText, choice, dateRange, record, metricFields, cardioTypes };
