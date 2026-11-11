import {
  chartPropertyDefinition, chartPropertyTree, editChartSource, insertChartProperty,
  type ChartPropertyDefinition,
  type ChartPropertyNode,
  type ChartSourceEdit,
  type CreateChartOptions,
  type OoxmlChartType,
} from "@tumblerjs/charts";

/** A chart type and its variant. Hosts convert the chart; the properties pane only proposes. */
export type ChartTypeChange = Pick<CreateChartOptions, "type" | "direction" | "grouping" | "radarStyle" | "scatterStyle" | "splitType" | "wireframe" | "shape" | "bubble3D">;

export interface ChartTypeOption {
  readonly label: string;
  readonly change: ChartTypeChange;
}

export interface ChartTypeFamily {
  readonly label: string;
  readonly options: readonly ChartTypeOption[];
}

/** One edit request from a property field. Node ids refer to the bytes the field was rendered from. */
export type ChartPropertyChange =
  | { readonly kind: "edit"; readonly edits: readonly ChartSourceEdit[] }
  | { readonly kind: "insert"; readonly node: number; readonly definition: string };

/** Applies a change and returns an error message when the document rejected it. */
export type ChartPropertyApply = (change: ChartPropertyChange) => string | undefined;

const groupings = [
  ["clustered", "Clustered"],
  ["stacked", "Stacked"],
  ["percentStacked", "100% stacked"],
] as const;
const stackings = [
  ["standard", ""],
  ["stacked", "Stacked"],
  ["percentStacked", "100% stacked"],
] as const;

function phrase(prefix: string, noun: string): string {
  return prefix ? `${prefix} ${noun.toLowerCase()}` : noun;
}

/** Every ECMA-376 chart type with the variants Word and Excel present in their type galleries. */
export const CHART_TYPE_FAMILIES: readonly ChartTypeFamily[] = [
  {
    label: "Column",
    options: [
      ...groupings.map(([grouping, label]) => ({ label: `${label} column`, change: { type: "barChart", direction: "col", grouping } }) as const),
      ...groupings.map(([grouping, label]) => ({ label: `3-D ${label.toLowerCase()} column`, change: { type: "bar3DChart", direction: "col", grouping } }) as const),
      { label: "3-D column", change: { type: "bar3DChart", direction: "col", grouping: "standard" } },
    ],
  },
  {
    label: "Bar",
    options: [
      ...groupings.map(([grouping, label]) => ({ label: `${label} bar`, change: { type: "barChart", direction: "bar", grouping } }) as const),
      ...groupings.map(([grouping, label]) => ({ label: `3-D ${label.toLowerCase()} bar`, change: { type: "bar3DChart", direction: "bar", grouping } }) as const),
      { label: "3-D bar", change: { type: "bar3DChart", direction: "bar", grouping: "standard" } },
    ],
  },
  {
    label: "Line",
    options: [
      ...stackings.map(([grouping, label]) => ({ label: phrase(label, "Line"), change: { type: "lineChart", grouping } }) as const),
      { label: "3-D line", change: { type: "line3DChart" } },
    ],
  },
  {
    label: "Area",
    options: [
      ...stackings.map(([grouping, label]) => ({ label: phrase(label, "Area"), change: { type: "areaChart", grouping } }) as const),
      ...stackings.map(([grouping, label]) => ({ label: `3-D ${phrase(label, "Area").toLowerCase()}`, change: { type: "area3DChart", grouping } }) as const),
    ],
  },
  {
    label: "Pie",
    options: [
      { label: "Pie", change: { type: "pieChart" } },
      { label: "3-D pie", change: { type: "pie3DChart" } },
      { label: "Pie of pie", change: { type: "ofPieChart", splitType: "pie" } },
      { label: "Bar of pie", change: { type: "ofPieChart", splitType: "bar" } },
      { label: "Doughnut", change: { type: "doughnutChart" } },
    ],
  },
  {
    label: "Scatter",
    options: [
      { label: "Scatter", change: { type: "scatterChart", scatterStyle: "marker" } },
      { label: "Scatter with smooth lines and markers", change: { type: "scatterChart", scatterStyle: "smoothMarker" } },
      { label: "Scatter with smooth lines", change: { type: "scatterChart", scatterStyle: "smooth" } },
      { label: "Scatter with straight lines and markers", change: { type: "scatterChart", scatterStyle: "lineMarker" } },
      { label: "Scatter with straight lines", change: { type: "scatterChart", scatterStyle: "line" } },
      { label: "Bubble", change: { type: "bubbleChart", bubble3D: false } },
      { label: "3-D bubble", change: { type: "bubbleChart", bubble3D: true } },
    ],
  },
  {
    label: "Radar",
    options: [
      { label: "Radar", change: { type: "radarChart", radarStyle: "standard" } },
      { label: "Radar with markers", change: { type: "radarChart", radarStyle: "marker" } },
      { label: "Filled radar", change: { type: "radarChart", radarStyle: "filled" } },
    ],
  },
  {
    label: "Surface",
    options: [
      { label: "3-D surface", change: { type: "surface3DChart", wireframe: false } },
      { label: "Wireframe 3-D surface", change: { type: "surface3DChart", wireframe: true } },
      { label: "Contour", change: { type: "surfaceChart", wireframe: false } },
      { label: "Wireframe contour", change: { type: "surfaceChart", wireframe: true } },
    ],
  },
  { label: "Stock", options: [{ label: "Stock", change: { type: "stockChart" } }] },
];

