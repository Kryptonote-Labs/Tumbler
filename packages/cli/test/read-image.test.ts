import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import * as Y from 'yjs';
import { createWordArtifact } from '@tumblerjs/word';
import { readWordImage } from '@tumblerjs/word/operations';
import { createFileHost } from '../src/file-host.ts';
import { runTumbler } from '../src/index.ts';

test('read-image resolves inspected DOCX images to their original bytes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tumbler-image-'));
  const path = join(directory, 'image.docx');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII=',
    'base64',
  );
  const source = createWordArtifact({
    blocks: [
      {
        kind: 'image',
        bytes: png,
        contentType: 'image/png',
        width: 100,
        height: 80,
        alt: 'A picture',
      },
    ],
  });
  writeFileSync(path, source.bytes());
  const host = createFileHost();
  try {
    const objects = z
      .object({
        objects: z.array(
          z.object({ attributes: z.object({ image: z.object({ id: z.string() }) }) }),
        ),
      })
      .parse(await host.inspect!(path, { what: 'objects', region: 'body', offset: 0 }));
    const id = objects.objects[0]!.attributes.image.id;
    let stdout = '';
    const errors: string[] = [];
    const options = {
      host,
      stdout: (value: string) => {
        stdout += value;
      },
      stderr: (value: string) => {
        errors.push(value);
      },
    };
    expect(await runTumbler([path, 'read-image', '--input', JSON.stringify({ id })], options)).toBe(
      0,
    );
    const result = z
      .object({
        image: z.object({ id: z.string(), alt: z.string() }),
        type: z.string(),
        data: z.string(),
      })
      .parse(JSON.parse(stdout));
    expect(result.image).toEqual({ id, alt: 'A picture' });
    expect(result.type).toBe('image/png');
    expect(Buffer.from(result.data, 'base64')).toEqual(png);
    expect(await runTumbler([path, 'read-image', '--input', '{"id":"missing"}'], options)).toBe(1);
    expect(errors.join('')).toContain('not present');
    expect(
      await runTumbler(
        [path, 'read-image', '--input', JSON.stringify({ id, unexpected: true })],
        options,
      ),
    ).toBe(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('live image lookup leaves hosted bytes to the host and rejects removed images', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  const image = { id: 'hosted-image', type: 'image/png' as const, width: 100, height: 80, alt: '' };
  try {
    text.insert(0, 'Text');
    text.insert(4, '\uFFFC', { image });
    expect(readWordImage(text, undefined, image.id)).toEqual({ image, offset: 4 });
    text.delete(0, text.length);
    expect(() => readWordImage(text, undefined, image.id)).toThrow('not present');
  } finally {
    doc.destroy();
  }
});
