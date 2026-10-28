import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {design,quantize,simulate} from '../src/dsp.js';
import {generate} from '../src/codegen.js';

for(const family of ['ellip','fir'])for(const precision of ['float32','float64','q14'])for(const topology of ['df1','df2','tdf2'])for(const target of ['cpp','c'])test(`Compiled ${target} ${family} ${topology} ${precision}`,()=>{
  const dir=mkdtempSync(join(tmpdir(),'zlab-'));
  try{
    const model=quantize(design({family,order:6}),precision),scalar=precision==='float64'?'double':'float';
    writeFileSync(join(dir,'filter.h'),generate(model,target,topology,precision));
    writeFileSync(join(dir,'main.'+(target==='c'?'c':'cpp')),`#include "filter.h"\n#include <stdio.h>\nint main(void) { FilterState s; filter_reset(&s); ${scalar} x[512]={1}, y[512]; processBiquadBlock(x,y,512,&s); for(int i=0;i<512;i++) printf("%.17g\\n",(double)y[i]); filter_reset(&s); processBiquadBlock(x,x,512,&s); for(int i=0;i<512;i++) if(x[i]!=y[i]) return 2; return 0; }`);
    execFileSync(target==='c'?'gcc':'g++',[target==='c'?'-std=c99':'-std=c++17','-Wall','-Wextra','-Werror',join(dir,'main.'+(target==='c'?'c':'cpp')),'-o',join(dir,'run')]);
    const actual=execFileSync(join(dir,'run'),{encoding:'utf8'}).trim().split('\n').map(Number),expected=simulate(model,Array.from({length:512},(_,i)=>i===0?1:0),topology);
    assert(Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])))<(precision==='float64'?1e-12:2e-6));
  }finally{rmSync(dir,{recursive:true,force:true})}
});

for(const family of ['butter','fir'])for(const precision of ['float32','float64','q14'])for(const target of ['juce','vst3'])test(`SDK interface syntax ${target} ${family} ${precision}`,()=>{
  const dir=mkdtempSync(join(tmpdir(),'zlab-sdk-'));
  try{
    mkdirSync(join(dir,'juce_audio_basics'),{recursive:true});mkdirSync(join(dir,'public.sdk/source/vst'),{recursive:true});
    writeFileSync(join(dir,'juce_audio_basics/juce_audio_basics.h'),'namespace juce {template<class T> struct AudioBuffer {int getNumChannels(){return 2;} int getNumSamples(){return 0;} T* getWritePointer(int){return nullptr;} void clear(){} };}');
    writeFileSync(join(dir,'public.sdk/source/vst/vstaudioeffect.h'),`#include <cstdint>\n#define PLUGIN_API\nnamespace Steinberg {using int32=int32_t; using uint64=uint64_t; using TBool=bool; using tresult=int; constexpr int kResultTrue=0,kResultFalse=1,kResultOk=0; namespace Vst {constexpr int kSample32=0; struct AudioBusBuffers {int numChannels; uint64 silenceFlags; float** channelBuffers32;}; struct ProcessData {int numSamples,numInputs,numOutputs,symbolicSampleSize; AudioBusBuffers *inputs,*outputs;}; struct ProcessSetup {double sampleRate;}; class AudioEffect {public: virtual ~AudioEffect()=default; virtual tresult canProcessSampleSize(int32){return 0;} virtual tresult setupProcessing(ProcessSetup&){return 0;} virtual tresult setActive(TBool){return 0;} virtual tresult process(ProcessData&){return 0;}};}}`);
    writeFileSync(join(dir,'filter.h'),generate(quantize(design({family}),precision),target,'tdf2',precision));
    writeFileSync(join(dir,'main.cpp'),'#include "filter.h"\nint main(){return 0;}');
    execFileSync('g++',['-std=c++17','-Wall','-Wextra','-Werror','-I',dir,join(dir,'main.cpp'),'-o',join(dir,'run')]);
  }finally{rmSync(dir,{recursive:true,force:true})}
});
