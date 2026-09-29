"""Validate DOCX WordprocessingML parts against the locally archived ECMA schemas.

Requires lxml and the reference schemas. This checks schema validity, not Office interoperability.
"""
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

root = Path(__file__).resolve().parent.parent
archive = root / 'docs/reference/vendor/raw/ecma/OfficeOpenXML-XMLSchema-Transitional.zip'
if len(sys.argv) < 2:
    raise SystemExit('Pass DOCX files to validate.')
failed = False
with tempfile.TemporaryDirectory(prefix='tumbler-word-schemas-') as directory:
    target = Path(directory)
    with ZipFile(archive) as package:
        package.extractall(target)
    # ECMA imports the XML namespace without a schema location. Supply its standard attributes.
    (target / 'xml.xsd').write_text('''<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://www.w3.org/XML/1998/namespace">
      <xs:attribute name="space"><xs:simpleType><xs:restriction base="xs:NCName"><xs:enumeration value="default"/><xs:enumeration value="preserve"/></xs:restriction></xs:simpleType></xs:attribute>
      <xs:attribute name="lang" type="xs:language"/><xs:attribute name="base" type="xs:anyURI"/><xs:attribute name="id" type="xs:ID"/>
    </xs:schema>''')
    for path in target.glob('*.xsd'):
        path.write_text(path.read_text().replace(
            '<xsd:import namespace="http://www.w3.org/XML/1998/namespace"/>',
            '<xsd:import namespace="http://www.w3.org/XML/1998/namespace" schemaLocation="xml.xsd"/>',
        ))
    schema = etree.XMLSchema(etree.parse(str(target / 'wml.xsd')))
    for file in sys.argv[1:]:
        errors = []
        with ZipFile(file) as package:
            for name in package.namelist():
                if not name.endswith('.xml'):
                    continue
                document = etree.fromstring(package.read(name), etree.XMLParser(resolve_entities=False, no_network=True))
                if etree.QName(document).namespace == 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' and not schema.validate(document):
                    errors.extend(f'{name}: {error.message}' for error in schema.error_log)
        print(f'{"FAIL" if errors else "PASS"} {Path(file).name}')
        for error in errors:
            print(error)
        failed |= bool(errors)
sys.exit(1 if failed else 0)
