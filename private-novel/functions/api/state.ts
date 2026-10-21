import {handleSharedState} from '../../server/shared-state';
export const onRequest:PagesFunction<{DB:D1Database;SHARED_STATE_ENABLED?:string}>=context=>context.env.SHARED_STATE_ENABLED==='1'?handleSharedState(context.request,context.env):Response.json({error:'state_sync_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
