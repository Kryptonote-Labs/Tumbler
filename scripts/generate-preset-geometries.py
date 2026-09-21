"""Compile ECMA-376's mathematical shape definitions. See packages/slides/ECMA-NOTICE.md."""
import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
root = Path(__file__).resolve().parent.parent
with ZipFile(root / 'docs/reference/vendor/raw/ecma/OfficeOpenXML-DrawingMLGeometries.zip') as package:
    definitions = ET.fromstring(package.read('presetShapeDefinitions.xml'))
ns = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
def convert(shape):
    def guides(name):
        result = []
        for guide in shape.findall('a:'+name+'/a:gd', ns):
            formula = guide.get('fmla')
            # Eight circular-arrow guides contain an extra trailing zero in the
            # published supplement. The +- operator takes exactly three operands.
            parts = formula.split()
            if shape.tag in ['circularArrow', 'leftCircularArrow', 'leftRightCircularArrow'] and parts[0] == '+-' and len(parts) == 5 and parts[-1] == '0':
                formula = ' '.join(parts[:-1])
            result.append([guide.get('name'), formula])
        return result
    rect = shape.find('a:rect', ns)
    return {'adjustments': guides('avLst'), 'guides': guides('gdLst'), 'rect': [rect.get(k) for k in ['l','t','r','b']] if rect is not None else ['l','t','r','b'], 'paths': [{'attrs': dict(p.attrib), 'commands': [[c.tag.split('}')[-1], dict(c.attrib), [dict(v.attrib) for v in c]] for c in p]} for p in shape.findall('a:pathLst/a:path', ns)]}
compiled = {shape.tag: convert(shape) for shape in definitions}
(root / 'packages/slides/src/preset-geometries.ts').write_text('// Generated mathematical definitions from ECMA-376 Part 1 DrawingML geometries.\n// See ECMA-NOTICE.md and scripts/generate-preset-geometries.py.\nimport type { GeometryDefinition } from "./drawing-geometry.ts";\nexport const presetGeometries: Readonly<Record<string, GeometryDefinition>> = '+json.dumps(compiled,separators=(',',':'))+';\n')
print(f'Compiled {len(compiled)} distinct preset geometries.')
