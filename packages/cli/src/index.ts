import { z } from 'zod';
import {
  characterFormat,
  operations,
  OperationRecoveryError,
  type OperationHost,
} from './registry.ts';
export * from './registry.ts';

const formatFlags = Object.keys(characterFormat.shape);
const flagName = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
export function tumblerHelp() {
  return (
    [
      'Usage: tumbler <document> <operation> [flags] | tumbler create <path.docx>',
      ...Object.values(operations).map((operation) => `${operation.name}: ${operation.summary}`),
      'read: --offset <UTF-16 offset> --region <region>',
      'format/replace: --page <handle> and --find <exact text> [--within <surrounding text>] or --start <offset> --end <offset>',
      `format: ${formatFlags.map((key) => `--${flagName(key)}`).join(' ')}. Boolean flags accept true/false; null restores inheritance.`,
      'replace: --value <text> (an empty string deletes the target)',
    ].join('\n') + '\n'
  );
}

/** Parses an argv array, never shell source. Hosts own addressing, authority and storage. */
export async function runTumbler(
  argv: readonly string[],
  options: { host: OperationHost; stdout: (text: string) => void; stderr: (text: string) => void },
): Promise<number> {
  try {
    if (!argv.length || argv.includes('--help')) {
      options.stdout(tumblerHelp());
      return 0;
    }
    const [first, second, ...rest] = argv;
    const name = first === 'create' ? 'create' : second;
    const document = first === 'create' ? second : first;
    if (!document || !name || !Object.hasOwn(operations, name))
      throw new Error('Specify a document and operation. Use --help.');
    const operation = operations[name as keyof typeof operations];
    const flags: Record<string, unknown> = {};
    const allowed = new Set(
      name === 'read'
        ? ['offset', 'region']
        : name === 'create'
          ? []
          : [
              'page',
              'find',
              'within',
              'start',
              'end',
              ...(name === 'replace' ? ['value'] : formatFlags),
            ],
    );
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!;
      if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
      const split = arg.indexOf('=');
      const raw = arg.slice(2, split < 0 ? undefined : split);
      const key = raw.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      if (!allowed.has(key)) throw new Error(`Unknown flag: --${raw}`);
      if (Object.hasOwn(flags, key)) throw new Error(`Duplicate flag: --${raw}`);
      const schema =
        name === 'format' && Object.hasOwn(characterFormat.shape, key)
          ? characterFormat.shape[key as keyof typeof characterFormat.shape]
          : undefined;
      const boolean = schema?.unwrap().unwrap() instanceof z.ZodBoolean;
      let value: string;
      if (split >= 0) value = arg.slice(split + 1);
      else if (boolean && (rest[i + 1] === undefined || rest[i + 1]!.startsWith('--')))
        value = 'true';
      else {
        value = rest[++i]!;
        if (value === undefined || value.startsWith('--'))
          throw new Error(
            `Missing value for --${raw}; use --${raw}=<value> for text starting with --`,
          );
      }
      flags[key] =
        schema && value === 'null'
          ? null
          : boolean
            ? value === 'true'
              ? true
              : value === 'false'
                ? false
                : value
            : ['start', 'end', 'offset', 'fontSize'].includes(key)
              ? value.trim() === ''
                ? NaN
                : Number(value)
              : value;
    }
    let input: unknown = flags;
    if (name === 'format' || name === 'replace') {
      const { page, find, within, start, end, value, ...format } = flags;
      if (find !== undefined && (start !== undefined || end !== undefined))
        throw new Error('Use --find or --start/--end, not both.');
      if (find === undefined && within !== undefined) throw new Error('--within requires --find.');
      input = {
        ...(page === undefined ? {} : { page }),
        target:
          find === undefined
            ? { kind: 'range', start, end }
            : { text: find, ...(within === undefined ? {} : { within }) },
        ...(name === 'replace' ? { value } : { format }),
      };
    }
    const result = await operation.execute(options.host, document, input);
    options.stdout(JSON.stringify(result) + '\n');
    return 0;
  } catch (error) {
    if (error instanceof OperationRecoveryError) throw error;
    options.stderr((error instanceof Error ? error.message : String(error)) + '\n');
    return 1;
  }
}
