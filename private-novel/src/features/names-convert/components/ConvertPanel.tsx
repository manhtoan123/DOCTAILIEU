import {useEffect,useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {convert,lookup} from '../services/language-client';
import type {Token} from '../services/language';
import {deleteConvertName,expandConvertSelection,formatConvertNames,parseConvertNames,readConvertNames,saveConvertNames} from '../services/convert-names';
import {errorText} from '../../../shared/components/common';
import {canonicalNameKey,displayNameKey,formatNameDraft,nameKeyResolver,resolveNameKey} from '../services/name-format';

const LIMIT=64000;
type Mode='vietphrase'|'hanviet';
function saveTxt(text:string,name:string) {
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function readTxt(file:File) {
  if(!/\.txt$/i.test(file.name))throw new Error('Chỉ nhận file TXT UTF-8.');
  if(file.size>LIMIT*4)throw new Error('File vượt giới hạn cho đoạn 64.000 ký tự UTF-16.');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
  if(text.length>LIMIT)throw new Error('Nội dung vượt 64.000 ký tự UTF-16; không nhập một phần.');
  return text;
}

export default function ConvertPanel({dictionaryVersion=''}:{dictionaryVersion?:string}) {
  const [source,setSource]=useState('');
  const [mode,setMode]=useState<Mode>('vietphrase');
  const [multiple,setMultiple]=useState(false);
  const [standardizePunct,setStandardizePunct]=useState(true);
  const [namesText,setNamesText]=useState('');
  const [temporaryText,setTemporaryText]=useState('');
  const [tokens,setTokens]=useState<Token[]>([]);
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [selected,setSelected]=useState<Token>();
  const [details,setDetails]=useState<{meanings:string[];hanviet:string}>();
  const [lookupBusy,setLookupBusy]=useState(false);
  const [edit,setEdit]=useState('');
  const generation=useRef(0),selection=useRef(0),alive=useRef(true),contentVersion=useRef(0);
  const dirty=useRef(false),draftRevision=useRef(0),baseline=useRef(''),observed=useRef<string | undefined>(undefined);
  const stored=useLiveQuery(async()=>{try{return {names:await readConvertNames(),error:''};}catch(e){return {names:[],error:errorText(e)};}},[]);
  const storedText=stored?formatConvertNames(stored.names):undefined;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;selection.current++;};},[]);
  function invalidate() {
    generation.current++;selection.current++;setTokens([]);setSelected(undefined);setDetails(undefined);setBusy(false);setLookupBusy(false);setMessage('');
  }
  useEffect(()=>{contentVersion.current++;invalidate();},[dictionaryVersion]);
  useEffect(()=>{
    if(storedText===undefined)return;
    if(observed.current!==undefined&&observed.current!==storedText)invalidate();
    observed.current=storedText;
    if(!dirty.current){baseline.current=storedText;setNamesText(storedText);}
  },[storedText]);
  function changeNames(text:string) {
    if(text.length>LIMIT){setMessage('Name List vượt 64.000 ký tự UTF-16; giữ nguyên bản trước.');return;}
    dirty.current=true;draftRevision.current++;setNamesText(text);
  }
  async function run(text=source,temp=temporaryText) {
    invalidate();const id=generation.current;setBusy(true);
    try {
      if(!text.trim())throw new Error('Dán hoặc nhập một đoạn chữ Trung trước khi Convert.');
      if(text.length>LIMIT)throw new Error('Nội dung vượt 64.000 ký tự UTF-16.');
      const result=await convert(text,parseConvertNames(temp),{mode,multipleMeanings:multiple,standardizePunctuation:standardizePunct,capitalize:standardizePunct});
      if(alive.current&&id===generation.current){setTokens(result);setMessage('Đã Convert trên thiết bị này. Bấm một từ để tra và Thêm Name lưu lâu dài.');}
    } catch(e) {if(alive.current&&id===generation.current)setMessage(errorText(e));}
    finally {if(alive.current&&id===generation.current)setBusy(false);}
  }
  async function selectToken(token:Token) {
    const id=++selection.current,context=generation.current;
    setSelected(token);setDetails(undefined);setEdit(token.targetText.trim());setLookupBusy(true);
    try {
      const result=await lookup(token.source);
      if(alive.current&&context===generation.current&&id===selection.current)setDetails(result);
    } catch(e) {if(alive.current&&context===generation.current&&id===selection.current)setMessage(errorText(e));}
    finally {if(alive.current&&context===generation.current&&id===selection.current)setLookupBusy(false);}
  }
  function expand(direction:'left'|'right') {
    if(!selected)return;
    const span=expandConvertSelection(source,selected.sourceStart,selected.sourceEnd,direction);
    void selectToken({...selected,...span,targetText:'',meanings:[],hanviet:''});
  }
  async function upload(file:File|undefined,toNames:boolean) {
    if(!file)return;
    const revision=draftRevision.current;
    if(!toNames){contentVersion.current++;invalidate();}
    const context=generation.current;
    try {
      const text=await readTxt(file);
      if(!alive.current||context!==generation.current||(toNames&&revision!==draftRevision.current))return;
      if(toNames){parseConvertNames(text);changeNames(formatNameDraft(text));}else setSource(text);
      setMessage(toNames?'Đã nhập bản nháp Name List; bấm Lưu Name List để lưu lâu dài.':'Đã nhập đoạn TXT UTF-8; bấm Convert.');
    }catch(e){if(alive.current&&context===generation.current)setMessage(errorText(e));}
  }
  async function saveDraft() {
    const revision=draftRevision.current,draft=namesText;setSaving(true);
    try {
      // A formatted list cannot identify which legacy alias the user intended.
      // Report that ambiguity before deriving edits from a canonical draft.
      const resolveKey=nameKeyResolver(stored?.names??[]);for(const row of stored?.names??[])resolveKey(row.key);
      const old=new Map(parseConvertNames(baseline.current).map(n=>[n.key,n.value]));
      const edits=parseConvertNames(draft).filter(n=>old.get(n.key)!==n.value);
      const count=await saveConvertNames(formatConvertNames(edits));
      const latest=formatConvertNames(await readConvertNames());
      if(!alive.current)return;
      invalidate();observed.current=latest;
      if(revision===draftRevision.current){dirty.current=false;baseline.current=latest;setNamesText(latest);}
      setMessage(`Đã lưu Name List (${count} mục) trên thiết bị. Bỏ dòng khỏi bản nháp không xóa Name; dùng Xóa Name đã lưu cho từ đang chọn.`);
    }catch(e){if(alive.current)setMessage(`Không lưu được; giữ nguyên bản nháp. ${errorText(e)}`);}
    finally{if(alive.current)setSaving(false);}
  }
  async function editName(permanent:boolean) {
    if(!selected||!edit.trim()){setMessage('Tên Việt không được để trống.');return;}
    const context=contentVersion.current,entry={key:selected.source,value:edit.trim()};
    try {
      if(/[\r\n]/.test(edit))throw new Error('Tên Việt phải nằm trên một dòng.');
      parseConvertNames(formatConvertNames([entry]));
      if(permanent){
        setSaving(true);await saveConvertNames(formatConvertNames([entry]));
        const latest=formatConvertNames(await readConvertNames());
        if(!alive.current)return;
        observed.current=latest;
        if(!dirty.current){baseline.current=latest;setNamesText(latest);}
        if(context===contentVersion.current){const next=formatConvertNames(parseConvertNames(temporaryText).filter(n=>n.key!==entry.key));setTemporaryText(next);await run(source,next);}
      }else{
        const map=new Map(parseConvertNames(temporaryText).map(n=>[n.key,n.value]));map.set(entry.key,entry.value);
        const next=formatConvertNames([...map].map(([key,value])=>({key,value})));parseConvertNames(next);setTemporaryText(next);await run(source,next);
      }
    }catch(e){if(alive.current)setMessage(`Không áp dụng được; giữ nguyên nghĩa đang sửa. ${errorText(e)}`);}
    finally{if(alive.current)setSaving(false);}
  }
  async function removeName() {
    if(!selected)return;const context=contentVersion.current;setSaving(true);
    try {
      const key=resolveNameKey(selected.source,stored?.names??[]);
      await deleteConvertName(key);const latest=formatConvertNames(await readConvertNames());
      if(!alive.current)return;observed.current=latest;
      if(!dirty.current){baseline.current=latest;setNamesText(latest);}
      if(context===contentVersion.current)await run();
    }catch(e){if(alive.current)setMessage(errorText(e));}
    finally{if(alive.current)setSaving(false);}
  }
  const output=tokens.map(token=>token.targetText).join('');
  const choices=[...new Set([...(details?.meanings||[]),...(selected?.meanings||[])])];
  return <section className="panel convert-workspace" aria-label="Convert đoạn chữ Trung">
    <h2>Công cụ Convert Vietphrase</h2>
    <p className="muted">Từ điển local · đoạn tối đa 64.000 ký tự UTF-16 · Name List lưu trên thiết bị và dùng chung với Reader.</p>
    <div className="convert-columns">
      <div className="convert-source"><h3>Văn bản gốc (Tiếng Trung)</h3>
        <label>Văn bản Trung<textarea aria-label="Văn bản Trung" rows={10} value={source} placeholder="Dán văn bản tiếng Trung vào đây…" onChange={event=>{
          contentVersion.current++;invalidate();if(event.target.value.length>LIMIT){setMessage('Nội dung vượt 64.000 ký tự UTF-16; giữ nguyên đoạn trước.');return;}setSource(event.target.value);
        }}/></label>
        <div className="convert-toolbar">
          <button className="primary" disabled={busy||saving} onClick={()=>void run()}>{busy?'Đang Convert…':'Convert đoạn'}</button>
          <label>Nhập đoạn TXT<input type="file" accept=".txt,text/plain" onChange={event=>{void upload(event.target.files?.[0],false);event.target.value='';}}/></label>
          <button onClick={()=>{contentVersion.current++;invalidate();setSource('');}}>Xóa đoạn</button>
        </div>
        <div className="convert-toolbar">
          <label>Chế độ Convert<select aria-label="Chế độ Convert" value={mode} onChange={event=>{contentVersion.current++;invalidate();setMode(event.target.value as Mode);}}><option value="vietphrase">Vietphrase</option><option value="hanviet">Hán-Việt</option></select></label>
          <label className="convert-check"><input type="checkbox" checked={multiple} onChange={event=>{contentVersion.current++;invalidate();setMultiple(event.target.checked);}}/>Hiện nhiều nghĩa</label>
          <label className="convert-check"><input type="checkbox" checked={standardizePunct} onChange={event=>{contentVersion.current++;invalidate();setStandardizePunct(event.target.checked);}}/>Dấu câu & viết hoa</label>
        </div>
      </div>
      <div className="convert-names"><h3>Name List <span className="convert-count">{stored?.names.length??'…'} mục đã lưu</span></h3>
        <p className="muted">Mỗi dòng: $中文=Việt. Bấm Lưu để hợp nhất; đóng trang hoặc tải lại vẫn giữ mục đã lưu.</p>
        <p className="muted">Bản sao lưu truyện có kèm Name List chung. Khi khôi phục, giữ mục đang có hoặc đã xóa trên thiết bị; chỉ bổ sung mục còn thiếu. Bạn cũng có thể xuất Name List TXT riêng.</p>
        <label>Name List<textarea aria-label="Name List" rows={10} value={namesText} placeholder="$张三=Trương Tam" onChange={event=>changeNames(event.target.value)}/></label>
        {dirty.current&&<p className="muted">Bản nháp chưa lưu. Convert dùng Name List đã lưu.</p>}
        <div className="convert-toolbar">
          <button className="primary" disabled={saving||!stored||!!stored.error} onClick={()=>void saveDraft()}>{saving?'Đang lưu…':'Lưu Name List'}</button>
          <label>Nhập Name List TXT<input type="file" accept=".txt,text/plain" onChange={event=>{void upload(event.target.files?.[0],true);event.target.value='';}}/></label>
          <button disabled={!stored||!!stored.error} onClick={()=>saveTxt(storedText||'','NameList.txt')}>Xuất Name List</button>
        </div>
      </div>
    </div>
    {stored?.error&&<p className="notice" role="alert">{stored.error}</p>}
    {message&&<p className="notice" role="status">{message}</p>}
    <div className="convert-output-heading"><h3>Tiếng Việt</h3><span className="muted">Bấm từ để dịch nhanh và sửa Name</span></div>
    <div className="convert-result" aria-label="Kết quả Convert" aria-busy={busy}>{tokens.map((token,index)=><button key={index} className={`convert-token${selected&&token.sourceStart>=selected.sourceStart&&token.sourceEnd<=selected.sourceEnd?' is-selected':''}`} title={token.source} aria-label={`Tra ${token.source}`} onClick={()=>void selectToken(token)}>{token.targetText}</button>)}</div>
    <div className="convert-toolbar"><button disabled={!tokens.length} onClick={async()=>{
      const id=generation.current;try{await navigator.clipboard.writeText(output);if(alive.current&&id===generation.current)setMessage('Đã sao chép kết quả.');}catch(e){if(alive.current&&id===generation.current)setMessage(`Không sao chép được: ${errorText(e)}. Có thể tải TXT.`);}
    }}>Sao chép kết quả</button><button disabled={!tokens.length} onClick={()=>saveTxt(output,'Convert.txt')}>Tải kết quả TXT</button></div>
    {selected&&<div className="convert-lookup" aria-label="Tra từ Convert"><div className="convert-output-heading"><h3>Dịch nhanh · Thêm / chỉnh Name</h3><button onClick={()=>{selection.current++;setSelected(undefined);setDetails(undefined);}}>Đóng tra từ</button></div>
      <div className="convert-expand"><button aria-label="Mở rộng sang trái" disabled={selected.sourceStart===0} onClick={()=>expand('left')}>← Mở rộng</button>
        <strong aria-label="Chữ Trung đang chọn">{displayNameKey(selected.source)}</strong><button aria-label="Mở rộng sang phải" disabled={selected.sourceEnd===source.length} onClick={()=>expand('right')}>Mở rộng →</button></div>
      <p>Hán-Việt: {lookupBusy?'Đang tra…':details?.hanviet||selected.hanviet||'Không có phiên âm'}</p>
      <p>Nghĩa: {choices.join(' / ')||'Chưa có nghĩa trong từ điển'}</p>
      <div className="convert-toolbar">{choices.map(value=><button key={value} onClick={()=>setEdit(value)}>{value}</button>)}{details?.hanviet&&<button onClick={()=>setEdit(details.hanviet)}>Dùng Hán-Việt</button>}</div>
      <label>Nghĩa tùy chỉnh<input aria-label="Tên Việt tạm" value={edit} onChange={event=>setEdit(event.target.value)}/></label>
      <div className="convert-toolbar"><button onClick={()=>setEdit(edit.replace(/(^|\s)(\p{L})/gu,(_all,space:string,char:string)=>space+char.toLocaleUpperCase('vi')))}>Hoa chữ đầu</button><button onClick={()=>setEdit(edit.toLocaleUpperCase('vi'))}>Hoa toàn bộ</button></div>
      <div className="convert-toolbar"><button className="primary" disabled={saving} onClick={()=>void editName(true)}>Thêm Name</button><button disabled={saving} onClick={()=>void editName(false)}>Áp dụng tạm và Convert lại</button><button disabled={saving||!stored?.names.some(n=>canonicalNameKey(n.key)===canonicalNameKey(selected.source))} onClick={()=>void removeName()}>Xóa Name đã lưu</button></div>
      <p className="muted">Thêm Name lưu lâu dài trên thiết bị; Áp dụng tạm chỉ giữ trong phiên này.</p>
    </div>}
    <details className="convert-temporary"><summary>Name List tạm — chỉ trong phiên này</summary>
      <label>Name List tạm<textarea aria-label="Name List tạm" rows={3} value={temporaryText} onChange={event=>{contentVersion.current++;invalidate();if(event.target.value.length>LIMIT){setMessage('Name List vượt 64.000 ký tự UTF-16.');return;}setTemporaryText(event.target.value);}}/></label>
      <div className="convert-toolbar"><button onClick={()=>{try{parseConvertNames(temporaryText);saveTxt(formatNameDraft(temporaryText),'NameList-session.txt');}catch(e){setMessage(errorText(e));}}}>Xuất Name List tạm</button><button onClick={()=>{contentVersion.current++;invalidate();setTemporaryText('');}}>Xóa Name List tạm</button></div>
    </details>
  </section>;
}
