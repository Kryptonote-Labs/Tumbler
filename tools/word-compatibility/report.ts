import { dimensions, type CompatibilityReport, type Counts } from './model.ts';

export function percentage(value: Counts): string { return value.percent === null ? 'n/a' : `${value.percent.toFixed(4)}%`; }
export function markdown(report: CompatibilityReport): string {
  const lines = [
    '# Word standards qualification', '',
    `**${percentage(report.overall)}: ${report.overall.verified} / ${report.overall.total} indexed topics qualified.**`, '',
    'This measures evidence against a versioned inventory, not the percentage of arbitrary Word documents that work. A topic needs a reviewed qualification plan and all required evidence. Passing narrow scenarios does not qualify a whole clause.', '',
    `Scope: \`${report.scope}\`. Commit: \`${report.provenance.commit}\`.`,
    `Source tree SHA-256: \`${report.provenance.treeSha256}\`. Inventory SHA-256: \`${report.inventorySha256}\`.`, '',
    '| Dimension | Qualified | Denominator | Percent | Failed | Blocked | Untested | Unreviewed | N/A |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...dimensions.map(dimension => row(dimension, report.dimensions[dimension])), '',
    '| Source | Qualified | Denominator | Percent | Failed | Blocked | Untested | Unreviewed | N/A |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(report.sources).map(([source, counts]) => row(source, counts)), '',
    '## Environment', '',
    `Bun ${report.provenance.bun}; ${report.provenance.platform}/${report.provenance.arch}; .NET ${report.provenance.dotnet ?? 'not run'}; Open XML SDK ${report.provenance.openXmlSdk}; ${report.provenance.libreoffice ?? 'LibreOffice not run'}.`, '',
    '## Executed evidence', '',
    `${report.evidence.filter(item => item.outcome === 'passed').length} passed; ${report.evidence.filter(item => item.outcome === 'failed').length} failed; ${report.evidence.filter(item => item.outcome === 'blocked').length} blocked. These counts earn no automatic topic credit.`, '',
    '| Scenario | Oracle | Result | Evidence |', '| --- | --- | --- | --- |',
    ...report.evidence.map(item => `| ${item.scenario} | ${item.oracle} | ${item.outcome} | ${cell(item.detail)} |`), '',
    '## Limits of this denominator', '',
    'The inventory indexes selected leaf headings from eight pinned standards sources. It is not a reviewed enumeration of every normative sentence, schema constraint, annex or feature interaction. Clause sizes differ. The JSON and HTML reports retain every unreviewed topic. The initial inventory has no fully reviewed qualification plans, so a zero score describes qualification maturity, not zero implemented functionality.', '',
    'Strict and Transitional fixtures, preservation comparisons, and independent SDK/LibreOffice checks are separate evidence. Word rendering, Word round trips, real-producer corpora, browser/font matrices and Kryptonote end-to-end tasks are not silently inferred from them.', '',
    'Unknown or missing evidence earns no credit. Unavailable tools are blocked. Known failures fail the run even when the headline score is already zero. No score floor encourages hiding gaps.', '',
  ];
  return lines.join('\n');
}
function row(label: string, value: Counts) {
  return `| ${label} | ${value.verified} | ${value.total} | ${percentage(value)} | ${value.failed} | ${value.blocked} | ${value.untested} | ${value.unreviewed} | ${value.notApplicable} |`;
}
function cell(value: string) { return value.replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('\r', ' '); }

