import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

export function convertTestTls(directory:string){
  const gitOpenSSL=join(process.env.ProgramFiles??'C:/Program Files','Git','usr','bin','openssl.exe');
  const openssl=process.env.TEST_OPENSSL??(process.platform==='win32'&&existsSync(gitOpenSSL)?gitOpenSSL:'openssl');
  const run=(...args:string[])=>execFileSync(openssl,args,{cwd:directory,stdio:'ignore'});
  run('req','-x509','-newkey','rsa:2048','-noenc','-keyout','server.key','-out','server.pem','-days','2',
    '-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','extendedKeyUsage=serverAuth');
  run('req','-x509','-newkey','rsa:2048','-noenc','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=Test Convert CA');
  run('req','-newkey','rsa:2048','-noenc','-keyout','client.key','-out','client.csr','-subj','/CN=Test Client',
    '-addext','extendedKeyUsage=clientAuth');
  run('x509','-req','-in','client.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','client.pem','-days','2','-copy_extensions','copy');
  const read=(file:string)=>readFileSync(join(directory,file));
  return {
    server:{cert:read('server.pem'),key:read('server.key'),ca:read('ca.pem')},
    client:{cert:read('client.pem'),key:read('client.key'),ca:read('server.pem')},
  };
}
