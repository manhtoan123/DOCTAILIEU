import {useEffect,useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../../../core/db';
import {AI_MODELS} from '../types/ai-models';
import {AI_COMMON_SETTINGS_KEY} from '../types/ai-reader-settings';
import {DEFAULT_AI_FALLBACK_ORDER,normalizeAiFallbackOrder} from '../services/ai-fallback';
import {queueAiSettings} from '../services/ai-settings';
import '../styles/ai-fallback-order.css';

export function AiFallbackOrderSettings({notify}:{notify?:(message:string)=>void}){
 const row=useLiveQuery(()=>db.settings.get(AI_COMMON_SETTINGS_KEY));
 const [order,setOrder]=useState<string[]>([...DEFAULT_AI_FALLBACK_ORDER]),[dragging,setDragging]=useState(''),[dropTarget,setDropTarget]=useState('');
 const orderRef=useRef(order);orderRef.current=order;
 const dragRef=useRef<{id:string;pointerId:number}|undefined>(undefined);
 useEffect(()=>{if(row)setOrder(normalizeAiFallbackOrder((row.value as {fallbackOrder?:unknown})?.fallbackOrder));},[row]);
 async function save(next:string[]){
  orderRef.current=next;setOrder(next);
  try{await queueAiSettings(AI_COMMON_SETTINGS_KEY,()=>db.transaction('rw',db.settings,async()=>{const current=await db.settings.get(AI_COMMON_SETTINGS_KEY),value=current?.value&&typeof current.value==='object'?current.value as Record<string,unknown>:{};await db.settings.put({key:AI_COMMON_SETTINGS_KEY,value:{...value,fallbackOrder:next}});}));notify?.('Đã lưu thứ tự model dự phòng.');}
  catch{notify?.('Không lưu được thứ tự model.');}
 }
 function move(id:string,targetIndex:number){
  const next=[...orderRef.current],from=next.indexOf(id);if(from<0)return;
  next.splice(from,1);const to=from<targetIndex?targetIndex-1:targetIndex;next.splice(Math.max(0,Math.min(to,next.length)),0,id);orderRef.current=next;setOrder(next);
 }
 useEffect(()=>{
  if(!dragging)return;
  const onMove=(event:PointerEvent)=>{if(dragRef.current?.pointerId!==event.pointerId)return;const element=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-ai-model-id]'),target=element?.dataset.aiModelId;if(target&&target!==dragRef.current.id){const rect=element!.getBoundingClientRect(),after=event.clientY>rect.top+rect.height/2,index=orderRef.current.indexOf(target)+(after?1:0);setDropTarget(`${target}:${after?'after':'before'}`);move(dragRef.current.id,index);}};
  const onEnd=(event:PointerEvent)=>{if(dragRef.current?.pointerId!==event.pointerId)return;dragRef.current=undefined;setDragging('');setDropTarget('');void save(orderRef.current);};
  window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onEnd);window.addEventListener('pointercancel',onEnd);
  return()=>{window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onEnd);window.removeEventListener('pointercancel',onEnd);};
 },[dragging]);
 return <section className="ai-fallback-order panel" aria-labelledby="ai-fallback-order-title">
  <header className="ai-fallback-order-heading"><div><h3 id="ai-fallback-order-title">Thứ tự model dự phòng</h3>
   <p className="muted">Giữ nút <strong>Kéo</strong> bên trái một model, di chuyển đến vị trí muốn đặt rồi thả.</p></div><span className="ai-fallback-order-count">{order.length} model</span></header>
  <p className="ai-fallback-order-usage">Khi bật tự động hạ model, model ưu tiên chạy trước; các model còn lại theo thứ tự này.</p>
  <ol aria-label="Thứ tự model dự phòng" aria-live="polite">{order.map((id,index)=>{
   const model=AI_MODELS.find(item=>item.id===id);if(!model)return null;
   const targetClass=dropTarget.startsWith(`${id}:`)?`drop-${dropTarget.split(':')[1]}`:'';
   return <li key={id} data-ai-model-id={id} className={[dragging===id?'is-dragging':'',targetClass].filter(Boolean).join(' ')}>
    <span className="ai-fallback-order-index">{index+1}.</span>
    <button type="button" className="ai-fallback-order-grip" aria-label={`Giữ và kéo để sắp xếp ${model.label}`} title="Giữ nút này và kéo model đến vị trí mới" onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();dragRef.current={id,pointerId:event.pointerId};setDropTarget('');setDragging(id);event.currentTarget.setPointerCapture(event.pointerId);}}><span aria-hidden="true">⠿</span><span>Kéo</span></button>
    <span className="ai-fallback-order-label">{model.label}</span>
    <span className="ai-fallback-order-controls"><button type="button" aria-label={`Đưa ${model.label} lên`} title="Đưa lên một vị trí" disabled={index===0} onClick={()=>{const next=[...orderRef.current];next.splice(index,1);next.splice(index-1,0,id);void save(next);}}>↑</button><button type="button" aria-label={`Đưa ${model.label} xuống`} title="Đưa xuống một vị trí" disabled={index===order.length-1} onClick={()=>{const next=[...orderRef.current];next.splice(index,1);next.splice(index+1,0,id);void save(next);}}>↓</button></span>
   </li>;
  })}</ol>
 </section>;
}
