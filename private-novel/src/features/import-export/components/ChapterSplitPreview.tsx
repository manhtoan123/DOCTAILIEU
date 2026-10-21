import {useEffect,useState} from 'react';

export function ChapterLimit({value,onChange,disabled=false}:{value:number;onChange:(value:number)=>void;disabled?:boolean}){
  const presets=[0,32000,64000,16000,8000,4000];
  const [custom,setCustom]=useState(!presets.includes(value));
  return <>
    <label>Giới hạn số chữ 1 chương<select aria-label="Giới hạn số chữ 1 chương" disabled={disabled} value={custom?-1:value} onChange={e=>{const n=Number(e.target.value);setCustom(n===-1);onChange(n===-1?5000:n);}}>
      <option value={0}>Giữ nguyên chương (tối đa 128.000 ký tự)</option>
      {presets.slice(1).map(n=><option key={n} value={n}>{n.toLocaleString('vi')} ký tự</option>)}
      <option value={-1}>Tùy chỉnh số ký tự...</option>
    </select></label>
    {custom&&<label>Số ký tự tối đa cho mỗi chương<input type="number" min={100} max={128000} step={1} disabled={disabled} value={Number.isFinite(value)?value:''} onChange={e=>onChange(e.target.value?Number(e.target.value):NaN)}/></label>}
    <small className="muted">Đếm ký tự, gồm khoảng trắng và xuống dòng. Khi vượt giới hạn, chương được chia thành phần; nội dung giữ nguyên. Trần 128.000 ký tự bảo đảm tương thích sao lưu và cloud. Dịch AI hiện nhận tối đa 32.000 ký tự.</small>
  </>;
}

export const validChapterLimit=(value:number)=>value===0||(Number.isSafeInteger(value)&&value>=100&&value<=128000);
interface PreviewRow {order:number;title:string;charCount:number}
interface PreviewFile {name:string;chapters:PreviewRow[];chapterCount:number;totalChars:number}

/** Preview never writes to the library. One worker at a time, cancelled on input changes. */
export default function ChapterSplitPreview({files,encoding,pattern,maxChars,onValidity}:{files:File[];encoding:string;pattern:string;maxChars:number;onValidity?:(valid:boolean)=>void}){
  const [result,setResult]=useState<PreviewFile[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;let worker:Worker|undefined;let cancelPending:(()=>void)|undefined;
    setResult([]);setError('');setLoading(!!files.length);onValidity?.(false);
    async function run(){
      try{
        if(!validChapterLimit(maxChars))throw new Error('Giới hạn phải là số nguyên từ 100 đến 128.000 ký tự hoặc chọn giữ nguyên chương.');
        if(pattern)new RegExp(pattern,'iu');
        const rows:PreviewFile[]=[];
        for(const file of files){
          if(cancelled)return;
          if(file.size>40*1024*1024)throw new Error(`${file.name}: vượt giới hạn 40 MiB.`);
          const row=await new Promise<PreviewFile>((resolve,reject)=>{
            worker=new Worker(new URL('../../../workers/import.worker.ts',import.meta.url),{type:'module'});
            const timer=setTimeout(()=>{worker?.terminate();reject(new Error(`${file.name}: phân tích quá lâu; kiểm tra Regex hoặc chia file nhỏ hơn.`));},30000);
            cancelPending=()=>{clearTimeout(timer);reject(new Error('Đã hủy xem trước.'));};
            worker.onerror=()=>{clearTimeout(timer);reject(new Error(`${file.name}: không phân tích được TXT.`));};
            worker.onmessage=e=>{
              clearTimeout(timer);
              if(e.data.type==='preview_done')resolve({name:file.webkitRelativePath||file.name,...e.data});
              else if(e.data.type==='preview_error')reject(new Error(`${file.name}: ${e.data.message}`));
            };
            worker.postMessage({type:'preview',file,encoding,pattern,maxChars});
          });
          worker?.terminate();worker=undefined;cancelPending=undefined;
          if(cancelled)return;
          rows.push(row);setResult([...rows]);
        }
        if(!cancelled)onValidity?.(!!files.length);
      }catch(e){if(!cancelled){setResult([]);setError(e instanceof Error?e.message:String(e));}}
      finally{worker?.terminate();if(!cancelled)setLoading(false);}
    }
    void run();
    return ()=>{cancelled=true;worker?.terminate();cancelPending?.();};
  },[files,encoding,pattern,maxChars,onValidity]);
  return <section aria-label="Xem trước chia chương" className="chapter-preview-section">
    {loading&&<p role="status">Đang phân tích và đếm số chương… ({result.length}/{files.length} file)</p>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    {!!result.length&&<>
      <p className="chapter-count-badge">Đã phát hiện: <strong>{result.reduce((n,r)=>n+r.chapterCount,0)}</strong> chương · {result.reduce((n,r)=>n+r.totalChars,0).toLocaleString('vi')} ký tự{loading?' (chưa phân tích hết)':''}</p>
      {result.map((r,index)=><details key={index}><summary>{r.name} — {r.chapterCount} chương</summary>
        <div className="chapter-preview-table-container"><table className="chapter-preview-table"><thead><tr><th>#</th><th>Tên chương</th><th>Số ký tự</th></tr></thead><tbody>{r.chapters.map(c=><tr key={c.order}><td>{c.order}</td><td>{c.title}</td><td>{c.charCount.toLocaleString('vi')}</td></tr>)}</tbody></table></div>
        {r.chapterCount>r.chapters.length&&<p className="muted">Hiển thị {r.chapters.length} / {r.chapterCount} chương đầu; tổng số đã đếm đầy đủ.</p>}
      </details>)}
    </>}
  </section>;
}
