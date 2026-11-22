import { commandEnd, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

const rgb = (channels: number[]) => '#' + channels.map(value => value.toString(16).padStart(2,'0')).join('');
const palette = new Map([
  ['black','#000000'],['white','#ffffff'],['red','#ff0000'],['green','#00ff00'],['blue','#0000ff'],
  ['cyan','#00ffff'],['magenta','#ff00ff'],['yellow','#ffff00'],['gray','#808080'],
]);

/** Validate the literal colour models understood by the color and xcolor packages. */
export function latexColourDefinition(source: string, start = 0) {
  const end = commandEnd(source, start);
  if (source.slice(start, end) !== '\\definecolor') return;
  const name = groupAt(source, whitespaceEnd(source, end));
  const model = name && groupAt(source, whitespaceEnd(source, name.end));
  const argument = model && groupAt(source, whitespaceEnd(source, model.end));
  if (!name || !model || !argument) return;
  const key = source.slice(name.from, name.to).trim();
  const kind = source.slice(model.from, model.to).trim();
  const value = source.slice(argument.from, argument.to).trim();
  if (kind === 'HTML' && /^[a-fA-F0-9]{6}$/.test(value))
    return { name: key, colour: '#' + value.toLowerCase(), end: argument.end };
  const channels = value.split(',').map(component => component.trim());
  if (channels.some(part => !/^\d*\.?\d+$/.test(part))) return;
  const numbers = channels.map(Number);
  const count = kind === 'gray' ? 1 : 3;
  if (!['RGB', 'rgb', 'gray'].includes(kind) || numbers.length !== count) return;
  const limit = kind === 'RGB' ? 255 : 1;
  if (numbers.some(component => component < 0 || component > limit)) return;
  const values = kind === 'gray' ? Array<number>(3).fill(numbers[0]!) : numbers;
  return { name: key, colour: rgb(values.map(value => Math.round(value * 255 / limit))), end: argument.end };
}

export function readLatexColours(prefix: string) {
  const colours = new Map(palette);
  for (const { name, start } of latexCommands(prefix)) {
    if (name !== 'definecolor') continue;
    const definition = latexColourDefinition(prefix, start);
    if (definition) colours.set(definition.name, definition.colour);
  }
  return colours;
}

/** Resolve named xcolor expressions with a single percentage blend. */
export function resolveLatexColour(value: string, colours: ReadonlyMap<string, string>) {
  const [name, percentage, other = 'white', ...extra] = value.trim().split('!');
  const first = colours.get(name ?? '');
  if (!first || extra.length) return;
  if (percentage === undefined) return first;
  const part = Number(percentage) / 100;
  const second = colours.get(other);
  if (!second || !percentage.trim() || !Number.isFinite(part) || part < 0 || part > 1) return;
  const channels = [1, 3, 5].map(at => Math.round(
    Number.parseInt(first.slice(at, at + 2), 16) * part +
    Number.parseInt(second.slice(at, at + 2), 16) * (1 - part),
  ));
  return rgb(channels);
}
