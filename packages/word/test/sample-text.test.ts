import { describe, expect, test } from 'bun:test';
import {
  createWordArtifact, importWordContent, openWordArtifact, openWordEditingSession,
  wordSampleText, wordSampleTextEdit, type WordParagraph,
} from '../src/index.ts';

describe('Word sample text', () => {
  for (const name of ['rand', 'lorem']) {
    test(`${name} supports default and explicit paragraph and sentence counts`, () => {
      for (const [command, paragraphs, sentences] of [
        [`=${name}()`, 3, 3], [`=${name}(2)`, 2, 3],
        [`=${name}(4,2)`, 4, 2], [`=${name}(,1)`, 3, 1],
        [`=${name}(2,)`, 2, 3], [` =${name.toUpperCase()} ( 2, 1 ) `, 2, 1],
        [`=${name}(17,11)`, 17, 11],
      ] as const) {
        const result = wordSampleText(command)!;
        const lines = result.split('\n');
        expect(lines).toHaveLength(paragraphs);
        for (const line of lines) expect(line.match(/\./g)).toHaveLength(sentences);
        expect(result).not.toContain('undefined');
      }
    });
  }

  test('uses stable English and Latin text', () => {
    expect(wordSampleText('=rand()')).toStartWith('A document begins');
    expect(wordSampleText('=lorem()')).toStartWith('Lorem ipsum dolor sit amet');
    expect(new Set(wordSampleText('=rand()')!.split('\n')).size).toBe(3);
    expect(wordSampleText('=lorem(2,4)')).toBe(wordSampleText('=lorem(2,4)'));
  });

  test('leaves malformed commands and surrounding content literal', () => {
    for (const command of [
      '=random()', '=rand.old()', '=lorem', '=lorem(0)', '=rand(-1)', '=rand(2,0)',
      '=rand(1.5)', '=rand(1e3)', '=rand(2,three)', '=rand(1,2,3)', '=rand(9007199254740992)',
      'Text =rand()', '=rand() text', '=rand()\n', '=rand(\n2)',
    ]) expect(wordSampleText(command)).toBeUndefined();
  });

  test('large expansions export completely and undo in one step', () => {
    const command = '=lorem(1001,12)';
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: command }] }] });
    const session = openWordEditingSession(source.bytes());
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;
    const position = { paragraphElementId: paragraph.elementId, offset: command.length };
    const edit = wordSampleTextEdit(session.artifact.document, { anchor: position, focus: position })!;
    expect(edit.value.length).toBeGreaterThan(1_000_000);
    session.replaceText(edit.selection, edit.value);
    const saved = openWordArtifact(session.artifact.bytes());
    const blocks = importWordContent(saved);
    expect(blocks).toHaveLength(1002);
    expect(blocks.map(block => block.kind === 'paragraph' ? block.runs.map(run => run.text).join('') : '').join('\n'))
      .toBe(edit.value);
    session.undo();
    expect(session.artifact.bytes()).toEqual(source.bytes());
    expect(session.canUndo).toBe(false);
    session.redo();
    expect(session.artifact.bytes()).toEqual(saved.bytes());
  });

  test('expansion is one formatted, exportable edit with undo and redo', () => {
    const source = createWordArtifact({ paragraphs: [
      { runs: [{ text: 'Before' }] },
      { alignment: 'center', runs: [{ text: '=lorem(2,1)', format: { bold: true } }] },
      { runs: [{ text: 'After' }] },
    ] });
    const session = openWordEditingSession(source.bytes());
    const paragraph = session.artifact.document.blocks[1] as WordParagraph;
    const position = { paragraphElementId: paragraph.elementId, offset: '=lorem(2,1)'.length };
    const edit = wordSampleTextEdit(session.artifact.document, { anchor: position, focus: position })!;
    expect(edit.selection.anchor.offset).toBe(0);
    expect(edit.selection.focus).toEqual(position);
    expect(edit.value).toBe(wordSampleText('=lorem(2,1)') + '\n');
    session.replaceText(edit.selection, edit.value);
    const exported = importWordContent(openWordArtifact(session.artifact.bytes()));
    expect(exported.map(block => block.kind === 'paragraph' && block.runs.map(run => run.text).join('')))
      .toEqual(['Before', ...wordSampleText('=lorem(2,1)')!.split('\n'), '', 'After']);
    for (const block of exported.slice(1, 3)) {
      expect(block).toMatchObject({ alignment: 'center' });
      if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
      expect(block.runs.every(run => run.format?.bold)).toBe(true);
    }
    session.undo();
    expect(session.artifact.bytes()).toEqual(source.bytes());
    expect(session.canUndo).toBe(false);
    session.redo();
    expect(importWordContent(session.artifact)).toEqual(exported);
  });

  test('expands inside a table cell without changing neighbouring cells', () => {
    const source = createWordArtifact({ blocks: [{
      kind: 'table', columnWidths: [120, 120], rows: [[
        { blocks: [{ kind: 'paragraph', runs: [{ text: '=rand(2,1)' }] }] },
        { blocks: [{ kind: 'paragraph', runs: [{ text: 'Neighbour' }] }] },
      ]],
    }] });
    const table = source.document.blocks[0]!;
    if (table.kind !== 'table') throw new Error('Expected table');
    const paragraph = table.rows[0]!.cells[0]!.blocks[0] as WordParagraph;
    const position = { paragraphElementId: paragraph.elementId, offset: '=rand(2,1)'.length };
    const edit = wordSampleTextEdit(source.document, { anchor: position, focus: position })!;
    const result = importWordContent(source.replaceText(edit.selection, edit.value))[0]!;
    if (result.kind !== 'table') throw new Error('Expected table');
    expect(result.rows[0]![0]!.blocks).toHaveLength(3);
    expect(result.rows[0]![1]!.blocks).toMatchObject([{ runs: [{ text: 'Neighbour' }] }]);
  });

  test('requires a collapsed caret at the end of the entire command paragraph', () => {
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: '=rand()' }] }] });
    const paragraph = source.document.blocks[0] as WordParagraph;
    const at = (offset: number) => ({ paragraphElementId: paragraph.elementId, offset });
    expect(wordSampleTextEdit(source.document, { anchor: at(3), focus: at(3) })).toBeUndefined();
    expect(wordSampleTextEdit(source.document, { anchor: at(0), focus: at(7) })).toBeUndefined();
    expect(wordSampleTextEdit(source.document, { anchor: at(8), focus: at(8) })).toBeUndefined();
    expect(wordSampleTextEdit(source.document, { anchor: at(7), focus: { paragraphElementId: -1, offset: 7 } })).toBeUndefined();
  });
});
