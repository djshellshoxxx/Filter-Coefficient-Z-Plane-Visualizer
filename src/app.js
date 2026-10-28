import * as dsp from './dsp.js';
import * as chart from './charts.js';
import {generate} from './codegen.js';
import {pack,unpack,encode,decode,readSaved} from './session.js';
import {Audition} from './audio.js';
const $=id=>document.getElementById(id),clone=x=>structuredClone(x);
const familyNames={butter:'Butterworth',cheby1:'Chebyshev I',cheby2:'Chebyshev II',ellip:'Elliptic',svf:'State variable',fir:'FIR Hamming'};
const descriptions={butter:'Maximally flat passband. A balanced starting point.',cheby1:'Passband ripple for a steeper transition.',cheby2:'A flat passband with stopband ripple.',ellip:'Ripple in both bands. A sharp transition.',svf:'A resonant second-order state-variable design.',fir:'Linear phase. Symmetric windowed-sinc taps.'};
let params={...dsp.defaults},model=dsp.design(params),custom=false,selected={kind:'p',index:0},target='cpp',timeMode='impulse',reference=null,data=[],quantized,code='',zGeom,fGeom,drag=null,toastTimer;
const audio=new Audition();let busyAudio=false;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000)}
function current(){return pack(params,model,custom)}
function autosave(){try{localStorage.setItem('zlab-workspace',JSON.stringify(current()));$('save-status').textContent='● Saved in this browser'}catch{$('save-status').textContent='Session only · storage unavailable'}}
function stopAudio(){audio.stop();$('audio-play').textContent='▶';$('audio-play').setAttribute('aria-label','Play audio preview');$('audio-bypass').setAttribute('aria-pressed','false');$('audio-status').textContent='Two-second loop · level matched'}
function syncControls(){
  const map={family:'family',type:'filter-type',fc:'fc',fs:'sample-rate',rp:'rp',rs:'rs',q:'q',gain:'gain',taps:'taps',topology:'topology',precision:'precision'};for(const [key,id] of Object.entries(map))$(id).value=params[key];
  $('fc').max=Math.min(20000,params.fs*.49);$('fc-max').textContent=(Number($('fc').max)/1000).toFixed(1)+' kHz';
  $('fc-range').value=1000*Math.log(params.fc/20)/Math.log(Number($('fc').max)/20);
  $('gain-value').textContent=(params.gain>0?'+':'')+params.gain.toFixed(1)+' dB';
  document.querySelectorAll('[data-order]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.order)===params.order);b.setAttribute('aria-pressed',Number(b.dataset.order)===params.order)});
  $('order-field').hidden=['fir','svf'].includes(params.family);$('taps-field').hidden=params.family!=='fir';$('rp-field').hidden=!['cheby1','ellip'].includes(params.family);$('rs-field').hidden=!['cheby2','ellip'].includes(params.family);$('q-field').hidden=params.family!=='svf';
  for(const option of $('filter-type').options)option.disabled=['bandpass','notch'].includes(option.value)&&params.family!=='svf';
  $('family-description').textContent=descriptions[params.family];
  $('cutoff-note').textContent=params.family==='cheby2'?'Stopband edge at −'+params.rs+' dB.':['cheby1','ellip'].includes(params.family)?'Passband edge at −'+params.rp+' dB.':params.family==='fir'?'Transition center, approximately −6 dB.':params.family==='svf'?'Natural frequency; resonance is controlled by Q.':'Cutoff is the −3 dB frequency.';
  $('method-label').textContent=params.family==='fir'?'Linear-phase FIR':'Bilinear transform';$('method-note').textContent=params.family==='fir'?'A symmetric Hamming window controls sidelobes.':'Frequency prewarping keeps your cutoff where you set it.';
  $('slope-label').textContent=params.order*6+' dB/oct';
  $('design-title').textContent=familyNames[params.family]+' '+params.type.replace('pass','-pass');
  $('order-tag').textContent=params.family==='fir'?model.b.length+' TAPS':(params.family==='svf'?2:params.order)+(params.family==='svf'||params.order===2?'ND':'TH')+' ORDER';$('custom-tag').hidden=!custom;
  $('topology').disabled=model.kind==='fir';
}
function syncRoots(){
  if(!model[selected.kind]?.[selected.index])selected=model.p.length?{kind:'p',index:0}:{kind:'z',index:0};
  const select=$('root-select');select.replaceChildren();
  for(const kind of ['p','z'])model[kind].forEach((v,index)=>{const o=document.createElement('option');o.value=`${kind}:${index}`;o.textContent=`${kind==='p'?'Pole':'Zero'} ${index+1}  ${v.re.toFixed(4)} ${v.im>=0?'+':'−'} ${Math.abs(v.im).toFixed(4)}j`;select.append(o)});
  select.value=`${selected.kind}:${selected.index}`;const root=model[selected.kind][selected.index];
  if(root){$('root-real').value=root.re.toFixed(6);$('root-imag').value=root.im.toFixed(6);$('root-imag').disabled=Math.abs(root.im)<1e-8}
}
function syncCoefficients(){
  const previous=Number($('section-select').value)||0;$('section-select').replaceChildren();
  const length=model.kind==='fir'?Math.ceil(model.b.length/8):quantized.sos.length;
  for(let i=0;i<length;i++){const o=document.createElement('option');o.value=i;o.textContent=model.kind==='fir'?`Taps ${i*8}–${Math.min(i*8+7,model.b.length-1)}`:`Section ${i+1} of ${length}`;$('section-select').append(o)}
  $('section-select').value=Math.min(previous,length-1);drawCoefficients();
  $('coefficient-note').textContent=model.kind==='fir'?'All taps are included in your FIR convolution export.':'Normalized coefficients. All sections are included in your export.';
}
function drawCoefficients(){
  const index=Number($('section-select').value)||0;
  const values=model.kind==='fir'?quantized.b.slice(index*8,index*8+8).map((v,i)=>['b'+(index*8+i),v]):[...quantized.sos[index].b.map((v,i)=>['b'+i,v]),...quantized.sos[index].a.slice(1).map((v,i)=>['a'+(i+1),v])];
  $('coefficient-body').replaceChildren();for(const [name,value] of values){const row=document.createElement('tr'),a=document.createElement('td'),b=document.createElement('td');a.textContent=name;b.textContent=value.toFixed(9);row.append(a,b);$('coefficient-body').append(row)}
}
function highlight(source){return source.split('\n').map(line=>{const escaped=line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');return line.trimStart().startsWith('//')?`<span class="code-comment">${escaped}</span>`:escaped.replace(/\b(float|double|int|unsigned|static|inline|const|typedef|struct|void|return|for|if|class|public|override|using|namespace|bool)\b/g,'<span class="code-keyword">$1</span>')}).join('\n')}
function syncCode(){code=generate(quantized,target,params.topology,params.precision);$('code-output').innerHTML=highlight(code);$('code-note').textContent=target==='juce'?'JUCE audio_basics adapter · mono/stereo · call prepare() at the design sample rate':target==='vst3'?'VST3 SDK processing base · add factory, controller, and buses in your plugin':'Portable processing core · separate state per channel · zero heap allocation'}
function render(){
  stopAudio();syncControls();syncRoots();data=dsp.response(model);
  const stable=dsp.stability(model);$('stability-badge').textContent=stable.stable?'● Stable':stable.radius===1?'● Marginal':'● Unstable';$('stability-badge').classList.toggle('unstable',!stable.stable);$('max-radius').textContent='|p|max = '+stable.radius.toFixed(4);$('audio-play').disabled=!stable.stable;
  quantized=dsp.quantize(model,params.precision);const qdata=dsp.response(quantized);let error=0;data.forEach((d,i)=>{if(d.db>-80)error=Math.max(error,Math.abs(d.db-qdata[i].db))});$('quant-error').textContent=(error<.001?'< 0.001':Number.isFinite(error)?error.toFixed(3):'∞')+' dB';const qs=dsp.stability(quantized);$('quant-stable').textContent=qs.stable?'Stable':'Unstable';$('quant-stable').className=qs.stable?'green':'red';
  syncCoefficients();syncCode();draw();autosave();
}
function draw(){
    fGeom=chart.frequency($('response-canvas'),data,{phase:$('phase-toggle').checked,unit:$('phase-unit').value,reference,fc:custom?null:params.fc,gain:params.gain});
    const input=Array.from({length:512},(_,i)=>timeMode==='step'||i===0?1:0),output=dsp.simulate(model,input,params.topology);chart.time($('time-canvas'),output);zGeom=chart.zplane($('z-canvas'),model,selected);
    $('time-length').textContent=`512 samples · ${(512/params.fs*1000).toFixed(2)} ms`;$('settle-stat').textContent='PEAK '+Math.max(...output.map(Math.abs)).toPrecision(4);$('frequency-range').textContent='20 Hz — '+(data.at(-1).f/1000).toFixed(1)+' kHz';$('time-canvas').setAttribute('aria-label',`512-sample ${timeMode} response, peak ${Math.max(...output.map(Math.abs)).toPrecision(4)}`);
}
function redesign(key,value){
  const previous=clone(params);params[key]=value;
  if(params.family!=='svf'&&!['lowpass','highpass'].includes(params.type))params.type='lowpass';
  params.fc=Math.min(params.fc,params.fs*.49,20000);
  try{model=dsp.design(params);custom=false;render()}catch(error){params=previous;syncControls();toast(error.message)}
}
function changeRoot(value){
  if(![value.re,value.im].every(Number.isFinite)||Math.abs(value.re)>100||Math.abs(value.im)>100){toast('Root coordinates must be finite and between −100 and 100.');return}
  try{model=dsp.moveRoot(model,selected.kind,selected.index,value);custom=true;render()}catch(error){toast(error.message)}
}
function restore(saved){try{const state=unpack(saved);params=state.params;model=state.model;custom=state.custom;render()}catch(error){toast('Could not load design: '+error.message)}}
function savedOptions(){const select=$('saved-presets');select.replaceChildren(new Option('Load a design…',''));readSaved().forEach((x,i)=>select.add(new Option(x.name,String(i))))}
function download(content,name,type='text/plain'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function copy(value,description){try{await navigator.clipboard.writeText(value);toast(description+' copied')}catch{const d=document.createElement('dialog'),h=document.createElement('h2'),area=document.createElement('textarea'),close=document.createElement('button');h.textContent='Copy '+description.toLowerCase();area.value=value;area.style.cssText='width:100%;height:200px;margin:15px 0;font:11px monospace';close.className='button';close.textContent='Close';close.onclick=()=>{d.close();d.remove()};d.append(h,area,close);document.body.append(d);d.showModal();area.select()}}

for(const [id,key] of Object.entries({family:'family','filter-type':'type',fc:'fc','sample-rate':'fs',rp:'rp',rs:'rs',q:'q',taps:'taps'}))$(id).addEventListener('change',e=>redesign(key,['family','type'].includes(key)?e.target.value:Number(e.target.value)));
for(const id of ['fc','rp','rs','q']){let timer;$(id).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{if($(id).value!==''&&$(id).validity.valid&&Number($(id).value)!==params[id])redesign(id,Number($(id).value))},180)});$(id).addEventListener('blur',()=>{clearTimeout(timer);if(Number($(id).value)!==params[id])redesign(id,Number($(id).value))})}
$('fc-range').addEventListener('input',e=>redesign('fc',Math.round(20*(Number($('fc').max)/20)**(Number(e.target.value)/1000))));$('gain').addEventListener('input',e=>redesign('gain',Number(e.target.value)));
document.querySelectorAll('[data-order]').forEach(b=>b.addEventListener('click',()=>redesign('order',Number(b.dataset.order))));
$('topology').addEventListener('change',e=>{params.topology=e.target.value;syncCode();draw();autosave()});$('precision').addEventListener('change',e=>{params.precision=e.target.value;render()});
$('phase-toggle').addEventListener('change',draw);$('phase-unit').addEventListener('change',draw);
document.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>{timeMode=b.dataset.time;document.querySelectorAll('[data-time]').forEach(x=>x.classList.toggle('active',x===b));draw()}));
$('pin-reference').addEventListener('click',()=>{reference=clone(data);$('reference-legend').hidden=false;$('clear-reference').hidden=false;$('pin-reference').textContent='↻ Repin A';draw();toast('Reference A pinned. Change your design to compare.')});$('clear-reference').addEventListener('click',()=>{reference=null;$('reference-legend').hidden=true;$('clear-reference').hidden=true;$('pin-reference').textContent='＋ Pin A/B';draw()});
$('section-select').addEventListener('change',drawCoefficients);
document.querySelectorAll('[data-target]').forEach(b=>b.addEventListener('click',()=>{target=b.dataset.target;document.querySelectorAll('[data-target]').forEach(x=>x.classList.toggle('active',x===b));syncCode()}));
$('copy-code').addEventListener('click',()=>copy(code,'Code'));$('download-code').addEventListener('click',()=>download(code,'zlab_filter.h'));$('export-top').addEventListener('click',()=>$('export-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
$('root-select').addEventListener('change',e=>{const [kind,index]=e.target.value.split(':');selected={kind,index:Number(index)};syncRoots();draw()});$('apply-root').addEventListener('click',()=>changeRoot(dsp.C(Number($('root-real').value),Number($('root-imag').value))));
$('z-canvas').addEventListener('pointerdown',e=>{
  const rect=e.currentTarget.getBoundingClientRect(),px=e.clientX-rect.left,py=e.clientY-rect.top;let best=16,hit;
  for(const kind of ['p','z'])model[kind].forEach((r,index)=>{const distance=Math.hypot(zGeom.x(r.re)-px,zGeom.y(r.im)-py);if(distance<best){hit={kind,index};best=distance}});
  if(hit){selected=hit;drag=hit;e.currentTarget.setPointerCapture(e.pointerId);syncRoots();draw()}
});
$('z-canvas').addEventListener('pointermove',e=>{if(!drag)return;const rect=e.currentTarget.getBoundingClientRect();let re=(e.clientX-rect.left-zGeom.cx)/zGeom.s,im=-(e.clientY-rect.top-zGeom.cy)/zGeom.s;if($('snap-grid').checked){re=Math.round(re/.05)*.05;im=Math.round(im/.05)*.05}changeRoot(dsp.C(dsp.clamp(re,-1.4,1.4),dsp.clamp(im,-1.4,1.4)))});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('z-canvas').addEventListener(name,()=>drag=null);
$('z-canvas').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const r=clone(model[selected.kind][selected.index]),step=e.shiftKey?.1:.01;if(e.key==='ArrowLeft')r.re-=step;if(e.key==='ArrowRight')r.re+=step;if(e.key==='ArrowUp')r.im+=step;if(e.key==='ArrowDown')r.im-=step;changeRoot(r)});
$('response-canvas').addEventListener('pointermove',e=>{const rect=e.currentTarget.getBoundingClientRect(),px=e.clientX-rect.left,t=dsp.clamp((px-fGeom.L)/fGeom.W,0,1),d=data[Math.round(t*(data.length-1))];$('frequency-tooltip').hidden=false;$('frequency-tooltip').textContent=`${d.f.toFixed(1)} Hz · ${d.db.toFixed(2)} dB · ${($('phase-unit').value==='deg'?d.phase*180/Math.PI:d.phase).toFixed(1)} ${$('phase-unit').value}`;$('frequency-tooltip').style.left=dsp.clamp(px+10,10,rect.width-260)+'px'});$('response-canvas').addEventListener('pointerleave',()=>$('frequency-tooltip').hidden=true);
$('save-design').addEventListener('click',()=>{$('design-name').value=$('design-title').textContent;$('save-dialog').showModal();$('design-name').select()});
$('save-form').addEventListener('submit',e=>{e.preventDefault();const name=$('design-name').value.trim();if(!name)return;const items=readSaved(),saved={name,data:current()},index=items.findIndex(x=>x.name===name);if(index>=0)items[index]=saved;else items.unshift(saved);try{localStorage.setItem('zlab-designs',JSON.stringify(items.slice(0,30)));savedOptions();$('save-dialog').close();toast('Design saved: '+name)}catch{toast('Browser storage is unavailable. Use JSON export to save your design.')}});
$('saved-presets').addEventListener('change',e=>{if(e.target.value==='')return;const item=readSaved()[Number(e.target.value)];if(item){restore(item.data);toast('Loaded '+item.name)}});
$('share-design').addEventListener('click',()=>{const url=new URL(location.href);url.hash='design='+encode(current());copy(url.href,'Design link')});$('download-design').addEventListener('click',()=>download(JSON.stringify(current(),null,2),'zlab-design.json','application/json'));
$('import-design').addEventListener('click',()=>$('import-file').click());$('import-file').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>50000)throw Error('File exceeds 50 KB');restore(JSON.parse(await file.text()))}catch(error){toast('Could not import: '+error.message)}e.target.value=''});
$('reset-design').addEventListener('click',()=>{params={...dsp.defaults};model=dsp.design(params);custom=false;history.replaceState(null,'',location.pathname+location.search);render();toast('Default Butterworth design restored')});
for(const id of ['help-button','spec-button'])$(id).addEventListener('click',()=>$('help-dialog').showModal());document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.addEventListener('keydown',e=>{if(e.key==='?'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))$('help-dialog').showModal()});
$('audio-play').addEventListener('click',async()=>{if(busyAudio)return;if(audio.playing){stopAudio();return}busyAudio=true;$('audio-play').disabled=true;const snapshot=model;try{await audio.start(model,$('audio-source').value);if(model!==snapshot){stopAudio();return}$('audio-play').textContent='■';$('audio-play').setAttribute('aria-label','Stop audio preview');$('audio-status').textContent='Playing · design sample rate '+params.fs+' Hz'}catch(error){toast(error.message);stopAudio()}finally{busyAudio=false;$('audio-play').disabled=!dsp.stability(model).stable}});
$('audio-source').addEventListener('change',stopAudio);$('audio-bypass').addEventListener('click',()=>{const on=$('audio-bypass').getAttribute('aria-pressed')!=='true';$('audio-bypass').setAttribute('aria-pressed',String(on));audio.bypass(on)});window.addEventListener('pagehide',stopAudio);
new ResizeObserver(draw).observe(document.querySelector('.workspace'));
try{if(location.hash.startsWith('#design=')){const state=decode(location.hash.slice(8));params=state.params;model=state.model;custom=state.custom}else{const cached=localStorage.getItem('zlab-workspace');if(cached){const state=unpack(JSON.parse(cached));params=state.params;model=state.model;custom=state.custom}}}catch(error){toast('Starting a fresh workspace: '+error.message)}
window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#design='))try{const s=decode(location.hash.slice(8));params=s.params;model=s.model;custom=s.custom;render()}catch(error){toast(error.message)}});
savedOptions();render();
