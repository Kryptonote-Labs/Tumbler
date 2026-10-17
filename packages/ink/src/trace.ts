export interface InkChannel {
  readonly name: string;
  readonly type: 'integer' | 'decimal' | 'double' | 'boolean';
  readonly intermittent?: boolean;
  readonly defaultValue?: number | boolean;
  readonly min?: number;
  readonly max?: number;
  readonly units?: string;
  readonly resolution?: number;
  readonly resolutionUnits?: string;
}

export type InkValue = number | boolean | null;
export type InkPoint = readonly InkValue[];

export class InkError extends Error {
  constructor(readonly code: 'trace' | 'structure' | 'reference' | 'range', message: string) {
    super(message);
    this.name = 'InkError';
  }
}

const numberToken = /^(?:#[0-9A-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/;
type Mode = '!' | "'" | '"';
interface State { mode: Mode; value: InkValue; delta?: number; raw: InkValue }

/** W3C InkML §3.2.2: each channel has independent persistent difference state. */
export function decodeInkTrace(text: string, channels: readonly InkChannel[]): readonly InkPoint[] {
  if (!channels.length || new Set(channels.map(c => c.name)).size !== channels.length) throw new InkError('trace', 'Trace channels must be nonempty and unique.');
  let intermittent = false;
  for (const channel of channels) {
    if ((channel.min !== undefined && !Number.isFinite(channel.min)) || (channel.max !== undefined && !Number.isFinite(channel.max)) || (channel.min !== undefined && channel.max !== undefined && channel.min > channel.max)) throw new InkError('trace', 'Invalid channel bounds.');
    if (channel.defaultValue !== undefined && (typeof channel.defaultValue === 'boolean') !== (channel.type === 'boolean')) throw new InkError('trace', 'Channel default does not match its type.');
    intermittent ||= channel.intermittent === true;
    if (intermittent && !channel.intermittent) throw new InkError('trace', 'Regular channels must precede intermittent channels.');
  }
  const states: (State | undefined)[] = [];
  const trimmed = text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  const samples = trimmed.replace(/,[ \t\r\n]*$/, '').split(',');
  if (!trimmed) return [];
  return samples.map((sample, pointIndex) => {
    let cursor = 0;
    const skip = () => { while (/[ \t\r\n]/.test(sample[cursor] ?? '') && cursor < sample.length) cursor++; };
    const point = channels.map((channel, index): InkValue => {
      skip();
      const prior = states[index];
      let mode = prior?.mode ?? '!';
      const prefix = sample[cursor];
      const explicitMode = prefix === '!' || prefix === "'" || prefix === '"';
      if (explicitMode) {
        if (channel.intermittent) throw new InkError('trace', 'Intermittent channels cannot use difference encoding.');
        mode = prefix; cursor++; skip();
      }
      let raw: InkValue;
      const token = sample[cursor];
      if (token === '?' || token === '*' || (token === undefined && channel.intermittent)) {
        if (explicitMode) throw new InkError('trace', 'Difference prefixes require a number.');
        if (token !== undefined) cursor++;
        if (token === '?') {
          if (!channel.intermittent) throw new InkError('trace', 'Only intermittent channels may omit a sample.');
          return null;
        }
        if (!prior && !channel.intermittent) throw new InkError('trace', 'The first regular sample must be explicit.');
        raw = prior?.raw ?? channel.defaultValue ?? (channel.type === 'boolean' ? false : 0);
      } else if (token === 'T' || token === 'F') {
        if (explicitMode || channel.type !== 'boolean') throw new InkError('trace', 'Boolean sample in a numeric channel.');
        raw = token === 'T'; cursor++;
      } else {
        let sign = 1;
        if (token === '-') { sign = -1; cursor++; skip(); }
        const match = numberToken.exec(sample.slice(cursor));
        if (!match) throw new InkError('trace', `Invalid sample at point ${pointIndex}, channel ${channel.name}.`);
        cursor += match[0].length;
        raw = sign * (match[0][0] === '#' ? parseInt(match[0].slice(1), 16) : Number(match[0]));
        if (channel.type === 'boolean') throw new InkError('trace', 'Boolean channels require T or F.');
      }
      let value = raw;
      let delta: number | undefined;
      if (mode !== '!') {
        if (typeof raw !== 'number' || typeof prior?.value !== 'number') throw new InkError('trace', 'Differences require a preceding numeric sample.');
        if (mode === '"' && prior.delta === undefined) throw new InkError('trace', 'Second differences require a preceding first difference.');
        delta = mode === '"' ? prior.delta! + raw : raw;
        value = prior.value + delta;
      }
      if (typeof value === 'number' && (!Number.isFinite(value) || (channel.type === 'integer' && !Number.isSafeInteger(value)))) {
        throw new InkError('trace', `Sample outside ${channel.name}'s representable range.`);
      }
      if (typeof value === 'number' && ((channel.min !== undefined && value < channel.min) || (channel.max !== undefined && value > channel.max))) {
        throw new InkError('range', `Sample ${pointIndex} in channel ${channel.name} is ${value}, outside declared bounds ${channel.min ?? '-Infinity'}..${channel.max ?? 'Infinity'}.`);
      }
      states[index] = { mode, value, raw, ...(delta === undefined ? {} : { delta }) };
      return value;
    });
    skip();
    if (cursor !== sample.length) throw new InkError('trace', `Extra data at point ${pointIndex}.`);
    return point;
  });
}

/** Absolute encoding avoids carrying compression state across edits or trace boundaries. */
export function encodeInkTrace(points: readonly InkPoint[], channels: readonly InkChannel[]): string {
  const text = points.map(point => {
    if (point.length !== channels.length) throw new InkError('trace', 'Point channel count does not match traceFormat.');
    return point.map(value => value === null ? '?' : typeof value === 'boolean' ? value ? 'T' : 'F' : String(value)).join(' ');
  }).join(', ');
  decodeInkTrace(text, channels);
  return text;
}
