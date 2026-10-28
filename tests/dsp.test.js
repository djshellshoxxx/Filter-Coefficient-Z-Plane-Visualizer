import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as dsp from '../src/dsp.js';
import {pack,unpack,encode,decode} from '../src/session.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures.json',import.meta.url)));
for(const fixture of fixtures)test('SciPy reference '+JSON.stringify(fixture.params),()=>{
  const model=dsp.design(fixture.params);assert(dsp.stability(model).stable);
  fixture.f.forEach((f,i)=>{const h=dsp.at(model,f),err=Math.hypot(h.re-fixture.real[i],h.im-fixture.imag[i]);assert(err<2e-7,`Complex response mismatch at ${f} Hz: ${err}`)});
  for(const topology of ['df1','df2','tdf2']){const impulse=dsp.simulate(model,Array.from({length:64},(_,i)=>i===0?1:0),topology);impulse.forEach((v,i)=>assert(Math.abs(v-fixture.impulse[i])<1e-7,`${topology} impulse[${i}]: ${v} vs ${fixture.impulse[i]}`))}
  if(model.kind==='fir') {const b=dsp.polynomial(model.z).map(x=>x*model.k);assert(b.length===model.b.length);assert(Math.max(...b.map((x,i)=>Math.abs(x-model.b[i])))<2e-5,'FIR root reconstruction')}
});
test('SVF response identities and cutoff prewarping',()=>{for(const fs of [22050,48000,96000])for(const fc of [100,3000,fs*.4]){const lp=dsp.design({family:'svf',type:'lowpass',fs,fc}),hp=dsp.design({family:'svf',type:'highpass',fs,fc}),bp=dsp.design({family:'svf',type:'bandpass',fs,fc}),notch=dsp.design({family:'svf',type:'notch',fs,fc});assert(Math.abs(dsp.abs(dsp.at(lp,fc))-Math.SQRT1_2)<1e-8);assert(Math.abs(dsp.abs(dsp.at(hp,fc))-Math.SQRT1_2)<1e-8);assert(Math.abs(dsp.abs(dsp.at(bp,fc))-1)<1e-10);assert(dsp.abs(dsp.at(notch,fc))<1e-10)}});
test('Real coefficients and conjugacy survive root edits',()=>{let m=dsp.design({});m=dsp.moveRoot(m,'p',0,dsp.C(.8,.3));assert(m.p.some(v=>v.re===.8&&v.im===-.3));assert(m.a.every(Number.isFinite));assert(dsp.stability(m).stable);m=dsp.moveRoot(m,'p',0,dsp.C(1.1,.3));assert(!dsp.stability(m).stable)});
test('Q2.14 saturation and marginal pole stability',()=>{const q=dsp.quantize(dsp.design({gain:24}),'q14');assert(q.sos.flatMap(s=>s.b).every(v=>v>=-2&&v<2));assert.equal(dsp.stability({p:[dsp.C(1)]}).stable,false)});
test('JSON and URL sessions round-trip and reject malformed data',()=>{const params={...dsp.defaults},m=dsp.moveRoot(dsp.design(params),'p',0,dsp.C(.7,.2));const data=pack(params,m,true),loaded=decode(encode(data));assert.deepEqual(loaded.model.p,m.p);assert.deepEqual(loaded.params,params);assert.throws(()=>unpack({version:2}));assert.throws(()=>unpack({...data,params:{...params,fc:24000}}));assert.throws(()=>unpack({...data,custom:{...data.custom,p:[dsp.C(NaN)]}}));assert.throws(()=>unpack({...data,custom:{...data.custom,p:[dsp.C(.2,.5)]}}))});
test('512-sample step equals accumulated impulse',()=>{const m=dsp.design({family:'ellip',order:8});const h=dsp.simulate(m,Array.from({length:512},(_,i)=>i===0?1:0)),s=dsp.simulate(m,Array(512).fill(1));let sum=0;h.forEach((v,i)=>{sum+=v;assert(Math.abs(sum-s[i])<1e-11)})});
