import {handleAuth,secure,type Env} from '../server/auth';
import type {PagesFunction} from '@cloudflare/workers-types';
export const onRequest:PagesFunction<Env & {CLOUD_ACCESS_TOKEN_HASH?:string;PUBLIC_LIBRARY?:string}>=async context=>{
  if(context.env.PUBLIC_LIBRARY==='1'||context.env.CLOUD_ACCESS_TOKEN_HASH!==undefined||!context.env.AUTH_PASSWORD_HASH){
    return secure(await context.next());
  }
  return handleAuth(context.request,context.env,()=>context.next());
};
