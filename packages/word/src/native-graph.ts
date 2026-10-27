/** The fixed codec table belongs to one version of the native Word format. */
export interface NativeCodec {
  readonly name: string;
  matches(value: object): boolean;
  write(value: object): unknown;
  read(value: unknown): object;
}

/** Keep the erased constructor input at the versioned, host-owned serialization boundary. */
export function nativeCodec<T extends object, Data>(
  name: string,
  matches: (value: object) => value is T,
  write: (value: T) => Data,
  read: (value: Data) => T,
): NativeCodec {
  return { name, matches, write(value) {
    if (!matches(value)) throw new TypeError(`Expected native ${name}.`);
    return write(value);
  }, read(value) { return read(value as Data); } };
}

type Value = null | boolean | number | string | { r: number } | { u: true } |
  { a: Value[] } | { o: Record<string, Value> } | { m: [Value, Value][] } |
  { b: number } | { c: [string, Value] };
export interface NativeGraph { readonly root: Value; readonly nodes: readonly Value[] }

/** Inline ordinary trees; only genuinely shared objects need graph references. */
export function writeNativeGraph(input: unknown, codecs: readonly NativeCodec[]) {
  const counts = new WeakMap<object, number>();
  const classes = new WeakMap<object, { codec: NativeCodec; data: unknown }>();
  const count = (input: unknown) => {
    if (!input || typeof input !== 'object') return;
    const previous = counts.get(input) ?? 0;
    counts.set(input, previous + 1);
    if (previous || input instanceof Uint8Array) return;
    if (Array.isArray(input)) { input.forEach(count); return; }
    if (input instanceof Map) { for (const [key, value] of input) { count(key); count(value); } return; }
    const codec = codecs.find(codec => codec.matches(input));
    if (codec) {
      const data = codec.write(input);
      classes.set(input, { codec, data });
      count(data);
    } else {
      if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
        throw new TypeError(`Unregistered native object ${input.constructor?.name ?? 'unknown'}.`);
      Object.values(input).forEach(count);
    }
  };
  count(input);
  const nodes: Value[] = [], resources: Uint8Array[] = [];
  const identities = new WeakMap<object, number>();
  const encode = (input: unknown): Value => {
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (input === undefined) return { u: true };
    if (typeof input !== 'object') throw new TypeError('Unsupported native value.');
    const shared = (counts.get(input) ?? 0) > 1 || classes.has(input) || input instanceof Uint8Array;
    if (shared) {
      const previous = identities.get(input);
      if (previous !== undefined) return { r: previous };
      const ref = nodes.length;
      nodes.push(null);
      identities.set(input, ref);
      nodes[ref] = contents(input);
      return { r: ref };
    }
    return contents(input);
  };
  const contents = (input: object): Value => {
    if (input instanceof Uint8Array) {
      const b = resources.length;
      resources.push(input);
      return { b };
    }
    if (Array.isArray(input)) return { a: input.map(encode) };
    if (input instanceof Map) return { m: [...input].map(([key, value]) => [encode(key), encode(value)]) };
    const type = classes.get(input);
    if (type) return { c: [type.codec.name, encode(type.data)] };
    return { o: Object.fromEntries(Object.entries(input).map(([key, value]) => [key, encode(value)])) };
  };
  return { graph: { root: encode(input), nodes } satisfies NativeGraph, resources };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
function isArray(input: unknown): input is unknown[] { return Array.isArray(input); }

/** Validate wire shapes as they are consumed, without cloning the entire graph for validation. */
export function readNativeGraph(input: unknown, resources: readonly Uint8Array[], codecs: readonly NativeCodec[]): unknown {
  if (!isRecord(input) || !isArray(input.nodes)) throw new TypeError('Invalid native graph.');
  const nodes = input.nodes;
  const output = new Map<number, unknown>(), active = new Set<number>();
  const decode = (value: unknown): unknown => {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!isRecord(value) || Object.keys(value).length !== 1) throw new TypeError('Invalid native value.');
    if ('r' in value) {
      const ref = value.r;
      if (typeof ref !== 'number' || !Number.isSafeInteger(ref) || ref < 0 || ref >= nodes.length || active.has(ref))
        throw new TypeError('Invalid native graph reference.');
      if (output.has(ref)) return output.get(ref);
      active.add(ref);
      const result = decode(nodes[ref]);
      active.delete(ref);
      output.set(ref, result);
      return result;
    }
    if (value.u === true) return undefined;
    if ('b' in value) {
      const index = value.b;
      if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || !(resources[index] instanceof Uint8Array))
        throw new TypeError('Missing native binary resource.');
      return resources[index];
    }
    if (isArray(value.a)) return value.a.map(decode);
    if (isRecord(value.o)) return Object.fromEntries(Object.entries(value.o).map(([key, value]) => [key, decode(value)]));
    if (isArray(value.m)) return new Map(value.m.map(pair => {
      if (!isArray(pair) || pair.length !== 2) throw new TypeError('Invalid native map.');
      return [decode(pair[0]), decode(pair[1])];
    }));
    if (isArray(value.c) && value.c.length === 2 && typeof value.c[0] === 'string') {
      const name = value.c[0];
      const codec = codecs.find(codec => codec.name === name);
      if (!codec) throw new TypeError(`Unknown native codec ${name}.`);
      return codec.read(decode(value.c[1]));
    }
    throw new TypeError('Unknown native value.');
  };
  return decode(input.root);
}
