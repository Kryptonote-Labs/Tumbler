import type { LosslessXmlDocument, LosslessXmlElement } from '@tumblerjs/ooxml';
import { attribute, children, elements } from './xml.ts';
import type { InkDiagnostic } from './document.ts';
const emma = 'http://www.w3.org/2003/04/emma';
export interface OfficeInkRecognition {
  readonly groupElementId: number;
  readonly elementId: number;
  readonly context: LosslessXmlElement | undefined;
  readonly id: string | undefined;
  readonly alternatives: readonly { readonly elementId: number; readonly text: string; readonly confidence: number | undefined }[];
  /** Recognition errors do not make otherwise valid pen geometry unavailable. */
  readonly diagnostics: readonly InkDiagnostic[];
}

/** Read Office's EMMA recognition subset; keep application-specific context XML intact. */
export function readOfficeInkRecognition(source: LosslessXmlDocument): readonly OfficeInkRecognition[] {
  const result: OfficeInkRecognition[] = [];
  const visit = (parent: LosslessXmlElement) => {
    for (const group of children(parent, 'traceGroup')) {
      for (const annotation of children(group, 'annotationXML')) {
        const root = elements(annotation).find(node => node.namespaceUri === emma && node.localName === 'emma');
        const diagnostics: InkDiagnostic[] = [];
        const problem = (element: LosslessXmlElement, message: string) => diagnostics.push({ elementId: element.id, code: 'structure', message });
        const nodes = root ? elements(root) : [];
        const interpretation = nodes[0], choices = nodes[1];
        if (!root) problem(annotation, 'Office trace-group annotationXML requires an EMMA root.');
        if (!interpretation || interpretation.namespaceUri !== emma || interpretation.localName !== 'interpretation') problem(root ?? annotation, 'Office EMMA requires a context interpretation first.');
        const context = interpretation && elements(interpretation).find(node => node.localName === 'context');
        if (interpretation && (!context || attribute(interpretation, 'mode', emma) !== 'ink')) problem(interpretation, 'Office EMMA context interpretation requires a context and emma:mode="ink".');
        const id = interpretation && attribute(interpretation, 'id');
        const alternatives: OfficeInkRecognition['alternatives'][number][] = [];
        if (choices && choices.namespaceUri === emma && choices.localName === 'one-of' && attribute(choices, 'disjunction-type') !== 'recognition') problem(root ?? annotation, 'Office EMMA requires a recognition one-of second.');
        else if (choices?.namespaceUri === emma && choices.localName === 'one-of') {
          let previous = Infinity;
          for (const choice of elements(choices)) {
            const literals = elements(choice).filter(node => node.namespaceUri === emma && node.localName === 'literal');
            if (choice.namespaceUri !== emma || choice.localName !== 'interpretation' || !literals.length || literals.some(node => elements(node).length)) { problem(choice, 'Recognition alternatives require plain-text EMMA literals.'); continue; }
            const rawConfidence = attribute(choice, 'confidence', emma);
            const confidence = rawConfidence === undefined ? undefined : Number(rawConfidence);
            if (confidence !== undefined) {
              if (!rawConfidence?.trim() || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || confidence > previous) problem(choice, 'Recognition confidence must be in [0, 1], in descending order.');
              previous = confidence;
            }
            alternatives.push({ elementId: choice.id, text: literals.map(node => source.textContent(node)).join(''), confidence });
          }
          if (!alternatives.length) problem(choices, 'Recognition one-of must contain an interpretation.');
        }
        result.push({ groupElementId: group.id, elementId: annotation.id, context, id: id && /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(id) ? id : undefined, alternatives, diagnostics });
      }
      visit(group);
    }
  };
  visit(source.root);
  return result;
}
