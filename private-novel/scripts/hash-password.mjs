import {randomBytes,pbkdf2Sync} from 'node:crypto';
// Read only from an interactive masked prompt: never put the password in shell history or arguments.
if(!process.stdin.isTTY){console.error('Chạy lệnh trong terminal tương tác để nhập mật khẩu ẩn.');process.exit(1);}
process.stdout.write('Mật khẩu truy cập (ít nhất 12 ký tự, không hiển thị): ');
process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');let value='';
process.stdin.on('data',chunk=>{for(const c of chunk){if(c==='\u0003'){process.stdin.setRawMode(false);process.exit(1);}if(c==='\r'||c==='\n'){process.stdin.setRawMode(false);process.stdin.pause();if(value.length<12||value.length>256){console.error('\nMật khẩu phải có 12–256 ký tự.');process.exit(1);}const salt=randomBytes(16);const hash=pbkdf2Sync(value,salt,600000,32,'sha256');console.log(`\nAUTH_PASSWORD_HASH="pbkdf2-sha256:600000:${salt.toString('hex')}:${hash.toString('hex')}"`);process.exit(0);}else if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else value+=c;}});
