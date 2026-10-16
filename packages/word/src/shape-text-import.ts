import type { LosslessXmlElement, LosslessXmlDocument } from '@tumblerjs/ooxml';
import type { OpcPackage, OpcPart } from '@tumblerjs/opc';
import type { WordConformance, WordParagraph, WordRun } from './document.ts';
import type { WordTextParagraph } from './create.ts';
import { readWordStyles } from './styles.ts';
import { readWordNumbering } from './numbering.ts';
import { WORD_LIST_KINDS } from './authored-list.ts';

/** Resolve text-box runs with the same style cascade as ordinary document paragraphs. */
export function readShapeText(
  input: {
    package: OpcPackage;
    part: OpcPart;
    source: LosslessXmlDocument;
    conformance: WordConformance;
  },
  box: LosslessXmlElement,
  namespace: string,
): WordTextParagraph[] | undefined {
  const children = (node: LosslessXmlElement, name?: string) =>
    node.children.filter(
      (c): c is LosslessXmlElement =>
        c.kind === 'element' &&
        c.namespaceUri === namespace &&
        (name === undefined || c.localName === name),
    );
  // Preserve unsupported text-box structures in their original package instead of flattening them.
  if (children(box).some((n) => n.localName !== 'p')) return undefined;
  const styles = readWordStyles(input),
    numbering = readWordNumbering(input);
  const output: WordTextParagraph[] = [];
  for (const node of children(box, 'p')) {
    if (children(node).some((n) => !['pPr', 'r'].includes(n.localName))) return undefined;
    const paragraph: WordParagraph = {
      kind: 'paragraph',
      elementId: node.id,
      propertiesElementId: children(node, 'pPr')[0]?.id,
      inlines: [],
      section: undefined,
    };
    const p = styles.paragraphFormat(input, paragraph);
    const runs = [];
    for (const element of children(node, 'r')) {
      if (children(element).some((n) => !['rPr', 't', 'tab', 'br'].includes(n.localName)))
        return undefined;
      const run: WordRun = {
        kind: 'run',
        elementId: element.id,
        propertiesElementId: children(element, 'rPr')[0]?.id,
        contents: [],
      };
      const f = styles.runFormat(input, paragraph, run);
      const text = children(element)
        .map((n) =>
          n.localName === 't'
            ? n.children.map((c) => (c.kind === 'text' ? c.value : '')).join('')
            : n.localName === 'tab'
              ? '\t'
              : n.localName === 'br'
                ? '\u2028'
                : '',
        )
        .join('');
      runs.push({
        text,
        format: {
          fontFamily: f.fontFamily,
          fontSizePoints: f.fontSizePoints,
          bold: f.bold,
          italic: f.italic,
          underline: f.underline,
          strike: f.strike,
          color: f.themeColour ?? f.color,
          highlight: f.highlight,
          verticalAlign: f.verticalAlign,
          ...(f.characterSpacingPoints === undefined
            ? {}
            : { characterSpacingPoints: f.characterSpacingPoints }),
        },
      });
    }
    const reference = numbering.paragraphReference(input, paragraph);
    const instance = numbering.instances.find((i) => i.id === reference?.numId);
    const definition = numbering.abstracts.find((i) => i.id === instance?.abstractId);
    const level =
      reference &&
      (instance?.levelOverrides.get(reference.level) ??
        definition?.levels.find((l) => l.level === reference.level));
    output.push({
      runs,
      ...(p.styleId ? { styleId: p.styleId } : {}),
      alignment: p.alignment === 'distribute' ? 'justify' : p.alignment,
      paragraph: {
        spacingBeforeTwips: p.spacingBeforeTwips,
        spacingAfterTwips: p.spacingAfterTwips,
        lineSpacing: p.lineSpacing,
        keepNext: p.keepNext,
        keepLines: p.keepLines,
        pageBreakBefore: p.pageBreakBefore,
        widowControl: p.widowControl,
        contextualSpacing: p.contextualSpacing,
        ...((p.shadingColour ?? p.shading) ? { shading: p.shadingColour ?? p.shading } : {}),
        ...((p.borderColours ?? p.borders) ? { borders: p.borderColours ?? p.borders } : {}),
      },
      positioning: {
        indentStartTwips: p.indentStartTwips,
        indentEndTwips: p.indentEndTwips,
        firstLineTwips: p.firstLineTwips,
        hangingTwips: p.hangingTwips,
        tabs: p.tabs,
      },
      ...(reference && level
        ? {
            list: {
              id: `source-list-${reference.numId}`,
              kind: WORD_LIST_KINDS.find((k) => k === level.format) ?? 'decimal',
              level: reference.level,
              start: level.start,
              ...(level.format === 'bullet' ? { marker: level.text } : {}),
            },
          }
        : {}),
    });
  }
  return output.length ? output : [{ runs: [] }];
}
