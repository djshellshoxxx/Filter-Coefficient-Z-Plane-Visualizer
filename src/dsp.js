// Complex arithmetic and digital filter design. All coefficient arrays use a0 = 1.
// Prototype algorithms adapted from SciPy (BSD-3-Clause); see ../THIRD_PARTY_NOTICES.md.
export const C=(re=0,im=0)=>({re,im});
export const add=(a,b)=>C(a.re+b.re,a.im+b.im);
export const sub=(a,b)=>C(a.re-b.re,a.im-b.im);
export const mul=(a,b)=>C(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
export const div=(a,b)=>{const d=b.re*b.re+b.im*b.im;return C((a.re*b.re+a.im*b.im)/d,(a.im*b.re-a.re*b.im)/d)};
export const scale=(a,k)=>C(a.re*k,a.im*k);
export const abs=a=>Math.hypot(a.re,a.im);
export const conj=a=>C(a.re,-a.im);
const product=xs=>xs.reduce(mul,C(1));
const neg=a=>scale(a,-1);
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const defaults={family:'butter',type:'lowpass',order:4,fc:2400,fs:48000,rp:1,rs:60,q:0.70710678,gain:0,taps:31,topology:'tdf2',precision:'float32'};

// Complete elliptic integral via the arithmetic-geometric mean.
function ellipticK(m,complement=false){let a=1,b=Math.sqrt(complement?m:1-m);for(let i=0;i<40;i++){const c=(a+b)/2;b=Math.sqrt(a*b);a=c;if(Math.abs(a-b)<1e-15*a)break}return Math.PI/(2*a)}
function jacobi(u,m){
  const a=[1],c=[Math.sqrt(m)];let b=Math.sqrt(1-m),n=0,pow=1;
  while(Math.abs(c[n]/a[n])>1e-14&&n<30){const old=a[n];n++;c[n]=(old-b)/2;a[n]=(old+b)/2;b=Math.sqrt(old*b);pow*=2}
  let phi=pow*a[n]*u;
  while(n>0){phi=(phi+Math.asin(clamp(c[n]*Math.sin(phi)/a[n],-1,1)))/2;n--}
  const sn=Math.sin(phi);return [sn,Math.cos(phi),Math.sqrt(1-m*sn*sn)];
}
function integral(f,a,b,tol=1e-12){
  const sim=(a,b,fa,fm,fb)=>(b-a)*(fa+4*fm+fb)/6;
  function rec(a,b,fa,fm,fb,whole,tol,d){const mid=(a+b)/2,l=f((a+mid)/2),r=f((mid+b)/2),left=sim(a,mid,fa,l,fm),right=sim(mid,b,fm,r,fb),delta=left+right-whole;if(d===0||Math.abs(delta)<15*tol)return left+right+delta/15;return rec(a,mid,fa,l,fm,left,tol/2,d-1)+rec(mid,b,fm,r,fb,right,tol/2,d-1)}
  const fa=f(a),fm=f((a+b)/2),fb=f(b);return rec(a,b,fa,fm,fb,sim(a,b,fa,fm,fb),tol,20);
}

export function prototype(family,n,rp,rs){
  let z=[],p=[];
  if(family==='ellip'){
    const eps2=Math.expm1(Math.LN10*rp/10),eps=Math.sqrt(eps2),m1=eps2/Math.expm1(Math.LN10*rs/10);
    const k1=ellipticK(m1),q=Math.exp(-Math.PI*ellipticK(m1,true)/k1/n);
    let num=0,den=1;for(let j=0;j<30;j++)num+=q**(j*(j+1));for(let j=1;j<30;j++)den+=2*q**(j*j);
    const m=16*q*(num/den)**4,K=ellipticK(m);
    const r=integral(t=>1/Math.sqrt(1-(1-m1)*Math.sin(t)**2),0,Math.atan(1/eps));
    const [sv,cv,dv]=jacobi(K*r/(n*k1),1-m);
    for(let j=1-n%2;j<n;j+=2){const [s,c,d]=jacobi(j*K/n,m);if(Math.abs(s)>1e-12){const zero=C(0,1/(Math.sqrt(m)*s));z.push(zero,conj(zero))}const pole=C(-c*d*sv*cv/(1-(d*sv)**2),-s*dv/(1-(d*sv)**2));p.push(pole);if(Math.abs(pole.im)>1e-12)p.push(conj(pole))}
  }else{
    const mu=family==='cheby1'?Math.asinh(1/Math.sqrt(10**(rp/10)-1))/n:family==='cheby2'?Math.asinh(Math.sqrt(10**(rs/10)-1))/n:0;
    for(let j=0;j<n;j++){
      const theta=Math.PI*(-n+1+2*j)/(2*n);
      if(family==='butter')p.push(C(-Math.cos(theta),-Math.sin(theta)));
      else {const pole=C(-Math.sinh(mu)*Math.cos(theta),-Math.cosh(mu)*Math.sin(theta));p.push(family==='cheby2'?div(C(1),pole):pole);if(family==='cheby2'&&Math.abs(Math.sin(theta))>1e-12)z.push(C(0,1/Math.sin(theta)))}
    }
  }
  let k=div(product(p.map(neg)),product(z.map(neg))).re;
  if((family==='cheby1'||family==='ellip')&&n%2===0)k*=10**(-rp/20);
  return {z,p,k};
}

export function polynomial(roots){
  const factors=pairs(roots).map(pair=>{if(pair.length===1){if(Math.abs(pair[0].im)>1e-8)throw Error('Roots must be real or conjugate pairs.');return [1,-pair[0].re]}const sum=add(...pair),prod=mul(...pair);if(Math.abs(sum.im)>1e-7||Math.abs(prod.im)>1e-7)throw Error('Roots must be real or conjugate pairs.');return [1,-sum.re,prod.re]});
  // Greedy factor ordering limits intermediate coefficient growth for long FIRs.
  let out=[1];while(factors.length){let best=Infinity,index=0,next;factors.forEach((f,i)=>{const a=convolve(out,f),norm=Math.max(...a.map(Math.abs));if(norm<best){best=norm;index=i;next=a}});out=next;factors.splice(index,1)}return out;
}
export function convolve(a,b){const out=Array(a.length+b.length-1).fill(0);a.forEach((x,i)=>b.forEach((y,j)=>out[i+j]+=x*y));return out}
export function quadratic(a,b,c){if(Math.abs(a)<1e-20)return Math.abs(b)<1e-20?[]:[C(-c/b)];const d=b*b-4*a*c;return d>=0?[C((-b+Math.sqrt(d))/(2*a)),C((-b-Math.sqrt(d))/(2*a))]:[C(-b/(2*a),Math.sqrt(-d)/(2*a)),C(-b/(2*a),-Math.sqrt(-d)/(2*a))]}
function pairs(roots){const remaining=roots.map(x=>({...x})),out=[];while(remaining.length){const r=remaining.shift();if(!remaining.length){out.push([r]);break}let i=0;if(Math.abs(r.im)>1e-8){let best=Infinity;remaining.forEach((x,j)=>{const d=abs(sub(x,conj(r)));if(d<best){best=d;i=j}})}else{i=remaining.findIndex(x=>Math.abs(x.im)<1e-8);if(i<0){out.push([r]);continue}}out.push([r,remaining.splice(i,1)[0]])}return out}
export function toSOS(z,p,k){const pp=pairs(p).sort((a,b)=>abs(a[0])-abs(b[0])),zz=pairs(z);const count=Math.max(pp.length,zz.length,1),gain=Math.abs(k)**(1/count);return Array.from({length:count},(_,i)=>{const b=polynomial(zz[i]||[]),a=polynomial(pp[i]||[]);while(b.length<3)b.push(0);while(a.length<3)a.push(0);return {b:b.map(x=>x*gain*(i===0&&k<0?-1:1)),a}})}
export function fromRoots(z,p,k,fs){const sos=toSOS(z,p,k);return {z,p,k,sos,b:polynomial(z).map(x=>x*k),a:polynomial(p),fs,kind:'iir'}}

// Aberth-Ehrlich simultaneous roots, used for the FIR visualizer only.
export function roots(coeff){
  let a=coeff.slice();while(a.length>1&&Math.abs(a[0])<1e-16)a.shift();const n=a.length-1;if(n===0)return [];if(n===1)return [C(-a[1]/a[0])];if(n===2)return quadratic(...a);
  a=a.map(x=>x/a[0]);let z=Array.from({length:n},(_,i)=>{const t=2*Math.PI*(i+0.37)/n;return C(1.02*Math.cos(t),1.02*Math.sin(t))});
  for(let iter=0;iter<1500;iter++){let max=0;const next=z.map((r,i)=>{let f=C(a[0]),df=C();for(let j=1;j<a.length;j++){df=add(mul(df,r),f);f=add(mul(f,r),C(a[j]))}let delta=div(f,df),sum=C();z.forEach((s,j)=>{if(i!==j)sum=add(sum,div(C(1),sub(r,s)))});delta=div(delta,sub(C(1),mul(delta,sum)));max=Math.max(max,abs(delta));return sub(r,delta)});z=next;if(max<1e-11)break}
  // Force numerically conjugate solutions into exact real-coefficient pairs.
  const out=[];while(z.length){const r=z.shift();if(Math.abs(r.im)<1e-7){out.push(C(r.re));continue}let best=Infinity,idx=0;z.forEach((s,i)=>{const d=abs(sub(s,conj(r)));if(d<best){best=d;idx=i}});const s=z.splice(idx,1)[0];if(!s)throw Error('FIR root solver did not converge');const v=C((r.re+s.re)/2,(Math.abs(r.im)+Math.abs(s.im))/2);out.push(v,conj(v))}return out;
}

export function design(raw){
  const o={...defaults,...raw};
  if(!['butter','cheby1','cheby2','ellip','svf','fir'].includes(o.family))throw Error('Unknown filter family');
  if(!Number.isFinite(o.fs)||o.fs<8000||o.fs>192000||!Number.isFinite(o.fc)||o.fc<10||o.fc>=o.fs/2)throw Error('Cutoff must be between 10 Hz and Nyquist');
  if(!['lowpass','highpass','bandpass','notch'].includes(o.type))throw Error('Unknown response type');
  if(![2,4,6,8].includes(o.order)||o.rp<0.1||o.rp>3||o.rs<20||o.rs>100||o.q<0.1||o.q>20||Math.abs(o.gain)>24)throw Error('Filter parameter out of range');
  if(o.family!=='svf'&&!['lowpass','highpass'].includes(o.type))throw Error('Band-pass and notch are available in SVF mode');
  const amplitude=10**(o.gain/20);
  if(o.family==='fir'){
    if(![15,31,63].includes(o.taps))throw Error('FIR length must be 15, 31, or 63');
    const mid=(o.taps-1)/2,w=2*Math.PI*o.fc/o.fs;
    let b=Array.from({length:o.taps},(_,i)=>{const x=i-mid;let v=x===0?w/Math.PI:Math.sin(w*x)/(Math.PI*x);if(o.type==='highpass')v=(x===0?1:0)-v;return v*(0.54-0.46*Math.cos(2*Math.PI*i/(o.taps-1)))});
    const norm=b.reduce((s,x,i)=>s+x*(o.type==='highpass'?(-1)**i:1),0);b=b.map(x=>x*amplitude/Math.abs(norm));
    const delay=b.findIndex(x=>Math.abs(x)>=1e-16),z=roots(b);return {kind:'fir',z,p:[],k:b[delay],delay,b,a:[1],sos:[],fs:o.fs};
  }
  if(o.family==='svf'){
    const g=Math.tan(Math.PI*o.fc/o.fs),r=1/o.q,d=1+r*g+g*g;
    const a=[1,2*(g*g-1)/d,(1-r*g+g*g)/d];
    const nums={lowpass:[g*g,2*g*g,g*g],highpass:[1,-2,1],bandpass:[r*g,0,-r*g],notch:[1+g*g,2*(g*g-1),1+g*g]};
    const b=nums[o.type].map(x=>x/d*amplitude),p=quadratic(...a),z=quadratic(...b);
    return {kind:'iir',z,p,k:b[0],sos:[{b,a}],b,a,fs:o.fs};
  }
  let {z,p,k}=prototype(o.family,o.order,o.rp,o.rs);
  const wo=2*o.fs*Math.tan(Math.PI*o.fc/o.fs),degree=p.length-z.length;
  if(o.type==='highpass'){
    k*=div(product(z.map(neg)),product(p.map(neg))).re;
    z=z.map(v=>div(C(wo),v));p=p.map(v=>div(C(wo),v));for(let i=0;i<degree;i++)z.push(C());
  }else{z=z.map(v=>scale(v,wo));p=p.map(v=>scale(v,wo));k*=wo**degree}
  const fs2=C(2*o.fs);k*=div(product(z.map(v=>sub(fs2,v))),product(p.map(v=>sub(fs2,v)))).re;
  z=z.map(v=>div(add(fs2,v),sub(fs2,v)));p=p.map(v=>div(add(fs2,v),sub(fs2,v)));while(z.length<p.length)z.push(C(-1));
  return fromRoots(z,p,k*amplitude,o.fs);
}

function evalPoly(a,w){let s=C();a.forEach((x,i)=>{s=add(s,C(x*Math.cos(w*i),-x*Math.sin(w*i)))});return s}
export function at(model,f){const w=2*Math.PI*f/model.fs;if(model.kind==='fir')return evalPoly(model.b,w);return model.sos.reduce((v,s)=>mul(v,div(evalPoly(s.b,w),evalPoly(s.a,w))),C(1))}
export function response(model,n=640){let previous=0,offset=0;const max=Math.min(20000,model.fs*0.499);return Array.from({length:n},(_,i)=>{const f=20*(max/20)**(i/(n-1)),h=at(model,f),angle=Math.atan2(h.im,h.re);if(i){const delta=angle-previous;if(delta>Math.PI)offset-=2*Math.PI;if(delta<-Math.PI)offset+=2*Math.PI}previous=angle;return {f,db:20*Math.log10(Math.max(abs(h),1e-15)),phase:angle+offset}})}
export function simulate(model,input,topology='tdf2'){
  if(model.kind==='fir')return input.map((_,i)=>model.b.reduce((s,b,j)=>s+(i>=j?b*input[i-j]:0),0));
  let out=input.slice();for(const {b,a} of model.sos){let s0=0,s1=0,x1=0,x2=0,y1=0,y2=0;out=out.map(x=>{let y;if(topology==='df1'){y=b[0]*x+b[1]*x1+b[2]*x2-a[1]*y1-a[2]*y2;x2=x1;x1=x;y2=y1;y1=y}else if(topology==='df2'){const v=x-a[1]*s0-a[2]*s1;y=b[0]*v+b[1]*s0+b[2]*s1;s1=s0;s0=v}else{y=b[0]*x+s0;s0=b[1]*x-a[1]*y+s1;s1=b[2]*x-a[2]*y}return y})}return out;
}
export function stability(model){const radius=Math.max(0,...model.p.map(abs));return {radius,margin:1-radius,stable:radius<1}}
export function quantize(model,mode){const fn=mode==='float32'?Math.fround:mode==='q14'?x=>clamp(Math.round(x*16384),-32768,32767)/16384:x=>x;const copy=structuredClone(model);copy.b=copy.b.map(fn);copy.a=copy.a.map(fn);copy.sos=copy.sos.map(s=>({b:s.b.map(fn),a:s.a.map(fn)}));if(copy.kind==='iir')copy.p=copy.sos.flatMap(s=>quadratic(...s.a));return copy}
export function moveRoot(model,kind,index,value){
  const list=model[kind].map(v=>({...v})),old=list[index];
  if(Math.abs(old.im)<1e-8)value.im=0;
  else {const mate=list.findIndex((v,i)=>i!==index&&abs(sub(v,conj(old)))<1e-6);if(mate<0)throw Error('Conjugate root missing');list[mate]=conj(value)}
  list[index]=value;const z=kind==='z'?list:model.z,p=kind==='p'?list:model.p;
  if(model.kind==='fir'){const b=[...Array(model.delay||0).fill(0),...polynomial(z).map(x=>x*model.k)];return {...model,z,b}}
  return fromRoots(z,p,model.k,model.fs);
}