const localName = (node: ChartPropertyNode) => node.name.split(":").at(-1)!;
const child = (node: ChartPropertyNode | undefined, name: string) => node?.children.find((candidate) => localName(candidate) === name);
const value = (node: ChartPropertyNode | undefined) => node?.attributes.find((attribute) => attribute.name === "val")?.value;
const booleanValue = (node: ChartPropertyNode | undefined) => node ? chartBoolean(value(node) ?? "1") : undefined;

/** Reads a boolean schema value, accepting both lexical forms. */
export function chartBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  return raw === "1" || raw === "true" || raw === "on";
}

export function chartPropertyChild(node: ChartPropertyNode | undefined, name: string): ChartPropertyNode | undefined {
  return child(node, name);
}

export function chartPropertyValue(node: ChartPropertyNode | undefined): string | undefined {
  return value(node);
}

/** Inspect the selected combination plot without changing its peers. */
export function currentChartType(root: ChartPropertyNode, index = 0): ChartTypeOption | undefined {
  const plot = child(child(root, "chart"), "plotArea")?.children.filter((node) =>
    CHART_TYPE_FAMILIES.some((family) => family.options.some((option) => option.change.type === localName(node))))[index];
  if (!plot) return undefined;
  const type = localName(plot) as OoxmlChartType;
  const series = plot.children.filter(node => localName(node) === 'ser');
  const plotBubble3D = booleanValue(child(plot, 'bubble3D')) ?? false;
  const observed: Record<string, string | boolean | undefined> = {
    direction: value(child(plot, "barDir")) ?? "col",
    grouping: value(child(plot, "grouping")) ?? (type.startsWith("bar") ? "clustered" : "standard"),
    radarStyle: value(child(plot, "radarStyle")) ?? "standard",
    scatterStyle: value(child(plot, "scatterStyle")) ?? "marker",
    splitType: value(child(plot, "ofPieType")) ?? "pie",
    bubble3D: series.length ? series.some(series => booleanValue(child(series, 'bubble3D')) ?? plotBubble3D) : plotBubble3D,
    wireframe: booleanValue(child(plot, "wireframe")) ?? false,
  };
  const options = CHART_TYPE_FAMILIES.flatMap((family) => family.options).filter((option) => option.change.type === type);
  return options.find((option) => Object.entries(option.change).every(([key, expected]) => key === "type" || observed[key] === expected)) ?? options[0];
}

export function sameChartType(left: ChartTypeChange, right: ChartTypeChange): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]) as Set<keyof ChartTypeChange>;
  return [...keys].every((key) => left[key] === right[key]);
}

export interface ChartFormatTarget {
  /** Stable across edits, unlike node ids. */
  readonly key: string;
  readonly label: string;
  readonly node: ChartPropertyNode;
}

