import { formatComment, commentData } from './summary.ts';
import type { CompatibilityReport, Counts } from './model.ts';
export function percentage(value: Counts): string { return value.percent === null ? 'n/a' : `${value.percent.toFixed(4)}%`; }
export function markdown(report: CompatibilityReport): string {
  return [formatComment(commentData(report)), '', `Narrow executable requirements: ${report.requirementCounts.verified}/${report.requirementCounts.total} verified. These do not replace the standards denominator.`, '', '## Requirements', '',
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
  const data = JSON.stringify({ ...summary, topicTitles: Object.fromEntries(report.topics.map(topic => [topic.id, topic.title])) }).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Word compatibility</title>
<style>:root{color-scheme:dark;font-family:system-ui;color:#e5e5e5;background:#151515}body{max-width:1100px;margin:32px auto;padding:0 20px;line-height:1.55}h1{font-size:24px}p{max-width:90ch}input,select{font:inherit;background:#222;color:inherit;border:1px solid #555;border-radius:4px;padding:6px}label{display:inline-block;margin:0 12px 12px 0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid #333;text-align:left;vertical-align:top;padding:8px}th{color:#bbb}.scroll{overflow:auto}details{margin:16px 0}code{overflow-wrap:anywhere}</style>
<h1>Word compatibility</h1><p id="score"></p><p>Percentages measure verified standards topic/dimension targets. Overall uses all six dimensions across the full inventory. LibreOffice Writer is the interoperability reference; Open XML SDK independently checks package validity. Unresolved and untested coverage remains in the denominator. This is not a probability that an arbitrary document works.</p>
<section id="everyday" hidden><h2>Everyday document benchmark · v1</h2><p>Equal-weight tasks, not estimated market coverage. Untested tasks earn no credit. Headless checks do not establish browser or Kryptonote behaviour.</p><table><thead><tr><th>Category</th><th>Verified</th><th>Total</th><th>Percent</th><th>Failed</th><th>Blocked</th><th>Untested</th></tr></thead><tbody id="everyday-categories"></tbody></table><details><summary>Everyday tasks and acceptance criteria</summary><table><thead><tr><th>Task</th><th>Layer</th><th>Status</th><th>Acceptance criteria</th><th>Evidence requirements</th></tr></thead><tbody id="everyday-tasks"></tbody></table></details></section>
<div class="scroll"><table><thead><tr><th>Dimension</th><th>Verified</th><th>Total</th><th>Percent</th><th>Failed</th><th>Blocked</th><th>Untested</th></tr></thead><tbody id="dimensions"></tbody></table></div>
<p id="inventory"></p><details><summary>Standards inventory by source</summary><table><thead><tr><th>Source</th><th>Topics</th><th>Targets</th><th>Verified</th><th>Percent</th></tr></thead><tbody id="sources"></tbody></table><p>These links are traceability, not complete clause coverage. The full topic inventory is retained in report.json.</p></details>
<h2>Standards targets</h2><label>Search <input id="query" type="search"></label><label>Status <select id="status"><option value="">All</option><option>verified</option><option>untested</option><option>blocked</option><option>failed</option></select></label><p id="count" aria-live="polite"></p><div class="scroll"><table><thead><tr><th>ID</th><th>Dimension</th><th>Status</th><th>Remaining work</th></tr></thead><tbody id="requirements"></tbody></table></div>
<details><summary>Narrow requirements and acceptance criteria</summary><table><thead><tr><th>ID</th><th>Status</th><th>Criteria</th></tr></thead><tbody id="narrow"></tbody></table></details><details><summary>Executed evidence</summary><table><thead><tr><th>Scenario</th><th>Oracle</th><th>Result</th><th>Details</th></tr></thead><tbody id="evidence"></tbody></table></details><details><summary>Provenance</summary><pre id="provenance" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>
<script>const report=${data};
const byId=id=>document.getElementById(id);const pct=n=>n===null?'n/a':(Math.floor(n*10000)/10000).toFixed(4)+'%';
function row(target,values){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=String(value);tr.append(td)}target.append(tr)}
if(report.everyday){byId('everyday').hidden=false;for(const [name,c] of Object.entries({overall:report.everyday.overall,...report.everyday.categories}))row(byId('everyday-categories'),[name,c.verified,c.total,pct(c.percent),c.failed,c.blocked,c.untested]);for(const task of report.everyday.tasks)row(byId('everyday-tasks'),[task.title,task.layer,task.status,task.criteria,task.probe?.detail||task.requirements.join(', ')||'No executable mapping yet']);}
byId('score').textContent=report.overall.verified+' / '+report.overall.total+' standards targets verified ('+pct(report.overall.percent)+').';
for(const [name,c] of Object.entries({overall:report.overall,...report.dimensions}))row(byId('dimensions'),[name==='interoperate'?'interoperate (LibreOffice)':name,c.verified,c.total,pct(c.percent),c.failed,c.blocked,c.untested]);
byId('inventory').textContent='Narrow requirements: '+report.requirementCounts.verified+'/'+report.requirementCounts.total+' verified. Standards inventory: '+report.inventory.mapped+' / '+report.inventory.total+' topics have requirements linked; '+report.inventory.withoutRequirements+' have none yet. Linked topics can still have missing requirements.';
for(const s of report.sources)row(byId('sources'),[s.id,s.total,s.coverage.total,s.coverage.verified,pct(s.coverage.percent)]);
for(const r of report.requirements)row(byId('narrow'),[r.id,r.status,r.criteria]);
for(const e of report.evidence)row(byId('evidence'),[e.scenario,e.oracle,e.outcome,e.detail]);
byId('provenance').textContent=JSON.stringify({scope:report.scope,contractHash:report.contractHash,inventorySha256:report.inventorySha256,...report.provenance},null,2);
function draw(){const query=byId('query').value.toLowerCase();const filtered=report.coverageTargets.filter(r=>(!byId('status').value||r.status===byId('status').value)&&(r.id+' '+r.source+' '+(r.gap||'')+' '+(report.topicTitles[r.topic]||'')).toLowerCase().includes(query));byId('requirements').replaceChildren();for(const r of filtered.slice(0,200))row(byId('requirements'),[r.topic+' '+(report.topicTitles[r.topic]||''),r.dimension,r.status,r.gap||'All requirements verified']);byId('count').textContent=filtered.length+' matching targets; showing up to 200. Narrow the search by topic title, source, section or dimension.'}

for(const id of ['query','status'])byId(id).addEventListener('input',draw);draw();
</script></html>`;
}
