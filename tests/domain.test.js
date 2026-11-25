const {test}=require('node:test');
const assert=require('node:assert/strict');
const {estimateEffectiveMacros}=require('../services/macroEstimator');
const {latestMetrics,metricChanges}=require('../services/bodyMetrics');
const {goalUpdate}=require('../controllers/goalController');
test('manual goals persist through unrelated updates and clear explicitly',()=>{
    assert.deepEqual(goalUpdate({notes:'hello'},{manualCalories:2400}),{notes:'hello'});
    assert.equal(goalUpdate({manualCalories:null},{manualCalories:2400}).manualCalories,null);
    assert.throws(()=>goalUpdate({manualCalories:1000,manualProtein:400}));
    const r=estimateEffectiveMacros({bodyMetrics:[{weight:90,date:'2026-11-24'}]}, {goalDirection:'maintain',notes:'cut',manualCalories:2400,manualProtein:170});
    assert.equal(r.goalDirection,'maintain');assert.equal(r.calories,2400);assert.equal(r.protein,170);
});
test('body metric history stores changed fields only',()=>{
    const history=[{date:'2026-11-23',weight:90,waist:100},{date:'2026-11-24',weight:89}];
    assert.deepEqual(latestMetrics(history),{weight:89,waist:100});
    assert.deepEqual(metricChanges(history,[{weight:88,waist:100}]),{weight:88});
    assert.deepEqual(metricChanges(history,[{weight:89,waist:100}]),{});
    assert.throws(()=>metricChanges(history,[{weight:-1}]));
});
