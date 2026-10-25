import {afterEach,beforeEach,expect,it} from 'vitest';
import {copyFileSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

let fixture,repository,app,script;
const session={cookie:'sessionid=synthetic-setup-review',deviceId:'123'};
beforeEach(()=>{
 fixture=mkdtempSync(join(tmpdir(),'capcut-setup-review-'));
 repository=join(fixture,'repository');app=join(repository,'app');mkdirSync(join(app,'scripts'),{recursive:true});
 execFileSync('git',['init','--quiet',repository],{stdio:'ignore',windowsHide:true});
 script=join(app,'scripts','configure-capcut-session.mjs');
 copyFileSync(new URL('../scripts/configure-capcut-session.mjs',import.meta.url),script);
});
afterEach(()=>{rmSync(fixture,{recursive:true,force:true});});
function check(file){
 writeFileSync(file,JSON.stringify(session));
 const result=spawnSync(process.execPath,[script,'--file',file],{encoding:'utf8',windowsHide:true});
 expect(result.error).toBeUndefined();expect(result.stdout+result.stderr).not.toContain(session.cookie);
 return result;
}
it('rejects an unignored session anywhere within the ancestor Git repository',()=>{
 const result=check(join(repository,'capcut-session.json'));
 expect(result.status).toBe(1);expect(result.stderr).toContain('Git');
});
it('does not mistake an internal filename starting with two dots for parent traversal',()=>{
 const result=check(join(repository,'..session.json'));
 expect(result.status).toBe(1);expect(result.stderr).toContain('Git');
});
it('allows an ignored ancestor-repository session without publishing',()=>{
 writeFileSync(join(repository,'.gitignore'),'/private-session.json\n');
 const result=check(join(repository,'private-session.json'));
 expect(result.status).toBe(0);expect(result.stdout).toContain('Chưa gửi dữ liệu lên server');
});
it('rejects a tracked session even if an ignore pattern was subsequently added',()=>{
 const file=join(repository,'tracked-session.json');writeFileSync(file,JSON.stringify(session));
 execFileSync('git',['add','--','tracked-session.json'],{cwd:repository,stdio:'ignore',windowsHide:true});
 writeFileSync(join(repository,'.gitignore'),'/tracked-session.json\n');
 const result=check(file);expect(result.status).toBe(1);expect(result.stderr).toContain('Git');
});
it('allows an explicitly selected session outside the Git repository without publishing',()=>{
 const result=check(join(fixture,'outside-session.json'));
 expect(result.status).toBe(0);expect(result.stdout).toContain('Chưa gửi dữ liệu lên server');
});
it('publishes only whitelisted session JSON through stdin to the fixed local Wrangler command',()=>{
 const file=join(fixture,'outside-session.json'),capture=join(fixture,'synthetic-stdin-capture.json');
 writeFileSync(file,JSON.stringify({...session,password:'synthetic-unrelated-password',story:'synthetic-unrelated-story'}));
 const cli=join(app,'node_modules','wrangler','bin','wrangler.js');mkdirSync(join(app,'node_modules','wrangler','bin'),{recursive:true});
 writeFileSync(cli,`const fs=require('node:fs');let input='';process.stdin.on('data',part=>input+=part);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),input:JSON.parse(input)}));console.log('synthetic-sensitive-child-output');console.error('synthetic-sensitive-child-error');});`);
 const result=spawnSync(process.execPath,[script,'--file',file,'--publish'],{encoding:'utf8',windowsHide:true});
 expect(result.status).toBe(0);const output=result.stdout+result.stderr;
 expect(output).not.toMatch(/synthetic-/);
 const stored=JSON.parse(readFileSync(capture,'utf8'));
 expect(stored.args).toEqual(['pages','secret','put','CAPCUT_SESSION_JSON','--project-name','thu-phong-private']);
 expect(stored.input).toEqual({...session,tdid:'',region:'VN',appVersion:'5.8.0'});
 expect(JSON.stringify(stored)).not.toMatch(/unrelated|outside-session/);
});
