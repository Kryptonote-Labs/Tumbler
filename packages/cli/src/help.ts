import { z } from 'zod';
import { wordOperations } from '@tumblerjs/word/operations';
import { operations, characterFormat } from './registry.ts';
import { replacementHelp } from './replacement-value.ts';

/** Uses the live operation registry so callers do not maintain a second capability list. */
export function tumblerCapabilities() {
  return Object.values(wordOperations)
    .map((op) => `${op.name}: ${op.summary}`)
    .join('\n');
}

const placement = `Layout: inline flows with text; front floats over text; behind floats behind text.
Floating coordinates x/y are points (72 per inch). horizontalRelativeTo: page|column; verticalRelativeTo: page|line|paragraph. Page-relative y stays on the page; line/paragraph-relative y moves with its text anchor. wrap currently accepts none only.
Inspect first and retain existing dimensions/properties. Drawing placement does not change the object's text anchor; move-object changes that anchor.`;
const targets = `Targets: exact unique {"text":"text","within":"optional context"}; UTF-16 {"kind":"range","start":0,"end":5}; {"kind":"cell","tableId":"...","cellId":"..."}; {"kind":"table","tableId":"..."}.
Use equal start/end for insertion. For edit-object/move-object use exactly the object's inspected start/end range. Table structural/format/fit edits require a whole-table target. Read the intended region first; ranges are relative to that region.`;

function schemaHelp(schema: z.ZodType) {
  return JSON.stringify(z.toJSONSchema(schema, { unrepresentable: 'any' }), null, 2);
}

export function tumblerHelp(commandName = 'tumbler') {
  return (
    [
      `Usage: ${commandName} <document> <operation> [flags]`,
      `Discover: ${commandName} <document> <operation> --help (no document is opened).`,
      ...Object.values(operations)
        .filter((op) => !Object.hasOwn(wordOperations, op.name))
        .map((op) => `${op.name}: ${op.summary}`),
      tumblerCapabilities(),
      'Read before editing. Edits use --target JSON --input JSON [--page <read-handle>]. Hosts may retain the current page; reread on stale/conflict errors.',
      'Detailed help lists input fields, enum choices, target rules and examples. Check it before declaring a capability unavailable.',
    ].join('\n') + '\n'
  );
}

export function tumblerOperationHelp(name: string, commandName = 'tumbler'): string {
  const prefix = `${commandName} <document>`;
  if (Object.hasOwn(wordOperations, name)) {
    const op = wordOperations[name as keyof typeof wordOperations];
    const insertion = name.startsWith('insert-') || name === 'break' || name === 'page-number';
    const table = ['edit-table', 'format-table', 'fit-table'].includes(name);
    const object = name === 'edit-object' || name === 'move-object';
    const target = table
      ? { kind: 'table', tableId: '<table-id>' }
      : object
        ? { kind: 'range', start: 0, end: 1 }
        : insertion
          ? { kind: 'range', start: 0, end: 0 }
          : { text: 'exact text' };
    const lines = [
      `${name}: ${op.summary}`,
      `${prefix} ${name} --target '${JSON.stringify(target)}' --input '${JSON.stringify(op.example)}' [--page <handle>]`,
      targets,
      'Input schema (custom values include their supported fields in descriptions):',
      schemaHelp(op.input),
    ];
    if (name === 'replace')
      lines.push(
        replacementHelp,
        `${prefix} replace --start 0 --end 0 --value-file - <<'TEXT'\nFirst line\nSecond line\nTEXT`,
      );
    if (name === 'format')
      lines.push(
        `Convenience flags: ${Object.keys(characterFormat.shape)
          .map((key) => '--' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()))
          .join(
            ' ',
          )}. Use --find 'exact text' or --start/--end. Boolean flags accept true/false; null restores inheritance.`,
      );
    if (['edit-object', 'insert-shape', 'insert-image', 'insert-ink'].includes(name))
      lines.push(placement);
    if (name === 'edit-object')
      lines.push(
        `${prefix} inspect --input '{"what":"objects"}'`,
        "Use the returned start/end and current width/height; the numbers below are examples, not the object's actual values.",
        `${prefix} edit-object --target '{"kind":"range","start":0,"end":1}' --input '{"drawing":{"width":120,"height":120,"layout":"front","x":72,"y":100,"horizontalRelativeTo":"page","verticalRelativeTo":"page"}}'`,
        'For a watermark use layout="behind". To return to text flow use drawing:{width,height,layout:"inline"}. This changes existing drawings, not just newly inserted ones.',
        'Nested shape/image/ink/drawing values are complete property values: retain fields that should not change. Do not replace ink to change only its placement; use drawing.',
      );
    if (name === 'insert-ink')
      lines.push(
        "Compose a whole drawing in one strokes array, with each stroke's points in the same frame. A single point is a dot. Separate insertions are separate objects and may wrap onto different lines. Legacy points/color/size inputs fit a single stroke to its frame.",
      );
    if (name === 'style')
      lines.push(`${prefix} inspect --input '{"what":"styles"}' to discover style IDs.`);
    if (name === 'page-number')
      lines.push(
        `${prefix} inspect --input '{"what":"regions"}' then read --region <region> to choose a header/footer.`,
      );
    return lines.join('\n') + '\n';
  }
  if (!Object.hasOwn(operations, name))
    throw new Error(`Unknown operation: ${name}. Use --help to list operations.`);
  const op = operations[name as keyof typeof operations];
  const usage = {
    read: `${prefix} read [--offset <UTF-16 offset>] [--region body] [--target '{"start":"<anchor>","end":"<anchor>"}']\nReturns bounded content and a page handle; continue at the returned next offset.`,
    inspect: `${prefix} inspect --input '{"what":"objects","region":"body","offset":0}'\nwhat: objects|styles|regions|geometry. Objects include start/end and editable attributes; follow next for more. Geometry describes available widths, not proof of rendered text wrapping.`,
    select: `${prefix} select --input '{"target":{"text":"exact text"}}'\n${targets}`,
    unselect: `${prefix} unselect`,
    create: `${commandName} create <path.docx>\nHosts may reserve creation for the workspace manager.`,
  };
  return `${name}: ${op.summary}\n${usage[name as keyof typeof usage]}\nInput schema:\n${schemaHelp(op.input)}\n`;
}
