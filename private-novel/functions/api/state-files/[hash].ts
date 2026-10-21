import {handleSharedFiles,type SharedFilesEnv} from '../../../server/shared-state-files';
export const onRequest:PagesFunction<SharedFilesEnv&{SHARED_STATE_ENABLED?:string}>=c=>c.env.SHARED_STATE_ENABLED==='1'?handleSharedFiles(c.request,c.env,p=>c.waitUntil(p)):Response.json({error:'state_sync_unavailable'},{status:503});
