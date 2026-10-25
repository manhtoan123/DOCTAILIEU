import {handleCloudDeviceAuth,type CloudDeviceEnv} from './cloud-device-auth';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ready="b.state='ready' AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions d WHERE d.id=b.id)";
const reply=(status:number,value:unknown)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export function handleReaderRoute(request:Request,env:CloudDeviceEnv){
 return handleCloudDeviceAuth(request,env,async()=>{
  const url=new URL(request.url),book=url.searchParams.get('book'),code=url.searchParams.get('code');
  if(!['GET','POST'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, POST'}});
  if(request.method==='POST'){
   if(!book||!uuid.test(book)||code||url.searchParams.size!==1)return reply(400,{error:'invalid_route_request'});
   // Incoming HTTP POSTs may expose an empty stream instead of a null body.
   // Read at most one chunk; no user payload is accepted or buffered.
   if(request.body){
    const reader=request.body.getReader();
    try{if(!(await reader.read()).done)return reply(400,{error:'invalid_route_request'});}
    finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
   }
   // Only an existing visible cloud book can reserve a row. No user-supplied code.
   const existing=await env.DB.prepare(`SELECT r.id+10000 code,b.id bookId FROM reader_routes r JOIN cloud_books b ON b.id=r.book_id WHERE b.id=? AND ${ready}`).bind(book).first();
   if(existing)return reply(200,existing);
   await env.DB.prepare(`INSERT INTO reader_routes(book_id) SELECT b.id FROM cloud_books b WHERE b.id=? AND ${ready} ON CONFLICT(book_id) DO NOTHING`).bind(book).run();
   const row=await env.DB.prepare(`SELECT r.id+10000 code,b.id bookId FROM reader_routes r JOIN cloud_books b ON b.id=r.book_id WHERE b.id=? AND ${ready}`).bind(book).first();
   return row?reply(200,row):reply(404,{error:'book_not_found'});
  }
  if(!code||!/^\d{5,12}$/.test(code)||String(Number(code))!==code||Number(code)<10001||book||url.searchParams.size!==1)return reply(400,{error:'invalid_route_request'});
  const row=await env.DB.prepare(`SELECT r.id+10000 code,b.id bookId FROM reader_routes r JOIN cloud_books b ON b.id=r.book_id WHERE r.id=? AND ${ready}`).bind(Number(code)-10000).first();
  return row?reply(200,row):reply(404,{error:'book_not_found'});
 });
}
