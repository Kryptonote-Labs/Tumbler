import { expect, test } from 'bun:test';
import { parseNote } from '@tumblerjs/markdown';
import { paintNotePreview, type NotePreviewCanvas } from '@tumblerjs/markdown/preview';

test('note previews preserve headings, block spacing, colours and code indentation on a continuous canvas', async () => {
  const text: { value: string; font: string; ink: unknown; y: number }[] = [];
  const ctx: NotePreviewCanvas = {
    fillStyle: '',
    font: '',
    textBaseline: '',
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    measureText(value) {
      return { width: value.length * 8 };
    },
    fillText(value, _x, y) {
      text.push({ value, y, font: this.font, ink: this.fillStyle });
    },
  };
  const markdown =
    '# Heading\n\nA =🔴red= paragraph.\n\n```java\n  int count = 1;\n  count++;\n```';
  paintNotePreview(ctx, parseNote(markdown), 480, 384);
  expect(text.find((run) => run.value === 'Heading')?.font).toContain('34px');
  expect(text.find((run) => run.value === 'red')?.ink).toBe('#e05252');
  expect(text.find((run) => run.value === 'A')!.y).toBeGreaterThan(text[0]!.y);
  expect(text.find((run) => run.value === '  int count = 1;')?.font).toContain('IBM Plex Mono');
  expect(text.some((run) => run.value === '  count++;')).toBe(true);
  text.length = 0;
  paintNotePreview(
    ctx,
    parseNote('# Heading\n\n' + 'Long paragraph words. '.repeat(100)),
    480,
    180,
    'light',
  );
  expect(text.every((run) => run.y + Number(/(\d+)px/.exec(run.font)![1]) * 0.3 <= 180 - 28)).toBe(
    true,
  );
});
