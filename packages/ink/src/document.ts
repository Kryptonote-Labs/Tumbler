import { readOfficeInkRecognition, type OfficeInkRecognition } from './recognition.ts';
import { parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement, type LosslessXmlLimits } from '@tumblerjs/ooxml';
import { readOfficeBrush, type InkBrush } from './brush.ts';
import { decodeInkTrace, InkError, type InkChannel, type InkPoint } from './trace.ts';
import { attribute, children, elements, INKML_NAMESPACE, XML_NAMESPACE } from './xml.ts';

export interface InkDiagnostic {
  readonly elementId: number;
  readonly code: 'structure' | 'reference' | 'trace' | 'range' | 'rendering' | 'resource';
  readonly message: string;
}
export interface OfficeInkTrace {
  readonly elementId: number;
  readonly id: string | undefined;
  readonly channels: readonly InkChannel[];
  readonly points: readonly InkPoint[];
  readonly brush: InkBrush;
}
export interface OfficeInkDocument {
  readonly source: LosslessXmlDocument;
  readonly traces: readonly OfficeInkTrace[];
  readonly recognition: readonly OfficeInkRecognition[];
  readonly diagnostics: readonly InkDiagnostic[];
}

/** Read the Office InkML profile without changing the source, fetching URIs, or discarding metadata. */
export function readOfficeInk(bytes: Uint8Array, limits?: Partial<LosslessXmlLimits>): OfficeInkDocument {
  const source = parseLosslessXml(bytes, limits);
  if (source.root.namespaceUri !== INKML_NAMESPACE || source.root.localName !== 'ink') throw new InkError('structure', 'Expected an InkML ink root.');
  const diagnostics: InkDiagnostic[] = [];
  const ids = new Map<string, LosslessXmlElement>();
  const ambiguousIds = new Set<string>();
  for (const element of source.elements()) {
    const id = attribute(element, 'id', XML_NAMESPACE);
    if (!id) continue;
    if (ids.has(id) || ambiguousIds.has(id)) {
      diagnostics.push({ elementId: element.id, code: 'reference', message: `Duplicate xml:id ${id}; references to this ID are ambiguous.` });
      ambiguousIds.add(id);
      ids.delete(id);
    } else ids.set(id, element);
  }
  const definitions = new Set(children(source.root, 'definitions').flatMap(elements));
  const reference = (element: LosslessXmlElement, name: string, target: string) => {
    const ref = attribute(element, name);
    const value = ref?.startsWith('#') ? ids.get(ref.slice(1)) : undefined;
    if (!value || value.namespaceUri !== INKML_NAMESPACE || value.localName !== target || (target === 'context' && !definitions.has(value))) {
      throw new InkError('reference', `${name} must reference an unambiguous local ${target}${target === 'context' ? ' in definitions' : ''}.`);
    }
    return value;
  };
  const traces: OfficeInkTrace[] = [];
  const visit = (parent: LosslessXmlElement) => {
    for (const element of elements(parent)) {
      if (element.namespaceUri !== INKML_NAMESPACE) continue;
      if (element.localName === 'traceGroup') { visit(element); continue; }
      if (element.localName !== 'trace') continue;
      try {
        if (elements(element).length) throw new InkError('structure', 'Trace samples cannot contain child elements.');
        const context = reference(element, 'contextRef', 'context');
        const brush = readOfficeBrush(reference(element, 'brushRef', 'brush'));
        const sources = children(context, 'inkSource');
        if (sources.length !== 1 || !attribute(sources[0]!, 'id', XML_NAMESPACE)) throw new InkError('structure', 'Office contexts require one inkSource with xml:id.');
        const formats = children(sources[0]!, 'traceFormat');
        if (formats.length !== 1) throw new InkError('structure', 'An explicit inkSource traceFormat is required to decode device samples.');
        const format = formats[0]!;
        const channelElements = [...children(format, 'channel'), ...children(format, 'intermittentChannels').flatMap(e => children(e, 'channel'))];
        const regularCount = children(format, 'channel').length;
        const properties = children(sources[0]!, 'channelProperties').flatMap(e => children(e, 'channelProperty'));
        const channels = channelElements.map((channel, index): InkChannel => {
          const name = attribute(channel, 'name');
          const type = attribute(channel, 'type') ?? 'decimal';
          if (!name || !['integer', 'decimal', 'double', 'boolean'].includes(type)) throw new InkError('structure', 'Invalid InkML channel name or type.');
          const numeric = (value: string | undefined) => {
            if (value === undefined) return undefined;
            if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new InkError('structure', `Invalid numeric property in ${name}.`);
            return Number(value);
          };
          const min = numeric(attribute(channel, 'min')), max = numeric(attribute(channel, 'max'));
          if (min !== undefined && max !== undefined && min > max) throw new InkError('structure', 'Channel minimum exceeds maximum.');
          const resolutions = properties.filter(p => attribute(p, 'channel') === name && attribute(p, 'name') === 'resolution');
          if (resolutions.length > 1) throw new InkError('structure', 'Ambiguous channel resolution.');
          const resolution = resolutions[0] && numeric(attribute(resolutions[0], 'value'));
          const resolutionUnits = resolutions[0] && attribute(resolutions[0], 'units');
          const units = attribute(channel, 'units');
          const initial = attribute(channel, 'default');
          let defaultValue: number | boolean | undefined;
          if (initial !== undefined) {
            if (type === 'boolean') {
              if (initial !== 'T' && initial !== 'F') throw new InkError('structure', 'Invalid boolean channel default.');
              defaultValue = initial === 'T';
            } else defaultValue = numeric(initial);
          }
          return { name, type: type as InkChannel['type'], ...(index < regularCount ? {} : { intermittent: true }),
            ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }),
            ...(units === undefined ? {} : { units }), ...(resolution === undefined ? {} : { resolution }),
            ...(resolutionUnits === undefined ? {} : { resolutionUnits }), ...(defaultValue === undefined ? {} : { defaultValue }) };
        });
        for (const property of properties) {
          if (!channels.some(c => c.name === attribute(property, 'channel'))) throw new InkError('structure', 'channelProperty references an undeclared channel.');
        }
        const points = decodeInkTrace(source.textContent(element), channels);
        const time = channels.findIndex(channel => channel.name === 'T');
        if (time >= 0 && points.some(point => !Number.isSafeInteger(point[time]))) throw new InkError('trace', 'Office time samples must be integer milliseconds.');
        traces.push({ elementId: element.id, id: attribute(element, 'id', XML_NAMESPACE), channels, points, brush });
      } catch (error) {
        if (!(error instanceof InkError)) throw error;
        diagnostics.push({ elementId: element.id, code: error.code, message: error.message });
      }
    }
  };
  visit(source.root);
  return { source, traces, diagnostics, recognition: readOfficeInkRecognition(source) };
}
