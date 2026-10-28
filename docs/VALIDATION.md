# Verification record

Validated on 2026-10-28 with Node.js, GCC/G++, SciPy 1.17.0 reference data, and a Chromium browser.

- 168 automated checks pass: 114 independent reference designs; numerical/session properties including FIR leading delays; 36 compiled C99/C++17 export checks; 12 SDK adapter syntax checks.
- Complex frequency responses match SciPy within absolute error 2e-7; impulse responses match within 1e-7 for all three biquad topologies. Compiled kernels match the selected coefficients within 2e-6 for float and 1e-12 for double in the tested designs.
- Local and GitHub Actions runs validate the application and build a static Pages artifact.
- Browser checks: filter selection, numeric cutoff changes, impulse/step switching, conjugate root dragging, unstable-pole detection and audio disablement, A/B pinning, coefficient precision, JUCE output, audio start/stop/bypass, named save/load, and copied share links.
- Desktop layout inspected at approximately 1365 px wide. A 390 px iframe viewport verified the mobile layout with no horizontal body overflow.
- Live GitHub Pages URL verified: https://djshellshoxxx.github.io/Filter-Coefficient-Z-Plane-Visualizer/

Limits: SDK adapter checks use interface stubs, not complete JUCE/VST3 builds. Audio playback was verified by browser state, not a hardware listening measurement. This is a finite test matrix, not proof over every possible root arrangement or parameter value. Q2.14 analysis concerns rounded coefficients, not a hardware fixed-point accumulator.

## Publication check (2026-10-28)

All 168 numerical/export tests and the static build pass. Chromium checks cover live audio signal, elliptic high-pass design, A/B reference pinning, C/C++ header download, and the CDL return link. Desktop 1440 px and mobile 390 px layouts were inspected; mobile document width matches the viewport.
