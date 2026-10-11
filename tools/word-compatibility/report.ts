import { formatComment, commentData } from './summary.ts';
import type { CompatibilityReport, Counts } from './model.ts';
export function percentage(value: Counts): string { return value.percent === null ? 'n/a' : `${value.percent.toFixed(4)}%`; }
export function markdown(report: CompatibilityReport): string {
  return [formatComment(commentData(report)), '', '## Requirements', '',
    '| ID | Dimension | Status | Acceptance criteria |', '| --- | --- | --- | --- |',
    ...report.requirements.map(item => `| ${item.id} | ${item.dimension} | ${item.status} | ${cell(item.criteria)} |`), '',
    '## Evidence', '', '| Scenario | Oracle | Result | Details |', '| --- | --- | --- | --- |',
    ...report.evidence.map(item => `| ${item.scenario} | ${item.oracle} | ${item.outcome} | ${cell(item.detail)} |`), '',
    '## Provenance', '', `Contract: \`${report.contractHash}\`. Inventory: \`${report.inventorySha256}\`. Source tree: \`${report.provenance.treeSha256}\`.`, '',
    `Bun ${report.provenance.bun}; ${report.provenance.platform}/${report.provenance.arch}; .NET ${report.provenance.dotnet ?? 'not run'}; Open XML SDK ${report.provenance.openXmlSdk}; ${report.provenance.libreoffice ?? 'LibreOffice not run'}.`, '',
    'LibreOffice is the current interoperability reference. SDK validation remains an independent write/edit check. Neither consumer success nor this contract percentage establishes complete Microsoft Word compatibility. The standards inventory still requires much more decomposition, including prose, schema rules and feature interactions.', '',
  ].join('\n');
}
function cell(value: string) { return value.replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('\r', ' '); }

/** Offline report focuses on actionable requirements; the full standards index remains in report.json. */
export function html(report: CompatibilityReport): string {
  const { topics: _, ...summary } = report;
  const data = JSON.stringify(summary).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Word compatibility</title>
<style>:root{color-scheme:dark;font-family:system-ui;color:#e5e5e5;background:#151515}body{max-width:1100px;margin:32px auto;padding:0 20px;line-height:1.55}h1{font-size:24px}p{max-width:90ch}input,select{font:inherit;background:#222;color:inherit;border:1px solid #555;border-radius:4px;padding:6px}label{display:inline-block;margin:0 12px 12px 0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid #333;text-align:left;vertical-align:top;padding:8px}th{color:#bbb}.scroll{overflow:auto}details{margin:16px 0}code{overflow-wrap:anywhere}</style>
<h1>Word compatibility</h1><p id="score"></p><p>Percentages measure explicit requirements in the current behaviour contract. LibreOffice Writer is the interoperability reference; Open XML SDK independently checks package validity. This is not a percentage of all Word features.</p>
<div class="scroll"><table><thead><tr><th>Dimension</th><th>Verified</th><th>Total</th><th>Percent</th><th>Failed</th><th>Blocked</th><th>Untested</th></tr></thead><tbody id="dimensions"></tbody></table></div>
<p id="inventory"></p><details><summary>Standards inventory by source</summary><table><thead><tr><th>Source</th><th>Topics</th><th>Linked to requirements</th></tr></thead><tbody id="sources"></tbody></table><p>These links are traceability, not complete clause coverage. The full topic inventory is retained in report.json.</p></details>
<h2>Requirements</h2><label>Search <input id="query" type="search"></label><label>Status <select id="status"><option value="">All</option><option>verified</option><option>untested</option><option>blocked</option><option>failed</option></select></label><p id="count" aria-live="polite"></p><div class="scroll"><table><thead><tr><th>ID</th><th>Dimension</th><th>Status</th><th>Acceptance criteria</th></tr></thead><tbody id="requirements"></tbody></table></div>
<details><summary>Executed evidence</summary><table><thead><tr><th>Scenario</th><th>Oracle</th><th>Result</th><th>Details</th></tr></thead><tbody id="evidence"></tbody></table></details><details><summary>Provenance</summary><pre id="provenance" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>
<script>const report=${data};
const byId=id=>document.getElementById(id);const pct=n=>n===null?'n/a':(Math.floor(n*100)/100).toFixed(2)+'%';
function row(target,values){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=String(value);tr.append(td)}target.append(tr)}
byId('score').textContent=report.overall.verified+' / '+report.overall.total+' defined requirements verified ('+pct(report.overall.percent)+').';
for(const [name,c] of Object.entries(report.dimensions))row(byId('dimensions'),[name==='interoperate'?'interoperate (LibreOffice)':name,c.verified,c.total,pct(c.percent),c.failed,c.blocked,c.untested]);
byId('inventory').textContent='Standards backlog: '+report.inventory.mapped+' / '+report.inventory.total+' topics have requirements linked; '+report.inventory.withoutRequirements+' have none yet. Linked topics can still have missing requirements.';
for(const s of report.sources)row(byId('sources'),[s.id,s.total,s.mapped]);
for(const e of report.evidence)row(byId('evidence'),[e.scenario,e.oracle,e.outcome,e.detail]);
byId('provenance').textContent=JSON.stringify({scope:report.scope,contractHash:report.contractHash,inventorySha256:report.inventorySha256,...report.provenance},null,2);
function draw(){const query=byId('query').value.toLowerCase();const filtered=report.requirements.filter(r=>(!byId('status').value||r.status===byId('status').value)&&(r.id+' '+r.criteria).toLowerCase().includes(query));byId('requirements').replaceChildren();for(const r of filtered)row(byId('requirements'),[r.id,r.dimension,r.status,r.criteria]);byId('count').textContent=filtered.length+' matching requirements'}
for(const id of ['query','status'])byId(id).addEventListener('input',draw);draw();
</script></html>`;
}
