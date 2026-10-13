import { characterFormattingRequirements } from './character-formatting.ts';
import { everydayRequirements } from './everyday/scenarios.ts';
import { renderRequirements } from './render/contract.ts';
import { tableRequirements } from './tables/contract.ts';
import { preservationRequirements } from './preservation/contract.ts';
import { pending } from './pending-requirements.ts';
import type { Check, Dimension, Oracle, Requirement } from './model.ts';

const text = 'ecma-1:17.3.3.31', bold = 'ecma-1:17.3.2.1', relationships = 'ecma-1:9.2';
const profiles = ['strict', 'transitional'];
const textCases = profiles.flatMap(profile => ['ascii', 'spaces', 'xml-escaping', 'unicode'].map(value => `${profile}-text-${value}`));
const paired = (name: string) => profiles.map(profile => `${profile}-${name}`);
const checks = (cases: readonly string[], oracles: readonly Oracle[]): Check[] => cases.flatMap(scenario => oracles.map(oracle => ({ scenario, oracle })));
function covered(id: string, dimension: Dimension, title: string, criteria: string, topics: readonly string[], cases: readonly string[], oracles: readonly Oracle[]): Requirement {
  return { id, dimension, title, criteria, topics, checks: checks(cases, oracles) };
}

/** This is a versioned behavioural contract, not an exhaustive decomposition of the source index. */
export const requirements: readonly Requirement[] = [
  covered('read.text-values', 'read', 'Read literal text values', 'Strict and Transitional fixtures retain ASCII, leading/trailing/repeated spaces with xml:space=preserve, XML metacharacters and the specified Unicode strings.', [text], textCases, ['assertion']),
  covered('read.main-relationship', 'read', 'Discover a relocated main part', 'Read the body text when the main document is content/report.xml and the root relationship points to it, in both namespace profiles.', [relationships], paired('relocated-main'), ['assertion']),
  covered('read.direct-bold', 'read', 'Read explicit substring bold', 'After saving and reopening, offsets 5–9 of "left bold right" are bold and offsets 0–4 are not, in both profiles.', [bold], paired('bold-range'), ['assertion']),
  covered('preserve.text-noop', 'preserve', 'Save text fixtures without changes', 'Opening and saving each literal-text fixture without edits returns byte-identical ZIP bytes.', [text], textCases, ['package-diff']),
  covered('preserve.relocated-noop', 'preserve', 'Preserve relocated packages', 'A no-op save of each relocated main-part fixture is byte-identical.', [relationships], paired('relocated-main'), ['package-diff']),
  covered('preserve.opaque-part', 'preserve', 'Preserve an unrelated XML part during a body edit', 'Replacing Original with Edited leaves the entry set and every payload outside word/document.xml identical, including the opaque customXml/item1.xml part.', [relationships], paired('opaque-part'), ['package-diff']),
  covered('preserve.bold-parts', 'preserve', 'Keep substring formatting changes in the main part', 'Applying bold to the fixture substring does not add/remove ZIP entries or change any other part payload.', [bold], paired('bold-range'), ['package-diff']),
  covered('write.text-fixtures', 'write', 'Emit valid edited text packages', 'Open XML SDK accepts the original and edited literal-text fixtures in both namespace profiles.', [text], textCases, ['openxml']),
  covered('write.bold-fixtures', 'write', 'Emit valid substring formatting', 'Open XML SDK accepts both namespace-profile outputs after applying bold to a substring.', [bold], paired('bold-range'), ['openxml']),
  covered('write.authored-runs', 'write', 'Author valid mixed-format paragraphs', 'The authored report retains both paragraphs, Unicode, bold and italic ranges after reopening, and passes Open XML SDK validation.', [text], ['authored-mixed-runs'], ['assertion', 'openxml']),
  covered('edit.text-history', 'edit', 'Replace text with reversible history', 'Each literal-text fixture becomes Replaced <&> 😀; undo restores exact source bytes; redo restores the edited text; both packages pass SDK validation.', [text], textCases, ['assertion', 'openxml']),
  covered('edit.bold-range', 'edit', 'Format a substring without formatting its neighbour', 'Explicitly enabling bold at offsets 5–9 preserves all text and leaves offsets 0–4 non-bold; the saved package passes SDK validation in both profiles.', [bold], paired('bold-range'), ['assertion', 'openxml']),
  covered('interoperate.text', 'interoperate', 'LibreOffice retains literal and edited text', 'Every before/after text fixture opens and saves through LibreOffice Writer, and the exact expected paragraph text survives.', [text], textCases, ['libreoffice']),
  covered('interoperate.relocated', 'interoperate', 'LibreOffice opens relocated main parts', 'LibreOffice Writer writes both relocated-main fixtures and the text Relocated survives reopening.', [relationships], paired('relocated-main'), ['libreoffice']),
  covered('interoperate.bold', 'interoperate', 'LibreOffice retains substring formatting', 'After LibreOffice open/save, the text and explicit bold/non-bold ranges in both fixtures remain correct.', [bold], paired('bold-range'), ['libreoffice']),
  covered('interoperate.authored', 'interoperate', 'LibreOffice retains authored mixed runs', 'After LibreOffice open/save, both paragraphs, Unicode, and the asserted bold/italic ranges remain correct.', [text], ['authored-mixed-runs'], ['libreoffice']),
  covered('interoperate.independent-table-merges', 'interoperate', 'LibreOffice retains independent table merges and restarts', 'Two independently merged columns retain their cell text, row spans, restart boundaries and neighbouring paragraph before and after a text/formatting edit, in Strict and Transitional input packages. This does not qualify full merged-table interoperability.', ['ecma-1:17.4.84'], ['strict', 'transitional'].map(profile => `table-interop-independent-merges-${profile}`), ['assertion', 'openxml', 'libreoffice']),
  ...pending,
  ...preservationRequirements,
  ...tableRequirements,
  ...renderRequirements,
  ...everydayRequirements,
  ...characterFormattingRequirements,
];
