import {useRef,useState} from 'react';
export function AiPromptEditor({label,value,onChange,rows=4,variables}:{label:string;value:string;onChange:(value:string)=>void;rows?:number;variables:string[]}){
  const input=useRef<HTMLTextAreaElement>(null),[expanded,setExpanded]=useState(false);
  const insert=(variable:string)=>{const el=input.current;if(!el)return;const at=el.selectionStart,end=el.selectionEnd;if(value.length-(end-at)+variable.length>8000)return;onChange(value.slice(0,at)+variable+value.slice(end));requestAnimationFrame(()=>{el.focus();el.setSelectionRange(at+variable.length,at+variable.length);});};
  return <div className="ai-prompt-editor"><div className="ai-editor-actions"><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Thu gọn':'Mở rộng'} {label}</button>{variables.map(v=><button type="button" key={v} title={`Chèn ${v}`} onClick={()=>insert(v)}>{v}</button>)}</div><textarea ref={input} aria-label={label} rows={expanded?16:rows} maxLength={8000} value={value} onChange={e=>onChange(e.target.value)}/></div>;
}
