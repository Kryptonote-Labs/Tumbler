import { useEffect, useRef } from 'react';
import { canvasWordTextMeasurer, paintWordPage, type NativeWordEditor } from '@tumblerjs/word';

export function Preview({ editor }: { editor: NativeWordEditor }) {
  const root = useRef<HTMLDivElement>(null);
  const blocks = editor.blocks;
  useEffect(() => {
    const measuring = document.createElement('canvas').getContext('2d')!;
    const layout = editor.document.layout(canvasWordTextMeasurer(measuring));
    const canvases = layout.pages.map(page => {
      const canvas = document.createElement('canvas');
      const pixelsPerPoint = 4 / 3;
      canvas.width = Math.ceil(page.width * pixelsPerPoint);
      canvas.height = Math.ceil(page.height * pixelsPerPoint);
      canvas.setAttribute('aria-label', `Page ${page.index + 1}`);
      const context = canvas.getContext('2d')!;
      context.scale(pixelsPerPoint, pixelsPerPoint);
      paintWordPage(context, page);
      return canvas;
    });
    root.current!.replaceChildren(...canvases);
  }, [editor, blocks]);
  return <div ref={root} className="preview" aria-label="Document page preview" />;
}