/** Text a series shows in its legend entry, read from the cached name. */
function seriesName(series: ChartPropertyNode): string | undefined {
  const tx = child(series, "tx");
  const direct = child(tx, "v")?.text;
  if (direct) return direct;
  const point = child(child(child(tx, "strRef"), "strCache"), "pt");
  return child(point, "v")?.text || undefined;
}

const axisLabels: Readonly<Record<string, string>> = { catAx: "Category axis", valAx: "Value axis", dateAx: "Date axis", serAx: "Depth axis" };

/** Named chart parts users format directly, each pointing at its full property subtree. */
export function chartFormatTargets(root: ChartPropertyNode): readonly ChartFormatTarget[] {
  const chart = child(root, "chart");
  const plotArea = child(chart, "plotArea");
  const targets: ChartFormatTarget[] = [{ key: "chart", label: "Entire chart", node: root }];
  const add = (key: string, label: string, node: ChartPropertyNode | undefined) => { if (node) targets.push({ key, label, node }); };
  add("area", "Chart area", child(root, "spPr"));
  add("title", "Title", child(chart, "title"));
  add("legend", "Legend", child(chart, "legend"));
  add("plotArea", "Plot area", plotArea);
  const plots = plotArea?.children.filter((node) => CHART_TYPE_FAMILIES.some((family) => family.options.some((option) => option.change.type === localName(node)))) ?? [];
  plots.forEach((plot, plotIndex) => {
    if (plots.length > 1) add(`plot:${plotIndex}`, plot.label, plot);
    plot.children.filter((node) => localName(node) === "ser").forEach((series, index) =>
      add(`series:${plotIndex}:${chartPropertyValue(child(series, "idx")) ?? index}`, seriesName(series) ?? `Series ${index + 1}`, series));
  });
  const axisCounts = new Map<string, number>();
  for (const axis of plotArea?.children ?? []) {
    const name = localName(axis);
    const label = axisLabels[name];
    if (!label) continue;
    const count = (axisCounts.get(name) ?? 0) + 1;
    axisCounts.set(name, count);
    add(`${name}:${chartPropertyValue(child(axis, "axId")) ?? count}`, count > 1 ? `Secondary ${label.toLowerCase()}` : label, axis);
  }
  return targets;
}

