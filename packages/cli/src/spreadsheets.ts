import { spreadsheetCommand, type SpreadsheetCommand } from '@tumblerjs/sheets';
import { z } from 'zod';

export interface SpreadsheetReadInput {
  sheetId?: string;
  range?: string;
}

export interface SpreadsheetOperationHost {
  readSpreadsheet?(document: string, input: SpreadsheetReadInput): Promise<unknown>;
  operateSpreadsheet?(
    document: string,
    input: { page?: string; command: SpreadsheetCommand },
  ): Promise<unknown>;
}

export function spreadsheetHelp(commandName = 'tumbler', name?: string): string {
  const schema = name
    ? spreadsheetCommand.options.find((option) => option.shape.name.value === name)
    : undefined;
  if (name && name !== 'read' && !schema) throw new Error(`Unknown spreadsheet command: ${name}`);
  return (
    [
      `Usage: ${commandName} <document> sheets read [--sheet <sheet-id>] [--range A1:J30]`,
      `${commandName} <document> sheets <command> --input JSON [--page <read-handle>]`,
      'Read the target sheet and range before editing. Use the sheetId returned by the read. Cell references use A1 notation; formula source omits the leading equals sign. Each command or batch is one undo step.',
      'Reads return values, formula source and calculated results. Read further ranges explicitly for more cells. A missing cell is blank, not unread content.',
      'Commands: ' + spreadsheetCommand.options.map((option) => option.shape.name.value).join(', '),
      ...(schema
        ? [JSON.stringify(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }), null, 2)]
        : [`Use ${commandName} <document> sheets <command> --help for fields.`]),
    ].join('\n') + '\n'
  );
}

/** Validates engine commands while hosts enforce permissions, read receipts and persistence. */
export async function runSpreadsheet(
  argv: readonly string[],
  options: {
    host: SpreadsheetOperationHost;
    commandName?: string;
    stdout: (text: string) => void;
  },
): Promise<void> {
  const [document, , name, ...flags] = argv;
  if (!document) throw new Error('Supply a spreadsheet document.');
  if (!name || name === '--help' || flags.includes('--help')) {
    options.stdout(spreadsheetHelp(options.commandName, name === '--help' ? undefined : name));
    return;
  }
  const values: Record<string, string> = {};
  for (let index = 0; index < flags.length; index += 2) {
    const key = flags[index]!;
    const value = flags[index + 1];
    if (
      !['--input', '--page', '--sheet', '--range'].includes(key) ||
      value === undefined ||
      Object.hasOwn(values, key)
    )
      throw new Error('Use --input JSON, --page, --sheet or --range once.');
    values[key] = value;
  }
  if (name === 'read') {
    if (values['--input'] || values['--page'])
      throw new Error('Spreadsheet reads accept only --sheet and --range.');
    if (!options.host.readSpreadsheet)
      throw new Error('Spreadsheet reading is unavailable on this host.');
    options.stdout(
      JSON.stringify(
        await options.host.readSpreadsheet(document, {
          ...(values['--sheet'] ? { sheetId: values['--sheet'] } : {}),
          ...(values['--range'] ? { range: values['--range'] } : {}),
        }),
      ) + '\n',
    );
    return;
  }
  if (values['--sheet'] || values['--range'] || !values['--input'])
    throw new Error('Spreadsheet edits require --input JSON and optional --page.');
  if (!options.host.operateSpreadsheet)
    throw new Error('Spreadsheet editing is unavailable on this host.');
  const input: unknown = JSON.parse(values['--input']);
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Command input must be an object.');
  const command = spreadsheetCommand.parse({ ...input, name });
  options.stdout(
    JSON.stringify(
      await options.host.operateSpreadsheet(document, {
        ...(values['--page'] ? { page: values['--page'] } : {}),
        command,
      }),
    ) + '\n',
  );
}
