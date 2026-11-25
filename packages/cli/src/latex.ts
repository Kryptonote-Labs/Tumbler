import { z } from 'zod';
import { latexOperation } from './latex-authoring.ts';

const revision = z.string().min(1);
export const latexEditInput = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('apply'), revision, operation: latexOperation }),
  z.object({ kind: z.literal('write'), revision, source: z.string() }).strict(),
  z
    .object({ kind: z.literal('replace'), revision, find: z.string().min(1), value: z.string() })
    .strict(),
]);
export type LatexEditInput = z.infer<typeof latexEditInput>;
export interface LatexOperationHost {
  inspectLatex?(document: string, offset: number): Promise<unknown>;
  readLatex?(document: string, offset: number): Promise<unknown>;
  editLatex?(document: string, input: LatexEditInput): Promise<unknown>;
}

export function latexHelp(command = 'tumbler') {
  return [
    `${command} <document> latex read [--offset N]`,
    `${command} <document> latex inspect [--offset N]`,
    `${command} <document> latex apply --revision REV --input <file|->`,
    'Apply reads one JSON operation: thesis, insert-page, front-matter, or page-numbering.',
    `${command} <document> latex replace --revision REV --find TEX --value TEX`,
    `${command} <document> latex write --revision REV --input <file|->`,
    'Read the source revision first. Replace requires one exact match. Use --value= for deletion.',
    '',
  ].join('\n');
}

export function editLatexSource(source: string, input: Exclude<LatexEditInput, { kind: 'apply' }>) {
  if (input.kind === 'write') return input.source;
  const position = source.indexOf(input.find);
  if (position < 0) throw new RangeError('The LaTeX target was not found.');
  if (source.indexOf(input.find, position + 1) >= 0)
    throw new RangeError('The LaTeX target matches more than once.');
  return source.slice(0, position) + input.value + source.slice(position + input.find.length);
}

export function readLatexSource(source: string, revision: string, offset: number) {
  let end = Math.min(source.length, offset + 12000);
  if (end < source.length && /[\uDC00-\uDFFF]/.test(source[end]!)) end--;
  return {
    revision,
    text: source.slice(offset, end),
    nextOffset: end < source.length ? end : null,
  };
}

export async function runLatex(
  argv: readonly string[],
  options: {
    commandName?: string;
    readValue?: (path: string) => Promise<string>;
    host: LatexOperationHost;
    stdout: (text: string) => void;
  },
) {
  const [document, , operation, ...args] = argv;
  if (!document || !operation || argv.includes('--help')) {
    options.stdout(latexHelp(options.commandName));
    return;
  }
  const usage = () => new Error(latexHelp(options.commandName));
  if (!['read', 'inspect', 'replace', 'write', 'apply'].includes(operation)) throw usage();
  const flags = new Map<string, string>();
  const allowed =
    operation === 'read' || operation === 'inspect'
      ? ['--offset']
      : operation === 'replace'
        ? ['--revision', '--find', '--value']
        : ['--revision', '--input'];
  for (let i = 0; i < args.length; i++) {
    const argument = args[i]!;
    const equal = argument.indexOf('=');
    const flag = equal < 0 ? argument : argument.slice(0, equal);
    const value = equal < 0 ? args[++i] : argument.slice(equal + 1);
    if (!allowed.includes(flag) || flags.has(flag) || value === undefined) throw usage();
    flags.set(flag, value);
  }
  let result: unknown;
  if (operation === 'read' || operation === 'inspect') {
    const offset = flags.get('--offset') ?? '0';
    if (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset))) throw usage();
    if (operation === 'inspect' && options.host.inspectLatex)
      result = await options.host.inspectLatex(document, Number(offset));
    else if (operation === 'read' && options.host.readLatex)
      result = await options.host.readLatex(document, Number(offset));
    else throw new Error('LaTeX ' + operation + ' is unavailable on this host.');
  } else {
    if (!options.host.editLatex) throw new Error('LaTeX editing is unavailable on this host.');
    const revision = flags.get('--revision');
    if (operation === 'replace') {
      result = await options.host.editLatex(
        document,
        latexEditInput.parse({
          kind: operation,
          revision,
          find: flags.get('--find'),
          value: flags.get('--value'),
        }),
      );
    } else {
      const input = flags.get('--input');
      if (!input || !revision || !options.readValue) throw usage();
      const value = await options.readValue(input);
      result = await options.host.editLatex(
        document,
        operation === 'apply'
          ? latexEditInput.parse({ kind: operation, revision, operation: JSON.parse(value) })
          : { kind: 'write', revision, source: value },
      );
    }
  }
  options.stdout(JSON.stringify(result) + '\n');
}
