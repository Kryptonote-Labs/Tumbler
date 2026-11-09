import { beginLosslessXmlEdit, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { openPresentationArtifact, type PresentationArtifact } from './artifact.ts';
import { objectTarget } from './authoring-objects.ts';
import { children, editable, raw } from './authoring-slides.ts';
import { A, R, xml } from './authoring-xml.ts';
import type { PresentationCommand } from './commands.ts';
import type { SlideText } from './model.ts';
type Metadata = Extract<PresentationCommand, { name: 'set-link' | 'set-alt-text' | 'replace-picture' }>;
const descendants = (e: LosslessXmlElement): LosslessXmlElement[] => children(e).flatMap(c => [c, ...descendants(c)]);

/** Split linked runs at range boundaries, preserving every other run property. */
export function linkedText(text: SlideText, start: number, end: number, href: string): SlideText {
  const length = text.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n').length;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > length) throw new RangeError('Invalid link range.');
  let offset = 0;
  return { ...text, paragraphs: text.paragraphs.map(p => {
    const runs = p.runs.flatMap(run => {
      const at = offset; offset += run.text.length;
      const a = Math.max(0, start - at), b = Math.min(run.text.length, end - at);
      if (b <= a) return [run];
      const authored = new Set(run.nativeAuthored); authored.add('hyperlink');
      return [
        ...(a ? [{ ...run, text: run.text.slice(0, a) }] : []),
        { ...run, text: run.text.slice(a, b), hyperlink: href ? { href } : undefined, nativeAuthored: [...authored] },
        ...(b < run.text.length ? [{ ...run, text: run.text.slice(b) }] : []),
      ];
    });
    offset++;
    return { ...p, runs };
  }) };
}

/** Metadata edits share the native command path and preserve unrelated Office markup. */
export function authorMetadata(artifact: PresentationArtifact, command: Metadata) {
  editable(artifact);
  if (command.name === 'set-link' && ((command.start === undefined) !== (command.end === undefined))) throw new Error('Provide both link range boundaries.');
  const { slide, object, source } = objectTarget(artifact, command.slideId, command.objectKey);
  const element = source.element(object.elementId)!;
  const all = descendants(element), nv = all.find(e => e.localName === 'cNvPr');
  const edit = beginLosslessXmlEdit(source), tx = beginPackageTransaction(artifact.document.package);
  const strict = artifact.document.conformance === 'strict';
  const a = strict ? 'http://purl.oclc.org/ooxml/drawingml/main' : A;
  const r = strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : R;
  function relation(type: string, target: string, external = false) {
    let id = 'rIdAuthor';
    const ids = new Set(artifact.document.package.relationships(artifact.document.package.getPart(slide.part)!.name).items.map(r => r.id));
    while (ids.has(id)) id += '_';
    tx.addRelationship(slide.part, external ? { id, type: `${r}/${type}`, target, targetMode: 'External' } : { id, type: `${r}/${type}`, target });
    return id;
  }
  if (command.name === 'set-alt-text') {
    if (!nv) throw new Error('Object metadata is missing.');
    const attr = nv.attributes.find(a => a.localName === 'descr');
    if (attr) edit.setAttribute(attr, command.alt);
    else edit.insertAttribute(nv, 'descr', command.alt);
  } else if (command.name === 'replace-picture') {
    if (object.kind !== 'picture') throw new Error('Select a picture.');
    const blip = all.find(e => e.localName === 'blip');
    const attr = blip?.attributes.find(a => a.localName === 'embed');
    if (!attr) throw new Error('Picture source is missing.');
    let n = 1; const pkg = artifact.document.package;
    while (pkg.getPart(`/ppt/media/replacement${n}.bin`)) n++;
    const part = `/ppt/media/replacement${n}.bin`;
    tx.addPart(part, command.contentType, Uint8Array.from(atob(command.data), c => c.charCodeAt(0)));
    edit.setAttribute(attr, relation('image', part));
  } else {
    const markup = command.href ? `<a:hlinkClick xmlns:a="${a}" xmlns:r="${r}" r:id="${relation('hyperlink', command.href, true)}"/>` : '';
    if (command.start === undefined) {
      if (!nv) throw new Error('Object metadata is missing.');
      const old = children(nv).find(e => e.localName === 'hlinkClick');
      if (old) edit.replaceElementMarkup(old, markup);
      else if (markup) {
        if (nv.selfClosing) edit.replaceElementMarkup(nv, raw(source, nv).replace(/\/>$/, '>' + markup + `</${nv.qualified}>`));
        else edit.appendMarkup(nv, markup);
      }
    } else {
      const text = command.cell ? object.table?.cells.find(c => c.row === command.cell!.row && c.column === command.cell!.column)?.text : object.text;
      if (!text) throw new Error('Select editable text.');
      if (!object.textEditable && !command.cell) throw new Error('Select editable text.');
      linkedText(text, command.start, command.end!, command.href);
      const cellElement = command.cell ? source.element(object.table!.cells.find(c => c.row === command.cell!.row && c.column === command.cell!.column)!.elementId)! : element;
      const target = descendants(cellElement).find(e => e.localName === 'txBody')!;
      if (!target) throw new Error('Text body is missing.');
      let offset = 0;
      for (const paragraph of children(target).filter(e => e.localName === 'p')) {
        for (const run of children(paragraph).filter(e => e.localName === 'r' || e.localName === 'br')) {
          const t = children(run).find(e => e.localName === 't');
          const value = run.localName === 'br' ? '\n' : t?.children.map(c => c.kind === 'text' || c.kind === 'cdata' ? c.value : '').join('') ?? '';
          const at = offset; offset += value.length;
          const lo = Math.max(0, command.start - at), hi = Math.min(value.length, command.end! - at);
          if (hi <= lo || !t) continue;
          const pr = children(run).find(e => e.localName === 'rPr');
          const props = pr ? raw(source, pr).replace(/<(?:\w+:)?hlink(?:Click|MouseOver)\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?hlink(?:Click|MouseOver)>)/g, '') : '<a:rPr/>';
          const linked = props.endsWith('/>') ? props.slice(0, -2) + '>' + markup + `</${pr?.qualified ?? 'a:rPr'}>` : props.replace(/<\/[^>]+>$/, markup + '$&');
          const render = (value: string, properties: string) => `<a:r xmlns:a="${a}">${properties}<a:t xml:space="preserve">${xml(value)}</a:t></a:r>`;
          edit.replaceElementMarkup(run, (lo ? render(value.slice(0, lo), pr ? raw(source, pr) : '') : '') + render(value.slice(lo, hi), linked) + (hi < value.length ? render(value.slice(hi), pr ? raw(source, pr) : '') : ''));
        }
        offset++;
      }
    }
  }
  tx.replacePart(slide.part, edit.commit().bytes);
  return openPresentationArtifact(tx.commit(), artifact.options);
}