/** Standalone, searchable report. No remote scripts, assets, or telemetry. */
export function html(report: CompatibilityReport): string {
  const data = JSON.stringify(report).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Word standards qualification</title>
<style>:root{color-scheme:dark;font-family:system-ui;color:#e5e5e5;background:#151515}body{max-width:1100px;margin:32px auto;padding:0 20px;line-height:1.55}h1{font-size:24px}p{max-width:85ch}small{color:#aaa}input,select,button{font:inherit;background:#222;color:inherit;border:1px solid #555;border-radius:4px;padding:6px}label{display:inline-block;margin:0 12px 12px 0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid #333;text-align:left;vertical-align:top;padding:8px}th{color:#bbb}code{overflow-wrap:anywhere}.scroll{overflow:auto}details{margin:16px 0}button:disabled{opacity:.4}</style>
<h1>Word standards qualification</h1><p id="score"></p>
<p>Qualification against a versioned topic inventory. This is not the percentage of arbitrary Word documents that work. Narrow scenario passes do not qualify a whole clause.</p>
<p id="scope"></p><details><summary>What this score cannot establish</summary><p>The inventory indexes selected leaf headings from eight pinned sources. Normative prose, annexes, schema constraints and interactions still require review. Topic sizes differ. Unreviewed topics stay in the denominator. Zero qualification does not mean zero implemented functionality.</p><p>Microsoft Word automation, reference layout, real-producer corpora and Kryptonote end-to-end qualification are not configured. Missing evidence earns no credit.</p></details>
<h2>Dimensions</h2><div class="scroll"><table><thead><tr><th>Dimension</th><th>Qualified / total</th><th>Percent</th><th>Failed</th><th>Blocked</th><th>Untested</th><th>Unreviewed</th><th>N/A</th></tr></thead><tbody id="dimensions"></tbody></table></div>
<h2>Evidence</h2><p id="evidence-count"></p><details><summary>Scenario results</summary><div class="scroll"><table><thead><tr><th>Scenario</th><th>Oracle</th><th>Result</th><th>Details</th></tr></thead><tbody id="evidence"></tbody></table></div></details>
<h2>Inventory</h2><label>Search <input id="query" type="search"></label><label>Source <select id="source"><option value="">All</option></select></label><label>Status <select id="status"><option value="">All</option></select></label><p id="count" aria-live="polite"></p><div class="scroll"><table><thead><tr><th>Reference</th><th>Topic</th><th>Status</th></tr></thead><tbody id="topics"></tbody></table></div><p><button id="previous">Previous</button> <button id="next">Next</button></p>
<script>const report=${data};
const byId=id=>document.getElementById(id);const pct=n=>n===null?'n/a':n.toFixed(4)+'%';
function row(target,values){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=String(value);tr.append(td)}target.append(tr)}
byId('score').textContent=pct(report.overall.percent)+' · '+report.overall.verified+' / '+report.overall.total+' topics qualified';
byId('scope').textContent=report.scope+' · commit '+report.provenance.commit+' · source tree '+report.provenance.treeSha256;
for(const [name,c] of Object.entries(report.dimensions))row(byId('dimensions'),[name,c.verified+' / '+c.total,pct(c.percent),c.failed,c.blocked,c.untested,c.unreviewed,c.notApplicable]);
byId('evidence-count').textContent=['passed','failed','blocked'].map(status=>report.evidence.filter(e=>e.outcome===status).length+' '+status).join('; ')+'. No automatic topic credit.';
for(const e of report.evidence)row(byId('evidence'),[e.scenario,e.oracle,e.outcome,e.detail]);
for(const [id,values] of [['source',Object.keys(report.sources)],['status',['unreviewed','untested','blocked','failed','verified']]])for(const value of values){const option=document.createElement('option');option.value=value;option.textContent=value;byId(id).append(option)}
let page=0;function draw(){const query=byId('query').value.toLowerCase();const filtered=report.topics.filter(t=>(!byId('source').value||t.source===byId('source').value)&&(!byId('status').value||t.status===byId('status').value)&&(t.id+' '+t.title).toLowerCase().includes(query));const pages=Math.max(1,Math.ceil(filtered.length/100));page=Math.min(page,pages-1);byId('topics').replaceChildren();for(const t of filtered.slice(page*100,page*100+100))row(byId('topics'),[t.id+' · p. '+t.page,t.title,t.status]);byId('count').textContent=filtered.length+' matching topics · page '+(page+1)+' / '+pages;byId('previous').disabled=page===0;byId('next').disabled=page+1===pages}
for(const id of ['query','source','status'])byId(id).addEventListener('input',()=>{page=0;draw()});byId('previous').onclick=()=>{page--;draw()};byId('next').onclick=()=>{page++;draw()};draw();
</script></html>`;
}
