<script lang="ts">
  import { untrack } from "svelte";
  import type { ChartPropertyNode } from "@tumblerjs/charts";
  import Self from "./ChartPropertyFields.svelte";
  import { chartBoolean, type ChartPropertyApply, type ChartPropertyChange } from "./chart-properties.ts";

  type Attribute = ChartPropertyNode["attributes"][number];

  /** Recursive schema-driven fields for one chart property and its descendants. */
  interface Props {
    readonly node: ChartPropertyNode;
    readonly labels: ReadonlyMap<number, string>;
    /** Ids whose removal keeps the parent valid; others never offer removal. */
    readonly removable: ReadonlySet<number>;
    readonly apply: ChartPropertyApply;
    readonly themeColors?: Readonly<Record<string, string>>;
    readonly disabled?: boolean;
    /** Expands every group while a search is active. */
    readonly searching?: boolean;
    readonly depth?: number;
  }

  let { node, labels, removable, apply, themeColors = {}, disabled = false, searching = false, depth = 0 }: Props = $props();

  const id = $props.id();
  let error = $state<string>();
  let open = $state(untrack(() => depth === 0 || searching));
  $effect(() => { if (searching) open = true; });

  const label = $derived(labels.get(node.id) ?? node.label);
  const textEditable = $derived(node.editableText && !node.children.length && (node.definition !== undefined || node.text !== ""));
  // A property with one value and nothing nested reads best as a single labelled row.
  const compact = $derived(
    depth > 0 && !node.children.length && !node.availableChildren.length && !textEditable
      && (node.attributes.length === 0 || (node.attributes.length === 1 && node.attributes[0]!.name === "val")),
  );

  function run(change: ChartPropertyChange) {
    error = apply(change);
  }
  function setAttribute(attribute: Attribute, value: string | null) {
    if (value === (attribute.value ?? null)) return;
    run({ kind: "edit", edits: [{ kind: "attribute", node: node.id, name: attribute.name, value }] });
  }
  function commitNumber(attribute: Attribute, input: HTMLInputElement) {
    const raw = input.value.trim();
    if (raw === "") {
      if (attribute.required) { error = `${attribute.label} is required.`; input.value = attribute.value ?? ""; return; }
      setAttribute(attribute, null);
      return;
    }
    const number = Number(raw);
    const { minimum = -Infinity, maximum = Infinity } = attribute;
    if (!Number.isFinite(number) || number < minimum || number > maximum ||
      attribute.integer && !Number.isInteger(number) ||
      attribute.minimumExclusive !== undefined && number <= attribute.minimumExclusive ||
      attribute.maximumExclusive !== undefined && number >= attribute.maximumExclusive) {
      error = Number.isFinite(minimum) && Number.isFinite(maximum)
        ? `${attribute.label} must be between ${minimum} and ${maximum}.`
        : `${attribute.label} must be a number.`;
      input.value = attribute.value ?? "";
      return;
    }
    setAttribute(attribute, raw);
  }
  function commitText(attribute: Attribute, input: HTMLInputElement) {
    if (input.value === "" && attribute.required) { error = `${attribute.label} is required.`; input.value = attribute.value ?? ""; return; }
    setAttribute(attribute, input.value === "" ? null : input.value);
  }
  function remove(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    run({ kind: "edit", edits: [{ kind: "remove", node: node.id }] });
  }
  function add(select: HTMLSelectElement) {
    const definition = select.value;
    select.value = "";
    if (definition) run({ kind: "insert", node: node.id, definition });
  }
  // Node ids shift after inserts; sibling position keeps expanded groups open across edits.
  const entries = $derived.by(() => {
    const seen = new Map<string, number>();
    return node.children.map((entry) => {
      const index = seen.get(entry.name) ?? 0;
      seen.set(entry.name, index + 1);
      return { entry, key: `${entry.name}#${index}` };
    });
  });
  const numeric = (attribute: Attribute) => attribute.kind === "number" && (attribute.value === undefined || Number.isFinite(Number(attribute.value)));
</script>

