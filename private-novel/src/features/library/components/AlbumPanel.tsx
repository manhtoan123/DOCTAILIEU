import {useEffect,useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {createAlbum,getAlbumRegistry,readStoredAlbumRegistry,renameAlbum,removeAlbum,moveBookToAlbum,type AlbumRegistry} from '../services/album-registry';
import {errorText} from '../../../shared/components/common';
interface Props {books:{id:string;title:string;album?:string}[];notify?:(message:string)=>void;onChange?:()=>void}
export function AlbumPanel({books,notify,onChange}:Props){
  const [registry,setRegistry]=useState<AlbumRegistry>();const [id,setId]=useState(''),[name,setName]=useState('');
  const [bookId,setBookId]=useState(''),[target,setTarget]=useState('');const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),loadGeneration=useRef(0),operationRunning=useRef(false);
  const observed=useLiveQuery(async()=>{try{return {registry:await readStoredAlbumRegistry(),error:''};}catch(e){return {registry:undefined,error:errorText(e)};}},[]);
  useEffect(()=>{if(operationRunning.current)return;if(observed?.registry){setRegistry(observed.registry);if(id&&!observed.registry.albums.some(a=>a.id===id))setId('');if(target&&!observed.registry.albums.some(a=>a.id===target))setTarget('');}if(observed?.error)setError(observed.error);},[observed]);
  const bookIdentity=JSON.stringify(books.map(b=>[b.id,b.album]));
  useEffect(()=>{generation.current++;return()=>{generation.current++;};},[]);
  useEffect(()=>{
    const request=++loadGeneration.current,epoch=generation.current;
    const current=()=>generation.current===epoch&&loadGeneration.current===request&&!operationRunning.current;
    void getAlbumRegistry().then(value=>{if(current())setRegistry(value);}).catch(e=>{if(current())setError(errorText(e));});
    return()=>{loadGeneration.current++;};
  },[bookIdentity]);
  async function act(operation:()=>Promise<unknown>,message:string){
    if(operationRunning.current||!registry)return;operationRunning.current=true;loadGeneration.current++;const request=generation.current;
    setBusy(true);setError('');
    try{
      const result=await operation(),updated=await getAlbumRegistry();if(generation.current!==request)return;
      loadGeneration.current++;setRegistry(updated);const saved=result&&typeof result==='object'&&'id'in result?updated.albums.find(a=>a.id===result.id):undefined;
      if(saved){setId(saved.id);setName(saved.name);}else if(id&&!updated.albums.some(a=>a.id===id)){setId('');setName('');}
      if(target&&!updated.albums.some(a=>a.id===target))setTarget('');notify?.(message);onChange?.();
    }catch(e){if(generation.current===request)setError(errorText(e));}
    finally{operationRunning.current=false;if(generation.current===request)setBusy(false);}
  }
  function chooseBook(next:string){setBookId(next);const book=books.find(b=>b.id===next);setTarget(registry?.albums.find(a=>a.name===book?.album)?.id??'');}
  return <section aria-label="Quản lý Album"><h2>Album</h2><p>Chỉ lưu trên thiết bị này.</p>
    {error&&<p role="alert">{error}</p>}
    <fieldset disabled={busy||!registry}>
      <label>Album<select aria-label="Album cần sửa" value={id} onChange={e=>{setId(e.target.value);setName(registry?.albums.find(a=>a.id===e.target.value)?.name??'');}}><option value="">Tạo Album</option>{registry?.albums.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Tên Album<input aria-label="Tên Album" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
      <div className="ai-actions"><button disabled={!name.trim()} onClick={()=>void act(()=>id?renameAlbum(id,name):createAlbum(name),id?'Đã đổi tên Album.':'Đã tạo Album.')}>{id?'Đổi tên':'Tạo Album'}</button><button disabled={!id} onClick={()=>void act(()=>removeAlbum(id),'Đã gỡ Album; truyện được giữ nguyên.')}>Gỡ Album</button></div>
      <label>Truyện<select aria-label="Truyện cần chuyển Album" value={bookId} onChange={e=>chooseBook(e.target.value)}><option value="">Chọn truyện</option>{books.map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select></label>
      <label>Chuyển đến<select aria-label="Album đích" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Chưa có Album</option>{registry?.albums.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <button disabled={!books.some(b=>b.id===bookId)} onClick={()=>void act(()=>moveBookToAlbum(bookId,target||undefined),'Đã chuyển Album.')}>Chuyển truyện</button>
    </fieldset>
  </section>;
}
