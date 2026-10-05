import {handleAuth,type Env} from '../server/auth';
export const onRequest:PagesFunction<Env>=async context=>handleAuth(context.request,context.env,()=>context.next());
