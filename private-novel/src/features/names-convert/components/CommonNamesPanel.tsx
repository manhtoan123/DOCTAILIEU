import {installDefaultDictionaries} from '../../sync-cloud/services/cloud-dictionaries';
import {useEffect,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {readCommonNames,editCommonName} from '../services/common-names';
import {errorText} from '../../../shared/components/common';
import {displayNameKey,formatNameEntry} from '../services/name-format';

export default function CommonNamesPanel(){
  useEffect(()=>{void installDefaultDictionaries(()=>{},['names']).catch(()=>{});},[]);
  const rows=useLiveQuery(()=>readCommonNames(),[]);
  const [query,setQuery]=useState(''),[key,setKey]=useState(''),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const selected=(rows||[]).filter(row=>!query.trim()||`${row.key} ${row.value}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  async function save(source:string,replacement:string|null){if(busy)return;setBusy(true);setError('');try{await editCommonName(source,replacement);if(replacement!==null){setKey('');setValue('');}}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  return <section aria-label="Sửa Names chung"><p>Names chung dùng cho Convert của mọi truyện. Các mục lưu bằng nút Lưu Name chung cho AI trong Trau chuốt Convert cũng dùng khi Dịch AI. Định dạng $中文=Việt.</p>
    {error&&<p role="alert">{error}</p>}
    <label>Tìm Names chung<input value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <fieldset disabled={busy}><label>Chữ nguồn chung<input value={key} onChange={e=>setKey(e.target.value)} maxLength={256}/></label><label>Tên Việt chung<input value={value} onChange={e=>setValue(e.target.value)} maxLength={4096}/></label><button disabled={!key.trim()||!value.trim()} onClick={()=>void save(key.trim(),value.trim())}>Lưu Name chung</button></fieldset>
    <p>{rows===undefined?'Đang đọc Names chung…':`${rows.length} tên · ${selected.length} tìm thấy (hiện tối đa 50)`}</p>
    {selected.slice(0,50).map(row=><div key={row.key} className="name-entry"><button disabled={busy} onClick={()=>{setKey(displayNameKey(row.key));setValue(row.value);}}>{formatNameEntry(row.key,row.value)}</button><button disabled={busy} aria-label={`Xóa Name chung ${displayNameKey(row.key)}`} onClick={()=>void save(row.key,null)}>×</button></div>)}
  </section>;
}
