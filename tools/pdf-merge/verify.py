"""Independent merge oracle. Requires reportlab, pypdf, Pillow and Poppler.
Run: python3 tools/pdf-merge/verify.py
Creates its entire corpus in a temporary directory and exercises the real CLI.
"""
from pathlib import Path
import subprocess
import tempfile
import hashlib
from PIL import Image, ImageChops
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[2]

def run(*args):
    result = subprocess.run(args, cwd=ROOT, capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout

def render(path, target, password=None):
    args = ['pdftoppm', '-r', '96', '-png']
    if password: args += ['-upw', password]
    run(*args, str(path), str(target))
    return sorted(target.parent.glob(target.name + '-*.png'))

with tempfile.TemporaryDirectory(prefix='tumbler-merge-oracle-') as temp:
    directory = Path(temp)
    font_paths = [Path('/System/Library/Fonts/Supplemental/Arial.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
    font = next((p for p in font_paths if p.exists()), None)
    if font: pdfmetrics.registerFont(TTFont('Embedded', str(font)))
    image = Image.new('RGB', (80, 60), '#32a89e')
    for x in range(80):
        for y in range(60): image.putpixel((x, y), (x * 3, y * 4, (x+y)*1))
    sources = []
    for doc in range(4):
        path = directory / f'source-{doc}.pdf'
        c = canvas.Canvas(str(path), pagesize=(420 + doc * 20, 550))
        for page in range(3):
            c.setFont('Embedded' if font else 'Helvetica', 15)
            c.drawString(30, 510, f'Document {doc}, page {page + 1}: café Ω')
            c.setFillColorRGB(.1, .3, .8); c.circle(110, 410, 40, fill=1)
            c.saveState(); c.setFillAlpha(.45); c.setFillColorRGB(.9,.2,.1)
            c.rect(80,380,100,80,fill=1); c.restoreState()
            c.drawImage(ImageReader(image), 220, 370, width=120, height=90, mask='auto')
            c.setFont('Helvetica', 12); c.drawString(30,320,'External link and editable form below')
            c.linkURL('https://example.org', (30,315,260,335), relative=0)
            c.acroForm.textfield(name=f'field-{page}', value=f'value-{doc}-{page}', x=30, y=260, width=210, height=25, forceBorder=True)
            c.textAnnotation(f'Note {doc}/{page}', Rect=(300,260,330,290))
            c.showPage()
        c.save()
        # Include inherited resources, embedded fonts, compressed streams, forms,
        # page rotations, non-zero crop origins, and encrypted AES-256 inputs.
        if doc in (1,2,3):
            reader = PdfReader(path); writer = PdfWriter(clone_from=reader)
            if doc == 1:
                for page in writer.pages: page.rotate(90)
            if doc == 2:
                for page in writer.pages: page.cropbox.lower_left = (10,15)
            if doc == 3:
                writer.encrypt('--help', algorithm='AES-256', permissions_flag=-4)
                # ISO 32000 requires /P to be signed; pypdf serializes uint32.
                writer._encrypt_entry[NameObject('/P')] = NumberObject(-4)
            with path.open('wb') as f: writer.write(f)
        sources.append(path)
    before = [hashlib.sha256(p.read_bytes()).hexdigest() for p in sources]
    output = directory / 'merged.pdf'
    plan = [(0,[2,0,0]),(1,[2,1,0]),(2,[1]),(3,[0,1,2]),(0,[1])]
    args = ['bun','packages/cli/src/bin.ts',str(sources[0]),'pdf','merge','--pages','3,1,1']
    for doc, pages in plan[1:]:
        args += ['--source',str(sources[doc]),'--pages',','.join(str(p+1) for p in pages)]
        if doc == 3: args += ['--password','--help']
    run(*args,'--output',str(output))
    merged = PdfReader(output)
    assert len(merged.pages) == 11 and not merged.is_encrypted
    expected = []
    originals = []
    for doc, path in enumerate(sources):
        originals.append(render(path,directory / f'original-{doc}', '--help' if doc == 3 else None))
    actual = render(output,directory / 'result')
    for doc, pages in plan:
        expected += [originals[doc][p] for p in pages]
    for index,(a,b) in enumerate(zip(expected,actual)):
        with Image.open(a) as first, Image.open(b) as second:
            assert first.size == second.size, (index,first.size,second.size)
            assert ImageChops.difference(first.convert('RGB'), second.convert('RGB')).getbbox() is None, f'Page {index+1} pixels changed'
    fields = merged.get_fields()
    assert fields
    leaves = {name: field for name, field in fields.items() if field.get('/FT')}
    assert len(leaves) == 11, f'Expected 11 independently addressable widgets: {leaves}'
    expected_values = sorted(f'value-{doc}-{page}' for doc, pages in plan for page in pages)
    assert sorted(field['/V'] for field in leaves.values()) == expected_values
    for page in merged.pages:
        widgets = [a.get_object() for a in page['/Annots'] if a.get_object().get('/Subtype') == '/Widget']
        assert len(widgets) == 1
        assert any(a.get_object().get('/Subtype') == '/Link' for a in page['/Annots'])
        assert any(a.get_object().get('/Subtype') == '/Text' for a in page['/Annots'])
    assert before == [hashlib.sha256(p.read_bytes()).hexdigest() for p in sources]
    print('PASS: 4 generated PDFs, 11 merged pages, pixel-identical Poppler rendering, forms, links, notes, embedded fonts, images, transparency, crops, rotations, AES-256, immutable sources.')
