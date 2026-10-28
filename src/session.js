import {defaults,design,fromRoots,polynomial} from './dsp.js';
export function pack(params,model,custom=false){return {version:1,params,...(custom?{custom:{kind:model.kind,z:model.z,p:model.p,k:model.k}}:{})}}
export function unpack(data){
  if(!data||data.version!==1||!data.params)throw Error('Unsupported design format');
  const params={...defaults};for(const k of Object.keys(defaults))if(k in data.params)params[k]=data.params[k];
  for(const k of ['order','fc','fs','rp','rs','q','gain','taps'])if(typeof params[k]!=='number'||!Number.isFinite(params[k]))throw Error('Invalid parameter: '+k);
  if(!['df1','df2','tdf2'].includes(params.topology)||!['float64','float32','q14'].includes(params.precision))throw Error('Invalid output settings');
  let model=design(params);
  if(data.custom){const {z,p,k,kind}=data.custom;
    if(!['iir','fir'].includes(kind)||kind!==model.kind||!Array.isArray(z)||!Array.isArray(p)||z.length>62||p.length>8||!Number.isFinite(k)||Math.abs(k)>1e12)throw Error('Invalid custom filter');
    for(const v of [...z,...p])if(!v||!Number.isFinite(v.re)||!Number.isFinite(v.im)||Math.abs(v.re)>100||Math.abs(v.im)>100)throw Error('Invalid root');
    polynomial(z);polynomial(p);
    if(kind==='fir'){if(p.length||z.length<1)throw Error('Invalid FIR design');model={...model,z,p,k,b:polynomial(z).map(x=>x*k)}}else {if(p.length<1||z.length>p.length)throw Error('Invalid IIR design');model=fromRoots(z,p,k,params.fs)}
  }
  return {params,model,custom:!!data.custom};
}
export const encode=data=>btoa(JSON.stringify(data));
export function decode(hash){if(hash.length>20000)throw Error('Design link is too long');return unpack(JSON.parse(atob(hash)))}
export function readSaved(){try{return JSON.parse(localStorage.getItem('zlab-designs')||'[]').filter(x=>typeof x.name==='string'&&x.data).slice(0,30)}catch{return []}}
