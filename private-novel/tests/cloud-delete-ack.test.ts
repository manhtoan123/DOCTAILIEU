import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {deleteCloudBook} from '../src/features/sync-cloud/services/cloud-client';
vi.mock('../src/features/sync-cloud/services/cloud-device',()=>({getCloudDeviceToken:async()=>undefined}));
const id='11111111-1111-4111-8111-111111111111';
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('location',{origin:'https://synthetic.test'});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('reports a verified cloud ACK even when saving local acknowledgement fails, preserving the protection marker',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({id,deleted:true})));const put=db.settings.put.bind(db.settings);
 vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof put>)=>String(args[0]?.key).startsWith('cloud-deleted:')?Promise.reject(Error('quota')) as ReturnType<typeof put>:put(...args));
 const error=await deleteCloudBook(id,null).catch(e=>e);expect(error).toMatchObject({cloudDeleted:true,bookId:id});expect(error.cause.message).toBe('quota');expect(await db.settings.get(`cloud-delete-review:https://synthetic.test:${id}`)).toBeDefined();expect(await db.settings.get(`cloud-deleted:https://synthetic.test:${id}`)).toBeUndefined();
});
it.each(['network','conflict','invalid-ack'])('does not claim a cloud ACK for %s failure',async kind=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{if(kind==='network')throw Error('network');return kind==='conflict'?Response.json({error:'changed'},{status:409}):Response.json({id:'wrong',deleted:true});}));const error=await deleteCloudBook(id,null).catch(e=>e);expect(error).toBeInstanceOf(Error);expect(error.cloudDeleted).not.toBe(true);
});
