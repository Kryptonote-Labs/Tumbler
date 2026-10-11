"""Extract independent PDF geometry; never consult Tumbler layout output.
Usage: python3 capture.py INPUT_DIRECTORY PDF_DIRECTORY OUTPUT_DIRECTORY
Generate inputs with export-inputs.ts, then use LibreOffice's PDF export.
"""
import hashlib
import json
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

inputs, pdfs, output = map(Path, sys.argv[1:])
output.mkdir(parents=True, exist_ok=True)
font = Path('/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf')
sha = lambda data: hashlib.sha256(data).hexdigest()
def version(*args):
    result = subprocess.run(args, capture_output=True, text=True, check=True)
    return (result.stdout + result.stderr).strip()

records = []
for source in sorted(inputs.glob('*.xml')):
    pdf = pdfs / (source.stem + '.pdf')
    fonts = version('pdffonts', str(pdf))
    if 'LiberationSerif' not in fonts:
        raise ValueError(f'{pdf}: expected embedded Liberation Serif')
    extracted = subprocess.check_output(['pdftotext', '-bbox', str(pdf), '-'])
    root = ET.fromstring(extracted)
    pages = []
    for page in root.findall('.//{*}page'):
        pages.append({'width': float(page.attrib['width']), 'height': float(page.attrib['height']),
                      'words': [{'text': word.text, 'x': float(word.attrib['xMin']), 'y': float(word.attrib['yMin'])}
                                for word in page.findall('{*}word')]})
    shutil.copyfile(pdf, output / pdf.name)
    records.append({'id': source.stem, 'inputSha256': sha(source.read_bytes()),
                    'pdfSha256': sha(pdf.read_bytes()), 'fonts': fonts, 'pages': pages})
metadata = {'producer': version('libreoffice', '--version'), 'extractor': version('pdftotext', '-v'),
            'font': {'name': font.name, 'sha256': sha(font.read_bytes())},
            'records': records}
(output / 'geometry.json').write_text(json.dumps(metadata, indent=2) + '\n')
