// User-run credential setup. Never print cookies, upload HARs, or write secrets
// into the repository. Only the selected session is sent to Pages secret storage.
import {readFileSync,statSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
export function extractCapcutSession(input){
 let value=input;
 if(input?.log?.entries){
  const candidates=input.log.entries.flatMap(entry=>{
   try{
    const request=entry.request,url=new URL(request.url);
    if(url.origin!=='https://edit-api-sg.capcut.com'||!/^\/(?:storyboard|lv|artist)\//.test(url.pathname))return [];
    const headers=Object.fromEntries((request.headers??[]).map(h=>[String(h.name).toLowerCase(),h.value]));
    if(typeof headers.cookie!=='string')return [];
    return [{cookie:headers.cookie,deviceId:headers.did,tdid:headers.tdid??'',region:String(headers['store-country-code']??'VN').toUpperCase(),appVersion:headers.appvr??'5.8.0'}];
   }catch{return [];}
  });
  value=candidates.at(-1);
 }
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Không tìm thấy phiên CapCut. HAR cần chứa Cookie và did của request tới edit-api-sg.capcut.com; chỉ lưu HAR ở thư mục riêng trên máy.');
 const session={cookie:value.cookie,deviceId:value.deviceId,tdid:value.tdid??'',region:value.region??'VN',appVersion:value.appVersion??'5.8.0'};
 if(typeof session.cookie!=='string'||session.cookie.length>8192||!session.cookie.length||!/^[\x20-\x7e]+$/.test(session.cookie)||!session.cookie.split(';').every(pair=>/^[!#$%&'*+.^_`|~0-9A-Za-z-]+=[^;]*$/.test(pair.trim()))||!session.cookie.split(';').some(pair=>/^(?:sessionid|sessionid_ss|sid_tt)=.+$/.test(pair.trim()))||typeof session.deviceId!=='string'||!/^\d{1,32}$/.test(session.deviceId)||typeof session.tdid!=='string'||!/^(?:\d{0,32}|web)$/.test(session.tdid)||typeof session.region!=='string'||!/^[A-Z]{2}$/.test(session.region)||typeof session.appVersion!=='string'||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(session.appVersion))throw Error('Cấu hình phiên thiếu hoặc sai định dạng. Không gửi nội dung file/cookie vào chat.');
 return session;
}
async function main(){
 const args=process.argv.slice(2),at=args.indexOf('--file'),file=at>=0?args[at+1]:undefined;
 if(!file||args.some((a,i)=>a!=='--file'&&i!==at+1&&a!=='--publish'))throw Error('Dùng: node scripts/configure-capcut-session.mjs --file <HAR hoặc JSON riêng> [--publish]');
 const path=realpathSync(resolve(file)),root=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
 // D: is a read-only reference drive in this workspace and cannot be uploaded.
 if(/^D:/i.test(path))throw Error('D: chỉ để tham khảo. Hãy dùng file phiên riêng do bạn tạo ngoài D:.');
 const gitRoot=realpathSync(execFileSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim());
 const rel=relative(gitRoot,path),outside=rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel);
 if(!outside){
  try{execFileSync('git',['check-ignore','-q','--',path],{cwd:root,stdio:'ignore',windowsHide:true});}
  catch{throw Error('File phiên nằm trong phần có thể đưa lên Git. Chuyển file vào thư mục riêng ngoài repo hoặc .dsh-tmp/ trước.');}
 }
 if(statSync(path).size>64*1024*1024)throw Error('File phiên/HAR vượt 64 MiB. Chỉ xuất request CapCut cần thiết.');
 let input;try{input=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));}catch{throw Error('Không đọc được JSON/HAR hợp lệ.');}
 const session=extractCapcutSession(input);
 if(!args.includes('--publish')){console.log('Đã kiểm định dạng phiên tại máy. Chưa gửi dữ liệu lên server; chưa xác minh phiên còn hạn.');return;}
 const cli=resolve(root,'node_modules/wrangler/bin/wrangler.js');
 await new Promise((done,reject)=>{
  const child=spawn(process.execPath,[cli,'pages','secret','put','CAPCUT_SESSION_JSON','--project-name','thu-phong-private'],{cwd:root,windowsHide:true,stdio:['pipe','ignore','ignore'],env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG:'error',WRANGLER_LOG_SANITIZE:'true'}});
  child.once('error',()=>reject(Error('Không chạy được Wrangler cài trong dự án.')));
  child.once('close',code=>code===0?done():reject(Error('Wrangler chưa cập nhật secret. Kiểm tra đăng nhập/quyền Pages bằng wrangler whoami rồi thử lại.')));
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(session));
 });
 console.log('Đã lưu CAPCUT_SESSION_JSON vào secret của Pages thu-phong-private. Chưa bật client CapCut hoặc xác minh giọng thật.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))main().catch(error=>{console.error(error.message);process.exitCode=1;});
