import {simulate,stability} from './dsp.js';
export class Audition {
  async start(model,signal='noise'){
    this.stop();if(!stability(model).stable)throw Error('Move all poles inside the unit circle before auditioning.');
    const length=model.fs*2;
    const input=Array.from({length},(_,i)=>signal==='sine'?Math.sin(2*Math.PI*440*i/model.fs):signal==='saw'?2*((220*i/model.fs)%1)-1:Math.random()*2-1);
    const filtered=simulate(model,input);
    if(filtered.some(x=>!Number.isFinite(x)||Math.abs(x)>1e6))throw Error('Output is too large to audition. Reduce the gain or resonance.');
    const peak=filtered.reduce((m,x)=>Math.max(m,Math.abs(x)),1),level=0.15/peak;
    this.context ||= new AudioContext();await this.context.resume();this.nodes=[];this.gains=[];
    for(const samples of [input,filtered]){const buffer=this.context.createBuffer(1,length,model.fs);buffer.getChannelData(0).set(samples.map(x=>x*level));const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.loop=true;source.connect(gain).connect(this.context.destination);this.nodes.push(source);this.gains.push(gain)}
    this.bypass(false);const t=this.context.currentTime+0.03;this.nodes.forEach(x=>x.start(t));this.playing=true;
  }
  bypass(on){if(!this.context)return;this.gains?.forEach((g,i)=>g.gain.setTargetAtTime((on?i===0:i===1)?1:0,this.context.currentTime,0.015))}
  stop(){this.nodes?.forEach(n=>{try{n.stop();n.disconnect()}catch{}});this.nodes=[];this.playing=false}
}
