"""Compare source pages with their merged copies using PDFium, independently of Tumbler."""
import json
import pathlib
import sys
import pypdfium2 as pdfium

root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / 'manifest.json').read_text())
count = 0
for item in manifest:
    name = item['name']
    source = pdfium.PdfDocument(root / f'{name}-source.pdf', password=item.get('password'))
    merged = pdfium.PdfDocument(root / f'{name}-merged.pdf')
    assert len(merged) == 2 * len(source), name
    for output_index, source_index in enumerate(list(range(len(source))) + list(reversed(range(len(source))))):
        original, result = source[source_index], merged[output_index]
        assert original.get_size() == result.get_size(), (name, output_index, 'page size')
        original_text, result_text = original.get_textpage(), result.get_textpage()
        assert original_text.get_text_range() == result_text.get_text_range(), (name, output_index, 'text')
        original_pixels = original.render(scale=1, draw_annots=True)
        result_pixels = result.render(scale=1, draw_annots=True)
        assert bytes(original_pixels.buffer) == bytes(result_pixels.buffer), (name, output_index, 'pixels')
        original_pixels.close()
        result_pixels.close()
        original_text.close()
        result_text.close()
        original.close()
        result.close()
        count += 1
    source.close()
    merged.close()
print(f'PASS: {len(manifest)} documents, {count} merged pages; exact PDFium pixels, text and geometry')
