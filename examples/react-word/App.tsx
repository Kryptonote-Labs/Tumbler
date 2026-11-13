import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { NativeWordEditor, createWordArtifact, type WordContentBlock } from '@tumblerjs/word';
import { WordBrowserInput } from '@tumblerjs/word/browser';
import { Preview } from './Preview.tsx';

const source = createWordArtifact({ paragraphs: [{ runs: [
  { text: 'Edit this highlighted text.', format: { highlight: 'yellow' } },
] }] });

export function App() {
  const [editor, setEditor] = useState(() => new NativeWordEditor({ source }));
  const revision = useSyncExternalStore(editor.subscribe, () => editor.revision);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<WordBrowserInput | null>(null);
  useLayoutEffect(() => {
    input.current = new WordBrowserInput(root.current!, editor);
    return () => { input.current?.destroy(); input.current = null; };
  }, [editor]);
  useLayoutEffect(() => { input.current?.restoreSelection(); }, [editor, revision]);

  function paragraphs(blocks: readonly WordContentBlock[]) {
    return blocks.map(block => {
      if (block.kind !== 'paragraph') return null;
      let offset = 0;
      return <p key={block.id} data-word-paragraph={block.id}>{block.runs.length ? block.runs.map((run, index) => {
        const format = editor.formatAt({ paragraphId: block.id!, offset });
        offset += run.text.length;
        const style: CSSProperties = {
          fontFamily: format.fontFamily, fontSize: `${format.fontSizePoints}pt`,
          fontWeight: format.bold ? 700 : 400, fontStyle: format.italic ? 'italic' : 'normal',
          textDecoration: [format.underline !== 'none' ? 'underline' : '', format.strike ? 'line-through' : ''].join(' '),
          color: format.color, backgroundColor: format.highlight === 'none' ? undefined : format.highlight,
        };
        return <span key={index} style={style}>{run.text}</span>;
      }) : <br />}</p>;
    });
  }

  function download() {
    const bytes = editor.document.artifact().bytes();
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'document.docx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return <main>
    <h1>Tumbler React editor</h1>
    <div className="toolbar" onPointerDown={event => event.preventDefault()}>
      <button onClick={() => editor.applyFormatting({ bold: !(editor.typingFormat.bold ?? editor.formatAt().bold) })}>Bold</button>
      <button onClick={() => editor.applyFormatting({ highlight: null })}>Clear highlight</button>
      <button disabled={!editor.canUndo} onClick={() => editor.undo()}>Undo</button>
      <button disabled={!editor.canRedo} onClick={() => editor.redo()}>Redo</button>
      <button onClick={download}>Download DOCX</button>
      <button onClick={() => setEditor(new NativeWordEditor({ source: editor.document.artifact() }))}>Export and reopen</button>
    </div>
    <div ref={root} contentEditable suppressContentEditableWarning role="textbox" aria-label="Document text" aria-multiline="true" className="editor">
      {/* Replace the input DOM after commits, including provisional IME DOM. The adapter restores selection. */}
      <div key={revision}>{paragraphs(editor.blocks)}</div>
    </div>
    <Preview editor={editor} />
  </main>;
}
