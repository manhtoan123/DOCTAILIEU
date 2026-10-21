import {useEffect,useMemo,useRef,useState} from 'react';
import {anthologyGroups,deriveAnthologyFiles,type AnthologyOutline} from '../services/anthology';
import {Modal,errorText} from '../../../shared/components/common';

export default function AnthologyImportDialog({file,encoding,onBack,onPrepared}:{file:File;encoding:string;onBack:()=>void;onPrepared:(files:File[],titles:string[],encoding:string)=>void}){
  const [outline,setOutline]=useState<AnthologyOutline>(),[starts,setStarts]=useState<number[]>([]),[titles,setTitles]=useState<Record<number,string>>({});
  const [pattern,setPattern]=useState(''),[pending,setPending]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const operation=useRef<AbortController|undefined>(undefined),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current?.abort();};},[]);
  useEffect(()=>{
    let alive=true;setPending(true);setOutline(undefined);setError('');setTitles({});
    const worker=new Worker(new URL('../../../workers/anthology.worker.ts',import.meta.url),{type:'module'});
    const timer=setTimeout(()=>{worker.terminate();if(alive){setError('Phân tích quá lâu. Kiểm tra Regex hoặc chọn file nhỏ hơn.');setPending(false);}},30000);
    worker.onmessage=event=>{
      if(!alive)return;clearTimeout(timer);worker.terminate();setPending(false);
      if(event.data.error){setError(event.data.error);return;}
      const result=event.data.outline as AnthologyOutline;setOutline(result);setStarts(result.starts);
    };
    worker.onerror=()=>{clearTimeout(timer);worker.terminate();if(alive){setError('Worker phân tích tuyển tập bị lỗi.');setPending(false);}};
    worker.postMessage({file,encoding,pattern});
    return()=>{alive=false;clearTimeout(timer);worker.terminate();};
  },[file,encoding,pattern]);
  const groups=useMemo(()=>{if(!outline)return [];try{return anthologyGroups(outline,starts);}catch{return [];}},[outline,starts]);
  function toggle(index:number){setStarts(current=>current.includes(index)?current.filter(value=>value!==index):[...current,index].sort((left,right)=>left-right));}
  async function prepare(){
    if(!outline||operation.current)return;const controller=new AbortController();operation.current=controller;setBusy(true);setError('');
    try{
      const names=groups.map(group=>(titles[group.markerIndex]??group.title).trim());
      const files=await deriveAnthologyFiles(file,outline,starts,names,controller.signal);controller.signal.throwIfAborted();
      if(mounted.current)onPrepared(files,names,outline.encoding);
    }catch(cause){if(mounted.current)setError(controller.signal.aborted?'Đã hủy tách tuyển tập.':errorText(cause));}
    finally{operation.current=undefined;if(mounted.current)setBusy(false);}
  }
  function back(){if(operation.current){operation.current.abort();return;}onBack();}
  return <Modal title="Tách tuyển tập thành nhiều truyện" wide onClose={back}>
    <p>{file.name} — đánh dấu dòng bắt đầu mỗi truyện. Những mốc không đánh dấu vẫn là chương/phần trong truyện trước.</p>
    <p className="muted">Mỗi truyện lưu phần TXT tương ứng, giữ nguyên byte và thứ tự. Ghép các phần theo thứ tự sẽ khôi phục toàn bộ file tuyển tập. Chưa nhập ở bước này; bước tiếp theo xem trước chương và chọn Album.</p>
    <details open={error?true:undefined}><summary>Regex mốc truyện (tùy chọn)</summary><label>Mẫu nhận diện mốc<input value={pattern} disabled={busy} onChange={event=>setPattern(event.target.value)} placeholder="Ví dụ: ^书名[:：]"/></label><p className="muted">Để trống: ưu tiên 书名/作品, 文件N: tên.txt hoặc 《tên》 作者: tác giả nếu có ít nhất hai mốc; nếu không, dò 第N章/部/卷/篇. Chương không bị tách thành truyện khi đã nhận diện được tên truyện riêng. Luôn kiểm tra ranh giới trước khi nhập.</p><p className="muted">Nếu file thực sự có dòng 文件1: tên.txt, dùng mẫu <code>{'^文件\\s*[0-9０-９]+\\s*[:：]\\s*.+\\.txt\\s*$'}</code>. Không dùng nhãn chỉ được thêm khi sao chép văn bản.</p></details>
    {pending&&<p role="status">Đang phân tích mốc truyện…</p>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    {outline&&<>
      <p role="status"><strong>{starts.length} truyện dự kiến</strong> · {outline.markers.length} mốc · {outline.encoding}</p>
      {!!outline.warnings.length&&<details open><summary>Cần kiểm tra ({outline.warnings.length})</summary><ul>{outline.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
      {starts.length>100&&<p role="alert">Tối đa 100 truyện mỗi lần. Bỏ bớt mốc bắt đầu để gộp các phần cùng truyện.</p>}
      <section aria-label="Mốc bắt đầu truyện" className="anthology-markers">{outline.markers.map((marker,index)=><label key={marker.offset}><input type="checkbox" disabled={busy||index===0} checked={starts.includes(index)} onChange={()=>toggle(index)}/><span>Dòng {marker.line} · {marker.title}</span></label>)}</section>
      <section aria-label="Các truyện sẽ nhập">{groups.map((group,index)=><label key={group.markerIndex}>Tên truyện {index+1}<input maxLength={300} disabled={busy} value={titles[group.markerIndex]??group.title} onChange={event=>setTitles(current=>({...current,[group.markerIndex]:event.target.value}))}/><small>{group.headingCount} mốc nội dung · {(group.end-group.start).toLocaleString('vi')} byte</small></label>)}</section>
    </>}
    <footer><button onClick={back}>{busy?'Hủy xử lý':'Quay lại'}</button><button className="primary" disabled={pending||busy||groups.length<2} onClick={()=>void prepare()}>{busy?'Đang kiểm tra file…':'Tiếp tục xem trước chương'}</button></footer>
  </Modal>;
}
