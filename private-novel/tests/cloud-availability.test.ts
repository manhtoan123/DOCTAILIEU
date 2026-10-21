import {expect,it} from 'vitest';
import {handleCloudLibrary,type CloudLibraryEnv} from '../server/cloud-library';

function failingEnv(failure:Error){
  return {PUBLIC_LIBRARY:'1',LIBRARY_BUCKET:{},DB:{prepare:()=>{throw failure;}}} as unknown as CloudLibraryEnv;
}
it.each([false,true])('reports exhausted D1 reads safely (wrapped: %s)',async wrapped=>{
  const quota=new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit. SQL and private detail");
  const failure=wrapped?new Error('binding failed',{cause:quota}):quota;
  const response=await handleCloudLibrary(new Request('https://example.test/api/cloud/books'),failingEnv(failure));
  expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'cloud_read_limit'});
  const delay=Number(response.headers.get('Retry-After'));expect(delay).toBeGreaterThan(0);expect(delay).toBeLessThanOrEqual(86400);
  expect(response.headers.get('Cache-Control')).toContain('no-store');expect(response.headers.get('X-Library-Access')).toBe('public');
});
it('keeps unrelated backend failures generic without leaking SQL or private details',async()=>{
  const response=await handleCloudLibrary(new Request('https://example.test/api/cloud/deletions'),failingEnv(new Error('SQL private detail')));
  expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'cloud_unavailable'});expect(response.headers.has('Retry-After')).toBe(false);
});
