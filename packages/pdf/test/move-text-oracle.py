"""Verify text movement with PDFium, independently of Tumbler. Reads one JSON request on stdin."""
import base64
import json
import sys
import pypdfium2 as pdfium

request = json.load(sys.stdin)
source = pdfium.PdfDocument(base64.b64decode(request['source']))
output = pdfium.PdfDocument(base64.b64decode(request['output']))
assert len(source) == len(output), 'Movement changed page count'
count = 0
for index, (dx, dy) in enumerate(request['translations']):
    before = source[index].get_textpage()
    after = output[index].get_textpage()
    def glyphs(page):
        return [(page.get_text_range(i, 1), page.get_charbox(i))
                for i in range(page.count_chars()) if page.get_text_range(i, 1).strip()]
    a, b = glyphs(before), glyphs(after)
    assert [g[0] for g in a] == [g[0] for g in b], f'Page {index + 1} text changed'
    for (char, old), (_, new) in zip(a, b):
        delta = [new[n] - old[n] for n in range(4)]
        expected = [dx, dy, dx, dy]
        assert all(abs(x-y) < .025 for x, y in zip(delta, expected)), (index, char, delta, expected)
        count += 1
    before.close()
    after.close()
print(json.dumps({'pages': len(source), 'characters': count}))
source.close()
output.close()
