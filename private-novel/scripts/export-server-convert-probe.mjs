import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
const directory=resolve('.dsh-tmp/server-convert/corpus');
const corpus=JSON.parse(await readFile(join(directory,'packed-latest.json'),'utf8'));
if(corpus.unsupportedEntries!==0||!resolve(corpus.databasePath).startsWith(directory+sep))throw Error('Invalid local corpus');
const file=join(directory,`import-${Date.now()}.sql`),db=new DatabaseSync(corpus.databasePath,{readOnly:true});
const quote=value=>typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
let rows=0,maxStatementBytes=0,buffer='';
try{
 await writeFile(file,await readFile('experiments/server-convert/packed-schema.sql','utf8'));
 for(const table of ['probe_buckets','probe_rules','probe_metadata'])for(const row of db.prepare(`SELECT * FROM ${table}`).iterate()){
  const statement=`INSERT INTO ${table} VALUES(${Object.values(row).map(quote).join(',')});\n`;
  const bytes=Buffer.byteLength(statement);if(bytes>99000)throw Error('SQL statement exceeds import budget');
  maxStatementBytes=Math.max(maxStatementBytes,bytes);rows++;buffer+=statement;
  if(Buffer.byteLength(buffer)>1000000){await appendFile(file,buffer);buffer='';}
 }
 if(buffer)await appendFile(file,buffer);
 const report={file,rows,maxStatementBytes,source:corpus.databasePath};
 await writeFile(join(directory,'export-latest.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{db.close();}
