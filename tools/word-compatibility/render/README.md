# Reference layout evidence

The reference-layout oracle compares Tumbler's headless layout with geometry
extracted from independently generated LibreOffice PDFs. CI reads checked-in
references; it cannot regenerate expected coordinates from Tumbler's output.

`reference/geometry.json` records LibreOffice 25.2.3.2, Poppler 25.03.0, the
Liberation Serif font file SHA-256, PDF font listings, input XML digests and PDF
digests. PDFs contain embedded font subsets. Each run checks input and PDF hashes,
then retains the PDF and complete geometry manifest with the evidence report.
Missing references, changed input or PDF bytes, and geometry mismatches fail the
check. A scenario with no reference implementation is blocked.

## Assertions and scope

All 14 cases run in Strict and Transitional markup. Page count, page assignment
and marker text must match exactly. Page width, height and text left edges must
match within 0.1 point. For line-break and spacing cases, baseline advances relative
to the first marker must match PDF word-top advances within the same tolerance.
Every marker uses the same font and size, so the constant PDF bounding-box offset
cancels. The tolerance accounts for PDF coordinate rounding, not visual similarity.

The fixed measurer uses the Liberation Serif 11pt vertical metrics recorded in
`packages/word/test/line-spacing.test.ts`: ascent 10.25pt, descent 2.4pt. Glyph
widths are synthetic and lines deliberately do not wrap. These checks qualify
page geometry and selected vertical layout behaviour, not font measurement,
shaping, soft wrapping, painted glyphs or the browser renderer. Absolute first-line
baselines are not compared. Fonts are embedded in the reference PDFs; normal CI
does not need these particular font or PDF-tool versions installed.

Only page size receives a full render coverage plan, for ECMA-376-1:2016 §17.6.13.
It checks width/height on repeated pages, omitted/explicit portrait orientation,
landscape, wide portrait, custom dimensions, descriptive printer-code independence
and section size changes. This is displayed page geometry, not physical printer
media selection. Missing width/height application defaults are not specified here.

Explicit page and text-wrapping breaks, and automatic single/1.15/double, exact and
at-least spacing receive bounded requirement evidence only. Their full topics stay
untested. Column breaks, floating-object clearance, paragraph before/after spacing,
blank and mixed-font paragraphs, and other spacing interactions remain work to do.
The existing broad `render.line-spacing` requirement remains pending.

## Regenerating references

Reference changes require review of the input, provenance, PDF and geometry diff.
Do not refresh references merely to make a failing comparison pass. Updating the
consumer/tool/font versions changes the reference environment and must be explicit
in the PR. The tools below must match the versions and font hash in the manifest
when reproducing this baseline. PDF timestamps may change hashes on regeneration;
geometry should remain stable.

```bash
bun tools/word-compatibility/render/export-inputs.ts /tmp/render-inputs
libreoffice -env:UserInstallation=file:///tmp/render-profile --headless \
  --convert-to pdf --outdir /tmp/render-pdfs /tmp/render-inputs/*.docx
python3 tools/word-compatibility/render/capture.py \
  /tmp/render-inputs /tmp/render-pdfs tools/word-compatibility/render/reference
```

Use fresh input, PDF and profile directories. Capture uses Python's standard
library plus `pdftotext` and `pdffonts`, and checks that Liberation Serif appears
in the PDF font listing. The regular font is read from
`/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf`.
Run the compatibility suite with SDK validation after regenerating. LibreOffice
PDF agreement is the chosen reference, not a claim of Microsoft Word parity.
