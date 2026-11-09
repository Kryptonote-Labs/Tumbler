<script lang="ts">
  import { untrack } from 'svelte';
  import type { FormulaScalarValue } from '../../../../../../packages/formulas/src/index.ts';
  import { createGridSelection } from '@tumblerjs/core';
  import { openSpreadsheetArtifact, type SpreadsheetCellValue } from '@tumblerjs/sheets';
  import { SpreadsheetGrid } from '@tumblerjs/svelte';
  let { data } = $props();
  let index = $state(0);
  let example = $derived(data.examples[index]!);
  function blank(i: number) {
    return openSpreadsheetArtifact(Uint8Array.from(atob(data.examples[i]!.bytes), c => c.charCodeAt(0)), { sheet: 'Results' }).editCell('A1', '');
  }
  let artifact = $state(untrack(() => blank(0)));
  let formula = $state('');
  let calculated = $state(false);
  let error = $state('');
  const selection = createGridSelection({ row: 1, column: 1 });
  function choose() { artifact = blank(index); formula = ''; calculated = false; error = ''; }
  function calculate() {
    try { artifact = artifact.editFormula('A1', formula.replace(/^=/, '')); calculated = true; error = ''; }
    catch (cause) { error = String(cause); }
  }
  let expected: readonly (readonly FormulaScalarValue[])[] = $derived('type' in example.expected ? [[example.expected]] : example.expected);
  let actual = $derived(expected.map((row, r) => row.map((_, c) => artifact.calculation.value(`${String.fromCharCode(65 + c)}${r + 1}`))));
  let matches = $derived(calculated && actual.every((row, r) => row.every((cell, c) => {
    const wanted = expected[r]![c]!;
    return cell?.type === 'number' && wanted.type === 'number' && Math.abs(cell.value - wanted.value) <= (example.tolerance ?? Math.max(1, Math.abs(wanted.value)) * 1e-11);
  })));
  function format(value: FormulaScalarValue | SpreadsheetCellValue | undefined) { return value?.type === 'number' ? Number(value.value.toPrecision(12)).toString() : value?.type === 'blank' ? 'blank' : value?.value ?? ''; }
</script>
<svelte:head><title>Statistical functions · Tumbler</title></svelte:head>
<main>
  <h1>Statistical functions</h1>
  <div class="controls"><label>Function <select aria-label="Function" bind:value={index} onchange={choose}>{#each data.examples as item, i}<option value={i}>{item.name}</option>{/each}</select></label><span>{index + 1} / {data.examples.length}</span></div>
  <p class="example"><code>={example.formula}</code></p>
  <form onsubmit={event => { event.preventDefault(); calculate(); }}><label for="formula">A1</label><input id="formula" aria-label="Formula" bind:value={formula} placeholder="Enter the formula above" autocomplete="off" spellcheck="false" /><button type="submit" disabled={!formula}>Calculate</button></form>
  {#if error}<p role="alert">{error}</p>{/if}
  <p class="status" data-result={matches ? 'pass' : calculated ? 'fail' : 'ready'}>{calculated ? matches ? 'Matches the independent expected result' : 'Result differs from the expected value' : 'Ready to calculate'}</p>
  <div class="grid"><SpreadsheetGrid worksheet={artifact.worksheet} calculation={artifact.calculation} {selection} readonly /></div>
  <table><thead><tr><th>Cell</th><th>Expected</th><th>Calculated</th></tr></thead><tbody>{#each expected as row, r}{#each row as value, c}<tr><td>{String.fromCharCode(65 + c)}{r + 1}</td><td>{format(value)}</td><td>{calculated ? format(actual[r]?.[c]) : ''}</td></tr>{/each}{/each}</tbody></table>
  <details><summary>Input cells and verification</summary><p>The grid uses Tumbler's spreadsheet engine. Expected results come from SciPy or exact arithmetic. The four ETS examples verify an exact linear series; they do not establish Excel optimizer parity.</p><table><thead><tr><th>Cell</th><th>Value</th></tr></thead><tbody>{#each Object.entries(example.cells ?? {}) as [reference, value]}<tr><td>Inputs!{reference}</td><td>{format(value)}</td></tr>{/each}</tbody></table></details>
</main>
<style>
 main{max-width:1100px;margin:24px auto;padding:0 24px}h1{font-size:24px;margin:0 0 20px}.controls,form{display:flex;align-items:center;gap:14px}.controls span{color:#929aa5}.controls label{display:flex;align-items:center;gap:12px}select,input,button{font:inherit;color:inherit;background:#171b21;border:1px solid #343b45;border-radius:5px;padding:9px 12px}select{min-width:260px}input{flex:1;font-family:monospace}button{cursor:pointer}.example{padding:12px 0;overflow-wrap:anywhere}.status{min-height:24px;color:#929aa5}.status[data-result=pass]{color:#79d5ab}.status[data-result=fail]{color:#fa8585}.grid{height:260px;overflow:hidden;border:1px solid #343b45}table{border-collapse:collapse;font-variant-numeric:tabular-nums;margin:20px 0;width:100%}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #343b45}th{color:#929aa5;font-weight:500}details{margin-top:18px}summary{cursor:pointer}
</style>
