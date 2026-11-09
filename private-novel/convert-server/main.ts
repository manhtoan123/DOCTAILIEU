import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {convertServerOrigin} from '../src/features/names-convert/services/convert-server-protocol';
import {createConvertServer} from './service';

function required(name:string){
  const value=process.env[name];
  if(!value)throw new Error('missing configuration');
  return value;
}

try {
  const appOrigin=convertServerOrigin(required('CONVERT_APP_ORIGIN'));
  const port=Number(process.env.CONVERT_PORT??8443);
  if(!appOrigin||!Number.isInteger(port)||port<1||port>65535)throw new Error('invalid configuration');
  const server=createConvertServer({
    appOrigin,directory:resolve(required('CONVERT_DATA_DIR')),
    tls:{
      cert:readFileSync(required('CONVERT_TLS_CERT')),
      key:readFileSync(required('CONVERT_TLS_KEY')),
      ca:readFileSync(required('CONVERT_CLIENT_CA')),
    },
  });
  server.on('error',()=>{process.stderr.write('Convert service could not bind.\n');process.exitCode=1;});
  server.listen(port,process.env.CONVERT_HOST??'127.0.0.1',()=>process.stdout.write('Convert HTTPS service listening.\n'));
} catch {
  process.stderr.write('Invalid Convert service configuration.\n');
  process.exitCode=1;
}
