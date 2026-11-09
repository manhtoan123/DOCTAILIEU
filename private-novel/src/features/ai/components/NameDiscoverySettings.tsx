import {useEffect,useRef,useState} from 'react';
import {db} from '../../../core/db';
import {errorText} from '../../../shared/components/common';
import {AI_NAME_PROMPT_KEY,DEFAULT_AI_NAME_PROMPT} from '../services/ai-name-discovery';
export default function NameDiscoverySettings(){
 const [prompt,setPrompt]=useState(DEFAULT_AI_NAME_PROMPT),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('');const baseline=useRef<unknown>(undefined);
 useEffect(()=>{let alive=true;void db.settings.get(AI_NAME_PROMPT_KEY).then(row=>{if(alive){baseline.current=row?.value;if(typeof row?.value==='string')setPrompt(row.value);setLoaded(true);}}).catch(e=>{if(alive)setStatus(errorText(e));});return()=>{alive=false;};},[]);
 async function save(){if(!loaded||busy||!prompt.trim())return;setBusy(true);try{if(prompt.length>8000)throw Error('Prompt tìm Name tối đa 8.000 ký tự.');await db.transaction('rw',db.settings,async()=>{if((await db.settings.get(AI_NAME_PROMPT_KEY))?.value!==baseline.current)throw Error('Prompt đã đổi ở nơi khác. Mở lại trang trước khi lưu.');await db.settings.put({key:AI_NAME_PROMPT_KEY,value:prompt});});baseline.current=prompt;setStatus('Đã lưu prompt tìm Name. Áp dụng từ lượt quét mới.');}catch(e){setStatus(errorText(e));}finally{setBusy(false);}}
 return <section className="panel" aria-label="Cài đặt tìm Name"><h2>Tìm và dịch Name</h2><p>Quét chương đang mở theo prompt bốn bước. Danh sách đề xuất chưa tự lưu vào Name riêng. Không đủ bằng chứng thì AI phải ghi chưa xác định tác phẩm.</p><label>Prompt tìm Name<textarea aria-label="Prompt tìm Name" rows={10} maxLength={8000} disabled={!loaded||busy} value={prompt} onChange={e=>setPrompt(e.target.value)} style={{width:'100%',boxSizing:'border-box'}}/></label><button disabled={!loaded||busy||!prompt.trim()} onClick={()=>void save()}>Lưu prompt tìm Name</button>{status&&<p role="status">{status}</p>}</section>;
}
