import { useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import { canvasWordTextMeasurer, type NativeWordEditor, type WordLayoutLine } from '@tumblerjs/word';
import { WordBrowserInput } from '@tumblerjs/word/browser';
import { fragmentStyle } from './text-style.ts';

/** The native layout is the editable page. Browser selection runs over its positioned text. */
export function PageEditor({ editor, revision }: { editor: NativeWordEditor; revision: number }) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<WordBrowserInput | null>(null);
  const [compositionVersion, resetCompositionDom] = useReducer(value => value + 1, 0);
  const measurer = useMemo(() => canvasWordTextMeasurer(document.createElement('canvas').getContext('2d')!), []);
  const blocks = editor.blocks;
  const layout = useMemo(() => editor.document.layout(measurer), [editor, blocks, measurer]);
  const paragraphIds = new Map(editor.document.paragraphs().map((paragraph, index) => {
    const block = blocks[index];
    return [paragraph.id, block?.kind === 'paragraph' ? block.id : undefined];
  }));

  useLayoutEffect(() => {
    const element = root.current!;
    input.current = new WordBrowserInput(element, editor);
    // IME owns provisional DOM until it commits or cancels. Replace it after composition ends.
    element.addEventListener('compositionend', resetCompositionDom);
    return () => {
      input.current?.destroy();
      input.current = null;
      element.removeEventListener('compositionend', resetCompositionDom);
    };
  }, [editor]);
  useLayoutEffect(() => { input.current?.restoreSelection(); }, [editor, revision, compositionVersion]);

  function lineView(line: WordLayoutLine) {
    const paragraphId = paragraphIds.get(line.paragraphElementId)!;
    let right = line.x;
    return <p
      key={`${paragraphId}:${line.startOffset}`}
      className="text-line"
      data-word-paragraph={paragraphId}
      data-word-start={line.startOffset}
      data-word-end={line.endOffset}
      style={{ left: `${line.x}pt`, top: `${line.y}pt`, width: `${Math.max(1, line.width)}pt`, height: `${line.height}pt` }}
    >{line.fragments.length ? line.fragments.map((fragment, index) => {
      const gap = fragment.x - right;
      right = fragment.x + fragment.width;
      return <span
        key={index}
        className="text-fragment"
        data-word-paragraph={paragraphId}
        data-word-start={fragment.startOffset}
        data-word-end={fragment.endOffset}
        style={fragmentStyle(fragment, line.y, gap)}
      >{fragment.text}</span>;
    }) : <span className="empty-line" style={{ fontSize: '12pt', lineHeight: `${line.height}pt` }}><br /></span>}</p>;
  }

  return <div
    ref={root}
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-label="Document text"
    aria-multiline="true"
    className="document-editor"
    spellCheck={false}
  ><div key={compositionVersion}>{layout.pages.map(page => <section
    key={page.index}
    className="word-page"
    aria-label={`Page ${page.index + 1}`}
    style={{ width: `${page.width}pt`, height: `${page.height}pt` }}
  >{page.columns.flatMap(column => column.lines.map(lineView))}</section>)}</div></div>;
}