/** Display labels by node id, numbering repeated properties and naming series by their legend text. */
export function chartPropertyLabels(root: ChartPropertyNode): ReadonlyMap<number, string> {
  const labels = new Map<number, string>([[root.id, root.label]]);
  const visit = (node: ChartPropertyNode) => {
    const totals = new Map<string, number>();
    for (const entry of node.children) totals.set(entry.label, (totals.get(entry.label) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const entry of node.children) {
      const index = (seen.get(entry.label) ?? 0) + 1;
      seen.set(entry.label, index);
      const name = localName(entry) === "ser" ? seriesName(entry) : undefined;
      labels.set(entry.id, name ?? (totals.get(entry.label)! > 1 ? `${entry.label} ${index}` : entry.label));
      visit(entry);
    }
  };
  visit(root);
  return labels;
}

type Particle = NonNullable<ChartPropertyDefinition["particle"]>;
/** At least `minimum` of `names` must remain, unless the optional group `scope` empties entirely. */
interface OccurrenceRule { readonly names: ReadonlySet<string>; readonly minimum: number; readonly scope?: ReadonlySet<string> }

function particleNames(particle: Particle): string[] {
  return particle.Name ? [particle.Name] : (particle.Items ?? []).flatMap(particleNames);
}

/** Minimum-occurrence rules that currently apply, given which children exist. */
function occurrenceRules(particle: Particle, present: ReadonlySet<string>, rules: OccurrenceRule[], scope?: ReadonlySet<string>): void {
  const minimum = particle.Occurs ? particle.Occurs[0]?.Min ?? 0 : 1;
  const names = new Set(particleNames(particle));
  const rule = (minimum: number) => rules.push(scope ? { names, minimum, scope } : { names, minimum });
  if (particle.Name) { if (minimum > 0) rule(minimum); return; }
  if (minimum === 0 && ![...names].some((name) => present.has(name))) return;
  // Inside a present optional group, requirements hold only while the group keeps other members.
  const inner = minimum === 0 ? names : scope;
  if (particle.Kind === "Choice" && minimum > 0) rule(minimum);
  for (const item of particle.Items ?? []) {
    // The choice-level rule already covers a single-element branch; compound branches keep their own rules.
    if (particle.Kind === "Choice" && (item.Name || !particleNames(item).some((name) => present.has(name)))) continue;
    occurrenceRules(item, present, rules, inner);
  }
}

// Structural anchors whose removal would leave no editable chart, or break series identity.
const essential = new Set(["chartSpace", "chart", "plotArea", "idx", "order"]);

/** Ids of schema-known properties whose removal still satisfies their parent's content model. */
export function removableChartProperties(root: ChartPropertyNode): ReadonlySet<number> {
  const removable = new Set<number>();
  const visit = (node: ChartPropertyNode) => {
    const particle = node.definition ? chartPropertyDefinition(node.definition)?.particle : undefined;
    if (particle) {
      const present = new Set(node.children.flatMap((entry) => entry.definition ? [entry.definition] : []));
      const rules: OccurrenceRule[] = [];
      occurrenceRules(particle, present, rules);
      for (const entry of node.children) {
        if (!entry.definition || essential.has(localName(entry))) continue;
        const count = (names: ReadonlySet<string>) => node.children.filter((other) => other.definition && names.has(other.definition)).length;
        const free = rules.every((rule) =>
          !rule.names.has(entry.definition!) || count(rule.names) > rule.minimum || (rule.scope !== undefined && count(rule.scope) === 1));
        if (free) removable.add(entry.id);
      }
    }
    node.children.forEach(visit);
  };
  visit(root);
  return removable;
}

/** Prunes a tree to properties whose names match, keeping matched groups whole for context. */
export function searchChartProperties(node: ChartPropertyNode, query: string, labels: ReadonlyMap<number, string>): ChartPropertyNode | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle || (labels.get(node.id) ?? node.label).toLowerCase().includes(needle)) return node;
  const children = node.children.flatMap((entry) => searchChartProperties(entry, needle, labels) ?? []);
  const attributes = node.attributes.filter((attribute) => attribute.label.toLowerCase().includes(needle));
  if (!children.length && !attributes.length) return undefined;
  return { ...node, attributes, children };
}

/** Plain title text, or undefined when the chart has no title. Paragraphs join with newlines. */
export function chartTitleText(root: ChartPropertyNode): string | undefined {
  const title = child(child(root, "chart"), "title");
  if (!title) return undefined;
  const tx = child(title, "tx");
  const rich = child(tx, "rich");
  if (!rich) return child(child(child(child(tx, "strRef"), "strCache"), "pt"), "v")?.text ?? "";
  return rich.children
    .filter((paragraph) => localName(paragraph) === "p")
    .map((paragraph) => paragraph.children.map((run) => ["r", "fld"].includes(localName(run)) ? child(run, "t")?.text ?? "" : localName(run) === "br" ? "\n" : "").join(""))
    .join("\n");
}


export type ChartPropertyLocator = (root: ChartPropertyNode) => ChartPropertyNode | undefined;

/** Resolve fresh node identities for each source edit, including optional numeric defaults. */
export function setChartPropertyValue(bytes: Uint8Array, locate: ChartPropertyLocator, name: string, definition: string, next: string | undefined): Uint8Array {
  let source = bytes;
  const parent = locate(chartPropertyTree(source));
  if (!parent) throw new TypeError('This chart has no place for that property.');
  let node = child(parent, name);
  if (next === undefined) return node ? editChartSource(source, [{ kind: 'remove', node: node.id }]) : source;
  if (!node) {
    source = insertChartProperty(source, parent.id, definition);
    node = child(locate(chartPropertyTree(source)), name)!;
  }
  return editChartSource(source, [{ kind: 'attribute', node: node.id, name: 'val', value: next }]);
}
