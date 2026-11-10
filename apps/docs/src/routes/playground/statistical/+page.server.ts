import { cases } from '../../../../../../packages/formulas/test/fixtures/statistical.ts';
import { buildFormulaDocument } from '../../../../../../scripts/formula-conformance/corpus.ts';

export const load = () => ({ examples: cases.map(fixture => ({ ...fixture, bytes: Buffer.from(buildFormulaDocument(fixture)).toString('base64') })) });
