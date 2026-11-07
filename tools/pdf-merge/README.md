# Independent PDF merge verification

Run `python3 -m pip install -r tools/pdf-merge/requirements.txt`, install Poppler (`pdftoppm`), then run `python3 tools/pdf-merge/verify.py` from the repository root.

The script creates four three-page ReportLab PDFs in a temporary directory, including embedded TrueType text (when Arial or DejaVu Sans is available), compressed streams, raster images, vector graphics, transparency, URL links, text notes, editable text fields with colliding names, rotation, cropping, and AES-256 encryption. It invokes the real CLI to interleave selections and repeat pages, then checks every resulting page against Poppler renderings pixel for pixel at 96 DPI. Pypdf independently verifies page counts, field values, links and notes; hashes verify the source files are unchanged. Temporary files are removed automatically.

This supplements the generated object-graph fixtures and existing PDF corpus exercised by `bun test packages/pdf/test/merge.test.ts`, the CLI integration tests, and the Svelte browser regression test.
