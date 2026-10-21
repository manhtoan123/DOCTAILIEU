import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
const directory=join(homedir(),'.codex','private-novel');
const file=join(directory,'cloud-device.json');
const origin='https://thu-phong-private.pages.dev';
mkdirSync(directory,{recursive:true});
const saved=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{token:randomBytes(32).toString('hex'),origin,createdAt:new Date().toISOString()};
if(saved.origin!==origin||typeof saved.token!=='string'||!/^[a-f0-9]{64}$/.test(saved.token))throw new Error('Cấu hình kết nối local không hợp lệ; không xoay hoặc thay secret tự động.');
if(!existsSync(file))writeFileSync(file,JSON.stringify(saved),{mode:0o600,flag:'wx'});
const digest=createHash('sha256').update(saved.token).digest('hex');
const link=`${origin}/#cloud-connect=${saved.token}`;
writeFileSync(join(directory,'connect-cloud.html'),`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kết nối Thư Phòng</title><style>body{font:18px system-ui;max-width:600px;margin:10vh auto;padding:24px;background:#faf6ed;color:#20372a}a{display:inline-block;padding:16px;background:#28503b;color:white;border-radius:8px;text-decoration:none}p{line-height:1.7}</style><h1>Kết nối kho Thư Phòng</h1><p>Bấm một lần trên thiết bị này. Các lần sau mở web bình thường, không nhập mật khẩu.</p><a href="${link}" rel="noreferrer">Kết nối và mở Thư Phòng</a><p>Liên kết cấp quyền vào kho của bạn. Sau kết nối, vào Cài đặt → Kho &amp; thiết bị → Kết nối thiết bị khác để sao chép sang điện thoại.</p></html>`,{mode:0o600});
if(process.argv.includes('--provision')){
  const result=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npx.cmd wrangler pages secret put CLOUD_ACCESS_TOKEN_HASH --project-name thu-phong-private'],{input:digest+'\n',encoding:'utf8'});
  const output=(result.stdout||'')+(result.stderr||'');
  process.stdout.write(output.replaceAll(saved.token,'[redacted]').replaceAll(digest,'[redacted]'));
  if(result.error||result.status!==0)throw new Error('Không cấu hình được secret cloud. File kết nối local được giữ để thử lại.');
}
console.log('Connection file prepared outside workspace; token never printed.');
