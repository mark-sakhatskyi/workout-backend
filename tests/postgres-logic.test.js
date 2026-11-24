const { test }=require('node:test');
const assert=require('node:assert/strict');
const {record,dateRange}=require('../postgres/validation');
const {stats}=require('../postgres/records');
const {goalUpdate}=require('../postgres/goals');
test('rejects invalid calendar dates and negative workout weight',()=>{
    assert.throws(()=>record('workouts',{date:'2026-02-30',name:'Bench',weight:100,reps:1,sets:1}));
    assert.throws(()=>record('workouts',{date:'2026-02-28',name:'Bench',weight:-1,reps:1,sets:1}));
    assert.throws(()=>dateRange({startDate:'2026-02-01',endDate:'2026-01-01'}));
});
test('cardio HR average is duration weighted',()=>{
    assert.equal(stats([{type:'walking',duration:10,avgHeartRate:100},{type:'running',duration:30,avgHeartRate:140}]).avgHeartRate,130);
});
test('manual goals are retained on unrelated updates and clear explicitly',()=>{
    assert.equal(goalUpdate({notes:'hello'},{manualCalories:2400}).manualCalories,2400);
    assert.equal(goalUpdate({manualCalories:null},{manualCalories:2400}).manualCalories,null);
});

const {estimateEffectiveMacros}=require('../services/macroEstimator');
test('explicit direction and macro overrides take priority over legacy data',()=>{
    const result=estimateEffectiveMacros({height:180,bodyMetrics:[{weight:90,date:'2026-11-24'}]}, {goalDirection:'maintain',notes:'cut',manualCalories:2400,manualProtein:170});
    assert.equal(result.goalDirection,'maintain');
    assert.equal(result.calories,2400);
    assert.equal(result.protein,170);
    assert.equal(result.method,'explicit_goal');
    assert.throws(()=>goalUpdate({manualCalories:1000,manualProtein:400},{}));
});
