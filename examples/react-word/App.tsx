import { useState, useSyncExternalStore } from 'react';
import { NativeWordEditor, createWordArtifact } from '@tumblerjs/word';
import { PageEditor } from './PageEditor.tsx';

const source = createWordArtifact({ paragraphs: [{ runs: [
  { text: 'Edit this highlighted text.', format: { highlight: 'yellow' } },
] }] });

export function App() {
  const [editor, setEditor] = useState(() => new NativeWordEditor({ source }));
  const revision = useSyncExternalStore(editor.subscribe, () => editor.revision);
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
    <PageEditor editor={editor} revision={revision} />
  </main>;
}
