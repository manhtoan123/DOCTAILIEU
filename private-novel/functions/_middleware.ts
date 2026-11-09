import {handleAuth,secure,type Env} from '../server/auth';
import type {PagesFunction,Fetcher} from '@cloudflare/workers-types';
export const onRequest:PagesFunction<Env & {CLOUD_ACCESS_TOKEN_HASH?:string;PUBLIC_LIBRARY?:string;ASSETS?:Fetcher;CONVERT_SERVER_ORIGIN?:string}>=async context=>{
  const next=async()=>{
    const response=await context.next();
    // Reader URLs are client routes. Pages Functions may otherwise return an
    // empty 404 on direct navigation/reload; preserve auth and security headers.
    const url=new URL(context.request.url);
    if(response.status===404&&['GET','HEAD'].includes(context.request.method)&&/^\/(?:r|read)\/[^/]+\/[^/]+\/?$/.test(url.pathname)&&context.env.ASSETS){
      void response.body?.cancel().catch(()=>{});
      return context.env.ASSETS.fetch(new Request(new URL('/',url),{method:context.request.method}));
    }
    return response;
  };
  if(context.env.PUBLIC_LIBRARY==='1'||context.env.CLOUD_ACCESS_TOKEN_HASH!==undefined||!context.env.AUTH_PASSWORD_HASH){
    return secure(await next(),context.env.CONVERT_SERVER_ORIGIN);
  }
  const response=await handleAuth(context.request,context.env,next);
  return context.env.CONVERT_SERVER_ORIGIN?secure(response,context.env.CONVERT_SERVER_ORIGIN):response;
};
