import type {D1Database} from '@cloudflare/workers-types';
import {convertServerOrigin} from '../src/features/names-convert/services/convert-server-protocol';
export interface Env { DB:D1Database; AUTH_PASSWORD_HASH:string }
const encoder=new TextEncoder();
export async function sha256(text:string){const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(text));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function safeEqual(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
export function validPasswordHash(encoded:string){return /^pbkdf2-sha256:600000:[a-f0-9]{32}:[a-f0-9]{64}$/.test(encoded);}
function hex(s:string){return new Uint8Array(s.match(/../g)!.map(x=>parseInt(x,16)));}
export async function verifyPassword(password:string,encoded:string){
  if(!validPasswordHash(encoded))return false;const [,iterations,salt,digest]=encoded.split(':');
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const result=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:hex(salt),iterations:Number(iterations)},key,256);return safeEqual(new Uint8Array(result),hex(digest));
}
export function sessionToken(request:Request){return request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-session='))?.slice('__Host-session='.length)||'';}
export function sameOrigin(request:Request){return request.headers.get('Origin')===new URL(request.url).origin;}
export function secure(response:Response,convertOrigin?:string){const headers=new Headers(response.headers);const convert=convertServerOrigin(convertOrigin);headers.set('Cache-Control','private, no-store');headers.set('X-Robots-Tag','noindex, nofollow, noarchive');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('Content-Security-Policy',`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://archives.bulbagarden.net; worker-src 'self'; connect-src 'self' https://ottsy.weilbyte.dev${convert?` ${convert}`:''}; font-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
export function loginPage(error=false){return new Response(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Đăng nhập — Thư Phòng</title><style>body{background:#192e28;color:#f4f0df;font:16px system-ui;display:grid;place-items:center;min-height:95vh;margin:0}main{max-width:360px;padding:32px}h1{font:40px Georgia}p{line-height:1.7;color:#b3c5b9}input,button{box-sizing:border-box;width:100%;padding:14px;border-radius:7px;border:1px solid #58715d;margin:10px 0;font:inherit}button{background:#b5c99b;color:#192e28;cursor:pointer}label{font-size:13px}.error{color:#ffccac}</style><main><h1>thư phòng</h1><p>Một góc riêng để đọc.<br>Nhập mật khẩu truy cập của bạn.</p>${error?'<p class="error" role="alert">Không đăng nhập được. Kiểm tra mật khẩu hoặc thử lại sau.</p>':''}<form method="post" action="/auth/login"><label for="password">Mật khẩu</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256" autofocus><button>Vào thư phòng →</button></form></main></html>`,{status:error?401:200,headers:{'Content-Type':'text/html;charset=utf-8'}});}
export async function handleAuth(request:Request,env:Env,next:()=>Promise<Response>):Promise<Response>{
  try {
    if(!env.DB||!env.AUTH_PASSWORD_HASH||!validPasswordHash(env.AUTH_PASSWORD_HASH))return secure(new Response('Ứng dụng chưa được cấu hình xác thực. Quyền truy cập đang đóng.',{status:503}));
    const path=new URL(request.url).pathname;const now=Date.now();
    if(path==='/login'&&request.method==='GET')return secure(loginPage());
    if(path==='/auth/login'&&request.method==='POST'){
      if(!sameOrigin(request))return secure(new Response('Origin không hợp lệ.',{status:403}));
      if(Number(request.headers.get('Content-Length')||0)>2048)return secure(new Response('Yêu cầu quá lớn.',{status:413}));
      const windowId=Math.floor(now/600000);const ip=await sha256(request.headers.get('CF-Connecting-IP')||'local');
      for(const [bucket,limit]of [[`${ip}:${windowId}`,8],[`all:${windowId}`,50]] as const){
        const row=await env.DB.prepare('INSERT INTO login_limits (bucket, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket,now+1200000).first<{attempts:number}>();
        if(!row||row.attempts>limit)return secure(new Response('Quá nhiều lần thử. Vui lòng chờ 10 phút.',{status:429,headers:{'Retry-After':'600'}}));
      }
      const raw=await request.text();if(raw.length>2048)return secure(new Response('Yêu cầu quá lớn.',{status:413}));const password=new URLSearchParams(raw).get('password')||'';
      if(!password||password.length>256||!await verifyPassword(password,env.AUTH_PASSWORD_HASH))return secure(loginPage(true));
      const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');const hash=await sha256(token);
      await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),env.DB.prepare('DELETE FROM login_limits WHERE expires_at < ?').bind(now),env.DB.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)').bind(hash,now+86400000)]);
      return secure(new Response(null,{status:303,headers:{Location:'/', 'Set-Cookie':`__Host-session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`}}));
    }
    const token=sessionToken(request);if(!/^[a-f0-9]{64}$/.test(token))return secure(path.startsWith('/api/')?Response.json({error:'unauthorized'},{status:401}):new Response(null,{status:303,headers:{Location:'/login'}}));
    const hash=await sha256(token);const session=await env.DB.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').bind(hash).first<{expires_at:number}>();
    if(!session||session.expires_at<=now)return secure(new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':'__Host-session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}}));
    if(!['GET','HEAD','OPTIONS'].includes(request.method)&&!sameOrigin(request))return secure(new Response('Origin không hợp lệ.',{status:403}));
    if(path==='/auth/logout'&&request.method==='POST'){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();return secure(new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':'__Host-session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}}));}
    if(path==='/api/session')return secure(Response.json({authenticated:true}));
    return secure(await next());
  }catch{return secure(new Response('Không thể kiểm tra phiên. Quyền truy cập đang đóng; hãy thử lại sau.',{status:503}));}
}
