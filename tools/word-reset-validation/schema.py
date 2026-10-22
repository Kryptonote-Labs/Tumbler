"""Validate reset fixtures against archived ECMA Transitional XSD, using lxml.

Usage: python3 tools/word-reset-validation/schema.py SCHEMA_ZIP FIXTURE_DIRECTORY
The fixtures use only mc:Ignorable="ext". This removes that known extension namespace
and the Ignorable attribute before XSD validation; it is not a general MCE processor.
"""
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

archive, fixtures = map(Path, sys.argv[1:])
with tempfile.TemporaryDirectory() as directory:
    target = Path(directory)
    with ZipFile(archive) as package:
        package.extractall(target)
    (target / 'xml.xsd').write_text('''<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://www.w3.org/XML/1998/namespace"><xs:attribute name="space"><xs:simpleType><xs:restriction base="xs:NCName"><xs:enumeration value="default"/><xs:enumeration value="preserve"/></xs:restriction></xs:simpleType></xs:attribute><xs:attribute name="lang" type="xs:language"/><xs:attribute name="base" type="xs:anyURI"/><xs:attribute name="id" type="xs:ID"/></xs:schema>''')
    for path in target.glob('*.xsd'):
        path.write_text(path.read_text().replace('<xsd:import namespace="http://www.w3.org/XML/1998/namespace"/>', '<xsd:import namespace="http://www.w3.org/XML/1998/namespace" schemaLocation="xml.xsd"/>'))
    schema = etree.XMLSchema(etree.parse(str(target / 'wml.xsd')))
    files = sorted(fixtures.glob('*.xml'))
    if len(files) != 6:
        raise ValueError('Expected six generated XML fixtures')
    for file in files:
        root = etree.parse(str(file), etree.XMLParser(resolve_entities=False, no_network=True))
        for node in list(root.iter()):
            if etree.QName(node).namespace == 'urn:custom':
                node.getparent().remove(node)
            node.attrib.pop('{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable', None)
        schema.assertValid(root)
        print(f'PASS {file.name}')
