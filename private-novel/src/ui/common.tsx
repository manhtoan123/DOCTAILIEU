import {useEffect,type ReactNode} from 'react';
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const nodes=Array.from(document.querySelectorAll<HTMLElement>('.dialog button:not(:disabled),.dialog input,.dialog select,.dialog textarea,.dialog a'));const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',handler);document.querySelector<HTMLElement>('.dialog button')?.focus();return()=>{document.removeEventListener('keydown',handler);previous?.focus();};},[onClose]);
  return <div className="overlay"><section className={`dialog ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Đóng">×</button></header>{children}</section></div>;
}
export function Empty({title,children}:{title:string;children:ReactNode}){return <div className="empty"><span className="empty-mark">⌑</span><h2>{title}</h2><p>{children}</p></div>;}
export function errorText(e:unknown){return e instanceof Error?e.message:String(e);}

