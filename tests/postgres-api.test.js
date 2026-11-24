const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');

// Explicit disposable test DB only. Never point this test at production.
test('PostgreSQL REST API: auth, ownership, CRUD, goals and revoked JWT',{skip:!process.env.TEST_DATABASE_URL},async t=>{
    process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET='test-only-secret-that-is-not-used-outside-ci';
    const {makePool,schema}=require('../db');
    const createApp=require('../postgres/app');
    const pool=makePool();
    let server;const userIds=[];
    t.after(async()=>{try{for(const id of userIds)await pool.query('DELETE FROM users WHERE id=$1',[id]);}
    finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();}});
    await schema(pool);
    server=await new Promise(resolve=>{const s=createApp(pool).listen(0,'127.0.0.1',()=>resolve(s));});
    const url='http://127.0.0.1:'+server.address().port+'/api';
    const request=async(path,{method='GET',token,body}={})=>{
        const response=await fetch(url+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
        return {status:response.status,data:await response.json()};
    };
    const emailSuffix=randomBytes(8).toString('hex');
    const register=async name=>{const r=await request('/auth/register',{method:'POST',body:{name,email:name+emailSuffix+'@example.test',password:'test-password'}});assert.equal(r.status,201);userIds.push(r.data.user.id);return r.data.token;};
    const a=await register('a'),b=await register('b');
    assert.equal((await request('/user')).status,401);
    assert.equal((await request('/user',{token:a})).status,403);
    assert.equal((await request('/auth/allUsers',{token:a})).status,403);
    assert.equal((await request('/ai',{token:a})).status,404);
    const w=await request('/workouts',{token:a,method:'POST',body:{date:'2026-11-24',name:'Bench',weight:100,reps:8,sets:3}});
    assert.equal(w.status,201);const path='/workouts/'+w.data._id;
    assert.equal((await request('/workouts',{token:b})).data.length,0);
    assert.equal((await request(path,{token:b,method:'PUT',body:{weight:120}})).status,404);
    assert.equal((await request(path,{token:b,method:'DELETE'})).status,404);
    assert.equal((await request(path,{token:a,method:'PUT',body:{weight:110}})).data.weight,110);
    assert.equal((await request('/workouts?startDate=2026-11-25',{token:a})).data.length,0);
    assert.equal((await request('/workouts?startDate=2026-02-30',{token:a})).status,400);
    assert.equal((await request('/workouts',{token:a,method:'POST',body:{date:'2026-11-24',name:'Bench',weight:-1,reps:8,sets:3}})).status,400);
    const meal=await request('/meals',{token:a,method:'POST',body:{date:'2026-11-24',name:'Rice',calories:100,protein:3,fats:1,carbs:20,grams:100}});
    assert.equal(meal.status,201);assert.equal((await request('/meals/by-date?date=2026-11-24',{token:a})).data.length,1);
    const comment=await request('/comments',{token:a,method:'POST',body:{date:'2026-11-24',text:'Test note'}});
    assert.equal(comment.status,201);assert.equal((await request('/comments/by-date?date=2026-11-24',{token:a})).data.length,1);
    const cardio=await request('/cardio',{token:a,method:'POST',body:{date:'2026-11-24',type:'walking',duration:10,avgHeartRate:100}});
    assert.equal(cardio.status,201);
    assert.equal((await request('/cardio',{token:a,method:'POST',body:{date:'2026-11-24',type:'running',duration:30,avgHeartRate:140}})).status,201);
    assert.equal((await request('/cardio/stats',{token:a})).data.avgHeartRate,130);
    assert.equal((await request('/auth/profile',{token:a,method:'PUT',body:{height:180,bodyMetrics:[{weight:90,waist:100}]}})).status,200);
    assert.equal((await request('/auth/profile',{token:a,method:'PUT',body:{bodyMetrics:[{weight:89,waist:100}]}})).status,200);
    const history=(await request('/auth/body-metrics-history',{token:a})).data;
    assert.equal(history.length,2);assert.equal(history[1].weight,89);assert.equal(history[1].waist,undefined);
    const profile=(await request('/auth/profile',{token:a})).data;
    assert.equal(profile.latestBodyMetrics.waist,100);assert.equal(profile.password_hash,undefined);
    const g=await request('/goals',{token:a,method:'PUT',body:{goalDirection:'maintain',manualCalories:2400,manualProtein:180}});
    assert.equal(g.status,200);assert.equal(g.data._macros.calories,2400);
    assert.equal((await request('/goals',{token:a,method:'PUT',body:{notes:'hello'}})).data._macros.protein,180);
    assert.equal((await request(path,{token:a,method:'DELETE'})).status,200);
    assert.equal((await request('/auth/logout',{token:a,method:'POST'})).status,200);
    assert.equal((await request('/auth/profile',{token:a})).status,401);
});
