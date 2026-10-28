# Z-Lab implementation specification

## Purpose and supported scope

A static, browser-only filter workbench hosted by GitHub Pages. No account, API server, tracking, or runtime JavaScript dependency. Source is native JavaScript modules; Canvas2D supplies responsive, device-pixel-ratio-aware plots. External web fonts have system fallbacks.

### Filter design

| Family | Response | Order / length | Cutoff convention |
| --- | --- | --- | --- |
| Butterworth | Low-pass, high-pass | 2, 4, 6, 8 | −3.0103 dB |
| Chebyshev I | Low-pass, high-pass | 2, 4, 6, 8 | Passband edge at −rp |
| Chebyshev II | Low-pass, high-pass | 2, 4, 6, 8 | Stopband edge at −rs |
| Elliptic / Cauer | Low-pass, high-pass | 2, 4, 6, 8 | Passband edge at −rp |
| State variable | Low-pass, high-pass, band-pass, notch | 2 | Natural frequency; Q controls resonance |
| FIR | Low-pass, high-pass | 15, 31, 63 taps | Windowed-sinc transition center, approximately −6 dB |

Sample rates: 22,050, 44,100, 48,000, 96,000, 192,000 Hz. UI cutoff is 10 Hz to min(20 kHz, 0.49 × sample rate); slider starts at 20 Hz. Ripple range: 0.1–3 dB. Stopband attenuation: 20–100 dB. Q: 0.1–20. Gain: ±24 dB.

Analog prototype poles and transmission zeros are transformed using prewarping Ω = 2fs tan(πfc/fs), then z = (2fs + s)/(2fs − s). Elliptic prototypes use elliptic integrals, the elliptic nome degree equation, and Jacobi functions. The SVF option is the bilinear transform of the second-order state-variable transfer function, exported as an equivalent biquad; it is not a separate nonlinear or topology-preserving integrator implementation.

Transfer convention is H(z) = Σ b[k]z^−k / Σ a[k]z^−k, with a[0] = 1. IIR processing uses cascaded real second-order sections, ordered by pole radius with distributed gain. The recurrence subtracts denominator feedback terms. Direct Form I, Direct Form II, and Transposed Direct Form II are selectable for time response and generated kernels. FIR uses Hamming-windowed sinc and direct convolution. Its delay poles at the origin are implicit and omitted in the Z-plane.

## Interaction contracts

1. Every parameter change regenerates the designed filter, replacing custom roots.
2. Dragging or editing a root preserves its conjugate. A real root stays on the real axis. Snap spacing is 0.05; keyboard movement is 0.01, or 0.1 with Shift.
3. Roots can be inspected and edited numerically outside the plot's approximately ±1.4 viewport. Repeated roots display a multiplicity label.
4. Stability is strict max pole radius < 1, with no assumed pole-zero cancellation. Marginal/unstable designs remain inspectable and exportable; audio is disabled.
5. Frequency plot samples 640 logarithmic points from 20 Hz to min(20 kHz, 0.499fs). Magnitude and unwrapped phase have independent axes. Phase is undefined at exact transmission zeros; sampled unwrapping near notches is not a group-delay measurement.
6. Impulse and step analyses simulate 512 samples. Unstable output may exceed the displayed time-axis range (limited to ±10^6).
7. Reference plots and time responses use the double-precision design. Quantization metrics and exports use the selected representation.

## Four additional features

### 1. Audio audition and bypass

Generate a two-second white-noise, 220 Hz saw, or 440 Hz sine loop. Process the exact filter at its design sample rate, then let Web Audio resample to the device. Use a common gain for dry and filtered signals, limited to 0.15 peak. A bypass crossfade compares the same source. Stop when design changes, source changes, or the page exits. This is a rendered loop, not microphone streaming or per-sample live parameter modulation.

### 2. Persistent and portable designs

Autosave the workspace in localStorage. Keep up to 30 named designs; saving an existing name replaces it. JSON import/export and URL-fragment sharing preserve parameters and custom roots. Validate file size, schema version, finite numeric values, bounds, conjugacy, and filter type. Storage failure falls back to session-only operation with JSON export available. A shared link contains its design in the fragment; it is not uploaded to an application backend.

### 3. A/B comparison

Pin a snapshot of the current magnitude response. Show it as a dashed reference while editing the active design. Repin and clear controls are explicit. Each response retains its own frequencies if the sample rate changes; show only the overlap. This is a visual response overlay, separate from audio bypass.

### 4. Coefficient quantization analysis

Offer Float64, Float32, and signed 16-bit Q2.14 coefficient rounding. Q2.14 has range [−2, 2 − 2^−14]; saturation is intentional and can destabilize or mute a design. Recompute denominator roots after rounding. Report maximum sampled magnitude deviation where reference magnitude is above −80 dB. This models coefficient rounding, not fixed-point multiply/accumulate overflow, noise, limit cycles, or hardware saturation. Export uses the rounded values in floating-point arithmetic.

## Code generation

All outputs are header snippets. The C core and C++ core contain complete coefficients, per-channel state, reset, sample processing, and block processing. State must be zero-initialized or reset before use. FIR exports convolution; IIR exports a cascade with the chosen topology. Input/output can alias for in-place operation. No heap allocation occurs in processing.

JUCE adds a mono/stereo AudioBuffer adapter; call prepare from prepareToPlay, and use the design sample rate. VST3 adds an AudioEffect processing base supporting one mono/stereo 32-bit bus, silence flags, state reset, and sample-rate rejection. Integrators supply factory registration, controllers, buses, supported layouts, and plugin packaging. These adapters require their SDKs; they are not complete VST3 binaries. Generated fixed coefficients do not support automated parameter smoothing.

## Modules and validation

- `src/dsp.js`: design, root algebra, SOS construction, response, simulation, stability, quantization.
- `src/charts.js`: Canvas plots; no DSP state ownership.
- `src/codegen.js`: C/C++ headers and SDK adapters.
- `src/session.js`: versioned input validation and serialization.
- `src/audio.js`: generated audition and playback lifecycle.
- `src/app.js`: UI state and event handling.

Tests compare complex frequency response and impulse output to checked-in SciPy fixtures across families, orders, sample rates, cutoff extremes, ripple, and attenuation. They also verify FIR root reconstruction, SVF identities, topology equivalence, conjugate editing, strict stability, session validation, and step/impulse consistency. Export tests compile C99/C++17 and compare generated impulse output with the reference. SDK adapter checks use interface stubs for syntax only, not full SDK integration certification. Browser checks cover desktop/mobile layout and core interactions.

## Sources

- [W3C Audio EQ Cookbook](https://www.w3.org/TR/audio-eq-cookbook/) — biquad transfer conventions and prewarped bilinear transformation.
- [SciPy signal design reference](https://docs.scipy.org/doc/scipy/reference/signal.html) and installed SciPy 1.17.0 — independent numerical fixtures and prototype algorithms. See THIRD_PARTY_NOTICES.md for the license on adapted algorithms.
- [SciPy bilinear_zpk](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.bilinear_zpk.html) — transformation and explicit absence of automatic prewarping.
- [JUCE coefficient reference](https://docs.juce.com/master/structjuce_1_1dsp_1_1IIR_1_1Coefficients.html) — normalized coefficient ordering.
- [Steinberg VST3 API](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical+Documentation/API+Documentation/Index.html) — buffers, processing, and sample size contracts.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) — publication workflow.
