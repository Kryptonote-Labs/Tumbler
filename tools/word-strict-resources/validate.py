"""Validate DOCX WordprocessingML parts against the locally archived ECMA schemas.

Requires lxml and the reference schemas. This checks schema validity, not Office interoperability.
"""
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

if len(sys.argv) < 4:
    raise SystemExit('Usage: validate.py <strict|transitional> <schema-archive.zip> <docx>...')
profile, archive = sys.argv[1:3]
namespace = 'http://purl.oclc.org/ooxml/wordprocessingml/main' if profile == 'strict' else 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
if profile not in ('strict', 'transitional'):
    raise SystemExit('Profile must be strict or transitional.')
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
    # The published Strict WML XSD has three invalid ST_OnOff defaults.
    # Normalize only those lexical defaults so libxml2 can compile it.
    # No instance constraints or particles are changed.
    if profile == 'strict':
        path = target / 'wml.xsd'
        path.write_text(path.read_text().replace('default="off"', 'default="false"').replace('default="on"', 'default="true"'))
    schema = etree.XMLSchema(etree.parse(str(target / 'wml.xsd')))
    theme_schema = etree.XMLSchema(etree.parse(str(target / 'dml-main.xsd')))
    for file in sys.argv[3:]:
        errors = []
        checked = 0
        with ZipFile(file) as package:
            for name in package.namelist():
                if not name.endswith('.xml'):
                    continue
                document = etree.fromstring(package.read(name), etree.XMLParser(resolve_entities=False, no_network=True))
                is_theme = etree.QName(document).localname == 'theme'
                if not is_theme and etree.QName(document).localname not in ('document', 'numbering', 'styles', 'hdr', 'ftr'):
                    continue
                checked += 1
                selected = theme_schema if is_theme else schema
                if not selected.validate(document):
                    errors.extend(f'{name}: {error.message}' for error in selected.error_log)
        if not checked:
            errors.append('No WordprocessingML parts matched the requested dialect.')
        print(f'{"FAIL" if errors else "PASS"} {Path(file).name} ({checked} parts)')
        for error in errors:
            print(error)
        failed |= bool(errors)
sys.exit(1 if failed else 0)
