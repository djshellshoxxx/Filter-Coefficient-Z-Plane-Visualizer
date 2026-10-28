"""Regenerate numerical oracle fixtures with SciPy. Not needed to run npm test."""
import json
from pathlib import Path
import numpy as np
from scipy import signal

cases=[]
for family in ['butter','cheby1','cheby2','ellip']:
    for order in [2,4,6,8]:
        for kind in ['lowpass','highpass']:
            for fs,fc,rp,rs in [(48000,2400,1,60),(44100,30,.1,100),(96000,19000,3,20)]:
                args=dict(N=order,Wn=fc,btype=kind,fs=fs,output='sos')
                if family in ['cheby1','ellip']: args['rp']=rp
                if family in ['cheby2','ellip']: args['rs']=rs
                sos=getattr(signal, family)(**args)
                f=np.geomspace(20,min(20000,fs*.499),48)
                _,h=signal.sosfreqz(sos,worN=f,fs=fs)
                impulse=signal.sosfilt(sos,np.r_[1.,np.zeros(63)])
                cases.append(dict(params=dict(family=family,order=order,type=kind,fs=fs,fc=fc,rp=rp,rs=rs),f=f.tolist(),real=h.real.tolist(),imag=h.imag.tolist(),impulse=impulse.tolist()))
for taps in [15,31,63]:
    for kind in ['lowpass','highpass']:
        for fc in [500,2400,17000]:
            b=signal.firwin(taps,fc,fs=48000,window='hamming',pass_zero=kind=='lowpass')
            f=np.geomspace(20,20000,48)
            _,h=signal.freqz(b,worN=f,fs=48000)
            cases.append(dict(params=dict(family='fir',taps=taps,type=kind,fc=fc),f=f.tolist(),real=h.real.tolist(),imag=h.imag.tolist(),impulse=np.r_[b,np.zeros(64-taps)].tolist()))
Path('tests/fixtures.json').write_text(json.dumps(cases,separators=(',',':'))+'\n')
print(f'Generated {len(cases)} SciPy reference designs')
