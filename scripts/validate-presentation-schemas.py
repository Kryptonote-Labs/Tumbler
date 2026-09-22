"""Validate generated PPTX XML against the locally archived ECMA schemas.

Requires lxml and `bun run references:fetch`. Does not replace Office interoperability tests.
"""
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

root = Path(__file__).resolve().parent.parent
archive = root / 'docs/reference/vendor/raw/ecma/OfficeOpenXML-XMLSchema-Transitional.zip'
paths = [Path(path) for path in sys.argv[1:]] or list((root / 'apps/docs/static/samples').glob('*.pptx'))
failed = False
with tempfile.TemporaryDirectory(prefix='tumbler-schemas-') as directory:
    with ZipFile(archive) as package:
        package.extractall(directory)
    schemas = {
        namespace: etree.XMLSchema(etree.parse(str(Path(directory) / file)))
        for namespace, file in [
            ('http://schemas.openxmlformats.org/presentationml/2006/main', 'pml.xsd'),
            ('http://schemas.openxmlformats.org/drawingml/2006/main', 'dml-main.xsd'),
            ('http://schemas.openxmlformats.org/drawingml/2006/chart', 'dml-chart.xsd'),
        ]
    }
    for path in paths:
        errors = []
        with ZipFile(path) as package:
            for name in package.namelist():
                if not name.startswith('ppt/') or not name.endswith('.xml'):
                    continue
                document = etree.fromstring(package.read(name), etree.XMLParser(resolve_entities=False, no_network=True))
                schema = schemas.get(etree.QName(document).namespace)
                if schema is not None and not schema.validate(document):
                    errors.extend(f'{name}: {error.message}' for error in schema.error_log)
        print(f'{"FAIL" if errors else "PASS"} {path.name}')
        for error in errors:
            print(error)
        failed |= bool(errors)
sys.exit(1 if failed else 0)
