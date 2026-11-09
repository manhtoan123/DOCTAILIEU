/** Shared wire acceptance, deliberately independent of dictionaries or storage. */
export interface AiNameCandidate {key:string;value:string}
export function readAiNameResult(result:string,source:string):AiNameCandidate[]{
 if(result.length>128000)throw Error('Danh sách Name vượt giới hạn.');
 const blocks=[...result.matchAll(/^```text\s*\r?\n([\s\S]*?)^```[ \t]*$/gm)];
 if(blocks.length!==1)throw Error('AI cần trả đúng một khối text chứa danh sách $Name.');
 const rows:AiNameCandidate[]=[],seen=new Set<string>();
 for(const line of blocks[0][1].split(/\r?\n/)){
  if(!line.trim()||line.trim()==='# Không tìm thấy Name.')continue;
  const match=/^\$([^=\r\n]+)=([^\r\n]+)$/.exec(line.trim());
  if(!match)throw Error('Dòng Name không đúng dạng $Tiếng Trung=Tiếng Việt.');
  const key=match[1].trim(),value=match[2].trim();
  if(!key||!value||key.length>256||value.length>4096||!/^\p{Script=Han}/u.test(key)||/[\u0000-\u001f\u007f$]/u.test(key)||/[\u0000-\u001f\u007f]/u.test(value)||/\p{Script=Han}/u.test(value)||!source.includes(key))throw Error('Name không khớp nguồn chương hoặc nghĩa Việt không hợp lệ.');
  const identity=JSON.stringify([key,value]);if(!seen.has(identity)){rows.push({key,value});seen.add(identity);}
 }
 if(rows.length>20000)throw Error('Danh sách Name vượt 20.000 mục.');
 return rows.sort((a,b)=>Array.from(b.key).length-Array.from(a.key).length||a.key.localeCompare(b.key));
}
export function readAiNameInput(text:string):{source:string}{
 let value:unknown;try{value=JSON.parse(text);}catch{throw Error('Nguồn tìm Name không hợp lệ.');}
 if(!value||typeof value!=='object'||Array.isArray(value)||!('version' in value)||value.version!==1||!('source' in value)||typeof value.source!=='string'||!value.source.trim())throw Error('Nguồn tìm Name không hợp lệ.');
 return {source:value.source};
}
