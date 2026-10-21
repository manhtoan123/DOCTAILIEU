import {readFileSync,writeFileSync} from 'node:fs';
const dir='.dsh-tmp/model-benchmark',report=JSON.parse(readFileSync(dir+'/results.json','utf8'));
if(report.runs.length!==report.models.length*report.rounds)throw Error('Comparison incomplete');
const summary=report.models.map(model=>{
 const runs=report.runs.filter(r=>r.model===model),done=runs.filter(r=>r.status==='complete'),seconds=done.map(r=>r.ms/1000);
 return {model,attempts:runs.length,complete:done.length,completionPercent:100*done.length/runs.length,withoutHan:done.filter(r=>r.hanRemaining===0).length,meanSeconds:seconds.length?seconds.reduce((a,b)=>a+b,0)/seconds.length:null,seconds,firstSeconds:done.map(r=>r.firstReadableMs/1000),http:[...new Set(runs.flatMap(r=>r.calls.map(c=>c.status)))],requests:runs.reduce((sum,r)=>sum+r.requests,0)};
});
writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2));
report.bounds='6 HTTP per run; no new send after100s; original run global cap120; reusable harness cap168';report.actualRequests=summary.reduce((sum,r)=>sum+r.requests,0);report.completedRuns=summary.reduce((sum,r)=>sum+r.complete,0);report.withoutHanRuns=summary.reduce((sum,r)=>sum+r.withoutHan,0);report.commonPrompt='AI_DEFAULTS';
writeFileSync(dir+'/results.json',JSON.stringify(report,null,2));
const cell=values=>values.length?values.map(v=>v.toFixed(2)).join(' / '):'—';
const table=['## Số liệu hai lượt đã hoàn tất','',`**${report.runs.length} lượt / ${report.models.length} model / ${report.actualRequests} HTTP proxy** (gồm retry; một HTTP proxy có thể xoay nhiều key theo policy hiện có). ${report.completedRuns} lượt trả đủ mọi phần; ${report.withoutHanRuns} lượt đồng thời không còn Hán tự. Không lấy tỷ lệ gộp của tập nhiều model lỗi làm tỷ lệ thành công chung của app.`,'','Dấu ★: model ngoài picker. Giây TB chỉ tính lượt hoàn tất. Không chấm chất lượng model không trả được chương.','','| Model | Trả đủ chương | Không còn Hán tự | Đủ chương lượt1 / lượt2 (s) | TB (s) | Phần đầu lượt1 / lượt2 (s) | HTTP quan sát |','|---|---:|---:|---:|---:|---:|---|',...summary.map(r=>`| ${r.model}${['gemini-2.5-pro','gemini-2.5-flash-lite','gemini-3.6-flash','gemini-3.5-flash-lite','gemini-4-argon'].includes(r.model)?' ★':''} | ${r.complete}/${r.attempts} (${r.completionPercent.toFixed(0)}%) | ${r.withoutHan}/${r.attempts} | ${cell(r.seconds)} | ${r.meanSeconds===null?'—':r.meanSeconds.toFixed(2)} | ${cell(r.firstSeconds)} | ${r.http.join(', ')} |`)].join('\n');
const path='docs/AI-MODEL-COMPARISON-1.md',doc=readFileSync(path,'utf8'),marker='<!-- MODEL-SUMMARY -->',endMarker='<!-- MODEL-SUMMARY-END -->';
const start=doc.indexOf(marker),end=doc.indexOf(endMarker,start),legacySuffix=doc.indexOf('\n## Retest',start);
const suffix=end>=0?doc.slice(end+endMarker.length):legacySuffix>=0?doc.slice(legacySuffix):'';
writeFileSync(path,(start>=0?doc.slice(0,start):doc+'\n')+marker+'\n'+table+'\n'+endMarker+suffix+'\n');
console.log(JSON.stringify({runs:report.runs.length,models:report.models.length,http:report.actualRequests,complete:report.completedRuns,withoutHan:report.withoutHanRuns}));
