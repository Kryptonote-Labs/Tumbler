import type { Node } from 'prosemirror-model';
import { latexPreambleCommand } from './latex-metadata';
import { commandEnd, groupAt, whitespaceEnd } from './latex-syntax';

const commands = new Set(['address', 'signature', 'name', 'date', 'opening', 'closing', 'encl', 'cc']);

export function latexLetterCommandAt(source: string, position: number) {
  const end = commandEnd(source, position);
  const command = source.slice(position + 1, end);
  if (!commands.has(command)) return;
  const argument = groupAt(source, whitespaceEnd(source, end));
  if (argument) return { command, ...argument };
}

type Argument = { from: number; to: number; source: string };
type Field = Argument & (
  | { origin: 'prefix' }
  | { origin: 'command' | 'opener'; position: number }
);
export type LatexLetterPart =
  | { kind: 'setting' }
  | { kind: 'opening'; salutation: Field; recipient: Field; sender?: Field; date?: Field }
  | { kind: 'closing'; closing: Field; signature?: Field; indented: boolean }
  | { kind: 'attachment'; text: Field; label: 'cc' | 'encl' };

function field(source: string, argument: { from: number; to: number }, position: number, origin: 'command' | 'opener'): Field {
  return { from: argument.from, to: argument.to, source: source.slice(argument.from, argument.to), position, origin };
}

export function readLatexLetterParts(document: Node) {
  const parts = new Map<number, LatexLetterPart>();
  const prefix = String(document.attrs.prefix ?? '');
  const settings = new Map<string, Field>();
  for (const command of ['name', 'address', 'signature', 'date']) {
    const argument = latexPreambleCommand(prefix, command);
    if (argument) settings.set(command, { ...argument, origin: 'prefix' });
  }

  function read(node: Node, position: number, local: Map<string, Field>, recipient?: Field) {
    const source = String(node.attrs.source ?? '');
    const command = node.type.name === 'latex_raw' && latexLetterCommandAt(source, 0);
    if (!command || command.end !== source.length) return;
    const value = field(source, command, position, 'command');
    switch (command.command) {
      case 'address':
      case 'signature':
      case 'name':
      case 'date':
        local.set(command.command, value);
        parts.set(position, { kind: 'setting' });
        break;
      case 'opening': {
        const sender = local.get('address');
        const date = local.get('date');
        if (recipient) parts.set(position, {
          kind: 'opening', salutation: value, recipient,
          ...(sender && { sender }),
          ...(date && { date }),
        });
        break;
      }
      case 'closing': {
        const authored = local.get('signature');
        const signature = authored?.source ? authored : local.get('name');
        if (recipient) parts.set(position, {
          kind: 'closing', closing: value,
          ...(signature && { signature }),
          indented: !!local.get('address')?.source,
        });
        break;
      }
      case 'cc':
      case 'encl':
        if (recipient) parts.set(position, { kind: 'attachment', text: value, label: command.command });
        break;
    }
  }

  document.forEach((node, position) => {
    const open = String(node.attrs.open ?? '');
    if (node.type.name !== 'latex_container' || !/^\\begin\s*\{letter\}/.test(open)) {
      read(node, position, settings);
      return;
    }
    const tag = groupAt(open, whitespaceEnd(open, commandEnd(open, 0)));
    const argument = tag && groupAt(open, whitespaceEnd(open, tag.end));
    if (!argument) return;
    const recipient = field(open, argument, position, 'opener');
    const local = new Map(settings);
    node.forEach((child, offset) => read(child, position + offset + 1, local, recipient));
  });
  return parts;
}
