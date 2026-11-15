import type { Node } from 'prosemirror-model';
import { noteColours } from './index';

export interface NotePreviewCanvas {
  fillStyle: unknown;
  font: string;
  textBaseline: unknown;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
}

/** Paint the beginning of a continuous note without converting it into a paginated document. */
export function paintNotePreview(
  ctx: NotePreviewCanvas,
  document: Node,
  width: number,
  height: number,
  theme: 'light' | 'dark' = 'dark',
) {
  const padding = 28;
  const bottom = height - padding;
  const palette =
    theme === 'light'
      ? {
          background: '#f8faf8',
          surface: '#ffffff',
          text: '#1d2b1e',
          muted: '#526151',
          border: '#e1e6df',
        }
      : {
          background: '#121212',
          surface: '#181818',
          text: '#e2fee7',
          muted: '#9baa9d',
          border: '#303030',
        };
  let y = padding;
  ctx.save();
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  ctx.rect(padding, padding, width - padding * 2, height - padding * 2);
  ctx.clip();
  ctx.textBaseline = 'alphabetic';
  const font = (size: number, bold = false, italic = false, mono = false) =>
    `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${size}px "${mono ? 'IBM Plex Mono' : 'Inter'}", "Noto Color Emoji"`;
  const inline = (node: Node, x: number, size: number, heading = false) => {
    const left = x;
    const lineHeight = size * 1.6;
    if (y + lineHeight > bottom) {
      y = height;
      return;
    }
    for (let i = 0; i < node.childCount && y < height; i++) {
      const child = node.child(i);
      if (child.type.name === 'hard_break') {
        x = left;
        y += lineHeight;
        continue;
      }
      const text = child.isText
        ? child.text!
        : child.type.name === 'image'
          ? '[Image]'
          : child.textContent;
      const marks = child.marks;
      ctx.font = font(
        size,
        heading || marks.some((m) => m.type.name === 'strong'),
        marks.some((m) => m.type.name === 'em'),
        marks.some((m) => m.type.name === 'code'),
      );
      const colour = marks.find((m) => m.type.name === 'colour');
      const highlight = marks.find((m) => m.type.name === 'highlight');
      const ink = colour
        ? noteColours.find((c) => c.name === colour.attrs.colour)?.text
        : undefined;
      for (const word of text.matchAll(/\s+|\S+/g)) {
        if (y >= height) break;
        const whitespace = /^\s+$/.test(word[0]);
        const value = whitespace ? ' ' : word[0];
        const advance = ctx.measureText(value).width;
        if (x > left && x + advance > width - padding) {
          x = left;
          y += lineHeight;
        }
        if (y + lineHeight > bottom) {
          y = height;
          break;
        }
        if (whitespace && x === left) continue;
        if (highlight) {
          ctx.fillStyle =
            noteColours.find((c) => c.name === highlight.attrs.colour)?.highlight ?? '#e5c33238';
          ctx.fillRect(x, y, advance, lineHeight);
        }
        ctx.fillStyle = ink ?? (heading ? palette.text : palette.muted);
        ctx.fillText(value, x, y + size, Math.max(1, width - padding - x));
        if (marks.some((m) => m.type.name === 'strike'))
          ctx.fillRect(x, y + size * 0.6, advance, 1);
        x += advance;
      }
    }
    y += lineHeight;
  };
  const block = (node: Node, depth = 0, marker?: string) => {
    if (y >= height) return;
    const x = padding + depth * 18;
    if (node.type.name === 'code_block') {
      const lineHeight = 21;
      const text = node.textContent;
      let offset = 0;
      const rows: string[] = [];
      const maxRows = Math.floor((bottom - y - 40) / lineHeight);
      if (maxRows < 1) {
        y = height;
        return;
      }
      while (offset <= text.length && rows.length < maxRows) {
        const end = text.indexOf('\n', offset);
        rows.push(text.slice(offset, end < 0 ? text.length : end));
        if (end < 0) break;
        offset = end + 1;
      }
      ctx.fillStyle = palette.surface;
      ctx.fillRect(x, y, width - padding - x, 36 + rows.length * lineHeight);
      ctx.font = font(11);
      ctx.fillStyle = palette.muted;
      ctx.fillText(String(node.attrs.params || 'Plain text'), x + 12, y + 20);
      y += 30;
      ctx.font = font(13, false, false, true);
      ctx.fillStyle = palette.text;
      for (const line of rows) {
        ctx.fillText(line, x + 12, y + 13, width - padding - x - 24);
        y += lineHeight;
      }
      y += 18;
    } else if (node.isTextblock) {
      if (marker) {
        ctx.font = font(15);
        ctx.fillStyle = palette.muted;
        ctx.fillText(marker, x - 16, y + 15);
      }
      const heading = node.type.name === 'heading';
      inline(
        node,
        x,
        heading ? Math.max(17, 34 - (Number(node.attrs.level) - 1) * 4) : 15,
        heading,
      );
      y += heading ? 10 : 12;
    } else if (node.type.name === 'horizontal_rule') {
      ctx.fillStyle = palette.border;
      ctx.fillRect(x, y + 4, width - padding - x, 1);
      y += 20;
    } else {
      const list = node.type.name === 'bullet_list' || node.type.name === 'ordered_list';
      const quote = node.type.name === 'blockquote' || node.type.name === 'callout';
      for (let i = 0; i < node.childCount && y < height; i++) {
        const child = node.child(i);
        const label = list
          ? node.type.name === 'ordered_list'
            ? `${Number(node.attrs.order ?? 1) + i}.`
            : child.attrs.checked === null
              ? '•'
              : child.attrs.checked
                ? '☑'
                : '☐'
          : marker;
        block(child, depth + (list || quote ? 1 : 0), label);
      }
    }
  };
  for (let i = 0; i < document.childCount && y < height; i++) block(document.child(i));
  ctx.restore();
}
