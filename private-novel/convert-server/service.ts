import {createServer,type ServerOptions} from 'node:https';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {TLSSocket} from 'node:tls';
import {
  MAX_CONVERT_BODY,MAX_CONVERT_OUTPUT,MAX_CONVERT_TEXT,PROFILE_TYPE,isProfileId,
} from '../src/features/names-convert/services/convert-server-protocol';
import type {ConvertOptions} from '../src/features/names-convert/services/language';
import {MAX_UPLOAD_BYTES,ProfileStore,RequestError} from './profile';

const knownPaths=['/v1/health','/v1/profile','/v1/convert','/v1/lookup'];
const textType='application/json';
const isObject=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));

function json(response:ServerResponse,status:number,value:unknown){
  const body=JSON.stringify(value);
  if(Buffer.byteLength(body)>MAX_CONVERT_OUTPUT)throw new RequestError(422,'output_limit');
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});
  response.end(body);
}

function checkBody(request:IncomingMessage,type:string,limit:number){
  if(request.headers['content-type']!==type||request.headers['content-encoding'])throw new RequestError(415,'invalid_content_type');
  const length=request.headers['content-length'];
  if(length!==undefined&&Number(length)>limit)throw new RequestError(413,'request_too_large');
}

async function readJson(request:IncomingMessage){
  checkBody(request,textType,MAX_CONVERT_BODY);
  const chunks:Buffer[]=[];
  let bytes=0;
  for await(const chunk of request.iterator({destroyOnReturn:false}) as AsyncIterable<Buffer>){
    bytes+=chunk.length;
    if(bytes>MAX_CONVERT_BODY)throw new RequestError(413,'request_too_large');
    chunks.push(chunk);
  }
  try {
    const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));
    if(isObject(value))return value;
  } catch {/* Treat invalid JSON and invalid UTF-8 as the same error. */}
  throw new RequestError(400,'invalid_body');
}

function convertInput(input:Record<string,unknown>){
  const {text,names,options,includeLookup}=input;
  if(typeof text!=='string'||!Array.isArray(names)||!isObject(options)||(includeLookup!==undefined&&includeLookup!==true))
    throw new RequestError(400,'invalid_input');
  if(text.length>MAX_CONVERT_TEXT)throw new RequestError(413,'text_too_large');
  if(names.length>25_000||includeLookup&&text.length>1024)throw new RequestError(413,'request_too_large');
  if(names.some((entry:unknown)=>!isObject(entry)||typeof entry.key!=='string'||!entry.key||
      entry.key.length>256||typeof entry.value!=='string'||entry.value.length>65536)||
    Object.entries(options).some(([key,value])=>key==='mode'?value!=='vietphrase'&&value!=='hanviet':
      !['multipleMeanings','standardizePunctuation','capitalize','reference'].includes(key)||typeof value!=='boolean'))
    throw new RequestError(400,'invalid_input');
  return {text,names:names as {key:string;value:string}[],options:options as ConvertOptions,includeLookup};
}

export function createConvertServer(config:{tls:ServerOptions;appOrigin:string;directory:string}){
  const store=new ProfileStore(config.directory);
  let activeRequests=0;

  async function route(request:IncomingMessage,response:ServerResponse){
    const {url,method}=request;
    response.setHeader('Cache-Control','private, no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Vary','Origin');
    if(!(request.socket as TLSSocket).authorized)throw new RequestError(401,'unauthorized');
    if(request.headers.origin!==config.appOrigin)throw new RequestError(403,'invalid_origin');
    response.setHeader('Access-Control-Allow-Origin',config.appOrigin);
    response.setHeader('Access-Control-Allow-Credentials','true');
    if(!url||!knownPaths.includes(url))throw new RequestError(404,'not_found');
    if(method==='OPTIONS'){
      response.writeHead(204,{
        'Access-Control-Allow-Methods':'GET, POST, PUT',
        'Access-Control-Allow-Headers':'Content-Type, If-Match',
        'Access-Control-Max-Age':'600',
      }).end();
      return;
    }

    if(url==='/v1/health'&&method==='GET'){
      const status=store.status();
      if(status.state==='loading')response.setHeader('Retry-After','2');
      json(response,['loading','error'].includes(status.state)?503:200,status);
      return;
    }
    if(url==='/v1/profile'&&method==='PUT'){
      checkBody(request,PROFILE_TYPE,MAX_UPLOAD_BYTES);
      const expected=request.headers['if-match']?.slice(1,-1);
      if(request.headers['if-match']!==`"${expected}"`||(!isProfileId(expected)&&expected!=='none'))
        throw new RequestError(428,'profile_precondition_required');
      const controller=new AbortController();
      const stop=()=>controller.abort();
      response.once('close',stop);
      request.setTimeout(300_000);
      try {json(response,200,await store.replace(request,expected,controller.signal));}
      finally {response.off('close',stop);}
      return;
    }
    if(!['/v1/convert','/v1/lookup'].includes(url)||method!=='POST')throw new RequestError(405,'method_not_allowed');
    if(store.state==='loading')response.setHeader('Retry-After','2');
    if(store.state!=='ready')throw new RequestError(503,store.state);
    if(activeRequests>=2)throw new RequestError(429,'busy');
    activeRequests++;
    try {
      const input=await readJson(request);
      // Resolve once after receiving the request so it uses one complete profile.
      const profile=store.current;
      if(store.state!=='ready'||!profile)throw new RequestError(503,store.state);
      if(url==='/v1/lookup'){
        if(typeof input.source!=='string'||!input.source||input.source.length>1024)throw new RequestError(400,'invalid_input');
        json(response,200,profile.engine.lookup(input.source));
      } else {
        const {text,names,options,includeLookup}=convertInput(input);
        let remaining=MAX_CONVERT_OUTPUT;
        const tokens=profile.engine.convert(text,names,options,units=>{
          remaining-=units;
          if(remaining<0)throw new RequestError(422,'output_limit');
        });
        json(response,200,includeLookup?{tokens,meaning:profile.engine.lookup(text)}:tokens);
      }
    } finally {activeRequests--;}
  }

  const server=createServer({
    ...config.tls,minVersion:'TLSv1.2',requestCert:true,rejectUnauthorized:true,
    maxHeaderSize:8192,requestTimeout:300_000,headersTimeout:10_000,handshakeTimeout:10_000,
  },(request,response)=>{
    void route(request,response).catch(error=>{
      if(response.destroyed||response.headersSent)return;
      if(!request.complete)response.setHeader('Connection','close');
      json(response,error instanceof RequestError?error.status:503,{
        error:error instanceof RequestError?error.message:'service_unavailable',
      });
    });
  });
  server.maxConnections=32;
  server.setTimeout(30_000,socket=>socket.destroy());
  server.once('listening',()=>void store.initialize());
  return server;
}
