import {abs,clamp} from './dsp.js';
const orange='#e77c54',green='#7b9b8d',grid='#edf0e9',text='#a4ada0',mono='9px "IBM Plex Mono", monospace';
function setup(canvas){const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,3);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,r.width,r.height);ctx.font=mono;ctx.lineWidth=1;return {ctx,w:r.width,h:r.height}}
function line(ctx,x1,y1,x2,y2,color=grid,dash=[]){ctx.beginPath();ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([])}
function path(ctx,data,x,y,color,width=1.6,dash=[]){ctx.beginPath();ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;let valid=false;data.forEach((d,i)=>{const xx=x(d,i),yy=y(d,i);if(!Number.isFinite(yy)){valid=false;return}if(valid)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy);valid=true});ctx.stroke();ctx.lineWidth=1;ctx.setLineDash([])}
export function frequency(canvas,data,{phase=true,unit='deg',reference=null,fc=2400,gain=0}={}){
  const {ctx,w,h}=setup(canvas),L=43,R=43,T=21,B=31,W=w-L-R,H=h-T-B,max=data.at(-1).f;
  const ymin=-96,ymax=Math.max(12,Math.ceil((gain+6)/12)*12),x=f=>L+Math.log(f/20)/Math.log(max/20)*W,y=db=>T+(ymax-db)/(ymax-ymin)*H;
  ctx.fillStyle=text;ctx.textAlign='right';for(let v=ymin;v<=ymax;v+=12){line(ctx,L,y(v),w-R,y(v));if(v%24===0||v===ymax)ctx.fillText(v.toString(),L-9,y(v)+3)}
  const ticks=[20,50,100,200,500,1000,2000,5000,10000,20000].filter(f=>f<=max*1.001);
  ctx.textAlign='center';for(const f of ticks){if(W<330&&[50,200,2000,10000].includes(f))continue;line(ctx,x(f),T,x(f),h-B);ctx.fillText(f>=1000?f/1000+'k':f.toString(),x(f),h-B+19)}
  ctx.textAlign='left';ctx.fillText('dB',L-25,11);ctx.textAlign='right';ctx.fillText('Hz',w-R+23,h-B+19);
  const phases=data.map(d=>d.phase*180/Math.PI),pmin=Math.floor(Math.min(...phases)/180)*180,pmax=Math.max(pmin+180,Math.ceil(Math.max(...phases)/180)*180),py=d=>T+(pmax-d.phase*180/Math.PI)/(pmax-pmin)*H;
  if(phase){ctx.fillText(unit==='deg'?'deg':'rad',w-6,11);ctx.textAlign='left';for(let i=0;i<=4;i++){const p=pmax-(pmax-pmin)*i/4;ctx.fillText(unit==='deg'?Math.round(p).toString():(p*Math.PI/180).toFixed(1),w-R+8,T+H*i/4+3)}}
  ctx.save();ctx.beginPath();ctx.rect(L,T,W,H);ctx.clip();
  ctx.beginPath();ctx.moveTo(x(data[0].f),y(ymin));for(const d of data)ctx.lineTo(x(d.f),y(d.db));ctx.lineTo(x(max),y(ymin));ctx.closePath();const grad=ctx.createLinearGradient(0,T,0,h-B);grad.addColorStop(0,'#ed98711c');grad.addColorStop(1,'#ed987103');ctx.fillStyle=grad;ctx.fill();
  if(reference)path(ctx,reference.filter(d=>d.f<=max),d=>x(d.f),d=>y(d.db),'#a5afa4',1.5,[5,4]);
  if(phase)path(ctx,data,d=>x(d.f),py,green,1.4,[5,4]);
  path(ctx,data,d=>x(d.f),d=>y(d.db),orange,2.2);
  if(fc>=20&&fc<=max){line(ctx,x(fc),T,x(fc),h-B,'#e8cabc',[3,4]);ctx.fillStyle='#cb987c';ctx.font='8px "IBM Plex Mono", monospace';ctx.textAlign='center';ctx.fillText((fc>=1000?(fc/1000).toFixed(2)+' kHz':fc+' Hz'),clamp(x(fc),L+32,w-R-32),T+12)}ctx.restore();
  return {L,R,W,max,x};
}
export function time(canvas,data){
  const {ctx,w,h}=setup(canvas),L=43,R=20,T=15,B=29,W=w-L-R,H=h-T-B;
  const finite=data.filter(Number.isFinite);let lo=Math.min(0,...finite),hi=Math.max(0.001,...finite);if(Math.abs(lo)>1e6||Math.abs(hi)>1e6){lo=-1e6;hi=1e6}const pad=(hi-lo)*.12;hi+=pad;lo-=pad;
  const x=i=>L+i/(data.length-1)*W,y=v=>T+(hi-v)/(hi-lo)*H;
  ctx.fillStyle=text;ctx.textAlign='right';for(let i=0;i<=4;i++){const v=hi-(hi-lo)*i/4;line(ctx,L,y(v),w-R,y(v));ctx.fillText(Math.abs(v)>=1000?v.toExponential(0):v.toFixed(2),L-8,y(v)+3)}
  ctx.textAlign='center';for(const i of [0,128,256,384,511]){line(ctx,x(i),T,x(i),h-B);ctx.fillText(i.toString(),x(i),h-10)}
  line(ctx,L,y(0),w-R,y(0),'#d8dfd3');ctx.save();ctx.beginPath();ctx.rect(L,T,W,H);ctx.clip();path(ctx,data,(_,i)=>x(i),d=>y(d),green,1.7);ctx.restore();
}
export function zplane(canvas,model,selected){
  const {ctx,w,h}=setup(canvas),cx=w/2,cy=h/2,s=Math.min(w,h)/2.85;
  const x=v=>cx+v*s,y=v=>cy-v*s;
  ctx.fillStyle='#f6f8f3';ctx.beginPath();ctx.arc(cx,cy,s,0,2*Math.PI);ctx.fill();
  for(let v=-1;v<=1.01;v+=.25){line(ctx,x(v),y(-1.2),x(v),y(1.2),v===0?'#d7ded1':'#e9eee4');line(ctx,x(-1.2),y(v),x(1.2),y(v),v===0?'#d7ded1':'#e9eee4')}
  ctx.strokeStyle='#b5c4ad';ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(cx,cy,s,0,2*Math.PI);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=text;ctx.font='8px "IBM Plex Mono",monospace';ctx.textAlign='center';ctx.fillText('Im',cx+12,13);ctx.fillText('Re',w-12,cy-9);ctx.fillText('−1',x(-1),cy+14);ctx.fillText('+1',x(1),cy+14);ctx.fillText('+j',cx+14,y(1));ctx.fillText('−j',cx+14,y(-1));
  let outside=0;
  for(const kind of ['z','p'])model[kind].forEach((root,i)=>{const px=x(root.re),py=y(root.im);if(px<6||px>w-6||py<6||py>h-6){outside++;return}const active=selected?.kind===kind&&selected.index===i;if(active){ctx.fillStyle=kind==='p'?'#ee8d6b22':'#739d7d22';ctx.beginPath();ctx.arc(px,py,11,0,2*Math.PI);ctx.fill()}
    ctx.strokeStyle=kind==='p'?orange:'#618774';ctx.lineWidth=1.8;ctx.beginPath();if(kind==='p'){ctx.moveTo(px-4,py-4);ctx.lineTo(px+4,py+4);ctx.moveTo(px+4,py-4);ctx.lineTo(px-4,py+4)}else{ctx.arc(px,py,4,0,2*Math.PI)}ctx.stroke();ctx.lineWidth=1;
    const count=model[kind].filter(v=>abs({re:v.re-root.re,im:v.im-root.im})<1e-7).length;
    if(count>1&&model[kind].findIndex(v=>abs({re:v.re-root.re,im:v.im-root.im})<1e-7)===i){ctx.fillStyle='#8f9e88';ctx.fillText('×'+count,px+12,py-8)}
  });
  if(outside){ctx.fillStyle='#b88b70';ctx.fillText(`${outside} roots outside view · use coordinates`,cx,h-7)}
  return {cx,cy,s,x,y};
}
