# PDF compatibility inputs

Generated synthetic documents and a Chromium-produced typography document from Kryptonote's
`apps/web/scripts/pdf-research/generate.ts`, introduced by Kn commit `f9567e2f`.
The manifest records each input's hash, producer versions and expected behaviour. These inputs
contain no customer data or third-party reference documents. Fixture passwords are test data.

qpdf, PDFium and Poppler independently checked the inputs. The broken-xref and truncated
inputs are deliberately malformed. Tests must reject them rather than silently repair them.
The font, geometry and graphics inputs also serve the native renderer's independent comparisons.
