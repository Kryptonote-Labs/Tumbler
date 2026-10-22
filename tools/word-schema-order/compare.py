"""Compare fixture packages, allowing only property ordering and empty-tab omission."""
import sys
from pathlib import Path
from zipfile import ZipFile
from lxml import etree


def normalized(data):
    root = etree.fromstring(data, etree.XMLParser(resolve_entities=False, no_network=True))
    for node in list(root.iter()):
        name = etree.QName(node).localname
        if name in ('tcPr', 'pBdr', 'tcBorders'):
            node[:] = sorted(node, key=lambda child: child.tag)
        if name == 'tabs' and len(node) == 0:
            node.getparent().remove(node)
    # Omission may also omit an otherwise empty pPr.
    for node in list(root.iter()):
        if etree.QName(node).localname == 'pPr' and len(node) == 0 and not node.attrib:
            node.getparent().remove(node)
    return etree.tostring(root, method='c14n')


before, after = map(Path, sys.argv[1:3])
for path in sorted(before.glob('*.docx')):
    with ZipFile(path) as old, ZipFile(after / path.name) as new:
        assert set(old.namelist()) == set(new.namelist()), path.name
        for name in old.namelist():
            a, b = old.read(name), new.read(name)
            assert (normalized(a) == normalized(b) if name.endswith('.xml') else a == b), (path.name, name)
    print('EQUIVALENT', path.name)