{#snippet control(attribute: Attribute, name: string, controlId: string)}
  {@const swatch = attribute.value === undefined ? undefined : themeColors[attribute.value]}
  {#if attribute.kind === "boolean"}
    {@const current = chartBoolean(attribute.value)}
    <select id={controlId} class="tumbler-select" {disabled} aria-label={name}
      value={current === undefined ? "" : current ? "1" : "0"}
      onchange={(event) => setAttribute(attribute, event.currentTarget.value || null)}>
      {#if !attribute.required}<option value="">Auto</option>{/if}
      <option value="1">Yes</option>
      <option value="0">No</option>
    </select>
  {:else if attribute.choices}
    <span class="choice">
      {#if swatch}<span class="swatch" style:background={swatch} aria-hidden="true"></span>{/if}
      <select id={controlId} class="tumbler-select" {disabled} aria-label={name} value={attribute.value ?? ""}
        onchange={(event) => setAttribute(attribute, event.currentTarget.value || null)}>
        {#if !attribute.required}<option value="">Auto</option>{/if}
        {#if attribute.value !== undefined && !attribute.choices.some((choice) => choice.value === attribute.value)}
          <option value={attribute.value}>{attribute.value}</option>
        {/if}
        {#each attribute.choices as choice (choice.value)}<option value={choice.value}>{choice.label}</option>{/each}
      </select>
    </span>
  {:else if attribute.kind === "hex"}
    <span class="choice">
      <input id={controlId} type="color" {disabled} aria-label={name} value={`#${attribute.value ?? "000000"}`}
        onchange={(event) => setAttribute(attribute, event.currentTarget.value.slice(1).toUpperCase())} />
      {#if !attribute.required && attribute.value !== undefined}
        <button type="button" class="icon" {disabled} aria-label={`Clear ${name}`} title="Clear" onclick={() => setAttribute(attribute, null)}>×</button>
      {/if}
    </span>
  {:else if numeric(attribute)}
    <input id={controlId} type="number" {disabled} aria-label={name} value={attribute.value ?? ""} placeholder={attribute.required ? "" : "Auto"}
      min={attribute.minimum} max={attribute.maximum} step={attribute.integer ? 1 : 'any'}
      onchange={(event) => commitNumber(attribute, event.currentTarget)}
      onkeydown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
  {:else}
    <input id={controlId} type="text" {disabled} aria-label={name} value={attribute.value ?? ""} placeholder={attribute.required ? "" : "Auto"}
      onchange={(event) => commitText(attribute, event.currentTarget)}
      onkeydown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
  {/if}
{/snippet}

{#snippet removeButton()}
  {#if removable.has(node.id)}
    <button type="button" class="icon" {disabled} aria-label={`Remove ${label}`} title="Remove" onclick={remove}>×</button>
  {/if}
{/snippet}

{#snippet errorLine()}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
{/snippet}

{#snippet body()}
  {#each node.attributes as attribute, index (attribute.name)}
    <div class="row">
      <label for={`${id}-${index}`}>{attribute.label}</label>
      {@render control(attribute, attribute.label, `${id}-${index}`)}
    </div>
  {/each}
  {#if textEditable}
    <div class="row">
      <label for={`${id}-text`}>Value</label>
      <input id={`${id}-text`} type="text" {disabled} value={node.text}
        onchange={(event) => run({ kind: "edit", edits: [{ kind: "text", node: node.id, value: event.currentTarget.value }] })}
        onkeydown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    </div>
  {/if}
  {#each entries as { entry, key } (key)}
    <Self node={entry} {labels} {removable} {apply} {themeColors} {disabled} {searching} depth={depth + 1} />
  {/each}
  {#if node.availableChildren.length}
    <select class="tumbler-select add" {disabled} aria-label={`Add property to ${label}`} value="" onchange={(event) => add(event.currentTarget)}>
      <option value="" disabled>Add property</option>
      {#each node.availableChildren as option (option.definition)}<option value={option.definition}>{option.label}</option>{/each}
    </select>
  {/if}
  {@render errorLine()}
{/snippet}

{#if compact}
  {@const attribute = node.attributes[0]}
  <div class="property">
    <div class="row">
      {#if attribute}
        <label for={`${id}-0`}>{label}</label>
        <span class="choice">{@render control(attribute, label, `${id}-0`)}{@render removeButton()}</span>
      {:else}
        <span>{label}</span>
        {@render removeButton()}
      {/if}
    </div>
    {@render errorLine()}
  </div>
{:else if depth === 0}
  <div class="fields">{@render body()}</div>
{:else}
  <details class="group" bind:open>
    <summary><span class="name">{label}</span>{@render removeButton()}</summary>
    {#if open}<div class="fields">{@render body()}</div>{/if}
  </details>
{/if}

<style>
  .fields { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .group .fields { padding: 6px 0 4px 10px; margin-left: 4px; border-left: 1px solid var(--tumbler-control-border, var(--border, #303030)); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; min-width: 0; }
  .row > label, .row > span:first-child, .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .choice { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
  summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 26px; cursor: pointer; list-style: none; border-radius: 4px; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: ""; flex: 0 0 auto; width: 6px; height: 6px; margin-right: 2px; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: rotate(-45deg); opacity: 0.6; transition: transform 120ms; }
  details[open] > summary::before { transform: rotate(45deg); }
  summary .name { flex: 1; }
  summary:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  input[type="text"], input[type="number"] {
    box-sizing: border-box; height: 28px; width: 112px; min-width: 0; padding: 0 6px; font: inherit;
    color: var(--tumbler-control-text, var(--text, #e2fee7)); background: var(--tumbler-control-bg, var(--surface, #181818));
    border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px;
  }
  input[type="number"] { width: 72px; }
  input[type="color"] { width: 28px; height: 24px; padding: 0; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; background: none; cursor: pointer; }
  input:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  select.tumbler-select { max-width: 150px; padding-block: 4px; }
  select.add { align-self: flex-start; max-width: 100%; color: var(--tumbler-control-muted, var(--text-soft, #9baa9d)); }
  .swatch { width: 14px; height: 14px; border-radius: 3px; box-shadow: inset 0 0 0 1px #8886; }
  .icon {
    display: inline-grid; place-items: center; flex: 0 0 auto; width: 22px; height: 22px; padding: 0; font: inherit; font-size: 15px; line-height: 1;
    color: var(--tumbler-control-muted, var(--text-soft, #9baa9d)); background: none; border: 0; border-radius: 4px; cursor: pointer;
  }
  .icon:hover:enabled { color: var(--tumbler-control-text, var(--text, #e2fee7)); background: var(--tumbler-control-hover, var(--surface-hover, #252825)); }
  .icon:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 0; }
  :disabled { opacity: 0.4; cursor: default; }
  .error { margin: 0; font-size: 11px; color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); }
</style>
