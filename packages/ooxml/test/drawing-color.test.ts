import { expect, test } from 'bun:test';
import { parseLosslessXml, resolveDrawingColor } from '../src/index.ts';
import { DRAWING_PRESET_COLORS } from '../src/preset-colors.ts';

test('all DrawingML preset colour names resolve through the shared colour engine', () => {
  for (const [name, hex] of Object.entries(DRAWING_PRESET_COLORS)) {
    const document = parseLosslessXml(new TextEncoder().encode(`<a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:prstClr val="${name}"/></a:solidFill>`));
    const resolved = resolveDrawingColor(document.root, () => undefined);
    expect(resolved).toBeDefined();
    const channels = hex.match(/../g)!.map(value => parseInt(value, 16));
    expect(resolved).toBe(`rgba(${channels.join(',')},1)`);
  }
});

test('colour percentage lexical values retain their magnitude and alpha', () => {
  const document = parseLosslessXml(new TextEncoder().encode('<a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:scrgbClr r="100%" g="0%" b="0%"><a:alpha val="50%"/></a:scrgbClr></a:solidFill>'));
  expect(resolveDrawingColor(document.root, () => undefined)).toBe('rgba(255,0,0,0.5)');
});


for (const profile of ['transitional', 'strict'] as const) test(`${profile} background references resolve native DrawingML children in PresentationML containers`, () => {
  const drawing = profile === 'strict' ? 'http://purl.oclc.org/ooxml/drawingml/main' : 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const presentation = profile === 'strict' ? 'http://purl.oclc.org/ooxml/presentationml/main' : 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const document = parseLosslessXml(new TextEncoder().encode(`<p:bgRef xmlns:p="${presentation}" xmlns:a="${drawing}" xmlns:u="urn:ignored-colour" idx="1001"><u:schemeClr val="accent1"/><a:schemeClr val="accent2"><a:alpha val="50000"/><u:alpha val="10000"/></a:schemeClr></p:bgRef>`));
  expect(resolveDrawingColor(document.root, name => name === 'accent2' ? '#FF0000' : '#0000FF')).toBe('rgba(255,0,0,0.5)');
});
