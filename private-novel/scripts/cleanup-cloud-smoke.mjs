// Delete only the synthetic object/catalog row recorded by smoke-cloud-production.
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
const path=join(homedir(),'.codex','private-novel','smoke-cloud-cleanup.json');
const row=JSON.parse(readFileSync(path,'utf8'));
if(!/^[a-f0-9-]{36}$/.test(row.id)||!/^[a-f0-9]{64}$/.test(row.sha256)||row.title!==`Synthetic R2 smoke ${row.id}`||row.objectKey!==`books/v1/${row.id}/${row.sha256}.json`)throw new Error('Synthetic cleanup target is invalid');
function run(command){const result=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',command],{encoding:'utf8'});process.stdout.write((result.stdout||'')+(result.stderr||''));if(result.status!==0)throw new Error('Synthetic cleanup failed; metadata retained for retry');}
// Exact generated UUID/SHA allowlisted above; no shell metacharacters can enter.
run(`npx.cmd wrangler r2 object delete thu-phong-library/${row.objectKey} --remote`);
mkdirSync('.wrangler',{recursive:true});
const sqlPath=join('.wrangler','cloud-smoke-cleanup.sql');
writeFileSync(sqlPath,`DELETE FROM cloud_books WHERE id='${row.id}' AND sha256='${row.sha256}' AND title='${row.title}';`);
run('npx.cmd wrangler d1 execute thu-phong-auth --remote --file .wrangler/cloud-smoke-cleanup.sql');
unlinkSync(sqlPath);
unlinkSync(path);console.log('Only the recorded synthetic cloud fixture was removed.');
