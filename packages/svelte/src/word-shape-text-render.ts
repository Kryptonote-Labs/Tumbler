import {
  resolveWordColour,
  type NativeWordDocument,
  type WordTextParagraph,
} from '@tumblerjs/word';
import { wordTextCss } from './word-font-metrics.ts';

/** Use the document engine's resolved styles for both editing and static shape text. */
export function renderShapeText(
  root: HTMLDivElement,
  paragraphs: readonly WordTextParagraph[],
  model: NativeWordDocument,
) {
  model.update(paragraphs.map((p) => ({ kind: 'paragraph', ...p })));
  root.replaceChildren();
  let offset = 0;
  paragraphs.forEach((p, index) => {
    const block = model.blocks[index];
    if (!block || block.kind !== 'paragraph') return;
    const computed = model.paragraphFormat(block);
    const element = document.createElement('div');
    element.dataset.shapeParagraph = String(offset);
    element.style.cssText = `text-align:${computed.alignment === 'start' ? 'left' : computed.alignment === 'end' ? 'right' : computed.alignment};margin:${computed.spacingBeforeTwips / 15}px 0 ${computed.spacingAfterTwips / 15}px;padding-left:${computed.indentStartTwips / 15}px;padding-right:${computed.indentEndTwips / 15}px;min-height:1em;white-space:pre-wrap;overflow-wrap:anywhere`;
    if (computed.lineSpacing)
      element.style.lineHeight =
        computed.lineSpacing.rule === 'auto'
          ? String(computed.lineSpacing.value / 240)
          : `${computed.lineSpacing.value / 15}px`;
    element.style.textIndent = `${(computed.firstLineTwips - computed.hangingTwips) / 15}px`;
    if (computed.shading) element.style.backgroundColor = computed.shading;
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const border = computed.borders?.[side];
      if (border)
        element.style.setProperty(
          `border-${side}`,
          `${(border.widthPoints * 4) / 3}px ${border.style === 'single' ? 'solid' : border.style} ${resolveWordColour(border.color)}`,
        );
    }
    const marker = model.listMarkers.get(block.elementId);
    if (marker) {
      element.style.display = 'list-item';
      element.style.listStyleType = JSON.stringify(marker.text + ' ');
    }
    const runs = block.inlines.flatMap((i) => (i.kind === 'run' ? [i] : []));
    p.runs.forEach((r, i) => {
      const span = document.createElement('span');
      const format = model.runFormat(block, runs[i]);
      span.style.cssText = wordTextCss(format);
      if (format.verticalAlign !== 'baseline') {
        span.style.verticalAlign = format.verticalAlign === 'superscript' ? 'super' : 'sub';
        span.style.fontSize = `${format.fontSizePoints}px`;
      }
      span.textContent = r.text;
      element.append(span);
      offset += r.text.length;
    });
    if (!element.textContent) element.append(document.createElement('br'));
    offset++;
    root.append(element);
  });
}
