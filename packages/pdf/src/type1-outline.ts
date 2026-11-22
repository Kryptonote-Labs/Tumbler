import { invalid, unsupported } from './objects.ts';

const accentNames = new Map([
  [193, 'grave'],
  [194, 'acute'],
  [195, 'circumflex'],
  [196, 'tilde'],
  [197, 'macron'],
  [198, 'breve'],
  [199, 'dotaccent'],
  [200, 'dieresis'],
  [202, 'ring'],
  [203, 'cedilla'],
  [205, 'hungarumlaut'],
  [206, 'ogonek'],
  [207, 'caron'],
  [245, 'dotlessi'],
]);

function standardGlyph(code: number) {
  return (
    accentNames.get(code) ??
    ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)
      ? String.fromCharCode(code)
      : undefined)
  );
}

/** Interpret an Adobe Type 1 charstring as outline geometry in its design units. */
export function type1Outline(
  font: { subrs: ReadonlyMap<number, Uint8Array>; glyphs: ReadonlyMap<string, Uint8Array> },
  glyph: string,
) {
  const path: string[] = [];
  let operations = 0;
  const paint = (name: string, offsetX: number, offsetY: number, depth: number) => {
    const code = font.glyphs.get(name);
    if (!code) return;
    if (depth > 16) invalid('Type 1 glyph components are nested too deeply.');
    const stack: number[] = [];
    const postscript: number[] = [];
    let x = 0,
      y = 0,
      bearing = 0;
    let flex: number[][] | undefined;
    const take = (count: number) => {
      if (stack.length < count) return invalid('Missing Type 1 charstring operands.');
      return stack.splice(-count, count);
    };
    const point = (px: number, py: number) => {
      if (!Number.isFinite(px) || !Number.isFinite(py))
        invalid('Invalid Type 1 outline coordinate.');
      return `${px + offsetX} ${py + offsetY}`;
    };
    const move = (dx: number, dy: number) => {
      if (flex) flex.push([dx, dy]);
      else path.push(`M${point((x += dx), (y += dy))}`);
    };
    const line = (dx: number, dy: number) => path.push(`L${point((x += dx), (y += dy))}`);
    const curve = (a: number, b: number, c: number, d: number, e: number, f: number) => {
      const first = point((x += a), (y += b));
      const second = point((x += c), (y += d));
      path.push(`C${first} ${second} ${point((x += e), (y += f))}`);
    };
    const execute = (bytes: Uint8Array, level: number) => {
      if (level > 32) invalid('Type 1 charstring subroutines are nested too deeply.');
      let at = 0;
      const read = () => bytes[at++] ?? invalid('Truncated Type 1 charstring operand.');
      while (at < bytes.length) {
        if (++operations > 1_000_000 || stack.length > 48)
          invalid('Invalid Type 1 charstring complexity.');
        const byte = read();
        if (byte >= 32) {
          if (byte <= 246) stack.push(byte - 139);
          else if (byte <= 250) stack.push(((byte - 247) << 8) + read() + 108);
          else if (byte <= 254) stack.push(-(((byte - 251) << 8) + read() + 108));
          else stack.push((read() << 24) | (read() << 16) | (read() << 8) | read());
          continue;
        }
        const opcode = byte === 12 ? 0x100 + read() : byte;
        switch (opcode) {
          case 1:
          case 3:
          case 0x100:
          case 0x101:
          case 0x102:
            stack.length = 0;
            break;
          case 4:
            move(0, take(1)[0]!);
            break;
          case 5: {
            const [dx, dy] = take(2);
            line(dx!, dy!);
            break;
          }
          case 6:
            line(take(1)[0]!, 0);
            break;
          case 7:
            line(0, take(1)[0]!);
            break;
          case 8: {
            const [a, b, c, d, e, f] = take(6);
            curve(a!, b!, c!, d!, e!, f!);
            break;
          }
          case 9:
            path.push('Z');
            break;
          case 10: {
            const subr = font.subrs.get(take(1)[0]!);
            if (!subr) invalid('Missing Type 1 charstring subroutine.');
            execute(subr!, level + 1);
            break;
          }
          case 11:
          case 14:
            return;
          case 13:
            x = bearing = take(2)[0]!;
            y = 0;
            break;
          case 21: {
            const [dx, dy] = take(2);
            move(dx!, dy!);
            break;
          }
          case 22:
            move(take(1)[0]!, 0);
            break;
          case 30: {
            const [a, b, c, d] = take(4);
            curve(0, a!, b!, c!, d!, 0);
            break;
          }
          case 31: {
            const [a, b, c, d] = take(4);
            curve(a!, 0, b!, c!, 0, d!);
            break;
          }
          case 0x106: {
            const [asb, dx, dy, baseCode, accentCode] = take(5);
            const base = standardGlyph(baseCode!);
            const accent = standardGlyph(accentCode!);
            if (base) paint(base, offsetX, offsetY, depth + 1);
            if (accent) paint(accent, offsetX + bearing + dx! - asb!, offsetY + dy!, depth + 1);
            return;
          }
          case 0x107: {
            const [bx, by] = take(4);
            x = bearing = bx!;
            y = by!;
            break;
          }
          case 0x10c: {
            const [num, den] = take(2);
            stack.push(num! / den!);
            break;
          }
          case 0x110: {
            const [count, subroutine] = take(2);
            if (count! < 0 || !Number.isSafeInteger(count))
              invalid('Invalid Type 1 OtherSubr argument count.');
            const args = take(count!);
            if (subroutine === 3) postscript.push(...args);
            else if (subroutine === 1) flex = [];
            else if (subroutine === 0 && flex?.length === 7) {
              const [lead, a, b, c, d, e, f] = flex;
              curve(lead![0]! + a![0]!, lead![1]! + a![1]!, b![0]!, b![1]!, c![0]!, c![1]!);
              curve(d![0]!, d![1]!, e![0]!, e![1]!, f![0]!, f![1]!);
              flex = undefined;
              postscript.push(args[2] ?? y, args[1] ?? x);
            } else if (subroutine !== 2) unsupported('Unsupported Type 1 OtherSubr.');
            break;
          }
          case 0x111:
            stack.push(postscript.pop() ?? invalid('Missing Type 1 OtherSubr result.'));
            break;
          case 0x121: {
            const [px, py] = take(2);
            x = px!;
            y = py!;
            break;
          }
          default:
            unsupported(`Unsupported Type 1 charstring operator ${opcode}.`);
        }
      }
    };
    execute(code, 0);
  };
  paint(glyph, 0, 0, 0);
  return path.join(' ');
}
