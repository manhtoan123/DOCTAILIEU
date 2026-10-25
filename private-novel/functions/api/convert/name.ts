import type {Fetcher,PagesFunction} from '@cloudflare/workers-types';
import {handleCloudDeviceAuth,type CloudDeviceEnv} from '../../../server/cloud-device-auth';
import {sameOrigin} from '../../../server/auth';
export const onRequest:PagesFunction<CloudDeviceEnv&{NAME_CONVERTER?:Fetcher}>=context=>handleCloudDeviceAuth(context.request,context.env,async()=>{
 if(!['GET','POST'].includes(context.request.method))return Response.json({error:'method_not_allowed'},{status:405});
 if(context.request.method==='POST'&&!sameOrigin(context.request))return Response.json({error:'invalid_origin'},{status:403});
 if(!context.env.NAME_CONVERTER)return Response.json({error:'convert_unavailable'},{status:503});
 const headers=new Headers();for(const name of ['Content-Type','X-Convert-Version']){const value=context.request.headers.get(name);if(value!==null)headers.set(name,value);}
 return context.env.NAME_CONVERTER.fetch(new Request('https://convert.internal/name',{method:context.request.method,headers,body:context.request.method==='POST'?context.request.body:undefined}));
});
