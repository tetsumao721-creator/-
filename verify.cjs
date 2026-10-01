const assert=require('node:assert/strict');const c=require('./dist/app.js');
const initial=c.evaluate(c.defaults);assert.equal(initial.risk,'high');assert.equal(initial.dew.toFixed(1),'14.4');assert.equal(initial.warming,6.4);
assert.equal(c.evaluate({fruit:20,air:20,humidity:100}).risk,'high');
assert.equal(c.evaluate({fruit:21.9,air:20,humidity:100}).risk,'caution');
assert.equal(c.evaluate({fruit:22,air:20,humidity:100}).risk,'low');
assert.equal(c.evaluate({fruit:22,air:20,humidity:100}).warming,0);
for(let air=-10;air<=50;air+=5)for(let humidity=1;humidity<=100;humidity++){const r=c.evaluate({fruit:10,air,humidity});assert(Number.isFinite(r.dew));assert(r.dew<=air+1e-10);assert(r.warming>=0);}
for(const bad of [NaN,Infinity,-11,51,'10',null])assert.throws(()=>c.evaluate({...c.defaults,fruit:bad}),RangeError);
assert.throws(()=>c.evaluate({...c.defaults,humidity:0}),RangeError);assert.throws(()=>c.evaluate({...c.defaults,humidity:101}),RangeError);
console.log('PASS: 初期値、境界、入力異常、1300条件の計算確認');

