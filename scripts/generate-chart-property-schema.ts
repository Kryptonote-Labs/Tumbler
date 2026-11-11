/** Rebuild chart/DrawingML editing metadata from the MIT-licensed Open XML SDK.
 * Pin the revision so a regeneration is reviewable and does not depend on current main.
 */
const revision = '431ab05cf160248cc3885a4a766026d4f8243792';
const base = `https://raw.githubusercontent.com/dotnet/Open-XML-SDK/${revision}`;
const files = [
  'schemas_openxmlformats_org_drawingml_2006_chart',
  'schemas_openxmlformats_org_drawingml_2006_main',
  'schemas_microsoft_com_office_drawing_2007_8_2_chart',
  'schemas_microsoft_com_office_drawing_2012_chart',
  'schemas_microsoft_com_office_drawing_2012_chartStyle',
  'schemas_microsoft_com_office_drawing_2014_chart',
  'schemas_microsoft_com_office_drawing_2014_chart_ac',
  'schemas_microsoft_com_office_drawing_2014_chartex',
  'schemas_microsoft_com_office_drawing_2017_03_chart',
];
interface Validator { Name: string; Arguments?: { Name: string; Value: string }[] }
interface Attribute { QName: string; PropertyName?: string; PropertyComments?: string; Type: string; Validators?: Validator[] }
interface Particle { Name?: string; Kind?: string; Occurs?: { Min?: number; Max?: number }[]; Items?: Particle[] }
interface Definition { Name: string; ClassName: string; BaseClass?: string; Attributes?: Attribute[]; Children?: { Name: string }[]; Particle?: Particle; IsLeafText?: boolean }
interface Schema { Types: Definition[]; Enums: { Name: string; Facets: { Value: string; Name?: string }[] }[] }
async function json<T>(path: string): Promise<T> {
  const response = await fetch(`${base}/${path}`);
  if (!response.ok) throw new Error(`Cannot read ${path}: ${response.status}`);
  return response.json() as Promise<T>;
}
const inputs = await Promise.all(files.map(file => json<Schema>(`data/schemas/${file}.json`)));
const definitions = inputs.flatMap(input => input.Types);
const byClass = new Map(definitions.map(definition => [definition.ClassName, definition]));
const enums = new Map(inputs.flatMap(input => input.Enums ?? []).map(value => [value.Name, value.Facets.map(facet => ({ value: facet.Value, label: words(facet.Name ?? facet.Value) }))]));
function words(value: string) { return value.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'); }
function inherited(definition: Definition, seen = new Set<string>()): Definition {
  const parent = byClass.get(definition.BaseClass ?? '');
  if (!parent || seen.has(parent.Name)) return definition;
  seen.add(parent.Name);
  const base = inherited(parent, seen);
  return { ...definition, Attributes: [...base.Attributes ?? [], ...definition.Attributes ?? []], Children: definition.Children ?? base.Children ?? [], ...(definition.Particle ?? base.Particle ? { Particle: definition.Particle ?? base.Particle } : {}), IsLeafText: definition.IsLeafText ?? base.IsLeafText ?? false };
}
const types = Object.fromEntries(definitions.filter(definition => definition.Name.split('/')[1]).map(raw => {
  const definition = inherited(raw);
  return [definition.Name, {
    name: definition.Name.split('/')[1], label: words(definition.ClassName),
    text: definition.IsLeafText ?? false,
    attributes: (definition.Attributes ?? []).map(attribute => {
      const enumeration = attribute.Type.match(/\.([^.<>]+)>$/)?.[1];
      const numeric = attribute.Validators?.find(validator => validator.Name === 'NumberValidator');
      const minimum = numeric?.Arguments?.find(argument => argument.Name === 'MinInclusive')?.Value;
      const maximum = numeric?.Arguments?.find(argument => argument.Name === 'MaxInclusive')?.Value;
      return {
        name: attribute.QName.replace(/^:/, ''), label: words(attribute.PropertyName ?? attribute.QName.replace(/^:/, '')),
        kind: attribute.Type === 'BooleanValue' ? 'boolean' : attribute.Type.includes('HexBinary') ? 'hex' : /(?:Int\d*|Double|Decimal|Single)Value/.test(attribute.Type) ? 'number' : 'string',
        required: attribute.Validators?.some(validator => validator.Name === 'RequiredValidator') ?? false,
        ...(enumeration && enums.has(enumeration) ? { choices: enums.get(enumeration)! } : {}),
        ...(minimum !== undefined ? { minimum: Number(minimum) } : {}), ...(maximum !== undefined ? { maximum: Number(maximum) } : {}),
      };
    }),
    children: (definition.Children ?? []).map(child => child.Name),
    ...(definition.Particle ? { particle: definition.Particle } : {}),
  }];
}));
const namespaces = await json<{ Prefix: string; Uri: string }[]>('data/namespaces.json');
await Bun.write(new URL('../packages/charts/src/property-schema.json', import.meta.url), JSON.stringify({ revision, namespaces: Object.fromEntries(namespaces.map(namespace => [namespace.Prefix, namespace.Uri])), types }) + '\n');
console.log(`Generated ${Object.keys(types).length} chart and DrawingML element definitions.`);
